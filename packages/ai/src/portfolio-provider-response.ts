import { AiExecutionStatus, type AiExecutionId } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiModelExecutionResult,
  type PortfolioAiModelReference,
  PortfolioAiRawExecutionAuthority,
  validatePortfolioAiModelExecutionRequest,
  validatePortfolioAiModelExecutionResult,
} from './portfolio-model-execution.js';
import {
  type PortfolioAiProviderRequestDescriptor,
  validatePortfolioAiProviderRequestDescriptor,
} from './portfolio-provider-request-descriptor.js';

/** Provider-neutral envelope for one terminal, still-untrusted raw execution. */
export interface PortfolioAiProviderResponse {
  readonly executionId: AiExecutionId;
  readonly model: PortfolioAiModelReference;
  readonly authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution;
  readonly result: PortfolioAiModelExecutionResult;
}

/** Creates a detached response envelope for an existing terminal raw result. */
export function createPortfolioAiProviderResponse(
  descriptor: PortfolioAiProviderRequestDescriptor,
  result: PortfolioAiModelExecutionResult,
): PortfolioAiProviderResponse {
  const response: PortfolioAiProviderResponse = {
    executionId: result.executionId,
    model: clone(result.model) as PortfolioAiModelReference,
    authority: result.authority,
    result: clone(result),
  };
  validatePortfolioAiProviderResponse(descriptor, response);
  return response;
}

/** Validates exact descriptor, result, identity, completion, and trust state only. */
export function validatePortfolioAiProviderResponse(
  descriptor: PortfolioAiProviderRequestDescriptor,
  response: PortfolioAiProviderResponse,
): void {
  try {
    validatePortfolioAiProviderRequestDescriptor(descriptor);
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI provider response descriptor is invalid.');
  }
  if (
    !isPlainRecord(response) ||
    !hasOnlyKeys(response, ['executionId', 'model', 'authority', 'result']) ||
    response.result === undefined ||
    response.model === undefined
  ) {
    throw new AiBoundaryValidationError('Portfolio AI provider response is malformed.');
  }
  try {
    validatePortfolioAiModelExecutionRequest({
      executionId: response.executionId,
      context: descriptor.request.promptDocument.plan.input.context,
      model: response.model,
    });
    validatePortfolioAiModelExecutionResult(
      {
        executionId: descriptor.executionId,
        context: descriptor.request.promptDocument.plan.input.context,
        model: descriptor.model,
      },
      response.result,
    );
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI provider response result is invalid.');
  }
  if (
    !isTerminalStatus(response.result.status) ||
    response.executionId !== descriptor.executionId ||
    response.executionId !== response.result.executionId ||
    !sameModelReference(response.model, descriptor.model) ||
    !sameModelReference(response.model, response.result.model) ||
    response.authority !== PortfolioAiRawExecutionAuthority.UntrustedModelExecution ||
    response.authority !== response.result.authority
  ) {
    throw new AiBoundaryValidationError('Portfolio AI provider response identity conflicts.');
  }
}

function isTerminalStatus(status: AiExecutionStatus): boolean {
  return status === AiExecutionStatus.Completed || status === AiExecutionStatus.Failed;
}

function sameModelReference(
  left: PortfolioAiModelReference,
  right: PortfolioAiModelReference | undefined,
): boolean {
  return left.providerId === right?.providerId && left.modelId === right?.modelId;
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
