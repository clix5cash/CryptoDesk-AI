import { PortfolioInsightValidationError } from './errors.js';
import { portfolioAssetIdentity } from './identity.js';
import type {
  PortfolioInsight,
  PortfolioInsightAnalysis,
  PortfolioInsightEvidence,
} from './insight.js';
import {
  PortfolioInsightCategory,
  validatePortfolioInsightAnalysis,
  type PortfolioInsightAnalysisInput,
} from './insight.js';
import {
  PortfolioInsightPriority,
  PortfolioInsightPriorityReason,
  type PortfolioPrioritizedInsightAnalysis,
} from './insight-prioritization.js';
import type { PortfolioCoverage } from './allocation.js';
import type { PortfolioRiskDataState } from './risk.js';
import type { PortfolioPositionValuation, PortfolioValuation } from './valuation.js';

/** Stable, transport- and UI-neutral sections of structured Portfolio presentation. */
export enum PortfolioPresentationSection {
  Overview = 'overview',
  Valuation = 'valuation',
  Coverage = 'coverage',
  Concentration = 'concentration',
  Exposure = 'exposure',
  DataQuality = 'data_quality',
  PrioritizedInsights = 'prioritized_insights',
}

/** Explicit coverage facts preserved without estimating unvalued positions. */
export interface PortfolioPresentationCoverage {
  readonly state?: PortfolioRiskDataState;
  readonly valuation: PortfolioCoverage;
}

/** Canonical evidence with only relevant, already-valued price provenance attached. */
export interface PortfolioPresentationEvidence {
  readonly insight: PortfolioInsightEvidence;
  readonly valuationPositions: ReadonlyArray<PortfolioPositionValuation>;
}

/** One immutable, presentation-ready view of an already-prioritized insight. */
export interface PortfolioPresentationItem {
  /** Directly reuses the canonical Portfolio insight identity. */
  readonly id: string;
  readonly category: PortfolioInsight['category'];
  readonly severity?: PortfolioInsight['severity'];
  readonly priority: PortfolioInsightPriority;
  readonly priorityReasons: ReadonlyArray<PortfolioInsightPriorityReason>;
  /** Canonical asset, position, allocation, or unavailable-data target identity. */
  readonly targetIdentity: string;
  readonly evidence: PortfolioPresentationEvidence;
}

/** Ordered, structured presentation records for one consumer-neutral section. */
export interface PortfolioPresentationRecords {
  readonly section: PortfolioPresentationSection;
  readonly items: ReadonlyArray<PortfolioPresentationItem>;
}

/** Detached deterministic Portfolio Intelligence output for future transport or UI layers. */
export interface PortfolioPresentation {
  readonly portfolioId: string;
  readonly capturedAt: string;
  readonly asOf: string;
  readonly currency: string;
  readonly totalValuedValue: string;
  readonly coverage: PortfolioPresentationCoverage;
  readonly sections: ReadonlyArray<PortfolioPresentationRecords>;
}

/** Stable semantic identity for one composed presentation section. */
export type PortfolioPresentationSectionId = string;

/** Explicit optional caller-driven filtering; omitted options retain every applicable section. */
export interface PortfolioPresentationSectionSelectionOptions {
  readonly includedSections?: ReadonlyArray<PortfolioPresentationSection>;
  readonly excludedSections?: ReadonlyArray<PortfolioPresentationSection>;
  readonly maxItemsPerSection?: number;
}

/** Structured references into the canonical presentation item collection; evidence is never copied. */
export interface PortfolioPresentationComposedSection {
  readonly id: PortfolioPresentationSectionId;
  readonly section: PortfolioPresentationSection;
  readonly itemIds: ReadonlyArray<string>;
}

/** Deterministic, selection-aware section view over a canonical presentation. */
export interface PortfolioPresentationSectionComposition {
  readonly portfolioId: string;
  readonly capturedAt: string;
  readonly asOf: string;
  readonly currency: string;
  readonly totalValuedValue: string;
  readonly coverage: PortfolioPresentationCoverage;
  readonly sections: ReadonlyArray<PortfolioPresentationComposedSection>;
}

