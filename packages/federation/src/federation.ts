import {
  FederationAgreement,
  FederationAvailability,
  FederationDomain,
  FederationEligibility,
  FederationExclusionReason,
  FederationFreshness,
  FederationStatus,
  FederationValidationError,
  type FederatedObservation,
  type FederationAgreementGroup,
  type FederationComparison,
  type FederationEligibilityPolicy,
  type FederationEnvelope,
  type FederationEnvelopeInput,
  type FederationObservation,
} from './contracts.js';

/**
 * Qualifies and groups normalized observations without provider selection,
 * aggregation, fallback, retry, ranking, or canonicalization.
 */
export function createFederationEnvelope<TPayload>(
  input: FederationEnvelopeInput<TPayload>,
): FederationEnvelope<TPayload> {
  validateInput(input);
  const observations = input.observations
    .map((observation) => qualifyObservation(observation, input.policy))
    .sort(compareObservations);
  const eligibleCount = observations.filter(
    (observation) => observation.eligibility === FederationEligibility.Eligible,
  ).length;
  const result: FederationEnvelope<TPayload> = {
    id: input.id,
    domain: input.domain,
    generatedAt: input.generatedAt,
    status:
      eligibleCount === 0
        ? FederationStatus.Unavailable
        : eligibleCount === observations.length
          ? FederationStatus.Available
          : FederationStatus.Partial,
    policy: clone(input.policy),
    observations,
    comparison: compareEligible(observations),
  };
  return deepFreeze(result);
}

function qualifyObservation<TPayload>(
  observation: FederationObservation<TPayload>,
  policy: FederationEligibilityPolicy,
): FederatedObservation<TPayload> {
  const base = clone(observation);
  if (observation.availability === FederationAvailability.Unavailable) {
    return {
      ...base,
      freshness: FederationFreshness.Unavailable,
      eligibility: FederationEligibility.Unavailable,
      exclusionReason: FederationExclusionReason.ProviderUnavailable,
    };
  }
  if (observation.availability === FederationAvailability.Invalid) {
    return {
      ...base,
      freshness: FederationFreshness.Unknown,
      eligibility: FederationEligibility.Ineligible,
      exclusionReason: FederationExclusionReason.ProviderResultInvalid,
    };
  }
  if (observation.availability === FederationAvailability.Unknown) {
    return {
      ...base,
      freshness: FederationFreshness.Unknown,
      eligibility: FederationEligibility.Ineligible,
      exclusionReason: FederationExclusionReason.ProviderAvailabilityUnknown,
    };
  }

  const observedAt = observation.provenance.observedAt;
  if (observedAt === undefined) {
    return policy.allowUnknownFreshness
      ? {
          ...base,
          freshness: FederationFreshness.Unknown,
          eligibility: FederationEligibility.Eligible,
        }
      : {
          ...base,
          freshness: FederationFreshness.Unknown,
          eligibility: FederationEligibility.Ineligible,
          exclusionReason: FederationExclusionReason.FreshnessUnknown,
        };
  }
  const age = timestamp(policy.referenceTime) - timestamp(observedAt);
  if (age > policy.maximumAgeMilliseconds) {
    return policy.allowStale
      ? {
          ...base,
          freshness: FederationFreshness.Stale,
          eligibility: FederationEligibility.Eligible,
        }
      : {
          ...base,
          freshness: FederationFreshness.Stale,
          eligibility: FederationEligibility.Ineligible,
          exclusionReason: FederationExclusionReason.ObservationStale,
        };
  }
  return {
    ...base,
    freshness: FederationFreshness.Current,
    eligibility: FederationEligibility.Eligible,
  };
}

function compareEligible<TPayload>(
  observations: ReadonlyArray<FederatedObservation<TPayload>>,
): FederationComparison {
  const eligible = observations.filter(
    (observation) => observation.eligibility === FederationEligibility.Eligible,
  );
  if (eligible.length < 2) {
    return {
      agreement: FederationAgreement.NotApplicable,
      comparedObservationIds: eligible.map((observation) => observation.id),
      groups: [],
    };
  }
  if (eligible.some((observation) => observation.comparisonKey === undefined)) {
    return {
      agreement: FederationAgreement.Unknown,
      comparedObservationIds: eligible.map((observation) => observation.id),
      groups: [],
    };
  }
  const grouped = new Map<string, string[]>();
  for (const observation of eligible) {
    const key = observation.comparisonKey!;
    const ids = grouped.get(key) ?? [];
    ids.push(observation.id);
    grouped.set(key, ids);
  }
  const groups: FederationAgreementGroup[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([comparisonKey, observationIds]) => ({ comparisonKey, observationIds }));
  return {
    agreement: groups.length === 1 ? FederationAgreement.Agree : FederationAgreement.Differ,
    comparedObservationIds: eligible.map((observation) => observation.id),
    groups,
  };
}

function validateInput<TPayload>(input: FederationEnvelopeInput<TPayload>): void {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, ['id', 'domain', 'generatedAt', 'observations', 'policy'])
  ) {
    throw new FederationValidationError();
  }
  assertIdentifier(input.id);
  assertEnum(input.domain, FederationDomain);
  assertTimestamp(input.generatedAt);
  validatePolicy(input.policy);
  if (!Array.isArray(input.observations)) throw new FederationValidationError();
  const ids = new Set<string>();
  for (const observation of input.observations) {
    validateObservation(observation, input.domain, input.policy.referenceTime);
    if (ids.has(observation.id)) throw new FederationValidationError();
    ids.add(observation.id);
  }
}

