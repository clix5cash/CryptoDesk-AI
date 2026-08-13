import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiGroundedInterpretationResult,
  validatePortfolioAiGroundedInterpretationResult,
} from './portfolio-grounded-interpretation.js';
import type { PortfolioAiBuiltContext } from './portfolio-intelligence-context.js';
import { PortfolioAiResultAuthority } from './portfolio-intelligence.js';
import {
  type PortfolioAiCandidateInterpretationResult,
  validatePortfolioAiCandidateInterpretationResult,
} from './portfolio-model-output-interpretation.js';
import type {
  PortfolioAiModelExecutionRequest,
  PortfolioAiModelExecutionResult,
} from './portfolio-model-execution.js';

/** Explicit input for deterministic promotion of validated candidate records. */
export interface PortfolioAiCandidateGroundingInput {
  readonly context: PortfolioAiBuiltContext;
  readonly request: PortfolioAiModelExecutionRequest;
  readonly execution: PortfolioAiModelExecutionResult;
  readonly candidate: PortfolioAiCandidateInterpretationResult;
}

/**
 * Promotes structurally valid, context-grounded candidate records to the
 * non-authoritative interpretation boundary. It performs no text parsing,
 * fact checking, inference, or canonical Portfolio mutation.
 */
export function groundPortfolioAiCandidateInterpretation(
  input: PortfolioAiCandidateGroundingInput,
): PortfolioAiGroundedInterpretationResult {
  validateInput(input);
  validatePortfolioAiCandidateInterpretationResult(
    input.context,
    input.request,
    input.execution,
    input.candidate,
  );

  const grounded: PortfolioAiGroundedInterpretationResult = {
    analysisId: input.context.analysisId,
    task: input.context.task,
    authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
    coverageState: input.context.summary.coverage.state,
    interpretations: input.candidate.candidates.map((candidate) => ({
      id: candidate.id,
      authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
      content: candidate.content,
      factReferences: (candidate.factReferences ?? []).map((reference) => ({
        factId: reference.factId,
        presentationItemId: reference.presentationItemId,
        sectionIds: [...reference.sectionIds],
      })),
      ...(candidate.sectionIds === undefined ? {} : { sectionIds: [...candidate.sectionIds] }),
      coverageState: input.context.summary.coverage.state,
    })),
  };
  validatePortfolioAiGroundedInterpretationResult(input.context, grounded);
  return clone(grounded);
}

function validateInput(input: PortfolioAiCandidateGroundingInput): void {
  if (
    !isPlainRecord(input) ||
    !hasOnlyKeys(input, ['context', 'request', 'execution', 'candidate'])
  ) {
    throw new AiBoundaryValidationError('Portfolio AI candidate grounding input is malformed.');
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
