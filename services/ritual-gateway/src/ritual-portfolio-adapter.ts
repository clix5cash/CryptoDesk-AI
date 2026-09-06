import {
  AiExecutionStatus,
  type PortfolioAiModelExecutionRequest,
  type PortfolioAiModelExecutionResult,
  type PortfolioAiModelProviderAdapter,
  PortfolioAiRawExecutionAuthority,
  type PortfolioAiProviderRequestDescriptor,
  validatePortfolioAiProviderRequestDescriptor,
} from '@cryptodesk-ai/ai';

const RITUAL_PROVIDER_ID = 'ritual';

/** Minimal instance-owned configuration for the injected Ritual execution primitive. */
export interface RitualRuntimeConfiguration {
  readonly targetId: string;
}

/** Runtime-owned input for one injected Ritual inference attempt. */
export interface RitualInferenceInvocation {
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
  readonly payload: string;
}

export enum RitualInferenceStatus {
  Completed = 'completed',
  Failed = 'failed',
}

/** Closed runtime failure categories; arbitrary runtime messages are never accepted. */
export enum RitualInferenceFailureKind {
  RuntimeFailure = 'runtime_failure',
  Timeout = 'timeout',
}

interface RitualInferenceCompletedResult {
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
  readonly status: RitualInferenceStatus.Completed;
  readonly output: string;
}

interface RitualInferenceFailedResult {
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
  readonly status: RitualInferenceStatus.Failed;
  readonly failureKind: RitualInferenceFailureKind;
}

/** Runtime-owned terminal result. No chain, receipt, endpoint, or vendor shape crosses it. */
export type RitualInferenceInvocationResult =
  RitualInferenceCompletedResult | RitualInferenceFailedResult;

/** Injected and deterministic in 10A.2; no default network implementation exists. */
export type RitualInferenceInvoker = (
  invocation: RitualInferenceInvocation,
) => Promise<RitualInferenceInvocationResult>;

/**
 * Creates a concrete Ritual adapter behind the existing provider-neutral AI seam.
 * The factory performs no discovery, network access, retry, fallback, or trust promotion.
 */
export function createRitualPortfolioModelProviderAdapter(
  configuration: RitualRuntimeConfiguration,
  invoke: RitualInferenceInvoker,
): PortfolioAiModelProviderAdapter {
  const runtime = validateAndDetachConfiguration(configuration);
  if (typeof invoke !== 'function') throw new TypeError('Ritual runtime invoker is invalid.');

  return {
    providerId: RITUAL_PROVIDER_ID,
    async execute(request) {
      return executeRitualInvocation(request, JSON.stringify(request.context), runtime, invoke);
    },
    async executeProviderRequest(descriptor) {
      validatePortfolioAiProviderRequestDescriptor(descriptor);
      return executeRitualInvocation(
        executionRequestFromDescriptor(descriptor),
        JSON.stringify(descriptor.request.promptDocument),
        runtime,
        invoke,
      );
    },
  };
}

async function executeRitualInvocation(
  request: PortfolioAiModelExecutionRequest,
  payload: string,
  runtime: RitualRuntimeConfiguration,
  invoke: RitualInferenceInvoker,
): Promise<PortfolioAiModelExecutionResult> {
  if (request.model?.providerId !== RITUAL_PROVIDER_ID) {
    return failed(request, 'provider_identity_mismatch', 'Provider identity is not supported.');
  }

  const invocation: RitualInferenceInvocation = {
    executionId: request.executionId,
    providerId: RITUAL_PROVIDER_ID,
    ...(request.model.modelId === undefined ? {} : { modelId: request.model.modelId }),
    targetId: runtime.targetId,
    payload,
  };

  let result: RitualInferenceInvocationResult;
  try {
    result = await invoke(clone(invocation));
  } catch {
    return failed(request, 'ritual_invocation_failed', 'The Ritual invocation failed.');
  }

  if (!isValidRuntimeResult(result)) {
    return failed(request, 'ritual_result_invalid', 'The Ritual execution result is invalid.');
  }
  if (!sameIdentity(invocation, result)) {
    return failed(
      request,
      'ritual_identity_mismatch',
      'The Ritual execution identity conflicts with the request.',
    );
  }
  if (result.status === RitualInferenceStatus.Failed) {
    return result.failureKind === RitualInferenceFailureKind.Timeout
      ? failed(request, 'ritual_timeout', 'The Ritual execution timed out.')
      : failed(request, 'ritual_execution_failed', 'The Ritual execution failed.');
  }

  return {
    executionId: request.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: result.output,
    model: detachModel(request),
  };
}

function executionRequestFromDescriptor(
  descriptor: PortfolioAiProviderRequestDescriptor,
): PortfolioAiModelExecutionRequest {
  return {
    executionId: descriptor.executionId,
    context: descriptor.request.promptDocument.plan.input.context,
    model: descriptor.model,
  };
}

function isValidRuntimeResult(value: unknown): value is RitualInferenceInvocationResult {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      'executionId',
      'providerId',
      'modelId',
      'targetId',
      'status',
      'output',
      'failureKind',
    ]) ||
    !isNonEmptyString(value.executionId) ||
    value.providerId !== RITUAL_PROVIDER_ID ||
    (value.modelId !== undefined && !isNonEmptyString(value.modelId)) ||
    !isNonEmptyString(value.targetId)
  ) {
    return false;
  }

  if (value.status === RitualInferenceStatus.Completed) {
    return isNonEmptyString(value.output) && value.failureKind === undefined;
  }
  if (value.status === RitualInferenceStatus.Failed) {
    return (
      value.output === undefined &&
      Object.values(RitualInferenceFailureKind).includes(
        value.failureKind as RitualInferenceFailureKind,
      )
    );
  }
  return false;
}

function sameIdentity(
  request: RitualInferenceInvocation,
  result: RitualInferenceInvocationResult,
): boolean {
  return (
    result.executionId === request.executionId &&
    result.providerId === request.providerId &&
    result.modelId === request.modelId &&
    result.targetId === request.targetId
  );
}

function failed(
  request: PortfolioAiModelExecutionRequest,
  code: string,
  message: string,
): PortfolioAiModelExecutionResult {
  return {
    executionId: request.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { code, message },
    ...(request.model === undefined ? {} : { model: detachModel(request) }),
  };
}

function detachModel(request: PortfolioAiModelExecutionRequest) {
  return {
    providerId: request.model?.providerId as string,
    ...(request.model?.modelId === undefined ? {} : { modelId: request.model.modelId }),
  };
}

function validateAndDetachConfiguration(
  value: RitualRuntimeConfiguration,
): RitualRuntimeConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ['targetId']) ||
    !isNonEmptyString(value.targetId)
  ) {
    throw new TypeError('Ritual runtime configuration is invalid.');
  }
  return { targetId: value.targetId };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
