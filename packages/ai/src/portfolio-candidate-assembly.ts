import { AiBoundaryValidationError } from './errors.js';
import type { PortfolioAiContextFactReference } from './portfolio-grounded-interpretation.js';
import type { PortfolioAiBuiltContext } from './portfolio-intelligence-context.js';
import {
  PortfolioAiCandidateInterpretationAuthority,
  type PortfolioAiCandidateInterpretationId,
  type PortfolioAiCandidateInterpretationResult,
  PortfolioAiCandidateInterpretationKind,
  validatePortfolioAiCandidateInterpretationResult,
} from './portfolio-model-output-interpretation.js';
import type {
  PortfolioAiModelExecutionRequest,
  PortfolioAiModelExecutionResult,
} from './portfolio-model-execution.js';

/** Already-structured, provider-neutral fields for one untrusted candidate. */
export interface PortfolioAiCandidateAssemblyItem {
  readonly id: PortfolioAiCandidateInterpretationId;
  readonly kind: PortfolioAiCandidateInterpretationKind.Descriptive;
  readonly content: string;
  readonly factReferences?: ReadonlyArray<PortfolioAiContextFactReference>;
  readonly sectionIds?: ReadonlyArray<string>;
}

/** Explicit assembly input; it deliberately contains no parser or raw-text field. */
export interface PortfolioAiCandidateAssemblyInput {
  readonly context: PortfolioAiBuiltContext;
  readonly request: PortfolioAiModelExecutionRequest;
  readonly execution: PortfolioAiModelExecutionResult;
  readonly candidates: ReadonlyArray<PortfolioAiCandidateAssemblyItem>;
}

/**
 * Assembles structured candidate fields into the existing untrusted candidate
 * contract. It never parses execution output, infers references, or grounds.
 */
export function assemblePortfolioAiCandidateInterpretation(
  input: PortfolioAiCandidateAssemblyInput,
): PortfolioAiCandidateInterpretationResult {
  validateInput(input);
  const result: PortfolioAiCandidateInterpretationResult = {
    executionId: input.execution.executionId,
    ...(input.execution.model === undefined
      ? {}
      : {
          model: {
            providerId: input.execution.model.providerId,
            ...(input.execution.model.modelId === undefined
              ? {}
              : { modelId: input.execution.model.modelId }),
          },
        }),
    authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
    candidates: input.candidates.map((candidate) => ({
      id: candidate.id,
      authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
      kind: candidate.kind,
      content: candidate.content,
      ...(candidate.factReferences === undefined
        ? {}
        : {
            factReferences: candidate.factReferences.map((reference) => ({
              factId: reference.factId,
              presentationItemId: reference.presentationItemId,
              sectionIds: [...reference.sectionIds],
            })),
          }),
      ...(candidate.sectionIds === undefined ? {} : { sectionIds: [...candidate.sectionIds] }),
    })),
  };
  validatePortfolioAiCandidateInterpretationResult(
    input.context,
    input.request,
    input.execution,
    result,
  );
  return result;
}

function validateInput(input: PortfolioAiCandidateAssemblyInput): void {
  if (
    !isPlainRecord(input) ||
    !hasOnlyKeys(input, ['context', 'request', 'execution', 'candidates']) ||
    !Array.isArray(input.candidates)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI candidate assembly input is malformed.');
  }
  for (const candidate of input.candidates) {
    if (
      !isPlainRecord(candidate) ||
      !hasOnlyKeys(candidate, ['id', 'kind', 'content', 'factReferences', 'sectionIds'])
    ) {
      throw new AiBoundaryValidationError('Portfolio AI candidate assembly item is malformed.');
    }
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
