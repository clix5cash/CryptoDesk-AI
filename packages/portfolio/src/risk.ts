import type {
  PortfolioAsset,
  PortfolioNetworkId,
  PortfolioPositionIdentity,
  PortfolioSnapshot,
  PortfolioSourceId,
} from './contracts.js';
import { PortfolioRiskValidationError } from './errors.js';
import {
  portfolioAssetIdentity,
  portfolioPositionIdentity,
  validatePortfolioSnapshotIdentity,
} from './identity.js';
import type {
  PortfolioAllocationAnalysis,
  PortfolioAllocationItem,
  PortfolioCoverage,
} from './allocation.js';
import { PortfolioAllocationDimension } from './allocation.js';
import type { PortfolioUnvaluedPosition, PortfolioValuation } from './valuation.js';
import { validatePortfolioValuation } from './valuation.js';

/** Externally supplied, opaque identity for one deterministic risk-analysis record. */
export type PortfolioRiskAnalysisId = string;

/** Explicit availability state; it describes evidence coverage, never a risk level. */
export enum PortfolioRiskDataState {
  Complete = 'complete',
  Partial = 'partial',
  Unavailable = 'unavailable',
  InsufficientData = 'insufficient_data',
}

/** Provider-neutral reason that descriptive risk evidence is unavailable. */
export enum PortfolioRiskUnavailableReason {
  MissingPrice = 'missing_price',
  MissingDecimals = 'missing_decimals',
  MissingNetworkProvenance = 'missing_network_provenance',
  MissingSourceProvenance = 'missing_source_provenance',
  MissingAccountProvenance = 'missing_account_provenance',
  NoValuedPositions = 'no_valued_positions',
  ZeroTotalValue = 'zero_total_value',
}

/** Rule-based concentration level; it is not a composite score or recommendation. */
export enum PortfolioRiskConcentrationLevel {
  None = 'none',
  Moderate = 'moderate',
  High = 'high',
}

/** Explicit percentage boundaries for one allocation dimension. */
export interface PortfolioRiskConcentrationThresholds {
  /** Inclusive lower boundary for a moderate concentration observation. */
  readonly moderatePercentage: string;
  /** Inclusive lower boundary for a high concentration observation. */
  readonly highPercentage: string;
}

/** Explicit, provider-neutral thresholds for every supported descriptive dimension. */
export interface PortfolioRiskThresholdConfiguration {
  readonly asset: PortfolioRiskConcentrationThresholds;
  readonly network: PortfolioRiskConcentrationThresholds;
  readonly source: PortfolioRiskConcentrationThresholds;
  readonly account: PortfolioRiskConcentrationThresholds;
}

/** Required caller-supplied rule configuration; there are no hidden threshold defaults. */
export interface PortfolioRiskAnalysisOptions {
  readonly thresholds: PortfolioRiskThresholdConfiguration;
}

/** Machine-readable rule evidence for an analyzer-produced concentration observation. */
export interface PortfolioRiskThresholdEvidence extends PortfolioRiskConcentrationThresholds {
  readonly matchedLevel: PortfolioRiskConcentrationLevel;
}

/** Immutable canonical inputs a future risk engine may consume. */
export interface PortfolioRiskAnalysisInput {
  readonly analysisId: PortfolioRiskAnalysisId;
  /** Explicit analysis cutoff; must match the valuation as-of timestamp. */
  readonly asOf: string;
  readonly snapshot: PortfolioSnapshot;
  readonly valuation: PortfolioValuation;
  readonly allocation: PortfolioAllocationAnalysis;
}

/** Explicit valued/unvalued coverage retained without estimating missing values. */
export interface PortfolioRiskCoverage {
  readonly state: PortfolioRiskDataState;
  readonly coverage: PortfolioCoverage;
  readonly valuedPositionIdentities: ReadonlyArray<PortfolioPositionIdentity>;
  readonly unvaluedPositions: ReadonlyArray<PortfolioUnvaluedPosition>;
}

/** Descriptive concentration evidence derived from one existing allocation item. */
export interface PortfolioRiskConcentrationObservation {
  readonly allocation: PortfolioAllocationItem;
  /** Present only when produced by deterministic threshold analysis. */
  readonly level?: PortfolioRiskConcentrationLevel;
  /** Preserves the explicit configuration used to derive `level`. */
  readonly thresholdEvidence?: PortfolioRiskThresholdEvidence;
}

