import type {
  PortfolioAccountId,
  PortfolioAsset,
  PortfolioNetworkId,
  PortfolioPositionIdentity,
  PortfolioSnapshot,
  PortfolioSourceId,
} from './contracts.js';
import { PortfolioInsightValidationError } from './errors.js';
import { portfolioAssetIdentity, portfolioPositionIdentity } from './identity.js';
import type { PortfolioAllocationAnalysis, PortfolioAllocationItem } from './allocation.js';
import { PortfolioAllocationDimension } from './allocation.js';
import type {
  PortfolioRiskAnalysis,
  PortfolioRiskDataState,
  PortfolioRiskThresholdEvidence,
  PortfolioRiskUnavailableReason,
} from './risk.js';
import {
  PortfolioRiskConcentrationLevel,
  validatePortfolioRiskAnalysis,
  validatePortfolioRiskAnalysisInput,
} from './risk.js';
import type { PortfolioValuation } from './valuation.js';

/** Externally supplied opaque identity for one deterministic, evidence-backed insight. */
export type PortfolioInsightId = string;

/** Supported canonical fact families; none represent advice or prediction. */
export enum PortfolioInsightCategory {
  Valuation = 'valuation',
  Allocation = 'allocation',
  Exposure = 'exposure',
  Concentration = 'concentration',
  Coverage = 'coverage',
  DataQuality = 'data_quality',
}

/** Descriptive prominence only; it is not a risk score or confidence value. */
export enum PortfolioInsightSeverity {
  Info = 'info',
  Notable = 'notable',
  Significant = 'significant',
}

/** Immutable canonical evidence retained by an insight without inferred facts. */
export interface PortfolioInsightEvidence {
  readonly portfolioId: string;
  readonly asset?: PortfolioAsset;
  readonly positionIdentity?: PortfolioPositionIdentity;
  readonly networkId?: PortfolioNetworkId;
  readonly sourceId?: PortfolioSourceId;
  readonly accountId?: PortfolioAccountId;
  readonly allocation?: PortfolioAllocationItem;
  readonly measuredValue?: string;
  readonly measuredPercentage?: string;
  readonly thresholdEvidence?: PortfolioRiskThresholdEvidence;
  readonly riskLevel?: PortfolioRiskConcentrationLevel;
  readonly coverageState?: PortfolioRiskDataState;
  readonly unavailableReason?: PortfolioRiskUnavailableReason;
}

/** Immutable descriptive Portfolio insight. It intentionally contains no narrative or recommendation. */
export interface PortfolioInsight {
  readonly id: PortfolioInsightId;
  readonly category: PortfolioInsightCategory;
  readonly severity?: PortfolioInsightSeverity;
  readonly evidence: PortfolioInsightEvidence;
}

/** Canonical inputs a future insight generator may consume; this sprint does not generate insights. */
export interface PortfolioInsightAnalysisInput {
  readonly snapshot: PortfolioSnapshot;
  readonly valuation: PortfolioValuation;
  readonly allocation: PortfolioAllocationAnalysis;
  readonly risk: PortfolioRiskAnalysis;
}

/** Optional, separately-produced collection of deterministic insight contracts. */
export interface PortfolioInsightAnalysis {
  readonly portfolioId: string;
  readonly asOf: string;
  /** Explicit canonical coverage retained by generated insight analyses. */
  readonly coverageState?: PortfolioRiskDataState;
  readonly insights: ReadonlyArray<PortfolioInsight>;
}