/** Explicit canonical inputs only; no provider, UI, or upstream orchestration is involved. */
export interface PortfolioPresentationInput extends PortfolioInsightAnalysisInput {
  readonly insights: PortfolioInsightAnalysis;
  readonly prioritizedInsights: PortfolioPrioritizedInsightAnalysis;
}

/**
 * Organizes already-computed canonical facts for presentation without
 * recalculating valuation, allocation, risk, severity, or priority.
 */
export function createPortfolioPresentation(
  input: PortfolioPresentationInput,
): PortfolioPresentation {
  validatePresentationInput(input);
  const snapshot = input.snapshot;
  return {
    portfolioId: snapshot.portfolio.id,
    capturedAt: snapshot.capturedAt,
    asOf: input.prioritizedInsights.asOf,
    currency: input.valuation.currency,
    totalValuedValue: input.valuation.totalValue,
    coverage: {
      ...(input.prioritizedInsights.coverageState === undefined
        ? {}
        : { state: input.prioritizedInsights.coverageState }),
      valuation: clone(input.allocation.coverage),
    },
    sections: [
      {
        section: PortfolioPresentationSection.PrioritizedInsights,
        items: input.prioritizedInsights.insights.map((item) =>
          presentationItem(item.insight, item.priority, item.reasons, input.valuation),
        ),
      },
    ],
  };
}

/**
 * Composes stable presentation sections from an existing presentation. It only
 * groups canonical item IDs; it never reranks, changes priority, or alters evidence.
 */
export function composePortfolioPresentationSections(
  presentation: PortfolioPresentation,
  options: PortfolioPresentationSectionSelectionOptions = {},
): PortfolioPresentationSectionComposition {
  validatePortfolioPresentation(presentation);
  validateSectionSelectionOptions(options);
  const items = presentation.sections[0]!.items;
  const maximum = options.maxItemsPerSection;
  const applicable: ReadonlyArray<PortfolioPresentationSection> = [
    PortfolioPresentationSection.Overview,
    PortfolioPresentationSection.Valuation,
    ...(hasCoverageFacts(presentation) ? [PortfolioPresentationSection.Coverage] : []),
    ...(hasCategory(items, PortfolioInsightCategory.Concentration)
      ? [PortfolioPresentationSection.Concentration]
      : []),
    ...(hasCategory(items, PortfolioInsightCategory.Exposure)
      ? [PortfolioPresentationSection.Exposure]
      : []),
    ...(hasCategory(items, PortfolioInsightCategory.DataQuality)
      ? [PortfolioPresentationSection.DataQuality]
      : []),
    ...(items.length > 0 ? [PortfolioPresentationSection.PrioritizedInsights] : []),
  ];
  const selected = applicable.filter((section) => isSelected(section, options));
  const composed = selected.map((section) => ({
    id: sectionIdentity(presentation.portfolioId, section),
    section,
    itemIds: itemIdsFor(section, items, maximum),
  }));
  return {
    portfolioId: presentation.portfolioId,
    capturedAt: presentation.capturedAt,
    asOf: presentation.asOf,
    currency: presentation.currency,
    totalValuedValue: presentation.totalValuedValue,
    coverage: clone(presentation.coverage),
    sections: composed.filter(
      (section) => isStructuralSection(section.section) || section.itemIds.length > 0,
    ),
  };
}

