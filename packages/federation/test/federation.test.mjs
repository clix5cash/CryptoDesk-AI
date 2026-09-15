import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FederationAgreement,
  FederationAvailability,
  FederationDomain,
  FederationEligibility,
  FederationExclusionReason,
  FederationFreshness,
  FederationStatus,
  FederationValidationError,
  createFederationEnvelope,
} from '@cryptodesk-ai/federation';

const currentTime = '2026-01-01T12:00:00.000Z';

function observation({
  id,
  providerId,
  availability = FederationAvailability.Available,
  observedAt = '2026-01-01T11:59:00.000Z',
  comparisonKey,
  payload = { value: id },
}) {
  return {
    id,
    domain: FederationDomain.Market,
    provider: { id: providerId, label: `Provider ${providerId}` },
    receivedAt: '2026-01-01T12:00:00.000Z',
    availability,
    provenance: {
      providerId,
      normalizationBoundary: 'synthetic_market_normalizer',
      ...(observedAt === undefined ? {} : { observedAt }),
      sourceId: `source-${providerId}`,
      sourceReference: `urn:synthetic:${id}`,
    },
    ...(availability === FederationAvailability.Available ? { payload } : {}),
    ...(comparisonKey === undefined ? {} : { comparisonKey }),
  };
}

function envelope(observations, policy = {}) {
  return createFederationEnvelope({
    id: 'federation-1',
    domain: FederationDomain.Market,
    generatedAt: currentTime,
    observations,
    policy: {
      referenceTime: currentTime,
      maximumAgeMilliseconds: 300_000,
      allowStale: false,
      allowUnknownFreshness: false,
      ...policy,
    },
  });
}

test('preserves provider identity, normalization provenance, source reference, and payload', () => {
  const result = envelope([
    observation({ id: 'observation-1', providerId: 'provider-a', comparisonKey: 'same' }),
  ]);
  const item = result.observations[0];
  assert.equal(item.provider.id, 'provider-a');
  assert.equal(item.provenance.providerId, 'provider-a');
  assert.equal(item.provenance.normalizationBoundary, 'synthetic_market_normalizer');
  assert.equal(item.provenance.sourceReference, 'urn:synthetic:observation-1');
  assert.deepEqual(item.payload, { value: 'observation-1' });
});

test('retains multiple observations deterministically without a selected winner', () => {
  const inputs = [
    observation({ id: 'observation-b', providerId: 'provider-b', comparisonKey: 'two' }),
    observation({ id: 'observation-a', providerId: 'provider-a', comparisonKey: 'one' }),
  ];
  const result = envelope(inputs);
  assert.deepEqual(
    result.observations.map((item) => item.id),
    ['observation-a', 'observation-b'],
  );
  assert.equal('selectedObservationId' in result, false);
  assert.equal(result.status, FederationStatus.Available);
});

test('represents agreement when eligible domain-owned comparison keys match', () => {
  const result = envelope([
    observation({ id: 'a', providerId: 'provider-a', comparisonKey: 'normalized-value' }),
    observation({ id: 'b', providerId: 'provider-b', comparisonKey: 'normalized-value' }),
  ]);
  assert.equal(result.comparison.agreement, FederationAgreement.Agree);
  assert.deepEqual(result.comparison.groups, [
    { comparisonKey: 'normalized-value', observationIds: ['a', 'b'] },
  ]);
});

test('preserves disagreement without averaging, ranking, or selecting', () => {
  const result = envelope([
    observation({ id: 'a', providerId: 'provider-a', comparisonKey: 'value-a' }),
    observation({ id: 'b', providerId: 'provider-b', comparisonKey: 'value-b' }),
  ]);
  assert.equal(result.comparison.agreement, FederationAgreement.Differ);
  assert.equal(result.comparison.groups.length, 2);
  assert.equal('selectedObservationId' in result, false);
});

