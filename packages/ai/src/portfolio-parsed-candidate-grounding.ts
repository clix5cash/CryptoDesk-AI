import { AiBoundaryValidationError } from './errors.js';
import { groundPortfolioAiCandidateInterpretation } from './portfolio-candidate-grounding.js';
import {
  type PortfolioAiGroundedInterpretationResult,
  validatePortfolioAiGroundedInterpretationResult,
} from './portfolio-grounded-interpretation.js';
import { PortfolioAiResultAuthority } from './portfolio-intelligence.js';
import type { PortfolioAiModelExecutionRequest } from './portfolio-model-execution.js';
import {
  type PortfolioAiParsedCandidateValidationResult,
  validatePortfolioAiParsedCandidateValidationResult,
  validatePortfolioAiParsedCandidates,
} from './portfolio-parsed-candidate-integration.js';
import {
  type PortfolioAiParsedStructuredOutput,
  validatePortfolioAiParsedStructuredOutput,
} from './portfolio-structured-output-parser.js';

/** Explicit complete-chain input; neither raw text nor unvalidated candidates are accepted. */
export interface PortfolioAiParsedCandidateGroundingInput {
  readonly parsed: PortfolioAiParsedStructuredOutput;
  readonly candidateValidation: PortfolioAiParsedCandidateValidationResult;
}

/** Grounded non-authoritative output with complete parsed and exchange traceability. */
export interface PortfolioAiParsedCandidateGroundingResult {
  readonly executionId: string;
  readonly providerId: string;
  readonly modelId?: string;
  readonly authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation;
  readonly grounded: PortfolioAiGroundedInterpretationResult;
  readonly sourceParsedOutput: PortfolioAiParsedStructuredOutput;
  readonly sourceCandidateValidation: PortfolioAiParsedCandidateValidationResult;
}

/**
 * Explicitly grounds an already parsed and validated candidate result through
 * the existing deterministic grounding boundary. No raw-output shortcut exists.
 */
export function groundPortfolioAiParsedCandidates(
  input: PortfolioAiParsedCandidateGroundingInput,
): PortfolioAiParsedCandidateGroundingResult {
  validateInput(input);
  validateSources(input.parsed, input.candidateValidation);

  const context =
    input.candidateValidation.sourceExchange.descriptor.request.promptDocument.plan.input.context;
  const request: PortfolioAiModelExecutionRequest = {
    executionId: input.candidateValidation.executionId,
    context,
    model: clone(input.candidateValidation.model),
  };
  const grounded = groundPortfolioAiCandidateInterpretation({
    context,
    request,
    execution: input.candidateValidation.sourceExchange.response.source.result,
    candidate: input.candidateValidation.candidate,
  });
  const result: PortfolioAiParsedCandidateGroundingResult = {
    executionId: input.candidateValidation.executionId,
    providerId: input.candidateValidation.model.providerId,
    ...(input.candidateValidation.model.modelId === undefined
      ? {}
      : { modelId: input.candidateValidation.model.modelId }),
    authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
    grounded,
    sourceParsedOutput: clone(input.parsed),
    sourceCandidateValidation: clone(input.candidateValidation),
  };
  validatePortfolioAiParsedCandidateGroundingResult(result);
  return result;
}

/** Validates complete-chain identity, trust, ordering, and exact grounding references. */
export function validatePortfolioAiParsedCandidateGroundingResult(
  result: PortfolioAiParsedCandidateGroundingResult,
): void {
  if (
    !isPlainRecord(result) ||
    !hasAllowedKeys(result, [
      'executionId',
      'providerId',
      'modelId',
      'authority',
      'grounded',
      'sourceParsedOutput',
      'sourceCandidateValidation',
    ]) ||
    !hasOwn(result, 'executionId') ||
    !hasOwn(result, 'providerId') ||
    !hasOwn(result, 'authority') ||
    !hasOwn(result, 'grounded') ||
    !hasOwn(result, 'sourceParsedOutput') ||
    !hasOwn(result, 'sourceCandidateValidation') ||
    result.authority !== PortfolioAiResultAuthority.NonAuthoritativeInterpretation
  ) {
    throw new AiBoundaryValidationError(
      'Grounded Portfolio AI parsed candidate result is malformed.',
    );
  }
  validateSources(result.sourceParsedOutput, result.sourceCandidateValidation);

  const model = result.sourceCandidateValidation.model;
  if (
    result.executionId !== result.sourceCandidateValidation.executionId ||
    result.providerId !== model.providerId ||
    result.modelId !== model.modelId
  ) {
    throw new AiBoundaryValidationError(
      'Grounded Portfolio AI parsed candidate identity conflicts.',
    );
  }

  const context =
    result.sourceCandidateValidation.sourceExchange.descriptor.request.promptDocument.plan.input
      .context;
  validatePortfolioAiGroundedInterpretationResult(context, result.grounded);
  validateGroundedContinuity(result.sourceCandidateValidation, result.grounded);
}

function validateInput(input: PortfolioAiParsedCandidateGroundingInput): void {
  if (!isPlainRecord(input) || !hasExactKeys(input, ['parsed', 'candidateValidation'])) {
    throw new AiBoundaryValidationError(
      'Portfolio AI parsed candidate grounding input is malformed.',
    );
  }
}

function validateSources(
  parsed: PortfolioAiParsedStructuredOutput,
  candidateValidation: PortfolioAiParsedCandidateValidationResult,
): void {
  try {
    validatePortfolioAiParsedStructuredOutput(parsed);
    validatePortfolioAiParsedCandidateValidationResult(candidateValidation);
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI parsed candidate grounding source is invalid.');
  }
  const expected = validatePortfolioAiParsedCandidates(parsed);
  if (!sameJson(expected, candidateValidation)) {
    throw new AiBoundaryValidationError(
      'Portfolio AI parsed and validated candidate sources conflict.',
    );
  }
}

function validateGroundedContinuity(
  source: PortfolioAiParsedCandidateValidationResult,
  grounded: PortfolioAiGroundedInterpretationResult,
): void {
  if (source.candidate.candidates.length !== grounded.interpretations.length) {
    throw new AiBoundaryValidationError('Grounded Portfolio AI candidate ordering conflicts.');
  }
  for (const [index, candidate] of source.candidate.candidates.entries()) {
    const interpretation = grounded.interpretations[index];
    if (
      interpretation === undefined ||
      interpretation.id !== candidate.id ||
      interpretation.content !== candidate.content ||
      !sameJson(interpretation.factReferences, candidate.factReferences ?? []) ||
      !sameJson(interpretation.sectionIds, candidate.sectionIds)
    ) {
      throw new AiBoundaryValidationError('Grounded Portfolio AI candidate continuity conflicts.');
    }
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasAllowedKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
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