/** Descriptive network, source, or account exposure evidence from existing allocation data. */
export interface PortfolioRiskExposureObservation {
  readonly allocation: PortfolioAllocationItem;
  /** Present only when produced by deterministic threshold analysis. */
  readonly level?: PortfolioRiskConcentrationLevel;
  /** Preserves the explicit configuration used to derive `level`. */
  readonly thresholdEvidence?: PortfolioRiskThresholdEvidence;
  /** Availability of the portfolio facts behind this measured exposure. */
  readonly coverageState?: PortfolioRiskDataState;
  /** Explicitly explains an unclassified canonical exposure without inventing a target. */
  readonly dataQualityReason?: PortfolioRiskUnavailableReason;
}

/** Explicit record of unavailable evidence; no value, score, or recommendation is implied. */
export interface PortfolioRiskUnavailableObservation {
  readonly reason: PortfolioRiskUnavailableReason;
  readonly positionIdentity?: PortfolioPositionIdentity;
  readonly asset?: PortfolioAsset;
  readonly networkId?: PortfolioNetworkId;
  readonly sourceId?: PortfolioSourceId;
}

/** Immutable descriptive risk-domain artifact. It intentionally contains no composite score. */
export interface PortfolioRiskAnalysis {
  readonly analysisId: PortfolioRiskAnalysisId;
  readonly portfolioId: string;
  readonly asOf: string;
  readonly coverage: PortfolioRiskCoverage;
  readonly concentrationObservations: ReadonlyArray<PortfolioRiskConcentrationObservation>;
  readonly exposureObservations: ReadonlyArray<PortfolioRiskExposureObservation>;
  readonly unavailableObservations: ReadonlyArray<PortfolioRiskUnavailableObservation>;
}

/**
 * Derives rule-based, descriptive concentration and exposure observations from
 * canonical allocation facts. It never fetches data, scores the portfolio, or
 * estimates unvalued positions.
 */
export function analyzePortfolioRisk(
  input: PortfolioRiskAnalysisInput,
  options: PortfolioRiskAnalysisOptions,
): PortfolioRiskAnalysis {
  validatePortfolioRiskAnalysisInput(input);
  validatePortfolioRiskAnalysisOptions(options);

  const coverage = riskCoverage(input);
  const hasValuedPositions = input.valuation.positions.length > 0;
  const hasPositiveTotal = comparePercentage(input.valuation.totalValue, '0') > 0;
  const concentrations = hasPositiveTotal
    ? input.allocation.assetAllocation.items.map((item) => observation(item, options.thresholds))
    : [];
  const exposures = hasPositiveTotal
    ? [
        ...input.allocation.exposure.network.items,
        ...input.allocation.exposure.source.items,
        ...input.allocation.exposure.account.items,
      ].map((item) => exposureObservation(item, options.thresholds, coverage.state))
    : [];
  const unavailable = [
    ...input.valuation.unvaluedPositions.map((position) => ({
      reason:
        position.reason === 'missing_price'
          ? PortfolioRiskUnavailableReason.MissingPrice
          : PortfolioRiskUnavailableReason.MissingDecimals,
      positionIdentity: position.positionIdentity,
      asset: cloneAsset(position.asset),
    })),
    ...unclassifiedProvenance(input.allocation),
    ...(hasValuedPositions
      ? hasPositiveTotal
        ? []
        : [{ reason: PortfolioRiskUnavailableReason.ZeroTotalValue }]
      : [{ reason: PortfolioRiskUnavailableReason.NoValuedPositions }]),
  ].sort(compareUnavailableObservations);

  const analysis: PortfolioRiskAnalysis = {
    analysisId: input.analysisId,
    portfolioId: input.snapshot.portfolio.id,
    asOf: input.asOf,
    coverage,
    concentrationObservations: concentrations.sort(compareObservations),
    exposureObservations: exposures.sort(compareObservations),
    unavailableObservations: unavailable,
  };
  validatePortfolioRiskAnalysis(input, analysis);
  return analysis;
}

