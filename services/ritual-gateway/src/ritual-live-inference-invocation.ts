import {
  AiExecutionStatus,
  type PortfolioAiModelExecutionResult,
  PortfolioAiRawExecutionAuthority,
} from '@cryptodesk-ai/ai';
import {
  createRitualInferenceTransactionConstructor,
  type RitualInferenceTransactionConstructor,
} from './ritual-inference-transaction-construction.js';
import {
  createRitualLiveInferenceContract,
  type RitualLiveInferenceCompletedResult,
  type RitualLiveInferenceMappingRequest,
  type RitualLiveInferenceOperation,
} from './ritual-live-inference-contract.js';
import {
  createRitualTransactionSigningBoundary,
  type RitualTransactionSignerCapability,
} from './ritual-transaction-signing-boundary.js';
import {
  createRitualTransactionSubmissionLifecycle,
  type RitualTransactionSettlementCapability,
  type RitualTransactionSubmissionAuthorizer,
  type RitualTransactionSubmissionCapability,
} from './ritual-transaction-submission-lifecycle.js';

const RITUAL_PROVIDER_ID = 'ritual';
const RITUAL_CHAIN_ID = 1979;
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface RitualLiveInferenceInvocationConfiguration {
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly expectedChainId: typeof RITUAL_CHAIN_ID;
  readonly targetId: string;
  readonly signerId: string;
  readonly submissionTimeoutMs?: number;
  readonly inferenceTimeoutMs?: number;
}

export interface RitualInferenceSigningAuthorizationRequest {
  readonly inferenceRequestId: string;
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
  readonly signingRequestId: string;
  readonly signerId: string;
}

export type RitualInferenceSigningAuthorizer = (
  request: RitualInferenceSigningAuthorizationRequest,
) => Promise<unknown>;

export interface RitualLiveInferenceCapabilityRequest {
  readonly inferenceRequestId: string;
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
  readonly submissionId: string;
  readonly payload: string;
}

export enum RitualLiveInferenceCapabilityFailureKind {
  InvocationFailed = 'invocation_failed',
  Timeout = 'timeout',
}

export type RitualLiveInferenceCapabilityResult =
  | RitualLiveInferenceCompletedResult
  | {
      readonly status: 'failed';
      readonly inferenceRequestId: string;
      readonly executionId: string;
      readonly providerId: typeof RITUAL_PROVIDER_ID;
      readonly modelId?: string;
      readonly targetId: string;
      readonly failureKind: RitualLiveInferenceCapabilityFailureKind;
    };

export type RitualLiveInferenceCapability = (
  request: RitualLiveInferenceCapabilityRequest,
) => Promise<unknown>;

export interface RitualLiveInferenceInvocationCapabilities {
  readonly authorizeSigning: RitualInferenceSigningAuthorizer;
  readonly sign: RitualTransactionSignerCapability;
  readonly authorizeSubmission: RitualTransactionSubmissionAuthorizer;
  readonly submit: RitualTransactionSubmissionCapability;
  readonly observeSettlement: RitualTransactionSettlementCapability;
  readonly invokeInference: RitualLiveInferenceCapability;
}

export interface RitualLiveInferenceInvoker {
  execute(request: RitualLiveInferenceMappingRequest): Promise<PortfolioAiModelExecutionResult>;
}

