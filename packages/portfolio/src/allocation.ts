import type {
  PortfolioAccountId,
  PortfolioAsset,
  PortfolioNetworkId,
  PortfolioPosition,
  PortfolioPositionIdentity,
  PortfolioSnapshot,
  PortfolioSourceId,
} from './contracts.js';
import { PortfolioValidationError } from './errors.js';
import { portfolioAssetIdentity, portfolioPositionIdentity } from './identity.js';
import { normalizePortfolioSnapshot } from './normalization.js';
import {
  type PortfolioPositionValuation,
  type PortfolioUnvaluedPosition,
  type PortfolioValuation,
  type PortfolioUnvaluedPositionReason,
  validatePortfolioValuation,
} from './valuation.js';

/** Descriptive grouping dimensions; none carry a risk or recommendation meaning. */
export enum PortfolioAllocationDimension {
  Asset = 'asset',
  Network = 'network',
  Source = 'source',
  Account = 'account',
}

/** Exact-valued contribution of one deterministic allocation or exposure target. */
export interface PortfolioAllocationItem {
  readonly dimension: PortfolioAllocationDimension;
  /** Stable grouping key, derived from an explicit target or the unclassified category. */
  readonly identity: string;
  readonly value: string;
  /** Percentage of total valued value, rounded half-up to four decimal places. */
  readonly percentage: string;
  readonly positionIdentities: ReadonlyArray<PortfolioPositionIdentity>;
  readonly asset?: PortfolioAsset;
  readonly networkId?: PortfolioNetworkId;
  readonly sourceId?: PortfolioSourceId;
  readonly accountId?: PortfolioAccountId;
  /** Explicitly denotes absent optional target provenance without inventing an ID. */
  readonly unclassified?: true;
}

/** One deterministic allocation/exposure breakdown over total valued value. */
export interface PortfolioAllocation {
  readonly dimension: PortfolioAllocationDimension;
  readonly totalValuedValue: string;
  readonly items: ReadonlyArray<PortfolioAllocationItem>;
}

/** Descriptive exposure breakdowns. They do not encode risk. */
export interface PortfolioExposure {
  readonly network: PortfolioAllocation;
  readonly source: PortfolioAllocation;
  readonly account: PortfolioAllocation;
}

/** Count of positions excluded from valued allocation for one explicit reason. */
export interface PortfolioUnvaluedCoverage {
  readonly reason: PortfolioUnvaluedPositionReason;
  readonly positionCount: number;
}

/** Coverage facts that keep partial valuation distinct from zero-valued holdings. */
export interface PortfolioCoverage {
  readonly totalPositionCount: number;
  readonly valuedPositionCount: number;
  readonly unvaluedPositionCount: number;
  /** Valued positions divided by all positions, rounded half-up to four decimal places. */
  readonly valuedPositionCoveragePercentage: string;
  readonly unvaluedReasons: ReadonlyArray<PortfolioUnvaluedCoverage>;
}

/** One valued position ordered by its descriptive contribution to valued total. */
export interface PortfolioLargestHolding {
  readonly positionIdentity: PortfolioPositionIdentity;
  readonly positionId: string;
  readonly asset: PortfolioAsset;
  readonly value: string;
  readonly percentage: string;
  readonly sourceId?: PortfolioSourceId;
  readonly accountId?: PortfolioAccountId;
}

/** Separate opt-in allocation and exposure analysis result. */
export interface PortfolioAllocationAnalysis {
  readonly portfolioId: string;
  readonly currency: string;
  readonly asOf: string;
  readonly totalValuedValue: string;
  readonly coverage: PortfolioCoverage;
  readonly assetAllocation: PortfolioAllocation;
  readonly exposure: PortfolioExposure;
  readonly largestHoldings: ReadonlyArray<PortfolioLargestHolding>;
}

/**
 * Analyzes only already-valued positions. It never fetches prices, estimates
 * unvalued values, classifies risk, or changes the snapshot or valuation.
 */