/** Generates deterministic, evidence-only Portfolio insights from canonical analysis results. */
export function generatePortfolioInsights(
  input: PortfolioInsightAnalysisInput,
): PortfolioInsightAnalysis {
  const riskInput = {
    analysisId: input.risk.analysisId,
    asOf: input.risk.asOf,
    snapshot: input.snapshot,
    valuation: input.valuation,
    allocation: input.allocation,
  };
  try {
    validatePortfolioRiskAnalysisInput(riskInput);
    validatePortfolioRiskAnalysis(riskInput, input.risk);
  } catch (error) {
    throw new PortfolioInsightValidationError(
      error instanceof Error ? error.message : 'Portfolio insight input is invalid.',
    );
  }

  const candidates: PortfolioInsight[] = [
    ...coverageInsights(input),
    ...allocationInsights(input),
    ...riskInsights(input),
    ...dataQualityInsights(input),
  ];
  const unique = new Map<string, PortfolioInsight>();
  for (const insight of candidates) {
    const existing = unique.get(insight.id);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(insight)) {
      throw new PortfolioInsightValidationError(
        `Portfolio insight identity "${insight.id}" has contradictory evidence.`,
      );
    }
    unique.set(insight.id, insight);
  }
  const analysis: PortfolioInsightAnalysis = {
    portfolioId: input.snapshot.portfolio.id,
    asOf: input.risk.asOf,
    coverageState: input.risk.coverage.state,
    insights: Array.from(unique.values()).sort(compareInsights),
  };
  validatePortfolioInsightAnalysis(input, analysis);
  return analysis;
}

/** Validates an evidence-backed insight collection against existing canonical Portfolio results. */
export function validatePortfolioInsightAnalysis(
  input: PortfolioInsightAnalysisInput,
  analysis: PortfolioInsightAnalysis,
): void {
  const riskInput = {
    analysisId: input.risk.analysisId,
    asOf: input.risk.asOf,
    snapshot: input.snapshot,
    valuation: input.valuation,
    allocation: input.allocation,
  };
  try {
    validatePortfolioRiskAnalysisInput(riskInput);
    validatePortfolioRiskAnalysis(riskInput, input.risk);
  } catch (error) {
    throw new PortfolioInsightValidationError(
      error instanceof Error ? error.message : 'Portfolio insight input is invalid.',
    );
  }
  assertNonEmpty(analysis.portfolioId, 'Portfolio insight analysis portfolio ID');
  assertTimestamp(analysis.asOf, 'Portfolio insight analysis asOf');
  if (analysis.portfolioId !== input.snapshot.portfolio.id || analysis.asOf !== input.risk.asOf) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight analysis identity does not match canonical Portfolio risk input.',
    );
  }
  if (
    analysis.coverageState !== undefined &&
    analysis.coverageState !== input.risk.coverage.state
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight analysis coverage state conflicts with canonical risk coverage.',
    );
  }
  const insightIds = new Set<string>();
  for (const insight of analysis.insights) {
    assertNonEmpty(insight.id, 'Portfolio insight ID');
    if (insightIds.has(insight.id)) {
      throw new PortfolioInsightValidationError(
        `Portfolio insight ID "${insight.id}" is duplicated.`,
      );
    }
    insightIds.add(insight.id);
    validateInsight(insight, input);
  }
}

function coverageInsights(input: PortfolioInsightAnalysisInput): ReadonlyArray<PortfolioInsight> {
  if (input.risk.coverage.state === 'complete') return [];
  return [
    insight(input, PortfolioInsightCategory.Coverage, 'coverage', PortfolioInsightSeverity.Info, {
      coverageState: input.risk.coverage.state,
    }),
  ];
}

function allocationInsights(input: PortfolioInsightAnalysisInput): ReadonlyArray<PortfolioInsight> {
  const items = [
    ...input.allocation.assetAllocation.items,
    ...input.allocation.exposure.network.items,
    ...input.allocation.exposure.source.items,
    ...input.allocation.exposure.account.items,
  ];
  return items.map((allocation) => {
    const category =
      allocation.dimension === PortfolioAllocationDimension.Asset
        ? PortfolioInsightCategory.Allocation
        : PortfolioInsightCategory.Exposure;
    return insight(
      input,
      category,
      `${allocation.dimension}:${allocation.identity}`,
      PortfolioInsightSeverity.Notable,
      {
        allocation,
        measuredValue: allocation.value,
        measuredPercentage: allocation.percentage,
        ...(allocation.asset === undefined ? {} : { asset: allocation.asset }),
        ...(allocation.networkId === undefined ? {} : { networkId: allocation.networkId }),
        ...(allocation.sourceId === undefined ? {} : { sourceId: allocation.sourceId }),
        ...(allocation.accountId === undefined ? {} : { accountId: allocation.accountId }),
        coverageState: input.risk.coverage.state,
      },
    );
  });
}

