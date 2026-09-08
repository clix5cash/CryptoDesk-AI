import {
  AiExecutionStatus,
  type PortfolioAiModelExecutionResult,
  PortfolioAiRawExecutionAuthority,
} from '@cryptodesk-ai/ai';
import {
  createRitualLiveInferenceContract,
  type RitualLiveInferenceMappingRequest,
  type RitualLiveInferenceOperation,
} from './ritual-live-inference-contract.js';

const RITUAL_PROVIDER_ID = 'ritual';
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface RitualInferenceResultVerificationConfiguration {
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly targetId: string;
  readonly timeoutMs?: number;
}

export interface RitualInferenceResultVerificationRequest {
  readonly mappingRequest: RitualLiveInferenceMappingRequest;
  readonly submissionId: string;
  readonly settlementId: string;
  readonly invocationId: string;
}

export interface RitualInferenceResultRetrievalRequest {
  readonly inferenceRequestId: string;
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
  readonly submissionId: string;
  readonly settlementId: string;
  readonly invocationId: string;
}

export enum RitualInferenceResultRetrievalFailureKind {
  RetrievalFailed = 'retrieval_failed',
}

export type RitualInferenceResultRetrievalResult =
  | (RitualInferenceResultRetrievalRequest & {
      readonly status: 'completed';
      readonly provenanceId: string;
      readonly output: string;
    })
  | (RitualInferenceResultRetrievalRequest & {
      readonly status: 'failed';
      readonly failureKind: RitualInferenceResultRetrievalFailureKind;
    });

export type RitualInferenceResultRetrievalCapability = (
  request: RitualInferenceResultRetrievalRequest,
) => Promise<unknown>;

export interface RitualInferenceProvenanceVerificationRequest extends RitualInferenceResultRetrievalRequest {
  readonly provenanceId: string;
}

export type RitualInferenceProvenanceVerificationCapability = (
  request: RitualInferenceProvenanceVerificationRequest,
) => Promise<unknown>;

export interface RitualInferenceResultVerificationCapabilities {
  readonly retrieveResult: RitualInferenceResultRetrievalCapability;
  readonly verifyProvenance: RitualInferenceProvenanceVerificationCapability;
}

export interface RitualInferenceResultVerifier {
  verify(
    request: RitualInferenceResultVerificationRequest,
  ): Promise<PortfolioAiModelExecutionResult>;
}

/**
 * Creates the gateway-local 10E.3 retrieval and structural provenance boundary.
 * Verification correlates execution evidence; it does not promote analytical trust.
 */
export function createRitualInferenceResultVerifier(
  configuration: RitualInferenceResultVerificationConfiguration,
  capabilities: RitualInferenceResultVerificationCapabilities,
): RitualInferenceResultVerifier {
  const runtime = validateAndDetachConfiguration(configuration);
  const dependencies = validateCapabilities(capabilities);
  const contract = createRitualLiveInferenceContract({
    providerId: RITUAL_PROVIDER_ID,
    targetId: runtime.targetId,
  });

  return {
    async verify(value) {
      const request = validateAndDetachRequest(value);
      const operation = contract.mapRequest(request.mappingRequest);
      const identity = retrievalIdentity(operation, request);
      const settled = await settleOnce(identity, dependencies, runtime.timeoutMs);
      if (settled.status === 'failed') return failed(operation, settled.failureCode);
      try {
        return contract.mapCompletedResult(operation, {
          status: 'completed',
          ...operationIdentity(operation),
          output: settled.output,
        });
      } catch {
        return failed(operation, 'ritual_result_invalid');
      }
    },
  };
}

type SettlementResult =
  | { readonly status: 'completed'; readonly output: string }
  | { readonly status: 'failed'; readonly failureCode: string };