/** Validates a standalone canonical presentation before a later selection boundary consumes it. */
export function validatePortfolioPresentation(presentation: PortfolioPresentation): void {
  if (
    presentation === null ||
    typeof presentation !== 'object' ||
    !presentation.portfolioId?.trim() ||
    !presentation.capturedAt?.trim() ||
    !presentation.asOf?.trim() ||
    !presentation.currency?.trim() ||
    !presentation.totalValuedValue?.trim() ||
    presentation.coverage === undefined ||
    !Array.isArray(presentation.sections)
  ) {
    throw new PortfolioInsightValidationError('Portfolio presentation is malformed.');
  }
  if (
    presentation.sections.length !== 1 ||
    presentation.sections[0].section !== PortfolioPresentationSection.PrioritizedInsights
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio presentation must contain one prioritized insight section.',
    );
  }
  const ids = new Set<string>();
  for (const item of presentation.sections[0].items) {
    if (!item.id?.trim() || ids.has(item.id) || !item.targetIdentity?.trim()) {
      throw new PortfolioInsightValidationError('Portfolio presentation item identity is invalid.');
    }
    if (!Object.values(PortfolioInsightPriority).includes(item.priority)) {
      throw new PortfolioInsightValidationError('Portfolio presentation item priority is invalid.');
    }
    if (!Array.isArray(item.priorityReasons) || item.priorityReasons.length === 0) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation item priority reasons are required.',
      );
    }
    const reasons = new Set<PortfolioInsightPriorityReason>();
    for (const reason of item.priorityReasons) {
      if (!Object.values(PortfolioInsightPriorityReason).includes(reason) || reasons.has(reason)) {
        throw new PortfolioInsightValidationError(
          'Portfolio presentation item priority reasons are invalid.',
        );
      }
      reasons.add(reason);
    }
    if (item.evidence?.insight?.portfolioId !== presentation.portfolioId) {
      throw new PortfolioInsightValidationError('Portfolio presentation item evidence is invalid.');
    }
    ids.add(item.id);
  }
}

function validatePresentationInput(input: PortfolioPresentationInput): void {
  if (input === null || typeof input !== 'object' || input.prioritizedInsights === undefined) {
    throw new PortfolioInsightValidationError('Portfolio presentation input is required.');
  }
  validatePortfolioInsightAnalysis(input, input.insights);
  const prioritized = input.prioritizedInsights;
  if (
    prioritized.portfolioId !== input.snapshot.portfolio.id ||
    prioritized.asOf !== input.risk.asOf ||
    prioritized.coverageState !== input.insights.coverageState ||
    !Array.isArray(prioritized.insights)
  ) {
    throw new PortfolioInsightValidationError(
      'Prioritized Portfolio insight analysis conflicts with canonical presentation input.',
    );
  }
  const canonical = new Map(input.insights.insights.map((insight) => [insight.id, insight]));
  const ids = new Set<string>();
  for (const prioritizedInsight of prioritized.insights) {
    const insight = prioritizedInsight.insight;
    if (!insight?.id || ids.has(insight.id) || canonical.get(insight.id) === undefined) {
      throw new PortfolioInsightValidationError(
        'Prioritized Portfolio insight identity is invalid.',
      );
    }
    if (JSON.stringify(canonical.get(insight.id)) !== JSON.stringify(insight)) {
      throw new PortfolioInsightValidationError(
        'Prioritized Portfolio insight evidence conflicts with canonical insight evidence.',
      );
    }
    if (!Object.values(PortfolioInsightPriority).includes(prioritizedInsight.priority)) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation insight priority is invalid.',
      );
    }
    if (!Array.isArray(prioritizedInsight.reasons) || prioritizedInsight.reasons.length === 0) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation insight priority reasons are required.',
      );
    }
    const reasons = new Set<PortfolioInsightPriorityReason>();
    for (const reason of prioritizedInsight.reasons) {
      if (!Object.values(PortfolioInsightPriorityReason).includes(reason) || reasons.has(reason)) {
        throw new PortfolioInsightValidationError(
          'Portfolio presentation insight priority reasons are invalid.',
        );
      }
      reasons.add(reason);
    }
    ids.add(insight.id);
  }
}

function validateSectionSelectionOptions(
  options: PortfolioPresentationSectionSelectionOptions,
): void {
  if (options === null || typeof options !== 'object') {
    throw new PortfolioInsightValidationError(
      'Portfolio presentation section options are malformed.',
    );
  }
  const included = validateSectionList(options.includedSections, 'included');
  const excluded = validateSectionList(options.excludedSections, 'excluded');
  if (Array.from(included).some((section) => excluded.has(section))) {
    throw new PortfolioInsightValidationError(
      'Portfolio presentation section selection is contradictory.',
    );
  }
  if (
    options.maxItemsPerSection !== undefined &&
    (!Number.isInteger(options.maxItemsPerSection) || options.maxItemsPerSection < 0)
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio presentation maxItemsPerSection must be a non-negative integer.',
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
    throw new PortfolioInsightValidationError(
      `Portfolio presentation ${label} sections are invalid.`,
    );
  }
  for (const section of sections) {
    if (!Object.values(PortfolioPresentationSection).includes(section) || values.has(section)) {
      throw new PortfolioInsightValidationError(
        `Portfolio presentation ${label} sections are invalid.`,
      );
    }
    values.add(section);
  }
  return values;
}