function riskInsights(input: PortfolioInsightAnalysisInput): ReadonlyArray<PortfolioInsight> {
  const observations = [
    ...input.risk.concentrationObservations.map((observation) => ({
      observation,
      category: PortfolioInsightCategory.Concentration,
    })),
    ...input.risk.exposureObservations.map((observation) => ({
      observation,
      category: PortfolioInsightCategory.Exposure,
    })),
  ];
  return observations
    .filter(
      ({ observation }) =>
        (observation.level === PortfolioRiskConcentrationLevel.Moderate ||
          observation.level === PortfolioRiskConcentrationLevel.High) &&
        observation.thresholdEvidence !== undefined,
    )
    .map(({ observation, category }) =>
      insight(
        input,
        category,
        `risk:${observation.allocation.dimension}:${observation.allocation.identity}:${observation.level}`,
        observation.level === PortfolioRiskConcentrationLevel.High
          ? PortfolioInsightSeverity.Significant
          : PortfolioInsightSeverity.Notable,
        {
          allocation: observation.allocation,
          measuredValue: observation.allocation.value,
          measuredPercentage: observation.allocation.percentage,
          thresholdEvidence: observation.thresholdEvidence,
          riskLevel: observation.level,
          coverageState: input.risk.coverage.state,
          ...(observation.allocation.asset === undefined
            ? {}
            : { asset: observation.allocation.asset }),
          ...(observation.allocation.networkId === undefined
            ? {}
            : { networkId: observation.allocation.networkId }),
          ...(observation.allocation.sourceId === undefined
            ? {}
            : { sourceId: observation.allocation.sourceId }),
          ...(observation.allocation.accountId === undefined
            ? {}
            : { accountId: observation.allocation.accountId }),
        },
      ),
    );
}

function dataQualityInsights(
  input: PortfolioInsightAnalysisInput,
): ReadonlyArray<PortfolioInsight> {
  return input.risk.unavailableObservations.map((observation) =>
    insight(
      input,
      PortfolioInsightCategory.DataQuality,
      `unavailable:${observation.reason}:${observation.positionIdentity ?? observation.networkId ?? observation.sourceId ?? ''}`,
      PortfolioInsightSeverity.Info,
      {
        unavailableReason: observation.reason,
        ...(observation.positionIdentity === undefined
          ? {}
          : { positionIdentity: observation.positionIdentity }),
        ...(observation.asset === undefined ? {} : { asset: observation.asset }),
        ...(observation.networkId === undefined ? {} : { networkId: observation.networkId }),
        ...(observation.sourceId === undefined ? {} : { sourceId: observation.sourceId }),
        coverageState: input.risk.coverage.state,
      },
    ),
  );
}

function insight(
  input: PortfolioInsightAnalysisInput,
  category: PortfolioInsightCategory,
  target: string,
  severity: PortfolioInsightSeverity,
  evidence: Omit<PortfolioInsightEvidence, 'portfolioId'>,
): PortfolioInsight {
  return {
    id: JSON.stringify([input.snapshot.portfolio.id, category, target]),
    category,
    severity,
    evidence: { portfolioId: input.snapshot.portfolio.id, ...evidence },
  };
}

function compareInsights(left: PortfolioInsight, right: PortfolioInsight): number {
  const severity = severityOrder(right.severity) - severityOrder(left.severity);
  if (severity !== 0) return severity;
  const category = left.category.localeCompare(right.category);
  if (category !== 0) return category;
  const target = insightTarget(left).localeCompare(insightTarget(right));
  return target || left.id.localeCompare(right.id);
}