function validateObservation<TPayload>(
  observation: FederationObservation<TPayload>,
  domain: FederationDomain,
  referenceTime: string,
): void {
  if (
    !isPlainRecord(observation) ||
    !hasAllowedKeys(observation, [
      'id',
      'domain',
      'provider',
      'receivedAt',
      'availability',
      'provenance',
      'payload',
      'comparisonKey',
    ]) ||
    !hasOwn(observation, 'id') ||
    !hasOwn(observation, 'domain') ||
    !hasOwn(observation, 'provider') ||
    !hasOwn(observation, 'receivedAt') ||
    !hasOwn(observation, 'availability') ||
    !hasOwn(observation, 'provenance')
  )
    throw new FederationValidationError();
  assertIdentifier(observation.id);
  if (observation.domain !== domain) throw new FederationValidationError();
  assertEnum(observation.availability, FederationAvailability);
  assertTimestamp(observation.receivedAt);
  validateProvider(observation.provider);
  validateProvenance(
    observation.provenance,
    observation.provider.id,
    observation.receivedAt,
    referenceTime,
  );
  const available = observation.availability === FederationAvailability.Available;
  if (
    available !== hasOwn(observation, 'payload') ||
    (!available && observation.comparisonKey !== undefined)
  ) {
    throw new FederationValidationError();
  }
  if (available) assertJsonSafe(observation.payload);
  if (observation.comparisonKey !== undefined) assertIdentifier(observation.comparisonKey);
}

function validateProvider(
  provider: unknown,
): asserts provider is { readonly id: string; readonly label?: string } {
  if (
    !isPlainRecord(provider) ||
    !hasAllowedKeys(provider, ['id', 'label']) ||
    !hasOwn(provider, 'id')
  ) {
    throw new FederationValidationError();
  }
  assertIdentifier(provider.id);
  if (provider.label !== undefined) assertIdentifier(provider.label);
}

function validateProvenance(
  provenance: unknown,
  providerId: string,
  receivedAt: string,
  referenceTime: string,
): asserts provenance is FederationObservation['provenance'] {
  if (
    !isPlainRecord(provenance) ||
    !hasAllowedKeys(provenance, [
      'providerId',
      'normalizationBoundary',
      'observedAt',
      'sourceId',
      'sourceReference',
    ]) ||
    !hasOwn(provenance, 'providerId') ||
    !hasOwn(provenance, 'normalizationBoundary') ||
    provenance.providerId !== providerId
  )
    throw new FederationValidationError();
  assertIdentifier(provenance.providerId);
  assertIdentifier(provenance.normalizationBoundary);
  if (provenance.sourceId !== undefined) assertIdentifier(provenance.sourceId);
  if (provenance.sourceReference !== undefined) assertIdentifier(provenance.sourceReference);
  if (provenance.observedAt !== undefined) {
    assertTimestamp(provenance.observedAt);
    if (
      timestamp(provenance.observedAt) > timestamp(receivedAt) ||
      timestamp(provenance.observedAt) > timestamp(referenceTime)
    ) {
      throw new FederationValidationError();
    }
  }
}

function validatePolicy(policy: FederationEligibilityPolicy): void {
  if (
    !isPlainRecord(policy) ||
    !hasExactKeys(policy, [
      'referenceTime',
      'maximumAgeMilliseconds',
      'allowStale',
      'allowUnknownFreshness',
    ])
  ) {
    throw new FederationValidationError();
  }
  assertTimestamp(policy.referenceTime);
  if (
    !Number.isSafeInteger(policy.maximumAgeMilliseconds) ||
    policy.maximumAgeMilliseconds < 0 ||
    typeof policy.allowStale !== 'boolean' ||
    typeof policy.allowUnknownFreshness !== 'boolean'
  ) {
    throw new FederationValidationError();
  }
}

function compareObservations<TPayload>(
  left: FederatedObservation<TPayload>,
  right: FederatedObservation<TPayload>,
): number {
  return left.provider.id.localeCompare(right.provider.id) || left.id.localeCompare(right.id);
}

function assertIdentifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new FederationValidationError();
}

function assertTimestamp(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new FederationValidationError();
  }
}

function timestamp(value: string): number {
  return Date.parse(value);
}

function assertJsonSafe(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new FederationValidationError();
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJsonSafe(item);
    return;
  }
  if (!isPlainRecord(value)) throw new FederationValidationError();
  for (const [key, entry] of Object.entries(value)) {
    if (key.length === 0 || entry === undefined) throw new FederationValidationError();
    assertJsonSafe(entry);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasAllowedKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  return (
    Object.keys(value).length === expected.length && expected.every((key) => hasOwn(value, key))
  );
}

function assertEnum<T extends string>(
  value: unknown,
  values: Record<string, T>,
): asserts value is T {
  if (!Object.values(values).includes(value as T)) throw new FederationValidationError();
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (isPlainRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
    ) as T;
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}
