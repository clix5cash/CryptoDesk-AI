import type {
  IsoTimestamp,
  PortfolioAsset,
  PortfolioId,
  PortfolioPosition,
  PortfolioPositionIdentity,
  PortfolioPositionId,
  PortfolioQuantity,
  PortfolioSnapshot,
} from './contracts.js';
import { PortfolioValidationError } from './errors.js';
import { portfolioAssetIdentity, portfolioPositionIdentity } from './identity.js';
import { normalizePortfolioSnapshot } from './normalization.js';

/** Provider-neutral unit of account selected explicitly for a valuation. */
export type ValuationCurrency = string;

/** Opaque source identity retained only when a price source supplies it. */
export type PortfolioPriceSourceId = string;

/** Immutable, provider-neutral unit-price observation for one exact asset representation. */
export interface PortfolioPriceObservation {
  readonly asset: PortfolioAsset;
  /** Non-negative decimal text; no binary floating-point price is accepted. */
  readonly price: string;
  readonly currency: ValuationCurrency;
  readonly observedAt: IsoTimestamp;
  readonly sourceId?: PortfolioPriceSourceId;
  readonly sourceRecordId?: string;
}

/** Explicit provider-neutral query for price observations; it contains no vendor identifiers. */
export interface PortfolioPriceQuery {
  readonly assets: ReadonlyArray<PortfolioAsset>;
  readonly currency: ValuationCurrency;
  readonly asOf?: IsoTimestamp;
}

/** Read-only provider-neutral capability; concrete providers belong outside Portfolio. */
export interface PortfolioPriceProvider {
  getPrices(query: PortfolioPriceQuery): Promise<ReadonlyArray<PortfolioPriceObservation>>;
}

/** Explicit reason a portfolio position is retained but cannot be valued. */
export enum PortfolioUnvaluedPositionReason {
  MissingPrice = 'missing_price',
  MissingDecimals = 'missing_decimals',
}

/** Value of one position, preserving the authoritative price provenance. */
export interface PortfolioPositionValuation {
  readonly positionId: PortfolioPositionId;
  readonly positionIdentity: PortfolioPositionIdentity;
  readonly asset: PortfolioAsset;
  readonly quantity: PortfolioQuantity;
  readonly positionObservedAt: IsoTimestamp;
  readonly unitPrice: PortfolioPriceObservation;
  /** Exact decimal text in the requested valuation currency. */
  readonly value: string;
}

/** A position deliberately excluded from the total because required facts are absent. */
export interface PortfolioUnvaluedPosition {
  readonly positionId: PortfolioPositionId;
  readonly positionIdentity: PortfolioPositionIdentity;
  readonly asset: PortfolioAsset;
  readonly quantity: PortfolioQuantity;
  readonly positionObservedAt: IsoTimestamp;
  readonly reason: PortfolioUnvaluedPositionReason;
}

/** Immutable, partial-capable valuation result separate from analytical Portfolio state. */
export interface PortfolioValuation {
  readonly portfolioId: PortfolioId;
  readonly currency: ValuationCurrency;
  /** Explicit valuation cutoff; defaults to the Portfolio snapshot capturedAt. */
  readonly asOf: IsoTimestamp;
  readonly snapshotCapturedAt: IsoTimestamp;
  readonly totalValue: string;
  readonly totalPositionCount: number;
  readonly valuedPositionCount: number;
  readonly positions: ReadonlyArray<PortfolioPositionValuation>;
  readonly unvaluedPositions: ReadonlyArray<PortfolioUnvaluedPosition>;
}

/** Explicit valuation options with no clock, provider selection, or hidden defaults. */
export interface PortfolioValuationOptions {
  readonly currency: ValuationCurrency;
  readonly asOf?: IsoTimestamp;
}

/**
 * Deterministically values a normalized Portfolio snapshot from explicit price
 * observations. String quantities are raw base units and require asset decimals;
 * numeric legacy quantities are already unit quantities. Missing facts produce
 * unvalued positions rather than fabricated values.
 */
