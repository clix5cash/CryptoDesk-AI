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
import type { PortfolioSnapshot } from './contracts.js';
import { portfolioAssetIdentity, portfolioPositionIdentity } from './identity.js';
import { normalizePortfolioSnapshot } from './normalization.js';

/** One normalized Portfolio snapshot supplied with explicit provider provenance. */
export type PortfolioProviderObservation = Omit<
  FederationObservation<PortfolioSnapshot>,
  'domain' | 'comparisonKey'
>;

export interface PortfolioFederationInput {
  readonly id: string;
  readonly generatedAt: string;
  readonly observations: ReadonlyArray<PortfolioProviderObservation>;
  readonly policy: FederationEligibilityPolicy;
}

/** Exact Portfolio-owned scope required before two snapshots may be compared. */
export interface PortfolioObservationIdentity {
  readonly portfolioId: string;
  readonly capturedAt: string;
  readonly sourceIds: ReadonlyArray<string>;
  readonly accountIdentities: ReadonlyArray<string>;
}

export interface PortfolioFactGroup {
  readonly observationIds: ReadonlyArray<string>;
}

/** Describes normalized snapshot facts; it never reconciles or promotes state. */
export interface PortfolioFederationComparison {
  readonly identity: PortfolioObservationIdentity;
  readonly agreement: FederationAgreement;
  readonly comparedObservationIds: ReadonlyArray<string>;
  readonly factGroups: ReadonlyArray<PortfolioFactGroup>;
}

export interface PortfolioFederationResult {
  readonly federation: FederationEnvelope<PortfolioSnapshot>;
  readonly comparisons: ReadonlyArray<PortfolioFederationComparison>;
  /** Deliberately absent: eligible observations are never canonical or selected. */
  readonly selectedObservationId?: never;
  readonly canonicalPortfolio?: never;
}

/**
 * Qualifies normalized Portfolio observations, retaining every source result.
 * Portfolio owns comparability; federation neither aggregates nor canonicalizes.
 */
export function createPortfolioFederation(
  input: PortfolioFederationInput,
): PortfolioFederationResult {
  validateInput(input);
  const observations = input.observations.map((observation) => {
    validateObservation(observation);
    return { ...observation, domain: FederationDomain.Portfolio };
  });
  const federation = createFederationEnvelope<PortfolioSnapshot>({
    id: input.id,
    domain: FederationDomain.Portfolio,
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

function validateInput(input: PortfolioFederationInput): void {
  const allowed = ['id', 'generatedAt', 'observations', 'policy'];
  if (
    !isPlainRecord(input) ||
    !allowed.every((key) => hasOwn(input, key)) ||
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    !Array.isArray(input.observations)
  ) {
    throw new PortfolioFederationValidationError();
  }
}

function validateObservation(observation: PortfolioProviderObservation): void {
  if (
    !isPlainRecord(observation) ||
    hasOwn(observation, 'domain') ||
    hasOwn(observation, 'comparisonKey')
  ) {
    throw new PortfolioFederationValidationError();
  }
  if (observation.payload === undefined) return;
  const snapshot = observation.payload;
  if (
    !isPlainRecord(snapshot) ||
    !hasExactKeys(snapshot, ['portfolio', 'capturedAt', 'positions']) ||
    observation.provenance.sourceId === undefined
  ) {
    throw new PortfolioFederationValidationError();
  }
  const normalized = safelyNormalize(snapshot);
  if (
    snapshotValue(snapshot) !== snapshotValue(normalized) ||
    !normalized.portfolio.sources.some(({ id }) => id === observation.provenance.sourceId)
  ) {
    throw new PortfolioFederationValidationError();
  }
}

function safelyNormalize(snapshot: PortfolioSnapshot): PortfolioSnapshot {
  try {
    return normalizePortfolioSnapshot(snapshot);
  } catch {
    throw new PortfolioFederationValidationError();
  }
}

function compareCompatibleObservations(
  observations: FederationEnvelope<PortfolioSnapshot>['observations'],
): PortfolioFederationComparison {
  const first = observations[0];
  if (!first?.payload) throw new PortfolioFederationValidationError();
  const identity = observationIdentity(first.payload);
  if (observations.length < 2) {
    return {
      identity,
      agreement: FederationAgreement.NotApplicable,
      comparedObservationIds: observations.map(({ id }) => id),
      factGroups: [],
    };
  }
  const groups = new Map<string, string[]>();
  for (const observation of observations) {
    if (!observation.payload) throw new PortfolioFederationValidationError();
    const key = factKey(observation.payload);
    groups.set(key, [...(groups.get(key) ?? []), observation.id]);
  }
  const factGroups = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, observationIds]) => ({ observationIds }));
  return {
    identity,
    agreement: factGroups.length === 1 ? FederationAgreement.Agree : FederationAgreement.Differ,
    comparedObservationIds: observations.map(({ id }) => id),
    factGroups,
  };
}

function observationIdentity(snapshot: PortfolioSnapshot): PortfolioObservationIdentity {
  return {
    portfolioId: snapshot.portfolio.id,
    capturedAt: snapshot.capturedAt,
    sourceIds: snapshot.portfolio.sources.map(({ id }) => id),
    accountIdentities: (snapshot.portfolio.accounts ?? []).map(({ sourceId, id }) =>
      JSON.stringify([sourceId, id]),
    ),
  };
}

function identityKey(value: PortfolioSnapshot | PortfolioObservationIdentity): string {
  const identity = 'portfolio' in value ? observationIdentity(value) : value;
  return JSON.stringify([
    identity.portfolioId,
    identity.capturedAt,
    identity.sourceIds,
    identity.accountIdentities,
  ]);
}

function factKey(snapshot: PortfolioSnapshot): string {
  return JSON.stringify(
    snapshot.positions.map((position) => [
      portfolioPositionIdentity(position),
      portfolioAssetIdentity(position.asset),
      position.quantity,
      position.kind ?? null,
      position.externalRecordId ?? null,
      position.observedAt,
    ]),
  );
}

function snapshotValue(snapshot: PortfolioSnapshot): string {
  return JSON.stringify(snapshot);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  return (
    Object.keys(value).length === expected.length && expected.every((key) => hasOwn(value, key))
  );
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

export class PortfolioFederationValidationError extends FederationValidationError {
  constructor() {
    super('Portfolio federation input is invalid.');
    this.name = 'PortfolioFederationValidationError';
  }
}
