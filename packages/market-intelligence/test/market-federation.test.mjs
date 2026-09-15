import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FederationAgreement,
  FederationAvailability,
  FederationEligibility,
  FederationFreshness,
  FederationValidationError,
} from '@cryptodesk-ai/federation';
import {
  MarketFederationValidationError,
  Timeframe,
  createMarketFederation,
} from '../dist/index.js';

const capturedAt = '2026-09-15T00:00:00.000Z';
const policy = {
  referenceTime: '2026-09-15T00:05:00.000Z',
  maximumAgeMilliseconds: 10 * 60 * 1000,
  allowStale: false,
  allowUnknownFreshness: false,
};

function snapshot(overrides = {}) {
  return {
    marketId: 'bitcoin-usd',
    baseAssetId: 'bitcoin',
    quoteAssetId: 'usd',
    timeframe: Timeframe.OneHour,
    capturedAt,
    lastPrice: 60_000,
    high: 61_000,
    low: 59_000,
    volume: 1_000_000,
    priceChangePercent: 1.25,
    ...overrides,
  };
}

function observation(providerId, overrides = {}) {
  const payload = overrides.payload ?? snapshot();
  return {
    id: `${providerId}-observation`,
    provider: { id: providerId, label: `${providerId} label` },
    receivedAt: '2026-09-15T00:01:00.000Z',
    availability: FederationAvailability.Available,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-market-normalizer`,
      observedAt: payload.capturedAt,
      sourceId: `${providerId}-bitcoin`,
      sourceReference: `${providerId}:bitcoin-usd`,
    },
    payload,
    ...overrides,
  };
}

function unavailableObservation(providerId) {
  return {
    id: `${providerId}-unavailable`,
    provider: { id: providerId },
    receivedAt: '2026-09-15T00:01:00.000Z',
    availability: FederationAvailability.Unavailable,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-market-normalizer`,
      sourceId: `${providerId}-bitcoin`,
    },
  };
}

function federate(observations, overrides = {}) {
  return createMarketFederation({
    id: 'market-federation',
    generatedAt: policy.referenceTime,
    observations,
    policy,
    ...overrides,
  });
}

test('retains two normalized providers with identity and provenance intact', () => {
  const result = federate([observation('provider-b'), observation('provider-a')]);

  assert.deepEqual(
    result.federation.observations.map(({ provider }) => provider.id),
    ['provider-a', 'provider-b'],
  );
  assert.equal(result.federation.observations[0].provenance.providerId, 'provider-a');
  assert.equal(
    result.federation.observations[0].provenance.normalizationBoundary,
    'provider-a-market-normalizer',
  );
  assert.equal(result.federation.observations[0].payload.marketId, 'bitcoin-usd');
});

test('reports exact agreement for compatible normalized snapshots', () => {
  const result = federate([observation('provider-a'), observation('provider-b')]);

  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].agreement, FederationAgreement.Agree);
  assert.deepEqual(result.comparisons[0].comparedObservationIds, [
    'provider-a-observation',
    'provider-b-observation',
  ]);
});

test('preserves exact disagreement without averaging or selecting', () => {
  const result = federate([
    observation('provider-a'),
    observation('provider-b', { payload: snapshot({ lastPrice: 60_001 }) }),
  ]);

  assert.equal(result.comparisons[0].agreement, FederationAgreement.Differ);
  assert.equal(result.comparisons[0].valueGroups.length, 2);
  assert.deepEqual(
    result.federation.observations.map(({ payload }) => payload.lastPrice),
    [60_000, 60_001],
  );
  assert.equal('selectedObservationId' in result, false);
  assert.equal('selectedObservationId' in result.federation, false);
});

test('keeps incompatible instruments separate and not applicable', () => {
  const result = federate([
    observation('provider-a'),
    observation('provider-b', {
      payload: snapshot({
        marketId: 'ethereum-usd',
        baseAssetId: 'ethereum',
      }),
    }),
  ]);

  assert.equal(result.comparisons.length, 2);
  assert.ok(
    result.comparisons.every(({ agreement }) => agreement === FederationAgreement.NotApplicable),
  );
});

