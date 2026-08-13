import { AiExecutionStatus } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiContextFactReference,
  validatePortfolioAiContextFactReference,
} from './portfolio-grounded-interpretation.js';
import type { PortfolioAiBuiltContext } from './portfolio-intelligence-context.js';
import {
  type PortfolioAiModelExecutionRequest,
  type PortfolioAiModelExecutionResult,
  type PortfolioAiModelReference,
  validatePortfolioAiModelExecutionResult,
} from './portfolio-model-execution.js';

/** Raw model-derived candidate content is explicitly untrusted and ungrounded. */
export enum PortfolioAiCandidateInterpretationAuthority {
  UntrustedCandidateInterpretation = 'untrusted_candidate_interpretation',
}

/** Only descriptive candidate records are supported; this is not advice, prediction, or Portfolio fact. */
export enum PortfolioAiCandidateInterpretationKind {
  Descriptive = 'descriptive',
}

/** Externally supplied opaque identity for a pre-grounding model candidate. */
export type PortfolioAiCandidateInterpretationId = string;

/**
 * A model-produced descriptive statement before grounding. References are
 * assertions about context material, not verified interpretation evidence.
 */
export interface PortfolioAiCandidateInterpretation {
  readonly id: PortfolioAiCandidateInterpretationId;
  readonly authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation;
  readonly kind: PortfolioAiCandidateInterpretationKind.Descriptive;
  readonly content: string;
  readonly factReferences?: ReadonlyArray<PortfolioAiContextFactReference>;
  readonly sectionIds?: ReadonlyArray<string>;
}

/**
 * Candidate result associated with one completed raw execution. It remains
 * distinct from both raw execution output and grounded interpretation output.
 */
export interface PortfolioAiCandidateInterpretationResult {
  readonly executionId: string;
  readonly model?: PortfolioAiModelReference;
  readonly authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation;
  readonly candidates: ReadonlyArray<PortfolioAiCandidateInterpretation>;
}

/**
 * Validates a caller-supplied candidate result against completed raw execution
 * and selected deterministic context. It never parses, generates, or grounds.
 */
export function validatePortfolioAiCandidateInterpretationResult(
  context: PortfolioAiBuiltContext,
  request: PortfolioAiModelExecutionRequest,
  execution: PortfolioAiModelExecutionResult,
  result: PortfolioAiCandidateInterpretationResult,
): void {
  validatePortfolioAiModelExecutionResult(request, execution);
  if (execution.status !== AiExecutionStatus.Completed) {
    throw new AiBoundaryValidationError(
      'Portfolio AI candidate interpretation requires completed raw execution.',
    );
  }
  if (
    !isPlainRecord(result) ||
    !hasOnlyKeys(result, ['executionId', 'model', 'authority', 'candidates']) ||
    result.executionId !== execution.executionId ||
    result.authority !==
      PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation ||
    !sameModelReference(result.model, execution.model) ||
    !Array.isArray(result.candidates)
  ) {
    throw new AiBoundaryValidationError(
      'Portfolio AI candidate interpretation result is malformed.',
    );
  }

  const ids = new Set<string>();
  for (const candidate of result.candidates) {
    validateCandidate(candidate, context, ids);
  }
}

function validateCandidate(
  candidate: PortfolioAiCandidateInterpretation,
  context: PortfolioAiBuiltContext,
  ids: Set<string>,
): void {
  if (
    !isPlainRecord(candidate) ||
    !hasOnlyKeys(candidate, [
      'id',
      'authority',
      'kind',
      'content',
      'factReferences',
      'sectionIds',
    ]) ||
    !isNonEmptyString(candidate.id) ||
    ids.has(candidate.id) ||
    candidate.authority !==
      PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation ||
    candidate.kind !== PortfolioAiCandidateInterpretationKind.Descriptive ||
    !isNonEmptyString(candidate.content) ||
    (candidate.factReferences !== undefined && !Array.isArray(candidate.factReferences)) ||
    (candidate.sectionIds !== undefined && !Array.isArray(candidate.sectionIds)) ||
    (candidate.factReferences === undefined && candidate.sectionIds === undefined) ||
    (candidate.factReferences?.length === 0 && candidate.sectionIds?.length === 0)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI candidate interpretation is malformed.');
  }
  ids.add(candidate.id);

  const factIds = new Set<string>();
  for (const reference of candidate.factReferences ?? []) {
    validatePortfolioAiContextFactReference(reference, context.facts, factIds);
  }
  validateCandidateSections(candidate, context);
}

function validateCandidateSections(
  candidate: PortfolioAiCandidateInterpretation,
  context: PortfolioAiBuiltContext,
): void {
  const sections = candidate.sectionIds;
  if (sections === undefined) return;
  const known = new Map(context.sections.map((section, index) => [section.id, index]));
  const seen = new Set<string>();
  let previous = -1;
  for (const sectionId of sections) {
    const index = known.get(sectionId);
    if (
      !isNonEmptyString(sectionId) ||
      index === undefined ||
      seen.has(sectionId) ||
      index <= previous
    ) {
      throw new AiBoundaryValidationError('Portfolio AI candidate section reference is invalid.');
    }
    seen.add(sectionId);
    previous = index;
  }

  if (candidate.factReferences === undefined) return;
  const expected = uniqueFactSectionIds(candidate.factReferences, context);
  if (
    expected.length !== sections.length ||
    expected.some((sectionId, index) => sectionId !== sections[index])
  ) {
    throw new AiBoundaryValidationError(
      'Portfolio AI candidate fact and section references are contradictory.',
    );
  }
}

function uniqueFactSectionIds(
  references: ReadonlyArray<PortfolioAiContextFactReference>,
  context: PortfolioAiBuiltContext,
): ReadonlyArray<string> {
  const ids = new Set<string>();
  for (const reference of references) {
    for (const sectionId of reference.sectionIds) {
      ids.add(sectionId);
    }
  }
  return context.sections.map((section) => section.id).filter((sectionId) => ids.has(sectionId));
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