export function valuePortfolioSnapshot(
  snapshot: PortfolioSnapshot,
  prices: ReadonlyArray<PortfolioPriceObservation>,
  options: PortfolioValuationOptions,
): PortfolioValuation {
  assertCurrency(options.currency);
  const normalizedSnapshot = normalizePortfolioSnapshot(snapshot);
  const asOf = options.asOf ?? normalizedSnapshot.capturedAt;
  assertIsoTimestamp(asOf, 'Portfolio valuation asOf');
  const pricesByAssetIdentity = normalizePrices(
    prices,
    normalizedSnapshot.positions,
    options.currency,
    asOf,
  );

  const positions: PortfolioPositionValuation[] = [];
  const unvaluedPositions: PortfolioUnvaluedPosition[] = [];
  let total = decimal('0');

  for (const position of normalizedSnapshot.positions) {
    const price = pricesByAssetIdentity.get(portfolioAssetIdentity(position.asset));
    if (price === undefined) {
      unvaluedPositions.push(unvalued(position, PortfolioUnvaluedPositionReason.MissingPrice));
      continue;
    }
    if (typeof position.quantity === 'string' && position.asset.decimals === undefined) {
      unvaluedPositions.push(unvalued(position, PortfolioUnvaluedPositionReason.MissingDecimals));
      continue;
    }

    const value = positionValue(position, price.price);
    total = add(total, value);
    positions.push({
      positionId: position.id,
      positionIdentity: portfolioPositionIdentity(position),
      asset: cloneAsset(position.asset),
      quantity: position.quantity,
      positionObservedAt: position.observedAt,
      unitPrice: clonePrice(price),
      value: formatDecimal(value),
    });
  }

  const valuation: PortfolioValuation = {
    portfolioId: normalizedSnapshot.portfolio.id,
    currency: options.currency,
    asOf,
    snapshotCapturedAt: normalizedSnapshot.capturedAt,
    totalValue: formatDecimal(total),
    totalPositionCount: normalizedSnapshot.positions.length,
    valuedPositionCount: positions.length,
    positions: positions.sort(compareValuedPositions),
    unvaluedPositions: unvaluedPositions.sort(compareUnvaluedPositions),
  };
  validatePortfolioValuation(valuation);
  return valuation;
}

/** Validates a standalone provider-neutral price observation without fetching or converting it. */
export function validatePortfolioPriceObservation(observation: PortfolioPriceObservation): void {
  portfolioAssetIdentity(observation.asset);
  assertDecimal(observation.price, 'Portfolio price');
  assertCurrency(observation.currency);
  assertIsoTimestamp(observation.observedAt, 'Portfolio price observedAt');
  assertOptionalNonEmpty(observation.sourceId, 'Portfolio price source ID');
  assertOptionalNonEmpty(observation.sourceRecordId, 'Portfolio price source record ID');
}

/** Validates a structured valuation result without altering Portfolio analytical state. */
export function validatePortfolioValuation(valuation: PortfolioValuation): void {
  assertNonEmpty(valuation.portfolioId, 'Portfolio valuation portfolio ID');
  assertCurrency(valuation.currency);
  assertIsoTimestamp(valuation.asOf, 'Portfolio valuation asOf');
  assertIsoTimestamp(valuation.snapshotCapturedAt, 'Portfolio valuation snapshot capturedAt');
  assertDecimal(valuation.totalValue, 'Portfolio valuation total value');
  if (!Number.isInteger(valuation.totalPositionCount) || valuation.totalPositionCount < 0) {
    throw new PortfolioValidationError(
      'Portfolio valuation total position count must be a non-negative integer.',
    );
  }
  if (!Number.isInteger(valuation.valuedPositionCount) || valuation.valuedPositionCount < 0) {
    throw new PortfolioValidationError(
      'Portfolio valuation valued position count must be a non-negative integer.',
    );
  }
  if (valuation.valuedPositionCount !== valuation.positions.length) {
    throw new PortfolioValidationError(
      'Portfolio valuation valued position count does not match valued positions.',
    );
  }
  if (
    valuation.totalPositionCount !==
    valuation.positions.length + valuation.unvaluedPositions.length
  ) {
    throw new PortfolioValidationError(
      'Portfolio valuation total position count does not match position coverage.',
    );
  }

  const identities = new Set<string>();
  let valuedTotal = decimal('0');
  for (const position of valuation.positions) {
    validateValuedPosition(position, identities);
    valuedTotal = add(valuedTotal, decimal(position.value));
  }
  for (const position of valuation.unvaluedPositions) {
    assertPositionValuationIdentity(position.positionId, position.positionIdentity, identities);
    portfolioAssetIdentity(position.asset);
    assertPortfolioQuantity(position.quantity);
    assertIsoTimestamp(position.positionObservedAt, 'Portfolio unvalued position observedAt');
    if (!Object.values(PortfolioUnvaluedPositionReason).includes(position.reason)) {
      throw new PortfolioValidationError('Portfolio unvalued position reason is invalid.');
    }
  }
  if (formatDecimal(valuedTotal) !== formatDecimal(decimal(valuation.totalValue))) {
    throw new PortfolioValidationError(
      'Portfolio valuation total value does not match valued positions.',
    );
  }
}

