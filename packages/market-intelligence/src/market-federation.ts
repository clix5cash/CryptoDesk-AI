import {
  FederationAgreement,
  FederationDomain,
  FederationEligibility,
  FederationValidationError,
  createFederationEnvelope,
  type FederationEligibilityPolicy,
  type FederationEnvelope,
  type FederationObservation,
} from '@cryptodesk-ai/federation';
import { Timeframe } from './models.js';
import type { MarketSnapshot } from './snapshot.js';

/** A normalized Market snapshot supplied with provider identity and provenance. */
export type MarketProviderObservation = Omit<
  FederationObservation<MarketSnapshot>,
  'domain' | 'comparisonKey'
>;

export interface MarketFederationInput {
  readonly id: string;
  readonly generatedAt: string;
  readonly observations: ReadonlyArray<MarketProviderObservation>;
  readonly policy: FederationEligibilityPolicy;
}

export interface MarketObservationIdentity {
  readonly marketId: string;
  readonly baseAssetId: string;
  readonly quoteAssetId: string;
  readonly timeframe: Timeframe;
  readonly capturedAt: string;
}

export interface MarketValueGroup {
  readonly observationIds: ReadonlyArray<string>;
}

/** Market-owned exact comparison; it describes values and never selects a provider. */
export interface MarketFederationComparison {
  readonly identity: MarketObservationIdentity;
  readonly agreement: FederationAgreement;
  readonly comparedObservationIds: ReadonlyArray<string>;
  readonly valueGroups: ReadonlyArray<MarketValueGroup>;
}

export interface MarketFederationResult {
  readonly federation: FederationEnvelope<MarketSnapshot>;
  readonly comparisons: ReadonlyArray<MarketFederationComparison>;
  /** Deliberately absent: eligibility never implies selection. */
  readonly selectedObservationId?: never;
}

/**
 * Qualifies normalized Market snapshots using generic federation mechanics,
 * then compares only snapshots whose Market identity is exactly compatible.
 */
export function createMarketFederation(input: MarketFederationInput): MarketFederationResult {
  validateMarketInput(input);
  const observations = input.observations.map((observation) => {
    validateMarketObservation(observation);
    return { ...observation, domain: FederationDomain.Market };
  });
  const federation = createFederationEnvelope<MarketSnapshot>({
    id: input.id,
    domain: FederationDomain.Market,
    generatedAt: input.generatedAt,
    observations,
    policy: input.policy,
  });
  const groups = new Map<string, typeof federation.observations>();

  for (const observation of federation.observations) {
    if (
      observation.eligibility !== FederationEligibility.Eligible ||
      observation.payload === undefined
    ) {
      continue;
    }
    const key = identityKey(observation.payload);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }

  const comparisons = [...groups.values()]
    .map(compareCompatibleObservations)
    .sort((left, right) => identityKey(left.identity).localeCompare(identityKey(right.identity)));

  return deepFreeze({ federation, comparisons });
}

function validateMarketInput(input: MarketFederationInput): void {
  if (
    !isPlainRecord(input) ||
    !['id', 'generatedAt', 'observations', 'policy'].every((key) =>
      Object.prototype.hasOwnProperty.call(input, key),
    ) ||
    Object.keys(input).some(
      (key) => !['id', 'generatedAt', 'observations', 'policy'].includes(key),
    ) ||
    !Array.isArray(input.observations)
  ) {
    throw new MarketFederationValidationError();
  }
}

function compareCompatibleObservations(
  observations: FederationEnvelope<MarketSnapshot>['observations'],
): MarketFederationComparison {
  const first = observations[0];
  if (!first?.payload) throw new MarketFederationValidationError();
  const identity = marketIdentity(first.payload);
  if (observations.length < 2) {
    return {
      identity,
      agreement: FederationAgreement.NotApplicable,
      comparedObservationIds: observations.map(({ id }) => id),
      valueGroups: [],
    };
  }

  const groups = new Map<string, string[]>();
  for (const observation of observations) {
    if (!observation.payload) throw new MarketFederationValidationError();
    const key = valueKey(observation.payload);
    groups.set(key, [...(groups.get(key) ?? []), observation.id]);
  }
  const valueGroups = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, observationIds]) => ({ observationIds }));
  return {
    identity,
    agreement: valueGroups.length === 1 ? FederationAgreement.Agree : FederationAgreement.Differ,
    comparedObservationIds: observations.map(({ id }) => id),
    valueGroups,
  };
}

function validateMarketObservation(observation: MarketProviderObservation): void {
  if (
    !isPlainRecord(observation) ||
    Object.prototype.hasOwnProperty.call(observation, 'domain') ||
    Object.prototype.hasOwnProperty.call(observation, 'comparisonKey')
  ) {
    throw new MarketFederationValidationError();
  }
  if (observation.payload === undefined) return;
  const snapshot = observation.payload;
  if (
    !isPlainRecord(snapshot) ||
    !hasOnlySnapshotKeys(snapshot) ||
    !isIdentifier(snapshot.marketId) ||
    !isIdentifier(snapshot.baseAssetId) ||
    !isIdentifier(snapshot.quoteAssetId) ||
    !Object.values(Timeframe).includes(snapshot.timeframe) ||
    !isTimestamp(snapshot.capturedAt) ||
    !isFiniteNumber(snapshot.lastPrice) ||
    !isFiniteNumber(snapshot.high) ||
    !isFiniteNumber(snapshot.low) ||
    !isFiniteNumber(snapshot.volume) ||
    (snapshot.priceChangePercent !== undefined && !isFiniteNumber(snapshot.priceChangePercent)) ||
    (snapshot.liquidity !== undefined && !isFiniteNumber(snapshot.liquidity)) ||
    observation.provenance.observedAt !== snapshot.capturedAt
  ) {
    throw new MarketFederationValidationError();
  }
}

function hasOnlySnapshotKeys(snapshot: Record<string, unknown>): boolean {
  const required = [
    'marketId',
    'baseAssetId',
    'quoteAssetId',
    'timeframe',
    'capturedAt',
    'lastPrice',
    'high',
    'low',
    'volume',
  ];
  const allowed = [...required, 'priceChangePercent', 'liquidity'];
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(snapshot, key)) &&
    Object.keys(snapshot).every((key) => allowed.includes(key))
  );
}

function marketIdentity(snapshot: MarketSnapshot): MarketObservationIdentity {
  return {
    marketId: snapshot.marketId,
    baseAssetId: snapshot.baseAssetId,
    quoteAssetId: snapshot.quoteAssetId,
    timeframe: snapshot.timeframe,
    capturedAt: snapshot.capturedAt,
  };
}

function identityKey(identity: MarketObservationIdentity): string {
  return JSON.stringify([
    identity.marketId,
    identity.baseAssetId,
    identity.quoteAssetId,
    identity.timeframe,
    identity.capturedAt,
  ]);
}

function valueKey(snapshot: MarketSnapshot): string {
  return JSON.stringify([
    snapshot.lastPrice,
    snapshot.high,
    snapshot.low,
    snapshot.volume,
    snapshot.priceChangePercent ?? null,
    snapshot.liquidity ?? null,
  ]);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

export class MarketFederationValidationError extends FederationValidationError {
  constructor() {
    super('Market federation input is invalid.');
    this.name = 'MarketFederationValidationError';
  }
}
