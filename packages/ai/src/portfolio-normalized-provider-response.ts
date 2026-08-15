import { AiExecutionStatus, type AiExecutionId } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiModelExecutionFailure,
  type PortfolioAiModelExecutionResult,
  type PortfolioAiModelReference,
  PortfolioAiRawExecutionAuthority,
  validatePortfolioAiModelExecutionResult,
} from './portfolio-model-execution.js';
import type { PortfolioAiProviderRequestDescriptor } from './portfolio-provider-request-descriptor.js';
import {
  type PortfolioAiProviderResponse,
  validatePortfolioAiProviderResponse,
} from './portfolio-provider-response.js';

interface PortfolioAiNormalizedProviderResponseBase {
  readonly executionId: AiExecutionId;
  readonly model: PortfolioAiModelReference;
  readonly authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution;
  readonly source: PortfolioAiProviderResponse;
}

export interface PortfolioAiNormalizedProviderCompletedResponse extends PortfolioAiNormalizedProviderResponseBase {
  readonly status: AiExecutionStatus.Completed;
  readonly output: string;
  readonly failure?: never;
}

export interface PortfolioAiNormalizedProviderFailedResponse extends PortfolioAiNormalizedProviderResponseBase {
  readonly status: AiExecutionStatus.Failed;
  readonly output?: never;
  readonly failure: PortfolioAiModelExecutionFailure;
}

/** Structural, provider-neutral projection of one terminal untrusted response. */
export type PortfolioAiNormalizedProviderResponse =
  PortfolioAiNormalizedProviderCompletedResponse | PortfolioAiNormalizedProviderFailedResponse;

/** Normalizes structure only; raw output and failure text remain opaque. */
export function normalizePortfolioAiProviderResponse(
  descriptor: PortfolioAiProviderRequestDescriptor,
  response: PortfolioAiProviderResponse,
): PortfolioAiNormalizedProviderResponse {
  validatePortfolioAiProviderResponse(descriptor, response);
  let normalized: PortfolioAiNormalizedProviderResponse;
  if (response.result.status === AiExecutionStatus.Completed) {
    normalized = {
      executionId: response.executionId,
      model: clone(response.model),
      status: AiExecutionStatus.Completed,
      authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
      output: response.result.output as string,
      source: clone(response),
    };
  } else {
    normalized = {
      executionId: response.executionId,
      model: clone(response.model),
      status: AiExecutionStatus.Failed,
      authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
      failure: clone(response.result.failure) as PortfolioAiModelExecutionFailure,
      source: clone(response),
    };
  }
  validatePortfolioAiNormalizedProviderResponse(descriptor, normalized);
  return normalized;
}

/** Validates exact structural ownership and traceability to the source response. */
export function validatePortfolioAiNormalizedProviderResponse(
  descriptor: PortfolioAiProviderRequestDescriptor,
  normalized: PortfolioAiNormalizedProviderResponse,
): void {
  if (
    !isPlainRecord(normalized) ||
    !hasOnlyKeys(normalized, [
      'executionId',
      'model',
      'status',
      'authority',
      'output',
      'failure',
      'source',
    ]) ||
    normalized.source === undefined ||
    normalized.model === undefined
  ) {
    throw new AiBoundaryValidationError('Normalized Portfolio AI provider response is malformed.');
  }
  try {
    validatePortfolioAiProviderResponse(descriptor, normalized.source);
    validatePortfolioAiModelExecutionResult(
      {
        executionId: descriptor.executionId,
        context: descriptor.request.promptDocument.plan.input.context,
        model: descriptor.model,
      },
      normalizedExecutionResult(normalized),
    );
  } catch (error) {
    throw asBoundaryError(error, 'Normalized Portfolio AI provider response source is invalid.');
  }
  if (
    normalized.executionId !== normalized.source.executionId ||
    !sameModelReference(normalized.model, normalized.source.model) ||
    normalized.status !== normalized.source.result.status ||
    normalized.authority !== PortfolioAiRawExecutionAuthority.UntrustedModelExecution ||
    normalized.authority !== normalized.source.authority ||
    normalized.output !== normalized.source.result.output ||
    !sameFailure(normalized.failure, normalized.source.result.failure)
  ) {
    throw new AiBoundaryValidationError(
      'Normalized Portfolio AI provider response conflicts with its source.',
    );
  }
}

function normalizedExecutionResult(
  normalized: PortfolioAiNormalizedProviderResponse,
): PortfolioAiModelExecutionResult {
  return {
    executionId: normalized.executionId,
    status: normalized.status,
    authority: normalized.authority,
    model: normalized.model,
    ...(normalized.status === AiExecutionStatus.Completed
      ? { output: normalized.output }
      : { failure: normalized.failure }),
  };
}

function sameModelReference(
  left: PortfolioAiModelReference,
  right: PortfolioAiModelReference,
): boolean {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

function sameFailure(
  left: PortfolioAiModelExecutionFailure | undefined,
  right: PortfolioAiModelExecutionFailure | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left?.code === right?.code && left?.message === right?.message;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function asBoundaryError(error: unknown, fallback: string): AiBoundaryValidationError {
  return new AiBoundaryValidationError(error instanceof Error ? error.message : fallback);
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
