import { AiExecutionStatus, type AiExecutionId, type ModelId } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiBuiltContext,
  validatePortfolioAiBuiltContext,
} from './portfolio-intelligence-context.js';

/** Opaque provider/model metadata. It carries no endpoint, credential, or vendor-specific shape. */
export interface PortfolioAiModelReference {
  readonly providerId: string;
  readonly modelId?: ModelId;
}

/** Explicit request boundary for a future model adapter; its context remains canonical grounding material. */
export interface PortfolioAiModelExecutionRequest {
  readonly executionId: AiExecutionId;
  readonly context: PortfolioAiBuiltContext;
  readonly model?: PortfolioAiModelReference;
}

/** Raw model output is untrusted and cannot be confused with a grounded interpretation. */
export enum PortfolioAiRawExecutionAuthority {
  UntrustedModelExecution = 'untrusted_model_execution',
}

/** Provider-neutral failure data supplied by a future execution adapter. */
export interface PortfolioAiModelExecutionFailure {
  readonly code?: string;
  readonly message: string;
}

/** Optional opaque usage units; they deliberately do not imply tokenizer or provider semantics. */
export interface PortfolioAiModelExecutionUsage {
  readonly inputUnits?: number;
  readonly outputUnits?: number;
}

/**
 * Raw result from a future provider-neutral model adapter. It is not Portfolio
 * truth and must pass separate grounded-interpretation validation before use.
 */
export interface PortfolioAiModelExecutionResult {
  readonly executionId: AiExecutionId;
  readonly status: AiExecutionStatus;
  readonly authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution;
  readonly output?: string;
  readonly failure?: PortfolioAiModelExecutionFailure;
  readonly model?: PortfolioAiModelReference;
  readonly usage?: PortfolioAiModelExecutionUsage;
}

/** Validates a request as an immutable reference to canonical deterministic AI context. */
export function validatePortfolioAiModelExecutionRequest(
  request: PortfolioAiModelExecutionRequest,
): void {
  if (
    !isPlainRecord(request) ||
    !hasOnlyKeys(request, ['executionId', 'context', 'model']) ||
    !isNonEmptyString(request.executionId)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI model execution request is malformed.');
  }
  try {
    validatePortfolioAiBuiltContext(request.context);
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI model execution context is invalid.');
  }
  validateModelReference(request.model);
}

/**
 * Validates raw execution structure only. It intentionally does not infer or
 * verify financial facts; a distinct grounded-interpretation step is required.
 */
export function validatePortfolioAiModelExecutionResult(
  request: PortfolioAiModelExecutionRequest,
  result: PortfolioAiModelExecutionResult,
): void {
  validatePortfolioAiModelExecutionRequest(request);
  if (
    !isPlainRecord(result) ||
    !hasOnlyKeys(result, [
      'executionId',
      'status',
      'authority',
      'output',
      'failure',
      'model',
      'usage',
    ]) ||
    result.executionId !== request.executionId ||
    !Object.values(AiExecutionStatus).includes(result.status) ||
    result.authority !== PortfolioAiRawExecutionAuthority.UntrustedModelExecution
  ) {
    throw new AiBoundaryValidationError('Portfolio AI model execution result is malformed.');
  }
  validateModelReference(result.model);
  if (!sameModelReference(result.model, request.model)) {
    throw new AiBoundaryValidationError(
      'Portfolio AI model execution result model conflicts with request.',
    );
  }
  validateUsage(result.usage);
  validateStatusPayload(result);
}

function validateStatusPayload(result: PortfolioAiModelExecutionResult): void {
  switch (result.status) {
    case AiExecutionStatus.Completed:
      if (!isNonEmptyString(result.output) || result.failure !== undefined) {
        throw new AiBoundaryValidationError(
          'Completed Portfolio AI execution result is malformed.',
        );
      }
      return;
    case AiExecutionStatus.Failed:
      if (result.output !== undefined || result.failure === undefined) {
        throw new AiBoundaryValidationError('Failed Portfolio AI execution result is malformed.');
      }
      validateFailure(result.failure);
      return;
    case AiExecutionStatus.Pending:
    case AiExecutionStatus.Running:
    case AiExecutionStatus.Cancelled:
      if (result.output !== undefined || result.failure !== undefined) {
        throw new AiBoundaryValidationError(
          'Incomplete Portfolio AI execution result is malformed.',
        );
      }
  }
}

function validateModelReference(value: PortfolioAiModelReference | undefined): void {
  if (value === undefined) return;
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ['providerId', 'modelId']) ||
    !isNonEmptyString(value.providerId) ||
    (value.modelId !== undefined && !isNonEmptyString(value.modelId))
  ) {
    throw new AiBoundaryValidationError('Portfolio AI model reference is malformed.');
  }
}

function validateFailure(value: PortfolioAiModelExecutionFailure): void {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ['code', 'message']) ||
    !isNonEmptyString(value.message) ||
    (value.code !== undefined && !isNonEmptyString(value.code))
  ) {
    throw new AiBoundaryValidationError('Portfolio AI execution failure is malformed.');
  }
}

function validateUsage(value: PortfolioAiModelExecutionUsage | undefined): void {
  if (value === undefined) return;
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ['inputUnits', 'outputUnits']) ||
    (value.inputUnits === undefined && value.outputUnits === undefined) ||
    (value.inputUnits !== undefined && !isNonNegativeSafeInteger(value.inputUnits)) ||
    (value.outputUnits !== undefined && !isNonNegativeSafeInteger(value.outputUnits))
  ) {
    throw new AiBoundaryValidationError('Portfolio AI execution usage is malformed.');
  }
}

function sameModelReference(
  left: PortfolioAiModelReference | undefined,
  right: PortfolioAiModelReference | undefined,
): boolean {
  return left?.providerId === right?.providerId && left?.modelId === right?.modelId;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
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