/** Validates caller-supplied thresholds without applying a hidden default. */
export function validatePortfolioRiskAnalysisOptions(options: PortfolioRiskAnalysisOptions): void {
  if (options === null || typeof options !== 'object' || options.thresholds === undefined) {
    throw new PortfolioRiskValidationError('Portfolio risk threshold configuration is required.');
  }
  validateThresholds(options.thresholds.asset, 'asset');
  validateThresholds(options.thresholds.network, 'network');
  validateThresholds(options.thresholds.source, 'source');
  validateThresholds(options.thresholds.account, 'account');
}

/** Validates cross-module identity and coverage coherence for canonical risk inputs. */
export function validatePortfolioRiskAnalysisInput(input: PortfolioRiskAnalysisInput): void {
  assertNonEmpty(input.analysisId, 'Portfolio risk analysis ID');
  assertIsoTimestamp(input.asOf, 'Portfolio risk analysis asOf');
  validatePortfolioSnapshotIdentity(input.snapshot);
  validatePortfolioValuation(input.valuation);

  if (input.snapshot.portfolio.id !== input.valuation.portfolioId) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk valuation portfolio ID does not match the Portfolio snapshot.',
    );
  }
  if (input.snapshot.capturedAt !== input.valuation.snapshotCapturedAt) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk valuation snapshot capturedAt does not match the Portfolio snapshot.',
    );
  }
  if (input.asOf !== input.valuation.asOf) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk analysis asOf does not match the valuation asOf timestamp.',
    );
  }
  if (
    input.allocation.portfolioId !== input.snapshot.portfolio.id ||
    input.allocation.currency !== input.valuation.currency ||
    input.allocation.asOf !== input.valuation.asOf ||
    input.allocation.totalValuedValue !== input.valuation.totalValue
  ) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk allocation does not match the Portfolio snapshot or valuation.',
    );
  }
  validateAllocationCoverage(input.allocation, input.valuation);
}

/** Validates a descriptive risk artifact against already validated canonical inputs. */
export function validatePortfolioRiskAnalysis(
  input: PortfolioRiskAnalysisInput,
  analysis: PortfolioRiskAnalysis,
): void {
  validatePortfolioRiskAnalysisInput(input);
  assertNonEmpty(analysis.analysisId, 'Portfolio risk analysis ID');
  assertNonEmpty(analysis.portfolioId, 'Portfolio risk portfolio ID');
  assertIsoTimestamp(analysis.asOf, 'Portfolio risk analysis asOf');
  if (
    analysis.analysisId !== input.analysisId ||
    analysis.portfolioId !== input.snapshot.portfolio.id ||
    analysis.asOf !== input.asOf
  ) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk analysis identity does not match the canonical risk input.',
    );
  }
  validateCoverage(input, analysis.coverage);
  validateConcentrations(analysis.concentrationObservations);
  validateExposures(analysis.exposureObservations);
  validateUnavailableObservations(analysis.unavailableObservations, input.snapshot);
}

function validateAllocationCoverage(
  allocation: PortfolioAllocationAnalysis,
  valuation: PortfolioValuation,
): void {
  const coverage = allocation.coverage;
  if (
    coverage.totalPositionCount !== valuation.totalPositionCount ||
    coverage.valuedPositionCount !== valuation.valuedPositionCount ||
    coverage.unvaluedPositionCount !== valuation.unvaluedPositions.length
  ) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk allocation coverage does not match the valuation coverage.',
    );
  }
}