test('treats timeframe and capture time as comparability identity', () => {
  const result = federate([
    observation('provider-a'),
    observation('provider-b', {
      payload: snapshot({
        timeframe: Timeframe.OneDay,
        capturedAt: '2026-09-14T00:00:00.000Z',
      }),
      provenance: {
        providerId: 'provider-b',
        normalizationBoundary: 'provider-b-market-normalizer',
        observedAt: '2026-09-14T00:00:00.000Z',
      },
    }),
  ]);

  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].agreement, FederationAgreement.NotApplicable);
  assert.equal(result.federation.observations[0].freshness, FederationFreshness.Current);
  assert.equal(result.federation.observations[1].freshness, FederationFreshness.Stale);
});

test('fails closed when normalized Market comparability information is missing', () => {
  assert.throws(
    () => federate([observation('provider-a', { payload: snapshot({ marketId: '' }) })]),
    MarketFederationValidationError,
  );
});

test('rejects provider-specific raw fields at the normalized Market boundary', () => {
  assert.throws(
    () =>
      federate([
        observation('provider-a', {
          payload: snapshot({ provider_raw_response: { current_price: 60_000 } }),
        }),
      ]),
    MarketFederationValidationError,
  );
});

test('keeps stale observations observable and explicitly ineligible', () => {
  const staleAt = '2026-09-14T00:00:00.000Z';
  const result = federate([
    observation('provider-a', {
      payload: snapshot({ capturedAt: staleAt }),
      provenance: {
        providerId: 'provider-a',
        normalizationBoundary: 'provider-a-market-normalizer',
        observedAt: staleAt,
      },
    }),
  ]);

  assert.equal(result.federation.observations.length, 1);
  assert.equal(result.federation.observations[0].freshness, FederationFreshness.Stale);
  assert.equal(result.federation.observations[0].eligibility, FederationEligibility.Ineligible);
});

test('retains unavailable providers beside eligible observations without substitution', () => {
  const result = federate([unavailableObservation('provider-a'), observation('provider-b')]);

  assert.equal(result.federation.observations.length, 2);
  assert.equal(result.federation.observations[0].freshness, FederationFreshness.Unavailable);
  assert.equal(result.federation.observations[0].eligibility, FederationEligibility.Unavailable);
  assert.equal(result.federation.observations[1].eligibility, FederationEligibility.Eligible);
  assert.equal('selectedObservationId' in result, false);
});

test('uses stable ordering only for determinism, never provider authority', () => {
  const forward = federate([observation('provider-b'), observation('provider-a')]);
  const reverse = federate([observation('provider-a'), observation('provider-b')]);

  assert.deepEqual(forward, reverse);
  assert.deepEqual(
    forward.federation.observations.map(({ provider }) => provider.id),
    ['provider-a', 'provider-b'],
  );
});

test('detaches and freezes immutable Market federation output', () => {
  const input = observation('provider-a');
  const result = federate([input]);
  input.payload.lastPrice = 1;

  assert.equal(result.federation.observations[0].payload.lastPrice, 60_000);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.comparisons), true);
  assert.equal(Object.isFrozen(result.comparisons[0].identity), true);
});

test('fails closed on provider provenance mismatch', () => {
  assert.throws(
    () =>
      federate([
        observation('provider-a', {
          provenance: {
            providerId: 'provider-b',
            normalizationBoundary: 'synthetic-market-normalizer',
            observedAt: capturedAt,
          },
        }),
      ]),
    FederationValidationError,
  );
});

test('fails closed on malformed Market federation envelopes', () => {
  assert.throws(
    () => createMarketFederation({ id: 'missing-required-fields' }),
    MarketFederationValidationError,
  );
  assert.throws(
    () =>
      createMarketFederation({
        id: 'unexpected-market-policy',
        generatedAt: policy.referenceTime,
        observations: [],
        policy,
        providerPriority: ['provider-a'],
      }),
    MarketFederationValidationError,
  );
});
