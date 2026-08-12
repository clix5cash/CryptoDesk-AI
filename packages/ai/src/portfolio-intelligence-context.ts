import {
  PortfolioRiskDataState,
  PortfolioPresentationSchemaVersion,
  PortfolioPresentationSection,
  PortfolioUnvaluedPositionReason,
  validatePortfolioPresentationPayload,
  type PortfolioPresentationComposedSection,
  type PortfolioPresentationItem,
  type PortfolioPresentationPayload,
} from '@cryptodesk-ai/portfolio';
import { AiBoundaryValidationError } from './errors.js';
import {
  PortfolioAiCanonicalSourceKind,
  type PortfolioAiContext,
  type PortfolioAiGroundingReference,
  type PortfolioAiTask,
  validatePortfolioAiContext,
} from './portfolio-intelligence.js';

/** Deterministic identity derived from one canonical presentation item. */
export type PortfolioAiContextFactId = string;

/** Canonical valuation and coverage facts copied exactly from the source payload. */
export interface PortfolioAiContextSummary {
  readonly portfolioId: string;
  readonly capturedAt: string;
  readonly asOf: string;
  readonly currency: string;
  readonly totalValuedValue: string;
  readonly coverage: PortfolioPresentationPayload['coverage'];
}

/** One selected canonical section; item IDs remain references, never divergent copies. */
export interface PortfolioAiContextSection {
  readonly id: string;
  readonly section: PortfolioPresentationSection;
  readonly itemIds: ReadonlyArray<string>;
}

/** Machine-readable projection of one canonical presentation item for a future AI consumer. */
export interface PortfolioAiContextFact {
  readonly id: PortfolioAiContextFactId;
  readonly presentationItemId: string;
  readonly category: PortfolioPresentationItem['category'];
  readonly severity?: PortfolioPresentationItem['severity'];
  readonly priority: PortfolioPresentationItem['priority'];
  readonly priorityReasons: PortfolioPresentationItem['priorityReasons'];
  readonly targetIdentity: string;
  readonly evidence: PortfolioPresentationItem['evidence'];
  readonly coverageState?: PortfolioPresentationPayload['coverage']['state'];
  readonly grounding: ReadonlyArray<PortfolioAiGroundingReference>;
}

/** Explicit caller input; no payload source, clock, provider, or model is resolved implicitly. */
export interface PortfolioAiContextBuilderInput {
  readonly analysisId: string;
  readonly task: PortfolioAiTask;
  readonly payload: PortfolioPresentationPayload;
}

/** Minimal caller-driven selection. It filters canonical references without reranking them. */
export interface PortfolioAiContextSelectionOptions {
  readonly includedSections?: ReadonlyArray<PortfolioPresentationSection>;
  readonly excludedSections?: ReadonlyArray<PortfolioPresentationSection>;
  readonly maxItems?: number;
}

/** A fully deterministic, detached projection of canonical Portfolio payload data. */
export interface PortfolioAiBuiltContext extends PortfolioAiContext {
  readonly summary: PortfolioAiContextSummary;
  readonly sections: ReadonlyArray<PortfolioAiContextSection>;
  readonly facts: ReadonlyArray<PortfolioAiContextFact>;
}

/**
 * Builds a deterministic AI context from an authoritative Portfolio payload.
 * It neither evaluates facts nor creates an interpretation result.
 */