export function analyzePortfolioAllocation(
  snapshot: PortfolioSnapshot,
  valuation: PortfolioValuation,
): PortfolioAllocationAnalysis {
  const normalizedSnapshot = normalizePortfolioSnapshot(snapshot);
  validatePortfolioValuation(valuation);
  const positions = validateValuationConsistency(normalizedSnapshot, valuation);
  const total = decimal(valuation.totalValue);
  const hasPositiveTotal = total.digits > 0n;

  return {
    portfolioId: valuation.portfolioId,
    currency: valuation.currency,
    asOf: valuation.asOf,
    totalValuedValue: valuation.totalValue,
    coverage: coverage(valuation),
    assetAllocation: allocation(
      PortfolioAllocationDimension.Asset,
      positions,
      total,
      hasPositiveTotal,
    ),
    exposure: {
      network: allocation(PortfolioAllocationDimension.Network, positions, total, hasPositiveTotal),
      source: allocation(PortfolioAllocationDimension.Source, positions, total, hasPositiveTotal),
      account: allocation(PortfolioAllocationDimension.Account, positions, total, hasPositiveTotal),
    },
    largestHoldings: hasPositiveTotal ? largestHoldings(positions, total) : [],
  };
}

interface ValuedSnapshotPosition {
  readonly snapshot: PortfolioPosition;
  readonly valuation: PortfolioPositionValuation;
}

interface Group {
  readonly identity: string;
  readonly asset?: PortfolioAsset;
  readonly networkId?: PortfolioNetworkId;
  readonly sourceId?: PortfolioSourceId;
  readonly accountId?: PortfolioAccountId;
  readonly unclassified?: true;
  value: Decimal;
  readonly positionIdentities: Set<PortfolioPositionIdentity>;
}

interface Decimal {
  readonly digits: bigint;
  readonly scale: number;
}

function validateValuationConsistency(
  snapshot: PortfolioSnapshot,
  valuation: PortfolioValuation,
): ReadonlyArray<ValuedSnapshotPosition> {
  if (snapshot.portfolio.id !== valuation.portfolioId) {
    throw new PortfolioValidationError(
      'Portfolio valuation portfolio ID does not match the Portfolio snapshot.',
    );
  }
  if (snapshot.capturedAt !== valuation.snapshotCapturedAt) {
    throw new PortfolioValidationError(
      'Portfolio valuation snapshot capturedAt does not match the Portfolio snapshot.',
    );
  }

  const snapshotPositions = new Map<PortfolioPositionIdentity, PortfolioPosition>();
  for (const position of snapshot.positions) {
    snapshotPositions.set(portfolioPositionIdentity(position), position);
  }
  const seen = new Set<PortfolioPositionIdentity>();
  const valued: ValuedSnapshotPosition[] = [];
  for (const item of valuation.positions) {
    const position = validateValuationPosition(item, snapshotPositions, seen, valuation.currency);
    valued.push({ snapshot: position, valuation: item });
  }
  for (const item of valuation.unvaluedPositions) {
    validateUnvaluedPosition(item, snapshotPositions, seen);
  }
  if (seen.size !== snapshot.positions.length) {
    throw new PortfolioValidationError(
      'Portfolio valuation does not cover every Portfolio snapshot position.',
    );
  }
  return valued;
}

function validateValuationPosition(
  item: PortfolioPositionValuation,
  snapshotPositions: ReadonlyMap<PortfolioPositionIdentity, PortfolioPosition>,
  seen: Set<PortfolioPositionIdentity>,
  currency: string,
): PortfolioPosition {
  const position = snapshotPositions.get(item.positionIdentity);
  if (position === undefined || seen.has(item.positionIdentity)) {
    throw new PortfolioValidationError(
      'Portfolio valuation references an unknown or duplicate position.',
    );
  }
  if (
    position.id !== item.positionId ||
    portfolioAssetIdentity(position.asset) !== portfolioAssetIdentity(item.asset) ||
    portfolioAssetIdentity(position.asset) !== portfolioAssetIdentity(item.unitPrice.asset) ||
    position.quantity !== item.quantity ||
    position.observedAt !== item.positionObservedAt ||
    item.unitPrice.currency !== currency
  ) {
    throw new PortfolioValidationError(
      'Portfolio valuation position does not match the Portfolio snapshot.',
    );
  }
  seen.add(item.positionIdentity);
  return position;
}