/** Creates the single explicit 10E.2 path by composing, not replacing, 10D boundaries. */
export function createRitualLiveInferenceInvoker(
  configuration: RitualLiveInferenceInvocationConfiguration,
  capabilities: RitualLiveInferenceInvocationCapabilities,
): RitualLiveInferenceInvoker {
  const runtime = validateAndDetachConfiguration(configuration);
  const dependencies = validateCapabilities(capabilities);
  const contract = createRitualLiveInferenceContract({
    providerId: RITUAL_PROVIDER_ID,
    targetId: runtime.targetId,
  });
  const constructor = createRitualInferenceTransactionConstructor({
    expectedChainId: RITUAL_CHAIN_ID,
    targetId: runtime.targetId,
    signerId: runtime.signerId,
  });
  const signer = createRitualTransactionSigningBoundary(
    { signerId: runtime.signerId },
    dependencies.sign,
  );
  const lifecycle = createRitualTransactionSubmissionLifecycle(
    runtime.submissionTimeoutMs === undefined ? {} : { timeoutMs: runtime.submissionTimeoutMs },
    dependencies.authorizeSubmission,
    dependencies.submit,
    dependencies.observeSettlement,
  );

  return {
    async execute(value) {
      const operation = contract.mapRequest(value);
      const constructed = constructor.construct({
        executionId: operation.executionId,
        chainId: RITUAL_CHAIN_ID,
        targetId: operation.targetId,
        payload: operation.payload,
      });
      if (!(await authorizeSigning(operation, constructed, dependencies.authorizeSigning))) {
        return failed(operation, 'ritual_signing_unauthorized');
      }
      const signed = await signer.sign(constructed.signingRequest);
      if (signed.status === 'failed') return failed(operation, 'ritual_signing_failed');
      const settlement = await lifecycle.execute({
        executionId: operation.executionId,
        signedTransaction: signed,
      });
      if (settlement.status === 'failed') {
        return failed(operation, `ritual_${settlement.failureKind}`);
      }
      const inference = await invokeOnce(
        operation,
        settlement.submissionId,
        dependencies.invokeInference,
        runtime.inferenceTimeoutMs,
      );
      if (inference.status === 'failed') {
        return failed(
          operation,
          inference.failureKind === RitualLiveInferenceCapabilityFailureKind.Timeout
            ? 'ritual_inference_timeout'
            : 'ritual_inference_failed',
        );
      }
      try {
        return contract.mapCompletedResult(operation, inference);
      } catch {
        return failed(operation, 'ritual_inference_result_invalid');
      }
    },
  };
}

async function authorizeSigning(
  operation: RitualLiveInferenceOperation,
  constructed: ReturnType<RitualInferenceTransactionConstructor['construct']>,
  authorize: RitualInferenceSigningAuthorizer,
): Promise<boolean> {
  const request: RitualInferenceSigningAuthorizationRequest = {
    ...operationIdentity(operation),
    signingRequestId: constructed.signingRequest.signingRequestId,
    signerId: constructed.signingRequest.signerId,
  };
  let value: unknown;
  try {
    value = await authorize(clone(request));
  } catch {
    return false;
  }
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ['status', ...Object.keys(request)]) &&
    value.status === 'authorized' &&
    Object.entries(request).every(([key, expected]) => value[key] === expected)
  );
}