function validateCoverage(
  input: PortfolioRiskAnalysisInput,
  coverage: PortfolioRiskCoverage,
): void {
  validateAllocationCoverage(input.allocation, input.valuation);
  if (
    coverage.coverage.totalPositionCount !== input.valuation.totalPositionCount ||
    coverage.coverage.valuedPositionCount !== input.valuation.valuedPositionCount ||
    coverage.coverage.unvaluedPositionCount !== input.valuation.unvaluedPositions.length
  ) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk coverage does not match the valuation coverage.',
    );
  }

  const valued = new Set<PortfolioPositionIdentity>();
  for (const position of input.valuation.positions) valued.add(position.positionIdentity);
  assertUniqueIdentities(
    coverage.valuedPositionIdentities,
    'Portfolio risk valued position identity',
  );
  if (!sameIdentities(coverage.valuedPositionIdentities, valued)) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk valued positions do not match the valuation positions.',
    );
  }
  assertUnvaluedPositionsMatch(coverage.unvaluedPositions, input.valuation.unvaluedPositions);

  switch (coverage.state) {
    case PortfolioRiskDataState.Complete:
      if (coverage.unvaluedPositions.length !== 0) {
        throw new PortfolioRiskValidationError(
          'Complete Portfolio risk coverage cannot contain unvalued positions.',
        );
      }
      break;
    case PortfolioRiskDataState.Partial:
      if (
        coverage.valuedPositionIdentities.length === 0 ||
        coverage.unvaluedPositions.length === 0
      ) {
        throw new PortfolioRiskValidationError(
          'Partial Portfolio risk coverage requires valued and unvalued positions.',
        );
      }
      break;
    case PortfolioRiskDataState.Unavailable:
      if (coverage.valuedPositionIdentities.length !== 0) {
        throw new PortfolioRiskValidationError(
          'Unavailable Portfolio risk coverage cannot contain valued positions.',
        );
      }
      break;
    case PortfolioRiskDataState.InsufficientData:
      break;
  }
}

function validateConcentrations(
  observations: ReadonlyArray<PortfolioRiskConcentrationObservation>,
): void {
  const identities = new Set<string>();
  for (const observation of observations) {
    const allocation = observation.allocation;
    if (allocation.dimension !== PortfolioAllocationDimension.Asset) {
      throw new PortfolioRiskValidationError(
        'Portfolio risk concentration observations must reference asset allocation.',
      );
    }
    portfolioAssetIdentity(allocation.asset ?? missingAsset());
    assertAllocationIdentity(allocation, identities, 'Portfolio risk concentration observation');
    validateObservationRuleEvidence(observation);
  }
}

function validateExposures(observations: ReadonlyArray<PortfolioRiskExposureObservation>): void {
  const identities = new Set<string>();
  for (const observation of observations) {
    const allocation = observation.allocation;
    if (allocation.dimension === PortfolioAllocationDimension.Asset) {
      throw new PortfolioRiskValidationError(
        'Portfolio risk exposure observations cannot reference asset allocation.',
      );
    }
    assertAllocationIdentity(allocation, identities, 'Portfolio risk exposure observation');
    validateObservationRuleEvidence(observation);
    validateExposureDataQuality(observation);
  }
}

function validateExposureDataQuality(observation: PortfolioRiskExposureObservation): void {
  if (observation.coverageState !== undefined) {
    if (!Object.values(PortfolioRiskDataState).includes(observation.coverageState)) {
      throw new PortfolioRiskValidationError('Portfolio risk exposure coverage state is invalid.');
    }
  }
  if (observation.dataQualityReason === undefined) return;
  const expected = unclassifiedReason(observation.allocation.dimension);
  if (!observation.allocation.unclassified || expected !== observation.dataQualityReason) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk exposure data-quality reason does not match unclassified exposure provenance.',
    );
  }
}

function validateObservationRuleEvidence(
  observation: PortfolioRiskConcentrationObservation | PortfolioRiskExposureObservation,
): void {
  if (observation.level === undefined && observation.thresholdEvidence === undefined) return;
  if (observation.level === undefined || observation.thresholdEvidence === undefined) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk observation level and threshold evidence must be supplied together.',
    );
  }
  validateThresholds(observation.thresholdEvidence, 'observation');
  if (
    observation.level !== observation.thresholdEvidence.matchedLevel ||
    !Object.values(PortfolioRiskConcentrationLevel).includes(observation.level)
  ) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk observation level does not match its threshold evidence.',
    );
  }
  const expected = classify(observation.allocation.percentage, observation.thresholdEvidence);
  if (observation.level !== expected) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk observation level does not match the measured allocation percentage.',
    );
  }
}

