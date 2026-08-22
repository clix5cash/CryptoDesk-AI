import { AiBoundaryValidationError } from './errors.js';
import { assemblePortfolioAiCandidateInterpretation } from './portfolio-candidate-assembly.js';
import {
  PortfolioAiCandidateInterpretationAuthority,
  type PortfolioAiCandidateInterpretationResult,
  validatePortfolioAiCandidateInterpretationResult,
} from './portfolio-model-output-interpretation.js';
import type {
  PortfolioAiModelExecutionRequest,
  PortfolioAiModelReference,
} from './portfolio-model-execution.js';
import {
  type PortfolioAiProviderExchange,
  validatePortfolioAiProviderExchange,
} from './portfolio-provider-exchange.js';
import {
  type PortfolioAiParsedStructuredOutput,
  validatePortfolioAiParsedStructuredOutput,
} from './portfolio-structured-output-parser.js';

/** Validated candidate output with exact traceability to its provider exchange. */
export interface PortfolioAiParsedCandidateValidationResult {
  readonly executionId: string;
  readonly model: PortfolioAiModelReference;
  readonly authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation;
  readonly candidate: PortfolioAiCandidateInterpretationResult;
  readonly sourceExchange: PortfolioAiProviderExchange;
}

/**
 * Maps already-parsed structured fields through the existing candidate assembly
 * and canonical-reference validators. It neither accepts raw text nor grounds.
 */
export function validatePortfolioAiParsedCandidates(
  parsed: PortfolioAiParsedStructuredOutput,
): PortfolioAiParsedCandidateValidationResult {
  try {
    validatePortfolioAiParsedStructuredOutput(parsed);
  } catch (error) {
    throw asBoundaryError(error, 'Parsed Portfolio AI candidate input is invalid.');
  }

  const context = parsed.sourceExchange.descriptor.request.promptDocument.plan.input.context;
  const request: PortfolioAiModelExecutionRequest = {
    executionId: parsed.executionId,
    context,
    model: clone(parsed.model),
  };
  const execution = parsed.sourceExchange.response.source.result;
  const candidate = assemblePortfolioAiCandidateInterpretation({
    context,
    request,
    execution,
    candidates: parsed.candidates,
  });
  const result: PortfolioAiParsedCandidateValidationResult = {
    executionId: parsed.executionId,
    model: clone(parsed.model),
    authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
    candidate,
    sourceExchange: clone(parsed.sourceExchange),
  };
  validatePortfolioAiParsedCandidateValidationResult(result);
  return result;
}

/** Validates the integration envelope without grounding or trust promotion. */
export function validatePortfolioAiParsedCandidateValidationResult(
  result: PortfolioAiParsedCandidateValidationResult,
): void {
  if (
    !isPlainRecord(result) ||
    !hasExactKeys(result, ['executionId', 'model', 'authority', 'candidate', 'sourceExchange']) ||
    result.authority !==
      PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation ||
    !sameModelReference(result.model, result.sourceExchange?.model) ||
    result.executionId !== result.sourceExchange?.executionId ||
    result.executionId !== result.candidate?.executionId ||
    !sameModelReference(result.model, result.candidate?.model)
  ) {
    throw new AiBoundaryValidationError(
      'Validated Portfolio AI parsed candidate result is malformed.',
    );
  }

  try {
    validatePortfolioAiProviderExchange(result.sourceExchange);
  } catch (error) {
    throw asBoundaryError(error, 'Validated Portfolio AI parsed candidate source is invalid.');
  }

  const context = result.sourceExchange.descriptor.request.promptDocument.plan.input.context;
  const request: PortfolioAiModelExecutionRequest = {
    executionId: result.executionId,
    context,
    model: result.model,
  };
  validatePortfolioAiCandidateInterpretationResult(
    context,
    request,
    result.sourceExchange.response.source.result,
    result.candidate,
  );
}

function sameModelReference(
  left: PortfolioAiModelReference | undefined,
  right: PortfolioAiModelReference | undefined,
): boolean {
  return left?.providerId === right?.providerId && left?.modelId === right?.modelId;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  return (
    Object.keys(value).length === expected.length && expected.every((key) => hasOwn(value, key))
  );
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
