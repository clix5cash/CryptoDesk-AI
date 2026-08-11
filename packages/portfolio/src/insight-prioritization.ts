import { PortfolioInsightValidationError } from './errors.js';
import { portfolioAssetIdentity } from './identity.js';
import {
  PortfolioInsightCategory,
  PortfolioInsightSeverity,
  type PortfolioInsight,
  type PortfolioInsightAnalysis,
} from './insight.js';

/** Ordinal presentation bucket; it is not a relevance or risk score. */
export enum PortfolioInsightPriority {
  High = 'high',
  Normal = 'normal',
  Low = 'low',
}

/** Canonical, machine-readable reason for a deterministic priority decision. */
export enum PortfolioInsightPriorityReason {
  SignificantSeverity = 'significant_severity',
  NotableSeverity = 'notable_severity',
  CoverageLimitation = 'coverage_limitation',
  DataQualityLimitation = 'data_quality_limitation',
  CategoryPrecedence = 'category_precedence',
  MeasuredMagnitude = 'measured_magnitude',
  CanonicalIdentity = 'canonical_identity',
}

export interface PortfolioPrioritizedInsight {
  readonly insight: PortfolioInsight;
  readonly priority: PortfolioInsightPriority;
  readonly reasons: ReadonlyArray<PortfolioInsightPriorityReason>;
}

export interface PortfolioPrioritizedInsightAnalysis {
  readonly portfolioId: string;
  readonly asOf: string;
  readonly coverageState?: PortfolioInsightAnalysis['coverageState'];
  readonly insights: ReadonlyArray<PortfolioPrioritizedInsight>;
}

/** Explicit optional selection; omitted values preserve every valid insight. */
export interface PortfolioInsightPrioritizationOptions {
  readonly maxItems?: number;
  readonly minimumSeverity?: PortfolioInsightSeverity;
}

/** Prioritizes existing insight records without modifying their evidence or semantics. */
export function prioritizePortfolioInsights(
  analysis: PortfolioInsightAnalysis,
  options: PortfolioInsightPrioritizationOptions = {},
): PortfolioPrioritizedInsightAnalysis {
  validateAnalysis(analysis);
  validateOptions(options);
  const prioritized = analysis.insights
    .filter((insight) => meetsMinimumSeverity(insight.severity, options.minimumSeverity))
    .map((insight) => ({ insight, priority: priorityFor(insight), reasons: reasonsFor(insight) }))
    .sort(comparePrioritized);
  return {
    portfolioId: analysis.portfolioId,
    asOf: analysis.asOf,
    ...(analysis.coverageState === undefined ? {} : { coverageState: analysis.coverageState }),
    insights: options.maxItems === undefined ? prioritized : prioritized.slice(0, options.maxItems),
  };
}

function validateAnalysis(analysis: PortfolioInsightAnalysis): void {
  if (
    analysis === null ||
    typeof analysis !== 'object' ||
    !analysis.portfolioId?.trim() ||
    !analysis.asOf?.trim() ||
    !Array.isArray(analysis.insights)
  ) {
    throw new PortfolioInsightValidationError('Portfolio insight analysis is malformed.');
  }
  const ids = new Set<string>();
  for (const insight of analysis.insights) {
    if (!insight.id?.trim() || ids.has(insight.id)) {
      throw new PortfolioInsightValidationError(
        'Portfolio insight IDs must be unique and non-empty.',
      );
    }
    ids.add(insight.id);
    if (!Object.values(PortfolioInsightCategory).includes(insight.category)) {
      throw new PortfolioInsightValidationError('Portfolio insight category is invalid.');
    }
    if (
      insight.severity !== undefined &&
      !Object.values(PortfolioInsightSeverity).includes(insight.severity)
    ) {
      throw new PortfolioInsightValidationError('Portfolio insight severity is invalid.');
    }
    if (insight.evidence?.portfolioId !== analysis.portfolioId) {
      throw new PortfolioInsightValidationError(
        'Portfolio insight evidence portfolio ID is invalid.',
      );
    }
  }
}

function validateOptions(options: PortfolioInsightPrioritizationOptions): void {
  if (options === null || typeof options !== 'object') {
    throw new PortfolioInsightValidationError(
      'Portfolio insight prioritization options are malformed.',
    );
  }
  if (
    options.maxItems !== undefined &&
    (!Number.isInteger(options.maxItems) || options.maxItems < 0)
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight maxItems must be a non-negative integer.',
    );
  }
  if (
    options.minimumSeverity !== undefined &&
    !Object.values(PortfolioInsightSeverity).includes(options.minimumSeverity)
  ) {
    throw new PortfolioInsightValidationError('Portfolio insight minimum severity is invalid.');
  }
}

