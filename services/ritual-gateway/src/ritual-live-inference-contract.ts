import {
  AiExecutionStatus,
  type PortfolioAiModelExecutionResult,
  type PortfolioAiProviderRequestDescriptor,
  PortfolioAiRawExecutionAuthority,
  validatePortfolioAiProviderRequestDescriptor,
} from '@cryptodesk-ai/ai';

const RITUAL_PROVIDER_ID = 'ritual';

/** Explicit gateway-owned identity policy for future Ritual inference. */
export interface RitualLiveInferenceContractConfiguration {
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly targetId: string;
}

/** AI owns `descriptor`; the gateway owns the explicit inference lifecycle identity. */
export interface RitualLiveInferenceMappingRequest {
  readonly inferenceRequestId: string;
  readonly targetId: string;
  readonly descriptor: PortfolioAiProviderRequestDescriptor;
}

/** Detached gateway-local operation contract. It is not a transaction or invocation. */
export interface RitualLiveInferenceOperation {
  readonly inferenceRequestId: string;
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
  readonly payload: string;
}

/** Minimal opaque result owned by the gateway before provider-neutral mapping. */
export interface RitualLiveInferenceCompletedResult {
  readonly status: 'completed';
  readonly inferenceRequestId: string;
  readonly executionId: string;
  readonly providerId: typeof RITUAL_PROVIDER_ID;
  readonly modelId?: string;
  readonly targetId: string;
  readonly output: string;
}

export interface RitualLiveInferenceContract {
  mapRequest(request: RitualLiveInferenceMappingRequest): RitualLiveInferenceOperation;
  mapCompletedResult(
    operation: RitualLiveInferenceOperation,
    result: RitualLiveInferenceCompletedResult,
  ): PortfolioAiModelExecutionResult;
}

/**
 * Creates a pure contract mapper. It performs no Ritual invocation, transaction,
 * signing, submission, settlement, retrieval, retry, or provider selection.
 */
export function createRitualLiveInferenceContract(
  configuration: RitualLiveInferenceContractConfiguration,
): RitualLiveInferenceContract {
  const runtime = validateAndDetachConfiguration(configuration);
  return {
    mapRequest(value) {
      const request = validateAndDetachMappingRequest(value, runtime);
      return {
        inferenceRequestId: request.inferenceRequestId,
        executionId: request.descriptor.executionId,
        providerId: RITUAL_PROVIDER_ID,
        ...(request.descriptor.model.modelId === undefined
          ? {}
          : { modelId: request.descriptor.model.modelId }),
        targetId: runtime.targetId,
        payload: JSON.stringify(request.descriptor.request.promptDocument),
      };
    },
    mapCompletedResult(operationValue, resultValue) {
      const operation = validateAndDetachOperation(operationValue, runtime);
      const result = validateAndDetachCompletedResult(resultValue, operation);
      const mapped: PortfolioAiModelExecutionResult = {
        executionId: operation.executionId,
        status: AiExecutionStatus.Completed,
        authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
        output: result.output,
        model: modelReference(operation),
      };
      return clone(mapped);
    },
  };
}

function validateAndDetachConfiguration(
  value: RitualLiveInferenceContractConfiguration,
): RitualLiveInferenceContractConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['providerId', 'targetId']) ||
    value.providerId !== RITUAL_PROVIDER_ID ||
    !isNonEmptyString(value.targetId)
  ) {
    throw new TypeError('Ritual live inference contract configuration is invalid.');
  }
  return { providerId: RITUAL_PROVIDER_ID, targetId: value.targetId };
}

function validateAndDetachMappingRequest(
  value: RitualLiveInferenceMappingRequest,
  runtime: RitualLiveInferenceContractConfiguration,
): RitualLiveInferenceMappingRequest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['inferenceRequestId', 'targetId', 'descriptor']) ||
    !isNonEmptyString(value.inferenceRequestId) ||
    value.targetId !== runtime.targetId ||
    !isPlainRecord(value.descriptor)
  ) {
    throw new TypeError('Ritual live inference mapping request is invalid.');
  }
  try {
    validatePortfolioAiProviderRequestDescriptor(value.descriptor);
  } catch {
    throw new TypeError('Ritual live inference mapping request is invalid.');
  }
  if (value.descriptor.model.providerId !== RITUAL_PROVIDER_ID) {
    throw new TypeError('Ritual live inference mapping identity conflicts.');
  }
  return {
    inferenceRequestId: value.inferenceRequestId,
    targetId: runtime.targetId,
    descriptor: clone(value.descriptor),
  };
}

function validateAndDetachOperation(
  value: RitualLiveInferenceOperation,
  runtime: RitualLiveInferenceContractConfiguration,
): RitualLiveInferenceOperation {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'inferenceRequestId',
      'executionId',
      'providerId',
      ...(value.modelId === undefined ? [] : ['modelId']),
      'targetId',
      'payload',
    ]) ||
    !isNonEmptyString(value.inferenceRequestId) ||
    !isNonEmptyString(value.executionId) ||
    value.providerId !== RITUAL_PROVIDER_ID ||
    (value.modelId !== undefined && !isNonEmptyString(value.modelId)) ||
    value.targetId !== runtime.targetId ||
    !isNonEmptyString(value.payload)
  ) {
    throw new TypeError('Ritual live inference operation is invalid.');
  }
  return clone(value);
}

function validateAndDetachCompletedResult(
  value: RitualLiveInferenceCompletedResult,
  operation: RitualLiveInferenceOperation,
): RitualLiveInferenceCompletedResult {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'status',
      'inferenceRequestId',
      'executionId',
      'providerId',
      ...(value.modelId === undefined ? [] : ['modelId']),
      'targetId',
      'output',
    ]) ||
    value.status !== 'completed' ||
    !isNonEmptyString(value.output)
  ) {
    throw new TypeError('Ritual live inference result is invalid.');
  }
  if (
    value.inferenceRequestId !== operation.inferenceRequestId ||
    value.executionId !== operation.executionId ||
    value.providerId !== operation.providerId ||
    value.modelId !== operation.modelId ||
    value.targetId !== operation.targetId
  ) {
    throw new TypeError('Ritual live inference result identity conflicts.');
  }
  return clone(value);
}

function modelReference(operation: RitualLiveInferenceOperation) {
  return {
    providerId: RITUAL_PROVIDER_ID,
    ...(operation.modelId === undefined ? {} : { modelId: operation.modelId }),
  };
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