function validateUnavailableObservations(
  observations: ReadonlyArray<PortfolioRiskUnavailableObservation>,
  snapshot: PortfolioSnapshot,
): void {
  const positions = new Map<PortfolioPositionIdentity, PortfolioAsset>();
  for (const position of snapshot.positions) {
    positions.set(portfolioPositionIdentity(position), position.asset);
  }
  const identities = new Set<string>();
  for (const observation of observations) {
    if (!Object.values(PortfolioRiskUnavailableReason).includes(observation.reason)) {
      throw new PortfolioRiskValidationError(
        'Portfolio risk unavailable observation reason is invalid.',
      );
    }
    if (observation.positionIdentity !== undefined) {
      assertNonEmpty(observation.positionIdentity, 'Portfolio risk unavailable position identity');
      const asset = positions.get(observation.positionIdentity);
      if (asset === undefined) {
        throw new PortfolioRiskValidationError(
          'Portfolio risk unavailable observation references an unknown position.',
        );
      }
      if (
        observation.asset !== undefined &&
        portfolioAssetIdentity(observation.asset) !== portfolioAssetIdentity(asset)
      ) {
        throw new PortfolioRiskValidationError(
          'Portfolio risk unavailable observation asset does not match the position asset.',
        );
      }
    }
    if (observation.asset !== undefined) portfolioAssetIdentity(observation.asset);
    assertOptionalNonEmpty(observation.networkId, 'Portfolio risk unavailable network ID');
    assertOptionalNonEmpty(observation.sourceId, 'Portfolio risk unavailable source ID');
    const identity = JSON.stringify([
      observation.reason,
      observation.positionIdentity ?? '',
      observation.asset === undefined ? '' : portfolioAssetIdentity(observation.asset),
      observation.networkId ?? '',
      observation.sourceId ?? '',
    ]);
    if (identities.has(identity)) {
      throw new PortfolioRiskValidationError(
        `Portfolio risk unavailable observation "${identity}" is duplicated.`,
      );
    }
    identities.add(identity);
  }
}

function assertUnvaluedPositionsMatch(
  supplied: ReadonlyArray<PortfolioUnvaluedPosition>,
  expected: ReadonlyArray<PortfolioUnvaluedPosition>,
): void {
  const expectedByIdentity = new Map(
    expected.map((position) => [position.positionIdentity, position]),
  );
  if (supplied.length !== expected.length) {
    throw new PortfolioRiskValidationError(
      'Portfolio risk unvalued positions do not match the valuation positions.',
    );
  }
  const suppliedIdentities = new Set<string>();
  for (const position of supplied) {
    if (suppliedIdentities.has(position.positionIdentity)) {
      throw new PortfolioRiskValidationError(
        `Portfolio risk unvalued position "${position.positionIdentity}" is duplicated.`,
      );
    }
    suppliedIdentities.add(position.positionIdentity);
    const match = expectedByIdentity.get(position.positionIdentity);
    if (match === undefined || unvaluedFingerprint(match) !== unvaluedFingerprint(position)) {
      throw new PortfolioRiskValidationError(
        'Portfolio risk unvalued positions do not match the valuation positions.',
      );
    }
  }
}

function assertAllocationIdentity(
  allocation: PortfolioAllocationItem,
  identities: Set<string>,
  label: string,
): void {
  assertNonEmpty(allocation.identity, `${label} identity`);
  const identity = `${allocation.dimension}:${allocation.identity}`;
  if (identities.has(identity)) {
    throw new PortfolioRiskValidationError(`${label} "${identity}" is duplicated.`);
  }
  identities.add(identity);
}

function assertUniqueIdentities(
  values: ReadonlyArray<PortfolioPositionIdentity>,
  label: string,
): void {
  const identities = new Set<string>();
  for (const value of values) {
    assertNonEmpty(value, label);
    if (identities.has(value)) {
      throw new PortfolioRiskValidationError(`${label} "${value}" is duplicated.`);
    }
    identities.add(value);
  }
}

function sameIdentities(
  values: ReadonlyArray<PortfolioPositionIdentity>,
  expected: Set<string>,
): boolean {
  return values.length === expected.size && values.every((value) => expected.has(value));
}

function unvaluedFingerprint(position: PortfolioUnvaluedPosition): string {
  return JSON.stringify([
    position.positionId,
    portfolioAssetIdentity(position.asset),
    position.quantity,
    position.positionObservedAt,
    position.reason,
  ]);
}