function priorityFor(insight: PortfolioInsight): PortfolioInsightPriority {
  if (
    insight.severity === PortfolioInsightSeverity.Significant ||
    insight.category === PortfolioInsightCategory.DataQuality ||
    insight.category === PortfolioInsightCategory.Coverage
  )
    return PortfolioInsightPriority.High;
  return insight.severity === PortfolioInsightSeverity.Notable
    ? PortfolioInsightPriority.Normal
    : PortfolioInsightPriority.Low;
}

function reasonsFor(insight: PortfolioInsight): ReadonlyArray<PortfolioInsightPriorityReason> {
  const reasons: PortfolioInsightPriorityReason[] = [];
  if (insight.severity === PortfolioInsightSeverity.Significant)
    reasons.push(PortfolioInsightPriorityReason.SignificantSeverity);
  if (insight.severity === PortfolioInsightSeverity.Notable)
    reasons.push(PortfolioInsightPriorityReason.NotableSeverity);
  if (insight.category === PortfolioInsightCategory.Coverage)
    reasons.push(PortfolioInsightPriorityReason.CoverageLimitation);
  if (insight.category === PortfolioInsightCategory.DataQuality)
    reasons.push(PortfolioInsightPriorityReason.DataQualityLimitation);
  reasons.push(PortfolioInsightPriorityReason.CategoryPrecedence);
  if (
    insight.evidence.measuredPercentage !== undefined ||
    insight.evidence.measuredValue !== undefined
  )
    reasons.push(PortfolioInsightPriorityReason.MeasuredMagnitude);
  reasons.push(PortfolioInsightPriorityReason.CanonicalIdentity);
  return reasons;
}

function comparePrioritized(
  left: PortfolioPrioritizedInsight,
  right: PortfolioPrioritizedInsight,
): number {
  const priority = priorityOrder(right.priority) - priorityOrder(left.priority);
  if (priority) return priority;
  const severity = severityOrder(right.insight.severity) - severityOrder(left.insight.severity);
  if (severity) return severity;
  const category = categoryOrder(left.insight.category) - categoryOrder(right.insight.category);
  if (category) return category;
  const magnitude = compareDecimal(
    right.insight.evidence.measuredPercentage ?? right.insight.evidence.measuredValue ?? '0',
    left.insight.evidence.measuredPercentage ?? left.insight.evidence.measuredValue ?? '0',
  );
  if (magnitude) return magnitude;
  return (
    target(left.insight).localeCompare(target(right.insight)) ||
    left.insight.id.localeCompare(right.insight.id)
  );
}

function meetsMinimumSeverity(
  severity: PortfolioInsightSeverity | undefined,
  minimum: PortfolioInsightSeverity | undefined,
): boolean {
  return minimum === undefined || severityOrder(severity) >= severityOrder(minimum);
}
function priorityOrder(value: PortfolioInsightPriority): number {
  return value === PortfolioInsightPriority.High
    ? 2
    : value === PortfolioInsightPriority.Normal
      ? 1
      : 0;
}
function severityOrder(value: PortfolioInsightSeverity | undefined): number {
  return value === PortfolioInsightSeverity.Significant
    ? 2
    : value === PortfolioInsightSeverity.Notable
      ? 1
      : 0;
}
function categoryOrder(value: PortfolioInsightCategory): number {
  return [
    PortfolioInsightCategory.Concentration,
    PortfolioInsightCategory.Exposure,
    PortfolioInsightCategory.Coverage,
    PortfolioInsightCategory.DataQuality,
    PortfolioInsightCategory.Valuation,
    PortfolioInsightCategory.Allocation,
  ].indexOf(value);
}
function target(insight: PortfolioInsight): string {
  if (insight.evidence.allocation !== undefined) return insight.evidence.allocation.identity;
  if (insight.evidence.positionIdentity !== undefined) return insight.evidence.positionIdentity;
  if (insight.evidence.asset !== undefined) return portfolioAssetIdentity(insight.evidence.asset);
  return insight.evidence.unavailableReason ?? insight.id;
}
function compareDecimal(left: string, right: string): number {
  const a = left.split('.');
  const b = right.split('.');
  const s = Math.max(a[1]?.length ?? 0, b[1]?.length ?? 0);
  const n = (x: string[]) => BigInt(`${x[0]}${(x[1] ?? '').padEnd(s, '0')}`);
  return n(a) === n(b) ? 0 : n(a) > n(b) ? 1 : -1;
}