async function settleOnce(
  identity: RitualInferenceResultRetrievalRequest,
  capabilities: RitualInferenceResultVerificationCapabilities,
  timeoutMs: number | undefined,
): Promise<SettlementResult> {
  const state = { timedOut: false };
  const operation = retrieveAndVerify(identity, capabilities, state);
  if (timeoutMs === undefined) return operation;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<SettlementResult>((resolve) => {
        timeout = setTimeout(() => {
          state.timedOut = true;
          resolve({ status: 'failed', failureCode: 'ritual_result_retrieval_timeout' });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function retrieveAndVerify(
  identity: RitualInferenceResultRetrievalRequest,
  capabilities: RitualInferenceResultVerificationCapabilities,
  state: { timedOut: boolean },
): Promise<SettlementResult> {
  let retrievedValue: unknown;
  try {
    retrievedValue = await capabilities.retrieveResult(clone(identity));
  } catch {
    return failure('ritual_result_retrieval_failed');
  }
  if (state.timedOut) return failure('ritual_result_retrieval_timeout');
  const retrieved = decodeRetrieval(retrievedValue, identity);
  if ('failureCode' in retrieved) return retrieved;

  const provenanceRequest = { ...identity, provenanceId: retrieved.provenanceId };
  let verificationValue: unknown;
  try {
    verificationValue = await capabilities.verifyProvenance(clone(provenanceRequest));
  } catch {
    return failure('ritual_provenance_verification_failed');
  }
  if (state.timedOut) return failure('ritual_result_retrieval_timeout');
  if (!isVerifiedProvenance(verificationValue, provenanceRequest)) {
    return failure('ritual_provenance_invalid');
  }
  return { status: 'completed', output: retrieved.output };
}

function decodeRetrieval(
  value: unknown,
  identity: RitualInferenceResultRetrievalRequest,
):
  | { readonly provenanceId: string; readonly output: string }
  | Extract<SettlementResult, { status: 'failed' }> {
  if (!isPlainRecord(value)) return failure('ritual_result_invalid');
  if (identityEntries(identity).some(([key, expected]) => value[key] !== expected)) {
    return failure('ritual_result_identity_mismatch');
  }
  const terminalKey = value.status === 'completed' ? ['provenanceId', 'output'] : ['failureKind'];
  if (!hasExactKeys(value, ['status', ...Object.keys(identity), ...terminalKey])) {
    return failure('ritual_result_invalid');
  }
  if (
    value.status === 'completed' &&
    isNonEmptyString(value.provenanceId) &&
    isNonEmptyString(value.output)
  ) {
    return { provenanceId: value.provenanceId, output: value.output };
  }
  if (
    value.status === 'failed' &&
    value.failureKind === RitualInferenceResultRetrievalFailureKind.RetrievalFailed
  ) {
    return failure('ritual_result_retrieval_failed');
  }
  return failure('ritual_result_invalid');
}

function isVerifiedProvenance(
  value: unknown,
  request: RitualInferenceProvenanceVerificationRequest,
): boolean {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ['status', ...Object.keys(request)]) &&
    value.status === 'verified' &&
    Object.entries(request).every(([key, expected]) => value[key] === expected)
  );
}

function validateAndDetachConfiguration(
  value: RitualInferenceResultVerificationConfiguration,
): RitualInferenceResultVerificationConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'providerId',
      'targetId',
      ...(value.timeoutMs === undefined ? [] : ['timeoutMs']),
    ]) ||
    value.providerId !== RITUAL_PROVIDER_ID ||
    !isNonEmptyString(value.targetId) ||
    !isValidTimeout(value.timeoutMs)
  ) {
    throw new TypeError('Ritual inference result verification configuration is invalid.');
  }
  return clone(value);
}

function validateAndDetachRequest(
  value: RitualInferenceResultVerificationRequest,
): RitualInferenceResultVerificationRequest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['mappingRequest', 'submissionId', 'settlementId', 'invocationId']) ||
    !isPlainRecord(value.mappingRequest) ||
    !isNonEmptyString(value.submissionId) ||
    !isNonEmptyString(value.settlementId) ||
    !isNonEmptyString(value.invocationId)
  ) {
    throw new TypeError('Ritual inference result verification request is invalid.');
  }
  return clone(value);
}

function validateCapabilities(
  value: RitualInferenceResultVerificationCapabilities,
): RitualInferenceResultVerificationCapabilities {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['retrieveResult', 'verifyProvenance']) ||
    typeof value.retrieveResult !== 'function' ||
    typeof value.verifyProvenance !== 'function'
  ) {
    throw new TypeError('Ritual inference result verification capabilities are invalid.');
  }
  return { ...value };
}

function retrievalIdentity(
  operation: RitualLiveInferenceOperation,
  request: RitualInferenceResultVerificationRequest,
): RitualInferenceResultRetrievalRequest {
  return {
    ...operationIdentity(operation),
    submissionId: request.submissionId,
    settlementId: request.settlementId,
    invocationId: request.invocationId,
  };
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

function identityEntries(value: RitualInferenceResultRetrievalRequest) {
  return Object.entries(value);
}

function failure(failureCode: string): Extract<SettlementResult, { status: 'failed' }> {
  return { status: 'failed', failureCode };
}

function failed(
  operation: RitualLiveInferenceOperation,
  code: string,
): PortfolioAiModelExecutionResult {
  return {
    executionId: operation.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { code, message: 'The Ritual inference result verification failed.' },
    model: {
      providerId: RITUAL_PROVIDER_ID,
      ...(operation.modelId === undefined ? {} : { modelId: operation.modelId }),
    },
  };
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