function insightTarget(insight: PortfolioInsight): string {
  if (insight.evidence.allocation !== undefined) return insight.evidence.allocation.identity;
  if (insight.evidence.positionIdentity !== undefined) return insight.evidence.positionIdentity;
  if (insight.evidence.asset !== undefined) return portfolioAssetIdentity(insight.evidence.asset);
  return insight.evidence.unavailableReason ?? 'coverage';
}

function severityOrder(severity: PortfolioInsightSeverity | undefined): number {
  return severity === PortfolioInsightSeverity.Significant
    ? 2
    : severity === PortfolioInsightSeverity.Notable
      ? 1
      : 0;
}

function validateInsight(insight: PortfolioInsight, input: PortfolioInsightAnalysisInput): void {
  if (!Object.values(PortfolioInsightCategory).includes(insight.category)) {
    throw new PortfolioInsightValidationError('Portfolio insight category is invalid.');
  }
  if (
    insight.severity !== undefined &&
    !Object.values(PortfolioInsightSeverity).includes(insight.severity)
  ) {
    throw new PortfolioInsightValidationError('Portfolio insight severity is invalid.');
  }
  const evidence = insight.evidence;
  if (evidence === null || typeof evidence !== 'object') {
    throw new PortfolioInsightValidationError('Portfolio insight evidence is required.');
  }
  if (evidence.portfolioId !== input.snapshot.portfolio.id) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight evidence portfolio ID is invalid.',
    );
  }
  validateEvidenceReferences(evidence, input.snapshot);
  validateEvidenceMeasurements(evidence);
  validateEvidenceAllocation(evidence, input.allocation);
  validateEvidenceRisk(evidence, input.risk);
  validateCategoryEvidence(insight.category, evidence);
}

function validateEvidenceReferences(
  evidence: PortfolioInsightEvidence,
  snapshot: PortfolioSnapshot,
): void {
  const positions = new Map(
    snapshot.positions.map((position) => [portfolioPositionIdentity(position), position]),
  );
  if (evidence.positionIdentity !== undefined) {
    const position = positions.get(evidence.positionIdentity);
    if (position === undefined) {
      throw new PortfolioInsightValidationError(
        'Portfolio insight evidence references an unknown position.',
      );
    }
    if (
      evidence.asset !== undefined &&
      portfolioAssetIdentity(evidence.asset) !== portfolioAssetIdentity(position.asset)
    ) {
      throw new PortfolioInsightValidationError(
        'Portfolio insight evidence asset conflicts with its position.',
      );
    }
  }
  if (evidence.asset !== undefined) {
    const asset = evidence.asset;
    const known = snapshot.positions.some(
      (position) => portfolioAssetIdentity(position.asset) === portfolioAssetIdentity(asset),
    );
    if (!known)
      throw new PortfolioInsightValidationError(
        'Portfolio insight evidence references an unknown asset.',
      );
  }
  if (
    evidence.networkId !== undefined &&
    !snapshot.positions.some((position) => position.asset.networkId === evidence.networkId)
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight evidence references an unknown network.',
    );
  }
  if (
    evidence.sourceId !== undefined &&
    !snapshot.portfolio.sources.some((source) => source.id === evidence.sourceId)
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight evidence references an unknown source.',
    );
  }
  if (
    evidence.accountId !== undefined &&
    !snapshot.portfolio.accounts?.some((account) => account.id === evidence.accountId)
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight evidence references an unknown account.',
    );
  }
}

function validateEvidenceMeasurements(evidence: PortfolioInsightEvidence): void {
  if (evidence.measuredValue !== undefined)
    assertDecimal(evidence.measuredValue, 'Portfolio insight value');
  if (evidence.measuredPercentage !== undefined) {
    assertPercentage(evidence.measuredPercentage, 'Portfolio insight percentage');
  }
  if (evidence.thresholdEvidence === undefined && evidence.riskLevel !== undefined) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight risk level requires explicit threshold evidence.',
    );
  }
  if (evidence.thresholdEvidence !== undefined) {
    assertPercentage(
      evidence.thresholdEvidence.moderatePercentage,
      'Portfolio insight moderate threshold',
    );
    assertPercentage(evidence.thresholdEvidence.highPercentage, 'Portfolio insight high threshold');
    if (
      compareDecimal(
        evidence.thresholdEvidence.moderatePercentage,
        evidence.thresholdEvidence.highPercentage,
      ) >= 0
    ) {
      throw new PortfolioInsightValidationError(
        'Portfolio insight moderate threshold must be lower than the high threshold.',
      );
    }
    if (
      evidence.riskLevel !== evidence.thresholdEvidence.matchedLevel ||
      !Object.values(PortfolioRiskConcentrationLevel).includes(evidence.riskLevel)
    ) {
      throw new PortfolioInsightValidationError(
        'Portfolio insight threshold evidence is malformed.',
      );
    }
  }
}