function riskCoverage(input: PortfolioRiskAnalysisInput): PortfolioRiskCoverage {
  const valuedPositionIdentities = input.valuation.positions
    .map((position) => position.positionIdentity)
    .sort();
  const totalIsPositive = comparePercentage(input.valuation.totalValue, '0') > 0;
  const state =
    input.valuation.positions.length === 0
      ? input.valuation.totalPositionCount === 0
        ? PortfolioRiskDataState.InsufficientData
        : PortfolioRiskDataState.Unavailable
      : !totalIsPositive
        ? PortfolioRiskDataState.InsufficientData
        : input.valuation.unvaluedPositions.length === 0
          ? PortfolioRiskDataState.Complete
          : PortfolioRiskDataState.Partial;
  return {
    state,
    coverage: cloneCoverage(input.allocation.coverage),
    valuedPositionIdentities,
    unvaluedPositions: input.valuation.unvaluedPositions.map(cloneUnvaluedPosition),
  };
}

function observation(
  allocation: PortfolioAllocationItem,
  thresholds: PortfolioRiskThresholdConfiguration,
): PortfolioRiskConcentrationObservation | PortfolioRiskExposureObservation {
  const threshold = thresholdsFor(allocation.dimension, thresholds);
  const level = classify(allocation.percentage, threshold);
  return {
    allocation: cloneAllocation(allocation),
    level,
    thresholdEvidence: { ...threshold, matchedLevel: level },
  };
}

function exposureObservation(
  allocation: PortfolioAllocationItem,
  thresholds: PortfolioRiskThresholdConfiguration,
  coverageState: PortfolioRiskDataState,
): PortfolioRiskExposureObservation {
  const base = observation(allocation, thresholds);
  return {
    ...base,
    coverageState,
    ...(unclassifiedReason(allocation.dimension) === undefined || !allocation.unclassified
      ? {}
      : { dataQualityReason: unclassifiedReason(allocation.dimension) }),
  };
}

function thresholdsFor(
  dimension: PortfolioAllocationDimension,
  thresholds: PortfolioRiskThresholdConfiguration,
): PortfolioRiskConcentrationThresholds {
  switch (dimension) {
    case PortfolioAllocationDimension.Asset:
      return thresholds.asset;
    case PortfolioAllocationDimension.Network:
      return thresholds.network;
    case PortfolioAllocationDimension.Source:
      return thresholds.source;
    case PortfolioAllocationDimension.Account:
      return thresholds.account;
  }
}

function classify(
  percentage: string,
  thresholds: PortfolioRiskConcentrationThresholds,
): PortfolioRiskConcentrationLevel {
  if (comparePercentage(percentage, thresholds.highPercentage) >= 0) {
    return PortfolioRiskConcentrationLevel.High;
  }
  if (comparePercentage(percentage, thresholds.moderatePercentage) >= 0) {
    return PortfolioRiskConcentrationLevel.Moderate;
  }
  return PortfolioRiskConcentrationLevel.None;
}

function validateThresholds(thresholds: PortfolioRiskConcentrationThresholds, label: string): void {
  if (thresholds === null || typeof thresholds !== 'object') {
    throw new PortfolioRiskValidationError(`Portfolio risk ${label} thresholds are required.`);
  }
  assertPercentage(thresholds.moderatePercentage, `Portfolio risk ${label} moderate threshold`);
  assertPercentage(thresholds.highPercentage, `Portfolio risk ${label} high threshold`);
  if (comparePercentage(thresholds.moderatePercentage, thresholds.highPercentage) >= 0) {
    throw new PortfolioRiskValidationError(
      `Portfolio risk ${label} moderate threshold must be lower than the high threshold.`,
    );
  }
}

function unclassifiedProvenance(
  allocation: PortfolioAllocationAnalysis,
): ReadonlyArray<PortfolioRiskUnavailableObservation> {
  const observations: PortfolioRiskUnavailableObservation[] = [];
  if (allocation.exposure.network.items.some((item) => item.unclassified)) {
    observations.push({ reason: PortfolioRiskUnavailableReason.MissingNetworkProvenance });
  }
  if (allocation.exposure.source.items.some((item) => item.unclassified)) {
    observations.push({ reason: PortfolioRiskUnavailableReason.MissingSourceProvenance });
  }
  if (allocation.exposure.account.items.some((item) => item.unclassified)) {
    observations.push({ reason: PortfolioRiskUnavailableReason.MissingAccountProvenance });
  }
  return observations;
}

