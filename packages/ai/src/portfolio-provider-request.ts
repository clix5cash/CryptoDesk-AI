import { type AiExecutionId } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiModelReference,
  validatePortfolioAiModelExecutionRequest,
} from './portfolio-model-execution.js';
import {
  type PortfolioAiPromptDocument,
  validatePortfolioAiPromptDocument,
} from './portfolio-prompt-document.js';

/**
 * Provider-neutral transport-preparation envelope. It deliberately preserves
 * the portable prompt document rather than representing a vendor request body.
 */
export interface PortfolioAiProviderRequest {
  readonly executionId: AiExecutionId;
  readonly model: PortfolioAiModelReference;
  readonly promptDocument: PortfolioAiPromptDocument;
}

/** Creates a detached provider-neutral request envelope without executing or mapping it. */
export function createPortfolioAiProviderRequest(
  request: PortfolioAiProviderRequest,
): PortfolioAiProviderRequest {
  validatePortfolioAiProviderRequest(request);
  return clone(request);
}

/**
 * Validates explicit execution and opaque provider/model identity against the
 * canonical context already retained by the prompt document.
 */
export function validatePortfolioAiProviderRequest(request: PortfolioAiProviderRequest): void {
  if (
    !isPlainRecord(request) ||
    !hasOnlyKeys(request, ['executionId', 'model', 'promptDocument']) ||
    request.model === undefined ||
    request.promptDocument === undefined
  ) {
    throw new AiBoundaryValidationError('Portfolio AI provider request is malformed.');
  }
  try {
    validatePortfolioAiPromptDocument(request.promptDocument);
    validatePortfolioAiModelExecutionRequest({
      executionId: request.executionId,
      context: request.promptDocument.plan.input.context,
      model: request.model,
    });
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI provider request is invalid.');
  }
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