test('reports comparison as unknown when eligible observations lack comparison evidence', () => {
  const result = envelope([
    observation({ id: 'a', providerId: 'provider-a' }),
    observation({ id: 'b', providerId: 'provider-b', comparisonKey: 'value-b' }),
  ]);
  assert.equal(result.comparison.agreement, FederationAgreement.Unknown);
  assert.deepEqual(result.comparison.groups, []);
});

test('retains unavailable, invalid, and unknown providers as explicit ineligible records', () => {
  const result = envelope([
    observation({
      id: 'a',
      providerId: 'provider-a',
      availability: FederationAvailability.Unavailable,
    }),
    observation({
      id: 'b',
      providerId: 'provider-b',
      availability: FederationAvailability.Invalid,
    }),
    observation({
      id: 'c',
      providerId: 'provider-c',
      availability: FederationAvailability.Unknown,
    }),
  ]);
  assert.equal(result.status, FederationStatus.Unavailable);
  assert.deepEqual(
    result.observations.map((item) => item.exclusionReason),
    [
      FederationExclusionReason.ProviderUnavailable,
      FederationExclusionReason.ProviderResultInvalid,
      FederationExclusionReason.ProviderAvailabilityUnknown,
    ],
  );
});

test('uses explicit reference time and maximum age for deterministic freshness eligibility', () => {
  const result = envelope([
    observation({
      id: 'current',
      providerId: 'provider-a',
      observedAt: '2026-01-01T11:59:00.000Z',
    }),
    observation({ id: 'stale', providerId: 'provider-b', observedAt: '2026-01-01T11:00:00.000Z' }),
  ]);
  assert.equal(result.status, FederationStatus.Partial);
  assert.equal(result.observations[0].freshness, FederationFreshness.Current);
  assert.equal(result.observations[0].eligibility, FederationEligibility.Eligible);
  assert.equal(result.observations[1].freshness, FederationFreshness.Stale);
  assert.equal(result.observations[1].eligibility, FederationEligibility.Ineligible);
  assert.equal(result.observations[1].exclusionReason, FederationExclusionReason.ObservationStale);
});

test('keeps unknown freshness distinct and policy-controlled without hidden defaults', () => {
  const unknown = observation({ id: 'unknown', providerId: 'provider-a' });
  delete unknown.provenance.observedAt;
  assert.equal(envelope([unknown]).observations[0].eligibility, FederationEligibility.Ineligible);
  assert.equal(
    envelope([unknown], { allowUnknownFreshness: true }).observations[0].eligibility,
    FederationEligibility.Eligible,
  );
});

test('returns equivalent frozen detached output for equivalent input sets', () => {
  const first = observation({ id: 'a', providerId: 'provider-a', comparisonKey: 'same' });
  const second = observation({ id: 'b', providerId: 'provider-b', comparisonKey: 'same' });
  const left = envelope([first, second]);
  const right = envelope([second, first]);
  assert.deepEqual(left, right);
  first.payload.value = 'mutated';
  assert.equal(left.observations[0].payload.value, 'a');
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.observations[0].payload), true);
  assert.throws(() => {
    left.observations.push(first);
  }, TypeError);
});

test('fails closed for malformed identities, provenance mismatch, payload state, and timestamps', () => {
  const valid = observation({ id: 'a', providerId: 'provider-a' });
  const malformed = [
    { ...valid, id: '' },
    { ...valid, provenance: { ...valid.provenance, providerId: 'substituted' } },
    { ...valid, availability: FederationAvailability.Unavailable },
    { ...valid, receivedAt: 'not-a-time' },
    { ...valid, unexpected: true },
  ];
  for (const item of malformed) {
    assert.throws(() => envelope([item]), FederationValidationError);
  }
});

test('keeps AI, transport, retry, fallback, and provider priority outside the public contract', async () => {
  const module = await import('@cryptodesk-ai/federation');
  const publicNames = Object.keys(module).join(' ');
  assert.doesNotMatch(publicNames, /AI|Model|Retry|Fallback|Priority|Transport|Executor/);
});