async function invokeOnce(
  operation: RitualLiveInferenceOperation,
  submissionId: string,
  invoke: RitualLiveInferenceCapability,
  timeoutMs: number | undefined,
): Promise<RitualLiveInferenceCapabilityResult> {
  const request: RitualLiveInferenceCapabilityRequest = {
    ...operationIdentity(operation),
    submissionId,
    payload: operation.payload,
  };
  const state = { timedOut: false };
  const invocation = invokeAndDecode(request, operation, invoke, state);
  if (timeoutMs === undefined) return invocation;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      invocation,
      new Promise<RitualLiveInferenceCapabilityResult>((resolve) => {
        timeout = setTimeout(() => {
          state.timedOut = true;
          resolve(capabilityFailed(operation, RitualLiveInferenceCapabilityFailureKind.Timeout));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function invokeAndDecode(
  request: RitualLiveInferenceCapabilityRequest,
  operation: RitualLiveInferenceOperation,
  invoke: RitualLiveInferenceCapability,
  state: { timedOut: boolean },
): Promise<RitualLiveInferenceCapabilityResult> {
  let value: unknown;
  try {
    value = await invoke(clone(request));
  } catch {
    return capabilityFailed(operation, RitualLiveInferenceCapabilityFailureKind.InvocationFailed);
  }
  if (state.timedOut) {
    return capabilityFailed(operation, RitualLiveInferenceCapabilityFailureKind.Timeout);
  }
  return decodeCapabilityResult(value, operation);
}

function decodeCapabilityResult(
  value: unknown,
  operation: RitualLiveInferenceOperation,
): RitualLiveInferenceCapabilityResult {
  if (!isPlainRecord(value)) {
    return capabilityFailed(operation, RitualLiveInferenceCapabilityFailureKind.InvocationFailed);
  }
  const identity = operationIdentity(operation);
  if (Object.entries(identity).some(([key, expected]) => value[key] !== expected)) {
    return capabilityFailed(operation, RitualLiveInferenceCapabilityFailureKind.InvocationFailed);
  }
  const keys = [
    'status',
    ...Object.keys(identity),
    ...(value.status === 'completed' ? ['output'] : ['failureKind']),
  ];
  if (!hasExactKeys(value, keys)) {
    return capabilityFailed(operation, RitualLiveInferenceCapabilityFailureKind.InvocationFailed);
  }
  if (value.status === 'completed' && isNonEmptyString(value.output)) {
    return clone(value) as unknown as RitualLiveInferenceCompletedResult;
  }
  if (
    value.status === 'failed' &&
    Object.values(RitualLiveInferenceCapabilityFailureKind).includes(
      value.failureKind as RitualLiveInferenceCapabilityFailureKind,
    )
  ) {
    return clone(value) as unknown as RitualLiveInferenceCapabilityResult;
  }
  return capabilityFailed(operation, RitualLiveInferenceCapabilityFailureKind.InvocationFailed);
}

function operationIdentity(operation: RitualLiveInferenceOperation): {
  readonly inferenceRequestId: string;
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
} {
  return {
    inferenceRequestId: operation.inferenceRequestId,
    executionId: operation.executionId,
    providerId: RITUAL_PROVIDER_ID,
    ...(operation.modelId === undefined ? {} : { modelId: operation.modelId }),
    targetId: operation.targetId,
  };
}

function capabilityFailed(
  operation: RitualLiveInferenceOperation,
  failureKind: RitualLiveInferenceCapabilityFailureKind,
): Extract<RitualLiveInferenceCapabilityResult, { status: 'failed' }> {
  return { status: 'failed', ...operationIdentity(operation), failureKind };
}

function failed(
  operation: RitualLiveInferenceOperation,
  code: string,
): PortfolioAiModelExecutionResult {
  return {
    executionId: operation.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { code, message: 'The Ritual inference invocation failed.' },
    model: {
      providerId: RITUAL_PROVIDER_ID,
      ...(operation.modelId === undefined ? {} : { modelId: operation.modelId }),
    },
  };
}

function validateAndDetachConfiguration(
  value: RitualLiveInferenceInvocationConfiguration,
): RitualLiveInferenceInvocationConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'providerId',
      'expectedChainId',
      'targetId',
      'signerId',
      ...(value.submissionTimeoutMs === undefined ? [] : ['submissionTimeoutMs']),
      ...(value.inferenceTimeoutMs === undefined ? [] : ['inferenceTimeoutMs']),
    ]) ||
    value.providerId !== RITUAL_PROVIDER_ID ||
    value.expectedChainId !== RITUAL_CHAIN_ID ||
    !isNonEmptyString(value.targetId) ||
    !isNonEmptyString(value.signerId) ||
    !isValidTimeout(value.submissionTimeoutMs) ||
    !isValidTimeout(value.inferenceTimeoutMs)
  ) {
    throw new TypeError('Ritual live inference invocation configuration is invalid.');
  }
  return clone(value);
}

function validateCapabilities(
  value: RitualLiveInferenceInvocationCapabilities,
): RitualLiveInferenceInvocationCapabilities {
  const keys = [
    'authorizeSigning',
    'sign',
    'authorizeSubmission',
    'submit',
    'observeSettlement',
    'invokeInference',
  ];
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, keys) ||
    keys.some((key) => typeof value[key] !== 'function')
  ) {
    throw new TypeError('Ritual live inference invocation capabilities are invalid.');
  }
  return { ...value };
}

function isValidTimeout(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= MAX_TIMEOUT_MS)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
    ) as T;
  }
  return value;
}