export function buildPortfolioAiContext(
  input: PortfolioAiContextBuilderInput,
  options: PortfolioAiContextSelectionOptions = {},
): PortfolioAiBuiltContext {
  validateBuilderInput(input);
  validateSelectionOptions(options);
  const payload = clone(input.payload);
  const selectedSections = payload.sections.filter((section) =>
    isSelected(section.section, options),
  );
  const selectedSectionIds = new Set(selectedSections.map((section) => section.id));
  const facts = payload.items
    .map((item) => fact(payload, item, selectedSections, selectedSectionIds))
    .filter((item): item is PortfolioAiContextFact => item !== undefined)
    .slice(0, options.maxItems)
    .map(clone);
  const context: PortfolioAiBuiltContext = {
    analysisId: input.analysisId,
    task: input.task,
    source: {
      kind: PortfolioAiCanonicalSourceKind.PresentationPayload,
      schemaVersion: PortfolioPresentationSchemaVersion,
      portfolioId: payload.portfolioId,
      capturedAt: payload.capturedAt,
      asOf: payload.asOf,
    },
    payload,
    summary: summary(payload),
    sections: selectedSections.map(clone),
    facts,
  };
  validatePortfolioAiBuiltContext(context);
  return context;
}

/** Validates a built context as a faithful deterministic projection of its canonical payload. */
export function validatePortfolioAiBuiltContext(context: PortfolioAiBuiltContext): void {
  validatePortfolioAiContext(context);
  validateCanonicalCoverage(context.payload);
  if (
    context.summary === undefined ||
    !Array.isArray(context.sections) ||
    !Array.isArray(context.facts)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI built context is malformed.');
  }
  validateSummary(context.summary, context.payload);
  validateSections(context.sections, context.payload);
  validateFacts(context.facts, context);
}

function validateBuilderInput(input: PortfolioAiContextBuilderInput): void {
  if (
    input === null ||
    typeof input !== 'object' ||
    !input.analysisId?.trim() ||
    input.task === undefined ||
    input.payload === undefined
  ) {
    throw new AiBoundaryValidationError('Portfolio AI context builder input is malformed.');
  }
  try {
    validatePortfolioPresentationPayload(input.payload);
  } catch (error) {
    throw new AiBoundaryValidationError(
      error instanceof Error ? error.message : 'Portfolio AI canonical payload is invalid.',
    );
  }
  validateCanonicalCoverage(input.payload);
}

function validateCanonicalCoverage(payload: PortfolioPresentationPayload): void {
  const { coverage } = payload;
  const valuation = coverage.valuation;
  if (
    (coverage.state !== undefined &&
      !Object.values(PortfolioRiskDataState).includes(coverage.state)) ||
    !Number.isSafeInteger(valuation.totalPositionCount) ||
    !Number.isSafeInteger(valuation.valuedPositionCount) ||
    !Number.isSafeInteger(valuation.unvaluedPositionCount) ||
    valuation.totalPositionCount < 0 ||
    valuation.valuedPositionCount < 0 ||
    valuation.unvaluedPositionCount < 0 ||
    valuation.totalPositionCount !==
      valuation.valuedPositionCount + valuation.unvaluedPositionCount ||
    !isNonNegativeDecimal(valuation.valuedPositionCoveragePercentage) ||
    !Array.isArray(valuation.unvaluedReasons)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI canonical coverage is contradictory.');
  }

  const reasons = new Set<string>();
  let unvaluedCount = 0;
  for (const reason of valuation.unvaluedReasons) {
    if (
      !Object.values(PortfolioUnvaluedPositionReason).includes(reason.reason) ||
      reasons.has(reason.reason) ||
      !Number.isSafeInteger(reason.positionCount) ||
      reason.positionCount < 0
    ) {
      throw new AiBoundaryValidationError('Portfolio AI canonical coverage is contradictory.');
    }
    reasons.add(reason.reason);
    unvaluedCount += reason.positionCount;
  }
  if (unvaluedCount !== valuation.unvaluedPositionCount) {
    throw new AiBoundaryValidationError('Portfolio AI canonical coverage is contradictory.');
  }

  switch (coverage.state) {
    case PortfolioRiskDataState.Complete:
      if (valuation.unvaluedPositionCount !== 0) {
        throw new AiBoundaryValidationError('Complete Portfolio AI coverage cannot be unvalued.');
      }
      break;
    case PortfolioRiskDataState.Partial:
      if (valuation.valuedPositionCount === 0 || valuation.unvaluedPositionCount === 0) {
        throw new AiBoundaryValidationError('Partial Portfolio AI coverage is contradictory.');
      }
      break;
    case PortfolioRiskDataState.Unavailable:
      if (valuation.valuedPositionCount !== 0) {
        throw new AiBoundaryValidationError('Unavailable Portfolio AI coverage cannot be valued.');
      }
      break;
    case PortfolioRiskDataState.InsufficientData:
    case undefined:
      break;
  }
}