function isSelected(
  section: PortfolioPresentationSection,
  options: PortfolioPresentationSectionSelectionOptions,
): boolean {
  const included = options.includedSections;
  return (
    (included === undefined || included.includes(section)) &&
    !options.excludedSections?.includes(section)
  );
}

function hasCoverageFacts(presentation: PortfolioPresentation): boolean {
  return (
    (presentation.coverage.state !== undefined && presentation.coverage.state !== 'complete') ||
    presentation.coverage.valuation.unvaluedPositionCount > 0
  );
}

function hasCategory(
  items: ReadonlyArray<PortfolioPresentationItem>,
  category: PortfolioInsight['category'],
): boolean {
  return items.some((item) => item.category === category);
}

function itemIdsFor(
  section: PortfolioPresentationSection,
  items: ReadonlyArray<PortfolioPresentationItem>,
  maximum: number | undefined,
): ReadonlyArray<string> {
  const matching =
    section === PortfolioPresentationSection.PrioritizedInsights
      ? items
      : section === PortfolioPresentationSection.Concentration
        ? items.filter((item) => item.category === 'concentration')
        : section === PortfolioPresentationSection.Exposure
          ? items.filter((item) => item.category === 'exposure')
          : section === PortfolioPresentationSection.DataQuality
            ? items.filter((item) => item.category === 'data_quality')
            : [];
  return matching.slice(0, maximum).map((item) => item.id);
}

function sectionIdentity(
  portfolioId: string,
  section: PortfolioPresentationSection,
): PortfolioPresentationSectionId {
  return JSON.stringify([portfolioId, section]);
}

function isStructuralSection(section: PortfolioPresentationSection): boolean {
  return (
    section === PortfolioPresentationSection.Overview ||
    section === PortfolioPresentationSection.Valuation ||
    section === PortfolioPresentationSection.Coverage
  );
}

function presentationItem(
  insight: PortfolioInsight,
  priority: PortfolioInsightPriority,
  reasons: ReadonlyArray<PortfolioInsightPriorityReason>,
  valuation: PortfolioValuation,
): PortfolioPresentationItem {
  return {
    id: insight.id,
    category: insight.category,
    ...(insight.severity === undefined ? {} : { severity: insight.severity }),
    priority,
    priorityReasons: [...reasons],
    targetIdentity: targetIdentity(insight),
    evidence: {
      insight: clone(insight.evidence),
      valuationPositions: relevantValuations(insight.evidence, valuation).map(clone),
    },
  };
}

function relevantValuations(
  evidence: PortfolioInsightEvidence,
  valuation: PortfolioValuation,
): ReadonlyArray<PortfolioPositionValuation> {
  const positionIdentities = new Set<string>([
    ...(evidence.positionIdentity === undefined ? [] : [evidence.positionIdentity]),
    ...(evidence.allocation?.positionIdentities ?? []),
  ]);
  const assetIdentity =
    evidence.asset === undefined ? undefined : portfolioAssetIdentity(evidence.asset);
  return valuation.positions.filter(
    (position) =>
      positionIdentities.has(position.positionIdentity) ||
      (assetIdentity !== undefined && portfolioAssetIdentity(position.asset) === assetIdentity),
  );
}

function targetIdentity(insight: PortfolioInsight): string {
  if (insight.evidence.allocation !== undefined) return insight.evidence.allocation.identity;
  if (insight.evidence.positionIdentity !== undefined) return insight.evidence.positionIdentity;
  if (insight.evidence.asset !== undefined) return portfolioAssetIdentity(insight.evidence.asset);
  return insight.evidence.unavailableReason ?? insight.id;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
