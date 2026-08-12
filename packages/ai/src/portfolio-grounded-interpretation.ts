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
      'coverageState',
    ]) ||
    !interpretation.id?.trim() ||
    interpretationIds.has(interpretation.id) ||
    interpretation.authority !== PortfolioAiResultAuthority.NonAuthoritativeInterpretation ||
    !interpretation.content?.trim() ||
    interpretation.coverageState !== context.summary.coverage.state ||
    !Array.isArray(interpretation.factReferences) ||
    interpretation.factReferences.length === 0
  ) {
    throw new AiBoundaryValidationError('Grounded Portfolio AI interpretation is malformed.');
  }
  interpretationIds.add(interpretation.id);

  const references = new Set<string>();
  for (const reference of interpretation.factReferences) {
    validateFactReference(reference, context.facts, references);
  }
}

function validateFactReference(
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

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