function isNonNegativeDecimal(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value);
}

function validateSelectionOptions(options: PortfolioAiContextSelectionOptions): void {
  if (options === null || typeof options !== 'object') {
    throw new AiBoundaryValidationError('Portfolio AI context selection options are malformed.');
  }
  const included = validateSectionList(options.includedSections, 'included');
  const excluded = validateSectionList(options.excludedSections, 'excluded');
  if (Array.from(included).some((section) => excluded.has(section))) {
    throw new AiBoundaryValidationError('Portfolio AI context section selection is contradictory.');
  }
  if (
    options.maxItems !== undefined &&
    (!Number.isInteger(options.maxItems) || options.maxItems < 0)
  ) {
    throw new AiBoundaryValidationError(
      'Portfolio AI context maxItems must be a non-negative integer.',
    );
  }
}

function validateSectionList(
  sections: ReadonlyArray<PortfolioPresentationSection> | undefined,
  label: string,
): Set<PortfolioPresentationSection> {
  const values = new Set<PortfolioPresentationSection>();
  if (sections === undefined) return values;
  if (!Array.isArray(sections)) {
    throw new AiBoundaryValidationError(`Portfolio AI context ${label} sections are invalid.`);
  }
  for (const section of sections) {
    if (!Object.values(PortfolioPresentationSection).includes(section) || values.has(section)) {
      throw new AiBoundaryValidationError(`Portfolio AI context ${label} sections are invalid.`);
    }
    values.add(section);
  }
  return values;
}

function isSelected(
  section: PortfolioPresentationSection,
  options: PortfolioAiContextSelectionOptions,
): boolean {
  return (
    (options.includedSections === undefined || options.includedSections.includes(section)) &&
    !options.excludedSections?.includes(section)
  );
}

function summary(payload: PortfolioPresentationPayload): PortfolioAiContextSummary {
  return {
    portfolioId: payload.portfolioId,
    capturedAt: payload.capturedAt,
    asOf: payload.asOf,
    currency: payload.currency,
    totalValuedValue: payload.totalValuedValue,
    coverage: clone(payload.coverage),
  };
}

function fact(
  payload: PortfolioPresentationPayload,
  item: PortfolioPresentationItem,
  sections: ReadonlyArray<PortfolioPresentationComposedSection>,
  selectedSectionIds: ReadonlySet<string>,
): PortfolioAiContextFact | undefined {
  const grounding = sections
    .filter((section) => section.itemIds.includes(item.id) && selectedSectionIds.has(section.id))
    .map((section) => ({ presentationItemId: item.id, sectionIds: [section.id] }));
  if (grounding.length === 0) return undefined;
  return {
    id: factIdentity(payload, item.id),
    presentationItemId: item.id,
    category: item.category,
    ...(item.severity === undefined ? {} : { severity: item.severity }),
    priority: item.priority,
    priorityReasons: clone(item.priorityReasons),
    targetIdentity: item.targetIdentity,
    evidence: clone(item.evidence),
    ...(payload.coverage.state === undefined ? {} : { coverageState: payload.coverage.state }),
    grounding,
  };
}

function validateSummary(
  value: PortfolioAiContextSummary,
  payload: PortfolioPresentationPayload,
): void {
  if (
    value.portfolioId !== payload.portfolioId ||
    value.capturedAt !== payload.capturedAt ||
    value.asOf !== payload.asOf ||
    value.currency !== payload.currency ||
    value.totalValuedValue !== payload.totalValuedValue ||
    JSON.stringify(value.coverage) !== JSON.stringify(payload.coverage)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI context summary conflicts with payload.');
  }
}

