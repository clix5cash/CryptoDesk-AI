import {
  AiExecutionStatus,
  type PortfolioAiModelExecutionRequest,
  type PortfolioAiModelExecutionResult,
  type PortfolioAiModelProviderAdapter,
  PortfolioAiRawExecutionAuthority,
  type PortfolioAiProviderRequestDescriptor,
  validatePortfolioAiModelExecutionRequest,
  validatePortfolioAiProviderRequestDescriptor,
} from '@cryptodesk-ai/ai';
import { executeInjectedRitualTransport } from './ritual-inference-transport.js';

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
      validatePortfolioAiModelExecutionRequest(request);
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
  const detachedRequest = clone(request);
  if (detachedRequest.model?.providerId !== RITUAL_PROVIDER_ID) {
    return failed(
      detachedRequest,
      'provider_identity_mismatch',
      'Provider identity is not supported.',
    );
  }

  const invocation: RitualInferenceInvocation = {
    executionId: detachedRequest.executionId,
    providerId: RITUAL_PROVIDER_ID,
    ...(detachedRequest.model.modelId === undefined
      ? {}
      : { modelId: detachedRequest.model.modelId }),
    targetId: runtime.targetId,
    payload,
  };

  const outcome = await executeInjectedRitualTransport(invocation, invoke);
  switch (outcome.kind) {
    case 'invocation_failed':
      return failed(detachedRequest, 'ritual_invocation_failed', 'The Ritual invocation failed.');
    case 'result_invalid':
      return failed(
        detachedRequest,
        'ritual_result_invalid',
        'The Ritual execution result is invalid.',
      );
    case 'identity_mismatch':
      return failed(
        detachedRequest,
        'ritual_identity_mismatch',
        'The Ritual execution identity conflicts with the request.',
      );
    case 'failed':
      return outcome.failureKind === RitualInferenceFailureKind.Timeout
        ? failed(detachedRequest, 'ritual_timeout', 'The Ritual execution timed out.')
        : failed(detachedRequest, 'ritual_execution_failed', 'The Ritual execution failed.');
    case 'completed':
      return {
        executionId: detachedRequest.executionId,
        status: AiExecutionStatus.Completed,
        authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
        output: outcome.output,
        model: detachModel(detachedRequest),
      };
  }
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