function unclassifiedReason(
  dimension: PortfolioAllocationDimension,
): PortfolioRiskUnavailableReason | undefined {
  switch (dimension) {
    case PortfolioAllocationDimension.Network:
      return PortfolioRiskUnavailableReason.MissingNetworkProvenance;
    case PortfolioAllocationDimension.Source:
      return PortfolioRiskUnavailableReason.MissingSourceProvenance;
    case PortfolioAllocationDimension.Account:
      return PortfolioRiskUnavailableReason.MissingAccountProvenance;
    case PortfolioAllocationDimension.Asset:
      return undefined;
  }
}

function compareObservations(
  left: PortfolioRiskConcentrationObservation | PortfolioRiskExposureObservation,
  right: PortfolioRiskConcentrationObservation | PortfolioRiskExposureObservation,
): number {
  const level = severity(right.level) - severity(left.level);
  if (level !== 0) return level;
  const dimension = left.allocation.dimension.localeCompare(right.allocation.dimension);
  if (dimension !== 0) return dimension;
  const percentage = comparePercentage(right.allocation.percentage, left.allocation.percentage);
  if (percentage !== 0) return percentage;
  return left.allocation.identity.localeCompare(right.allocation.identity);
}

function compareUnavailableObservations(
  left: PortfolioRiskUnavailableObservation,
  right: PortfolioRiskUnavailableObservation,
): number {
  const reason = left.reason.localeCompare(right.reason);
  if (reason !== 0) return reason;
  const position = (left.positionIdentity ?? '').localeCompare(right.positionIdentity ?? '');
  if (position !== 0) return position;
  const asset = (left.asset === undefined ? '' : portfolioAssetIdentity(left.asset)).localeCompare(
    right.asset === undefined ? '' : portfolioAssetIdentity(right.asset),
  );
  if (asset !== 0) return asset;
  return (left.networkId ?? '').localeCompare(right.networkId ?? '');
}

function severity(level: PortfolioRiskConcentrationLevel | undefined): number {
  switch (level) {
    case PortfolioRiskConcentrationLevel.High:
      return 2;
    case PortfolioRiskConcentrationLevel.Moderate:
      return 1;
    default:
      return 0;
  }
}

function cloneCoverage(coverage: PortfolioCoverage): PortfolioCoverage {
  return {
    ...coverage,
    unvaluedReasons: coverage.unvaluedReasons.map((reason) => ({ ...reason })),
  };
}

function cloneUnvaluedPosition(position: PortfolioUnvaluedPosition): PortfolioUnvaluedPosition {
  return { ...position, asset: cloneAsset(position.asset) };
}

function cloneAllocation(allocation: PortfolioAllocationItem): PortfolioAllocationItem {
  return {
    ...allocation,
    positionIdentities: [...allocation.positionIdentities],
    ...(allocation.asset === undefined ? {} : { asset: cloneAsset(allocation.asset) }),
  };
}

function cloneAsset(asset: PortfolioAsset): PortfolioAsset {
  return { ...asset };
}

function missingAsset(): PortfolioAsset {
  throw new PortfolioRiskValidationError(
    'Portfolio risk concentration observation must preserve the allocated asset identity.',
  );
}

function assertIsoTimestamp(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new PortfolioRiskValidationError(`${label} must be a valid ISO timestamp.`);
  }
}

function assertPercentage(value: string, label: string): void {
  if (typeof value !== 'string') {
    throw new PortfolioRiskValidationError(`${label} must be a decimal percentage from 0 to 100.`);
  }
  assertNonEmpty(value, label);
  if (!/^\d+(?:\.\d+)?$/.test(value) || comparePercentage(value, '100') > 0) {
    throw new PortfolioRiskValidationError(`${label} must be a decimal percentage from 0 to 100.`);
  }
}

function comparePercentage(left: string, right: string): number {
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const scale = Math.max(leftParts[1]?.length ?? 0, rightParts[1]?.length ?? 0);
  const normalize = (value: string, parts: ReadonlyArray<string>): bigint =>
    BigInt(`${parts[0]}${(parts[1] ?? '').padEnd(scale, '0')}`);
  const leftValue = normalize(left, leftParts);
  const rightValue = normalize(right, rightParts);
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

function assertOptionalNonEmpty(value: string | undefined, label: string): void {
  if (value !== undefined) assertNonEmpty(value, label);
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new PortfolioRiskValidationError(`${label} is required.`);
}