function validateSections(
  sections: ReadonlyArray<PortfolioAiContextSection>,
  payload: PortfolioPresentationPayload,
): void {
  const known = new Map(payload.sections.map((section) => [section.id, section]));
  const seen = new Set<string>();
  let previousIndex = -1;
  for (const section of sections) {
    const expected = known.get(section.id);
    const index = payload.sections.findIndex((candidate) => candidate.id === section.id);
    if (
      !section.id?.trim() ||
      seen.has(section.id) ||
      expected === undefined ||
      index <= previousIndex ||
      JSON.stringify(section) !== JSON.stringify(expected)
    ) {
      throw new AiBoundaryValidationError('Portfolio AI context section is invalid.');
    }
    seen.add(section.id);
    previousIndex = index;
  }
}

function validateFacts(
  facts: ReadonlyArray<PortfolioAiContextFact>,
  context: PortfolioAiBuiltContext,
): void {
  const selectedSectionIds = new Set(context.sections.map((section) => section.id));
  const knownItems = new Map(context.payload.items.map((item) => [item.id, item]));
  const factIds = new Set<string>();
  const itemIds = new Set<string>();
  let previousIndex = -1;
  for (const value of facts) {
    const item = knownItems.get(value.presentationItemId);
    const index = context.payload.items.findIndex(
      (candidate) => candidate.id === value.presentationItemId,
    );
    if (
      !value.id?.trim() ||
      factIds.has(value.id) ||
      itemIds.has(value.presentationItemId) ||
      item === undefined ||
      index <= previousIndex ||
      value.id !== factIdentity(context.payload, item.id) ||
      value.category !== item.category ||
      value.severity !== item.severity ||
      value.priority !== item.priority ||
      value.targetIdentity !== item.targetIdentity ||
      value.coverageState !== context.payload.coverage.state ||
      JSON.stringify(value.priorityReasons) !== JSON.stringify(item.priorityReasons) ||
      JSON.stringify(value.evidence) !== JSON.stringify(item.evidence)
    ) {
      throw new AiBoundaryValidationError('Portfolio AI context fact is invalid.');
    }
    factIds.add(value.id);
    itemIds.add(value.presentationItemId);
    previousIndex = index;
    validateFactGrounding(
      value.grounding,
      value.presentationItemId,
      context.payload,
      selectedSectionIds,
    );
  }
}

function validateFactGrounding(
  grounding: ReadonlyArray<PortfolioAiGroundingReference>,
  itemId: string,
  payload: PortfolioPresentationPayload,
  selectedSectionIds: ReadonlySet<string>,
): void {
  if (!Array.isArray(grounding) || grounding.length === 0) {
    throw new AiBoundaryValidationError('Portfolio AI context fact grounding is invalid.');
  }
  const sectionIds = new Set<string>();
  for (const reference of grounding) {
    if (
      reference.presentationItemId !== itemId ||
      !Array.isArray(reference.sectionIds) ||
      reference.sectionIds.length !== 1
    ) {
      throw new AiBoundaryValidationError('Portfolio AI context fact grounding is invalid.');
    }
    const sectionId = reference.sectionIds[0];
    const section = payload.sections.find((candidate) => candidate.id === sectionId);
    if (
      sectionId === undefined ||
      sectionIds.has(sectionId) ||
      !selectedSectionIds.has(sectionId) ||
      section === undefined ||
      !section.itemIds.includes(itemId)
    ) {
      throw new AiBoundaryValidationError('Portfolio AI context fact grounding is invalid.');
    }
    sectionIds.add(sectionId);
  }
}

function factIdentity(
  payload: PortfolioPresentationPayload,
  itemId: string,
): PortfolioAiContextFactId {
  return JSON.stringify([payload.portfolioId, payload.capturedAt, payload.asOf, itemId]);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