interface Decimal {
  readonly digits: bigint;
  readonly scale: number;
}

function validateValuedPosition(
  position: PortfolioPositionValuation,
  identities: Set<string>,
): void {
  assertPositionValuationIdentity(position.positionId, position.positionIdentity, identities);
  portfolioAssetIdentity(position.asset);
  assertPortfolioQuantity(position.quantity);
  assertIsoTimestamp(position.positionObservedAt, 'Portfolio valued position observedAt');
  validatePortfolioPriceObservation(position.unitPrice);
  assertDecimal(position.value, 'Portfolio position valuation value');
}

function assertPositionValuationIdentity(
  positionId: PortfolioPositionId,
  identity: PortfolioPositionIdentity,
  identities: Set<string>,
): void {
  assertNonEmpty(positionId, 'Portfolio valuation position ID');
  assertNonEmpty(identity, 'Portfolio valuation position identity');
  if (identities.has(identity)) {
    throw new PortfolioValidationError(
      `Portfolio valuation position identity "${identity}" is duplicated.`,
    );
  }
  identities.add(identity);
}

function assertPortfolioQuantity(value: PortfolioQuantity): void {
  if (typeof value === 'string') {
    if (!/^\d+$/u.test(value)) {
      throw new PortfolioValidationError(
        'Portfolio valuation quantity text must contain only unsigned decimal base-unit digits.',
      );
    }
    return;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new PortfolioValidationError(
      'Portfolio valuation quantity must be a finite non-negative number.',
    );
  }
}

function normalizePrices(
  observations: ReadonlyArray<PortfolioPriceObservation>,
  positions: ReadonlyArray<PortfolioPosition>,
  currency: ValuationCurrency,
  asOf: IsoTimestamp,
): ReadonlyMap<string, PortfolioPriceObservation> {
  const positionAssets = new Map<string, string>();
  for (const position of positions) {
    positionAssets.set(position.asset.id, portfolioAssetIdentity(position.asset));
  }

  const byObservationIdentity = new Map<string, PortfolioPriceObservation>();
  for (const observation of observations) {
    validatePortfolioPriceObservation(observation);
    const assetIdentity = portfolioAssetIdentity(observation.asset);
    const expectedIdentity = positionAssets.get(observation.asset.id);
    if (expectedIdentity !== undefined && expectedIdentity !== assetIdentity) {
      throw new PortfolioValidationError(
        `Portfolio price asset ID "${observation.asset.id}" does not match the portfolio asset identity.`,
      );
    }
    const identity = JSON.stringify([
      assetIdentity,
      observation.currency,
      timestampMilliseconds(observation.observedAt),
    ]);
    const existing = byObservationIdentity.get(identity);
    if (existing !== undefined && priceFingerprint(existing) !== priceFingerprint(observation)) {
      throw new PortfolioValidationError(
        `Portfolio price observation "${identity}" has conflicting records.`,
      );
    }
    byObservationIdentity.set(
      identity,
      existing === undefined
        ? clonePrice(observation)
        : compareText(existing.observedAt, observation.observedAt) <= 0
          ? existing
          : clonePrice(observation),
    );
  }

  const selected = new Map<string, PortfolioPriceObservation>();
  for (const observation of byObservationIdentity.values()) {
    if (
      observation.currency !== currency ||
      timestampMilliseconds(observation.observedAt) > timestampMilliseconds(asOf)
    ) {
      continue;
    }
    const assetIdentity = portfolioAssetIdentity(observation.asset);
    const current = selected.get(assetIdentity);
    if (
      current === undefined ||
      timestampMilliseconds(current.observedAt) < timestampMilliseconds(observation.observedAt)
    ) {
      selected.set(assetIdentity, observation);
    }
  }
  return selected;
}

