import { AiBoundaryValidationError } from './errors.js';
import { PortfolioAiResultAuthority, type PortfolioAiTask } from './portfolio-intelligence.js';
import {
  type PortfolioAiBuiltContext,
  type PortfolioAiContextFact,
  validatePortfolioAiBuiltContext,
} from './portfolio-intelligence-context.js';

/** Externally supplied opaque identity for one grounded, non-authoritative interpretation. */
export type PortfolioAiGroundedInterpretationId = string;

/** Exact reference to one selected deterministic context fact and its canonical grounding. */
export interface PortfolioAiContextFactReference {
  readonly factId: string;
  readonly presentationItemId: string;
  readonly sectionIds: ReadonlyArray<string>;
}

/**
 * Non-authoritative interpretation content grounded exclusively in deterministic
 * context facts. It intentionally cannot contain canonical financial fields.
 */
export interface PortfolioAiGroundedInterpretation {
  readonly id: PortfolioAiGroundedInterpretationId;
  readonly authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation;
  readonly content: string;
  readonly factReferences: ReadonlyArray<PortfolioAiContextFactReference>;
  /** Optional exact context-section grounding for section-level statements. */
  readonly sectionIds?: ReadonlyArray<string>;
  readonly coverageState?: PortfolioAiBuiltContext['summary']['coverage']['state'];
}

/** Validated result envelope for a future probabilistic interpretation provider. */
export interface PortfolioAiGroundedInterpretationResult {
  readonly analysisId: string;
  readonly task: PortfolioAiTask;
  readonly authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation;
  readonly coverageState?: PortfolioAiBuiltContext['summary']['coverage']['state'];
  readonly interpretations: ReadonlyArray<PortfolioAiGroundedInterpretation>;
}

/**
 * Deterministically validates future interpretation output against a selected,
 * immutable Portfolio AI context. No model/provider execution occurs here.
 */
export function validatePortfolioAiGroundedInterpretationResult(
  context: PortfolioAiBuiltContext,
  result: PortfolioAiGroundedInterpretationResult,
): void {
  validatePortfolioAiBuiltContext(context);
  if (
    !isPlainRecord(result) ||
    !hasOnlyKeys(result, ['analysisId', 'task', 'authority', 'coverageState', 'interpretations']) ||
    result.analysisId !== context.analysisId ||
    result.task !== context.task ||
    result.authority !== PortfolioAiResultAuthority.NonAuthoritativeInterpretation ||
    result.coverageState !== context.summary.coverage.state ||
    !Array.isArray(result.interpretations)
  ) {
    throw new AiBoundaryValidationError(
      'Grounded Portfolio AI interpretation result is malformed.',
    );
  }

  const interpretationIds = new Set<string>();
  for (const interpretation of result.interpretations) {
    validateInterpretation(interpretation, context, interpretationIds);
  }
}

function validateInterpretation(
  interpretation: PortfolioAiGroundedInterpretation,
  context: PortfolioAiBuiltContext,
  interpretationIds: Set<string>,
): void {
  if (
    !isPlainRecord(interpretation) ||
    !hasOnlyKeys(interpretation, [
      'id',
      'authority',
      'content',
      'factReferences',
      'sectionIds',
      'coverageState',
    ]) ||
    !interpretation.id?.trim() ||
    interpretationIds.has(interpretation.id) ||
    interpretation.authority !== PortfolioAiResultAuthority.NonAuthoritativeInterpretation ||
    !interpretation.content?.trim() ||
    interpretation.coverageState !== context.summary.coverage.state ||
    !Array.isArray(interpretation.factReferences) ||
    (interpretation.sectionIds !== undefined && !Array.isArray(interpretation.sectionIds)) ||
    (interpretation.factReferences.length === 0 && interpretation.sectionIds?.length === 0)
  ) {
    throw new AiBoundaryValidationError('Grounded Portfolio AI interpretation is malformed.');
  }
  interpretationIds.add(interpretation.id);

  const references = new Set<string>();
  for (const reference of interpretation.factReferences) {
    validatePortfolioAiContextFactReference(reference, context.facts, references);
  }
  validatePortfolioAiContextSectionReferences(
    interpretation.sectionIds,
    context.sections,
    interpretation.factReferences.length === 0 ? undefined : interpretation.factReferences,
  );
}

/** Validates an exact reference to selected deterministic context facts and sections. */
export function validatePortfolioAiContextFactReference(
  reference: PortfolioAiContextFactReference,
  facts: ReadonlyArray<PortfolioAiContextFact>,
  references: Set<string>,
): void {
  if (
    !isPlainRecord(reference) ||
    !hasOnlyKeys(reference, ['factId', 'presentationItemId', 'sectionIds']) ||
    !reference.factId?.trim() ||
    references.has(reference.factId) ||
    !reference.presentationItemId?.trim() ||
    !Array.isArray(reference.sectionIds) ||
    reference.sectionIds.length === 0
  ) {
    throw new AiBoundaryValidationError('Grounded Portfolio AI fact reference is malformed.');
  }
  const fact = facts.find((candidate) => candidate.id === reference.factId);
  if (
    fact === undefined ||
    fact.presentationItemId !== reference.presentationItemId ||
    !sameSectionIds(reference.sectionIds, fact.grounding)
  ) {
    throw new AiBoundaryValidationError(
      'Grounded Portfolio AI fact reference conflicts with deterministic context.',
    );
  }
  references.add(reference.factId);
}

/** Validates exact selected context sections and their relationship to fact grounding. */
export function validatePortfolioAiContextSectionReferences(
  sectionIds: ReadonlyArray<string> | undefined,
  sections: PortfolioAiBuiltContext['sections'],
  factReferences?: ReadonlyArray<PortfolioAiContextFactReference>,
): void {
  if (sectionIds === undefined) return;
  const known = new Map(sections.map((section, index) => [section.id, index]));
  const seen = new Set<string>();
  let previous = -1;
  for (const sectionId of sectionIds) {
    const index = known.get(sectionId);
    if (
      !isNonEmptyString(sectionId) ||
      index === undefined ||
      seen.has(sectionId) ||
      index <= previous
    ) {
      throw new AiBoundaryValidationError('Grounded Portfolio AI section reference is invalid.');
    }
    seen.add(sectionId);
    previous = index;
  }

  if (factReferences === undefined) return;
  const expected = sectionIdsForFactReferences(factReferences, sections);
  if (
    expected.length !== sectionIds.length ||
    expected.some((sectionId, index) => sectionId !== sectionIds[index])
  ) {
    throw new AiBoundaryValidationError(
      'Grounded Portfolio AI fact and section references are contradictory.',
    );
  }
}

function sectionIdsForFactReferences(
  factReferences: ReadonlyArray<PortfolioAiContextFactReference>,
  sections: PortfolioAiBuiltContext['sections'],
): ReadonlyArray<string> {
  const ids = new Set<string>();
  for (const reference of factReferences) {
    for (const sectionId of reference.sectionIds) ids.add(sectionId);
  }
  return sections.map((section) => section.id).filter((sectionId) => ids.has(sectionId));
}

function sameSectionIds(
  sectionIds: ReadonlyArray<string>,
  grounding: PortfolioAiContextFact['grounding'],
): boolean {
  const expected = grounding.map((reference) => reference.sectionIds[0]);
  return (
    sectionIds.length === expected.length &&
    sectionIds.every((sectionId, index) => sectionId === expected[index]) &&
    new Set(sectionIds).size === sectionIds.length
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