function validateEvidenceAllocation(
  evidence: PortfolioInsightEvidence,
  allocation: PortfolioAllocationAnalysis,
): void {
  if (evidence.allocation === undefined) return;
  const candidates = [
    ...allocation.assetAllocation.items,
    ...allocation.exposure.network.items,
    ...allocation.exposure.source.items,
    ...allocation.exposure.account.items,
  ];
  const match = candidates.find(
    (item) =>
      item.dimension === evidence.allocation?.dimension &&
      item.identity === evidence.allocation?.identity &&
      item.value === evidence.allocation?.value &&
      item.percentage === evidence.allocation?.percentage,
  );
  if (match === undefined) {
    throw new PortfolioInsightValidationError('Portfolio insight evidence allocation is unknown.');
  }
}

function validateEvidenceRisk(
  evidence: PortfolioInsightEvidence,
  risk: PortfolioRiskAnalysis,
): void {
  if (evidence.coverageState !== undefined && evidence.coverageState !== risk.coverage.state) {
    throw new PortfolioInsightValidationError(
      'Portfolio insight coverage state conflicts with risk coverage.',
    );
  }
  if (
    evidence.unavailableReason !== undefined &&
    !risk.unavailableObservations.some((item) => item.reason === evidence.unavailableReason)
  ) {
    throw new PortfolioInsightValidationError('Portfolio insight unavailable reason is unknown.');
  }
}

function validateCategoryEvidence(
  category: PortfolioInsightCategory,
  evidence: PortfolioInsightEvidence,
): void {
  if (
    category === PortfolioInsightCategory.Concentration &&
    evidence.allocation?.dimension !== PortfolioAllocationDimension.Asset
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio concentration insight requires asset allocation evidence.',
    );
  }
  if (
    category === PortfolioInsightCategory.Exposure &&
    evidence.allocation?.dimension === PortfolioAllocationDimension.Asset
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio exposure insight cannot use asset allocation evidence.',
    );
  }
  if (category === PortfolioInsightCategory.Coverage && evidence.coverageState === undefined) {
    throw new PortfolioInsightValidationError(
      'Portfolio coverage insight requires coverage evidence.',
    );
  }
  if (
    category === PortfolioInsightCategory.DataQuality &&
    evidence.unavailableReason === undefined
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio data-quality insight requires unavailable evidence.',
    );
  }
}

function assertDecimal(value: string, label: string): void {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) {
    throw new PortfolioInsightValidationError(`${label} must be a non-negative decimal value.`);
  }
}

function assertPercentage(value: string, label: string): void {
  assertDecimal(value, label);
  if (compareDecimal(value, '100') > 0) {
    throw new PortfolioInsightValidationError(`${label} must be from 0 to 100.`);
  }
}

function compareDecimal(left: string, right: string): number {
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const scale = Math.max(leftParts[1]?.length ?? 0, rightParts[1]?.length ?? 0);
  const normalize = (parts: ReadonlyArray<string>): bigint =>
    BigInt(`${parts[0]}${(parts[1] ?? '').padEnd(scale, '0')}`);
  const leftValue = normalize(leftParts);
  const rightValue = normalize(rightParts);
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

function assertTimestamp(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new PortfolioInsightValidationError(`${label} must be a valid ISO timestamp.`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PortfolioInsightValidationError(`${label} is required.`);
  }
}