function positionValue(position: PortfolioPosition, price: string): Decimal {
  if (typeof position.quantity === 'string') {
    const rawQuantity = decimal(position.quantity);
    return multiply(
      { ...rawQuantity, scale: rawQuantity.scale + (position.asset.decimals ?? 0) },
      decimal(price),
    );
  }
  return multiply(decimal(numberToDecimalText(position.quantity)), decimal(price));
}

function unvalued(
  position: PortfolioPosition,
  reason: PortfolioUnvaluedPositionReason,
): PortfolioUnvaluedPosition {
  return {
    positionId: position.id,
    positionIdentity: portfolioPositionIdentity(position),
    asset: cloneAsset(position.asset),
    quantity: position.quantity,
    positionObservedAt: position.observedAt,
    reason,
  };
}

function decimal(value: string): Decimal {
  const [whole, fraction = ''] = value.split('.');
  const digits = BigInt(`${whole ?? '0'}${fraction}`);
  return normalizeDecimal({ digits, scale: fraction.length });
}

function multiply(left: Decimal, right: Decimal): Decimal {
  return normalizeDecimal({ digits: left.digits * right.digits, scale: left.scale + right.scale });
}

function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  const leftDigits = left.digits * 10n ** BigInt(scale - left.scale);
  const rightDigits = right.digits * 10n ** BigInt(scale - right.scale);
  return normalizeDecimal({ digits: leftDigits + rightDigits, scale });
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

function numberToDecimalText(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new PortfolioValidationError(
      'Portfolio position quantity must be a finite non-negative number.',
    );
  }
  const text = value.toString();
  if (!/[eE]/u.test(text)) return text;
  const [coefficient, exponentText] = text.toLowerCase().split('e');
  const exponent = Number(exponentText);
  const [whole = '0', fraction = ''] = coefficient?.split('.') ?? ['0', ''];
  const unscaled = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  if (decimalIndex <= 0) return `0.${'0'.repeat(-decimalIndex)}${unscaled}`;
  if (decimalIndex >= unscaled.length)
    return `${unscaled}${'0'.repeat(decimalIndex - unscaled.length)}`;
  return `${unscaled.slice(0, decimalIndex)}.${unscaled.slice(decimalIndex)}`;
}

function priceFingerprint(observation: PortfolioPriceObservation): string {
  return JSON.stringify([
    observation.price,
    observation.sourceId ?? '',
    observation.sourceRecordId ?? '',
  ]);
}

function clonePrice(observation: PortfolioPriceObservation): PortfolioPriceObservation {
  return { ...observation, asset: cloneAsset(observation.asset) };
}

function cloneAsset(asset: PortfolioAsset): PortfolioAsset {
  return { ...asset };
}

function compareValuedPositions(
  left: PortfolioPositionValuation,
  right: PortfolioPositionValuation,
): number {
  return (
    compareText(portfolioAssetIdentity(left.asset), portfolioAssetIdentity(right.asset)) ||
    compareText(left.positionIdentity, right.positionIdentity)
  );
}

function compareUnvaluedPositions(
  left: PortfolioUnvaluedPosition,
  right: PortfolioUnvaluedPosition,
): number {
  return (
    compareText(portfolioAssetIdentity(left.asset), portfolioAssetIdentity(right.asset)) ||
    compareText(left.positionIdentity, right.positionIdentity)
  );
}

function assertDecimal(value: string, label: string): void {
  if (!/^\d+(?:\.\d+)?$/u.test(value)) {
    throw new PortfolioValidationError(`${label} must be non-negative decimal text.`);
  }
}

function assertCurrency(value: ValuationCurrency): void {
  assertNonEmpty(value, 'Portfolio valuation currency');
}

function assertIsoTimestamp(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new PortfolioValidationError(`${label} must be a valid ISO timestamp.`);
  }
}

function timestampMilliseconds(value: IsoTimestamp): number {
  return Date.parse(value);
}

function assertOptionalNonEmpty(value: string | undefined, label: string): void {
  if (value !== undefined) assertNonEmpty(value, label);
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new PortfolioValidationError(`${label} is required.`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