function validateUnvaluedPosition(
  item: PortfolioUnvaluedPosition,
  snapshotPositions: ReadonlyMap<PortfolioPositionIdentity, PortfolioPosition>,
  seen: Set<PortfolioPositionIdentity>,
): void {
  const position = snapshotPositions.get(item.positionIdentity);
  if (position === undefined || seen.has(item.positionIdentity)) {
    throw new PortfolioValidationError(
      'Portfolio valuation references an unknown or duplicate position.',
    );
  }
  if (
    position.id !== item.positionId ||
    portfolioAssetIdentity(position.asset) !== portfolioAssetIdentity(item.asset) ||
    position.quantity !== item.quantity ||
    position.observedAt !== item.positionObservedAt
  ) {
    throw new PortfolioValidationError(
      'Portfolio unvalued position does not match the Portfolio snapshot.',
    );
  }
  seen.add(item.positionIdentity);
}

function allocation(
  dimension: PortfolioAllocationDimension,
  positions: ReadonlyArray<ValuedSnapshotPosition>,
  total: Decimal,
  hasPositiveTotal: boolean,
): PortfolioAllocation {
  if (!hasPositiveTotal) return { dimension, totalValuedValue: formatDecimal(total), items: [] };

  const groups = new Map<string, Group>();
  for (const position of positions) {
    const target = groupTarget(dimension, position.snapshot);
    const existing = groups.get(target.identity);
    const value = decimal(position.valuation.value);
    if (existing === undefined) {
      groups.set(target.identity, {
        ...target,
        value,
        positionIdentities: new Set([position.valuation.positionIdentity]),
      });
    } else {
      existing.value = add(existing.value, value);
      existing.positionIdentities.add(position.valuation.positionIdentity);
    }
  }

  return {
    dimension,
    totalValuedValue: formatDecimal(total),
    items: Array.from(groups.values())
      .map((group) => ({
        dimension,
        identity: group.identity,
        value: formatDecimal(group.value),
        percentage: percentage(group.value, total),
        positionIdentities: Array.from(group.positionIdentities).sort(compareText),
        ...(group.asset === undefined ? {} : { asset: cloneAsset(group.asset) }),
        ...(group.networkId === undefined ? {} : { networkId: group.networkId }),
        ...(group.sourceId === undefined ? {} : { sourceId: group.sourceId }),
        ...(group.accountId === undefined ? {} : { accountId: group.accountId }),
        ...(group.unclassified === undefined ? {} : { unclassified: true as const }),
      }))
      .sort(compareAllocationItems),
  };
}

function groupTarget(
  dimension: PortfolioAllocationDimension,
  position: PortfolioPosition,
): Omit<Group, 'value' | 'positionIdentities'> {
  switch (dimension) {
    case PortfolioAllocationDimension.Asset:
      return { identity: portfolioAssetIdentity(position.asset), asset: position.asset };
    case PortfolioAllocationDimension.Network:
      return position.asset.networkId === undefined
        ? { identity: 'unclassified', unclassified: true }
        : { identity: position.asset.networkId, networkId: position.asset.networkId };
    case PortfolioAllocationDimension.Source:
      return position.sourceId === undefined
        ? { identity: 'unclassified', unclassified: true }
        : { identity: position.sourceId, sourceId: position.sourceId };
    case PortfolioAllocationDimension.Account:
      return position.accountId === undefined
        ? { identity: 'unclassified', unclassified: true }
        : { identity: position.accountId, accountId: position.accountId };
  }
}

