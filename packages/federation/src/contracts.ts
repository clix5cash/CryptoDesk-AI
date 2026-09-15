export type FederationId = string;
export type FederationProviderId = string;
export type FederationObservationId = string;
export type FederationSourceId = string;

export enum FederationDomain {
  Market = 'market',
  News = 'news',
  Portfolio = 'portfolio',
  Context = 'context',
}

export enum FederationAvailability {
  Available = 'available',
  Unavailable = 'unavailable',
  Invalid = 'invalid',
  Unknown = 'unknown',
}

export enum FederationFreshness {
  Current = 'current',
  Stale = 'stale',
  Unknown = 'unknown',
  Unavailable = 'unavailable',
}

export enum FederationEligibility {
  Eligible = 'eligible',
  Ineligible = 'ineligible',
  Unavailable = 'unavailable',
}

export enum FederationExclusionReason {
  ProviderUnavailable = 'provider_unavailable',
  ProviderResultInvalid = 'provider_result_invalid',
  ProviderAvailabilityUnknown = 'provider_availability_unknown',
  ObservationStale = 'observation_stale',
  FreshnessUnknown = 'freshness_unknown',
}

export enum FederationAgreement {
  Agree = 'agree',
  Differ = 'differ',
  Unknown = 'unknown',
  NotApplicable = 'not_applicable',
}

export enum FederationStatus {
  Available = 'available',
  Partial = 'partial',
  Unavailable = 'unavailable',
}

/** Descriptive identity only; registration never implies trust or preference. */
export interface FederationProviderIdentity {
  readonly id: FederationProviderId;
  readonly label?: string;
}

/** Provider-neutral provenance retained through normalization and federation. */
export interface FederationProvenance {
  readonly providerId: FederationProviderId;
  readonly normalizationBoundary: string;
  readonly observedAt?: string;
  readonly sourceId?: FederationSourceId;
  readonly sourceReference?: string;
}

/** One immutable normalized provider result or explicit provider failure record. */
export interface FederationObservation<TPayload = unknown> {
  readonly id: FederationObservationId;
  readonly domain: FederationDomain;
  readonly provider: FederationProviderIdentity;
  readonly receivedAt: string;
  readonly availability: FederationAvailability;
  readonly provenance: FederationProvenance;
  readonly payload?: TPayload;
  /** Optional domain-owned equality key. Federation never derives it from payload values. */
  readonly comparisonKey?: string;
}

/** Every time-sensitive decision is caller-supplied and deterministic. */
export interface FederationEligibilityPolicy {
  readonly referenceTime: string;
  readonly maximumAgeMilliseconds: number;
  readonly allowStale: boolean;
  readonly allowUnknownFreshness: boolean;
}

export interface FederatedObservation<TPayload = unknown> extends FederationObservation<TPayload> {
  readonly freshness: FederationFreshness;
  readonly eligibility: FederationEligibility;
  readonly exclusionReason?: FederationExclusionReason;
}

export interface FederationAgreementGroup {
  readonly comparisonKey: string;
  readonly observationIds: ReadonlyArray<FederationObservationId>;
}

/** Describes comparison only. It never selects, ranks, averages, or canonicalizes. */
export interface FederationComparison {
  readonly agreement: FederationAgreement;
  readonly comparedObservationIds: ReadonlyArray<FederationObservationId>;
  readonly groups: ReadonlyArray<FederationAgreementGroup>;
}

export interface FederationEnvelopeInput<TPayload = unknown> {
  readonly id: FederationId;
  readonly domain: FederationDomain;
  readonly generatedAt: string;
  readonly observations: ReadonlyArray<FederationObservation<TPayload>>;
  readonly policy: FederationEligibilityPolicy;
}

/** Provider-neutral organization of all supplied observations, including failures. */
export interface FederationEnvelope<TPayload = unknown> {
  readonly id: FederationId;
  readonly domain: FederationDomain;
  readonly generatedAt: string;
  readonly status: FederationStatus;
  readonly policy: FederationEligibilityPolicy;
  readonly observations: ReadonlyArray<FederatedObservation<TPayload>>;
  readonly comparison: FederationComparison;
  /** Deliberately empty: selection remains an explicit later domain-owned decision. */
  readonly selectedObservationId?: never;
}

export class FederationValidationError extends Error {
  constructor(message = 'Federation input is invalid.') {
    super(message);
    this.name = 'FederationValidationError';
  }
}
