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
}

/** Descriptive network, source, or account exposure evidence from existing allocation data. */
export interface PortfolioRiskExposureObservation {
  readonly allocation: PortfolioAllocationItem;
}

/** Explicit record of unavailable evidence; no value, score, or recommendation is implied. */
export interface PortfolioRiskUnavailableObservation {
  readonly reason: PortfolioRiskUnavailableReason;
  readonly positionIdentity?: PortfolioPositionIdentity;
  readonly asset?: PortfolioAsset;
  readonly networkId?: PortfolioNetworkId;
  readonly sourceId?: PortfolioSourceId;
}

/** Immutable descriptive risk-domain artifact. It intentionally contains no score or classification. */
export interface PortfolioRiskAnalysis {
  readonly analysisId: PortfolioRiskAnalysisId;
  readonly portfolioId: string;
  readonly asOf: string;
  readonly coverage: PortfolioRiskCoverage;
  readonly concentrationObservations: ReadonlyArray<PortfolioRiskConcentrationObservation>;
  readonly exposureObservations: ReadonlyArray<PortfolioRiskExposureObservation>;
  readonly unavailableObservations: ReadonlyArray<PortfolioRiskUnavailableObservation>;
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
  if (identities.has(allocation.identity)) {
    throw new PortfolioRiskValidationError(`${label} "${allocation.identity}" is duplicated.`);
  }
  identities.add(allocation.identity);
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

function assertOptionalNonEmpty(value: string | undefined, label: string): void {
  if (value !== undefined) assertNonEmpty(value, label);
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new PortfolioRiskValidationError(`${label} is required.`);
}