function largestHoldings(
  positions: ReadonlyArray<ValuedSnapshotPosition>,
  total: Decimal,
): ReadonlyArray<PortfolioLargestHolding> {
  return positions
    .map(({ snapshot, valuation }) => ({
      positionIdentity: valuation.positionIdentity,
      positionId: valuation.positionId,
      asset: cloneAsset(valuation.asset),
      value: valuation.value,
      percentage: percentage(decimal(valuation.value), total),
      ...(snapshot.sourceId === undefined ? {} : { sourceId: snapshot.sourceId }),
      ...(snapshot.accountId === undefined ? {} : { accountId: snapshot.accountId }),
    }))
    .sort((left, right) => {
      const valueComparison = compareDecimal(decimal(right.value), decimal(left.value));
      return (
        valueComparison ||
        compareText(portfolioAssetIdentity(left.asset), portfolioAssetIdentity(right.asset)) ||
        compareText(left.positionIdentity, right.positionIdentity)
      );
    });
}

function coverage(valuation: PortfolioValuation): PortfolioCoverage {
  const counts = new Map<PortfolioUnvaluedPositionReason, number>();
  for (const position of valuation.unvaluedPositions) {
    counts.set(position.reason, (counts.get(position.reason) ?? 0) + 1);
  }
  return {
    totalPositionCount: valuation.totalPositionCount,
    valuedPositionCount: valuation.valuedPositionCount,
    unvaluedPositionCount: valuation.unvaluedPositions.length,
    valuedPositionCoveragePercentage: integerPercentage(
      valuation.valuedPositionCount,
      valuation.totalPositionCount,
    ),
    unvaluedReasons: Array.from(counts.entries())
      .map(([reason, positionCount]) => ({ reason, positionCount }))
      .sort((left, right) => compareText(left.reason, right.reason)),
  };
}

function percentage(value: Decimal, total: Decimal): string {
  return scaledPercentage(value.digits, value.scale, total.digits, total.scale);
}

function integerPercentage(value: number, total: number): string {
  if (total === 0) return '0';
  return scaledPercentage(BigInt(value), 0, BigInt(total), 0);
}

/** Four decimal places, rounded half-up, then rendered without trailing zeroes. */
function scaledPercentage(
  valueDigits: bigint,
  valueScale: number,
  totalDigits: bigint,
  totalScale: number,
): string {
  if (totalDigits === 0n) return '0';
  const displayScale = 4;
  const numerator = valueDigits * 10n ** BigInt(totalScale + 2 + displayScale);
  const denominator = totalDigits * 10n ** BigInt(valueScale);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return formatDecimal({ digits: rounded, scale: displayScale });
}

function decimal(value: string): Decimal {
  const [whole = '0', fraction = ''] = value.split('.');
  return normalizeDecimal({ digits: BigInt(`${whole}${fraction}`), scale: fraction.length });
}

function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return normalizeDecimal({
    digits:
      left.digits * 10n ** BigInt(scale - left.scale) +
      right.digits * 10n ** BigInt(scale - right.scale),
    scale,
  });
}

function compareDecimal(left: Decimal, right: Decimal): number {
  const scale = Math.max(left.scale, right.scale);
  const leftDigits = left.digits * 10n ** BigInt(scale - left.scale);
  const rightDigits = right.digits * 10n ** BigInt(scale - right.scale);
  return leftDigits < rightDigits ? -1 : leftDigits > rightDigits ? 1 : 0;
}

function normalizeDecimal(value: Decimal): Decimal {
  if (value.digits === 0n) return { digits: 0n, scale: 0 };
  let { digits, scale } = value;
  while (scale > 0 && digits % 10n === 0n) {
    digits /= 10n;
    scale -= 1;
  }
  return { digits, scale };
}

function formatDecimal(value: Decimal): string {
  const normalized = normalizeDecimal(value);
  const digits = normalized.digits.toString();
  if (normalized.scale === 0) return digits;
  const padded = digits.padStart(normalized.scale + 1, '0');
  return `${padded.slice(0, -normalized.scale)}.${padded.slice(-normalized.scale)}`;
}

function compareAllocationItems(
  left: PortfolioAllocationItem,
  right: PortfolioAllocationItem,
): number {
  return compareText(left.identity, right.identity);
}

function cloneAsset(asset: PortfolioAsset): PortfolioAsset {
  return { ...asset };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
