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
  PortfolioAssetKind,
  PortfolioFederationValidationError,
  PortfolioPositionKind,
  createPortfolioFederation,
} from '../dist/index.js';

const capturedAt = '2026-09-15T00:00:00.000Z';
const policy = {
  referenceTime: '2026-09-15T00:05:00.000Z',
  maximumAgeMilliseconds: 10 * 60 * 1000,
  allowStale: false,
  allowUnknownFreshness: false,
};

function position(overrides = {}) {
  return {
    id: 'synthetic-position-btc',
    asset: {
      id: 'synthetic-asset-btc',
      symbol: 'TEST-BTC',
      kind: PortfolioAssetKind.Native,
      networkId: 'synthetic-network',
    },
    quantity: 10,
    sourceId: 'synthetic-source',
    accountId: 'synthetic-account-a',
    kind: PortfolioPositionKind.AssetBalance,
    observedAt: capturedAt,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    portfolio: {
      id: 'synthetic-portfolio',
      label: 'Synthetic test portfolio',
      sources: [{ id: 'synthetic-source', label: 'Synthetic source' }],
      accounts: [
        {
          id: 'synthetic-account-a',
          sourceId: 'synthetic-source',
          label: 'Synthetic account A',
        },
      ],
    },
    capturedAt,
    positions: [position()],
    ...overrides,
  };
}

function observation(providerId, overrides = {}) {
  return {
    id: `${providerId}-observation`,
    provider: { id: providerId, label: `${providerId} synthetic provider` },
    receivedAt: '2026-09-15T00:02:00.000Z',
    availability: FederationAvailability.Available,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-synthetic-portfolio-normalizer`,
      sourceId: 'synthetic-source',
      sourceReference: `${providerId}:synthetic-snapshot`,
      observedAt: '2026-09-15T00:01:00.000Z',
    },
    payload: snapshot(),
    ...overrides,
  };
}

function unavailable(providerId) {
  return {
    id: `${providerId}-unavailable`,
    provider: { id: providerId },
    receivedAt: '2026-09-15T00:02:00.000Z',
    availability: FederationAvailability.Unavailable,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-synthetic-portfolio-normalizer`,
      sourceId: 'synthetic-source',
    },
  };
}

function federate(observations, overrides = {}) {
  return createPortfolioFederation({
    id: 'synthetic-portfolio-federation',
    generatedAt: policy.referenceTime,
    observations,
    policy,
    ...overrides,
  });
}

test('retains multiple sources with provider, source, account, snapshot, and provenance intact', () => {
  const result = federate([
    observation('synthetic-provider-b'),
    observation('synthetic-provider-a'),
  ]);

  assert.deepEqual(
    result.federation.observations.map(({ provider }) => provider.id),
    ['synthetic-provider-a', 'synthetic-provider-b'],
  );
  const retained = result.federation.observations[0];
  assert.equal(retained.provenance.sourceId, 'synthetic-source');
  assert.equal(retained.payload.portfolio.accounts[0].id, 'synthetic-account-a');
  assert.equal(retained.payload.capturedAt, capturedAt);
  assert.equal(retained.payload.positions[0].asset.id, 'synthetic-asset-btc');
});

test('keeps capture, provider observation, position observation, and generation times distinct', () => {
  const result = federate([observation('synthetic-provider-a')]);
  const retained = result.federation.observations[0];

  assert.equal(retained.payload.capturedAt, capturedAt);
  assert.equal(retained.payload.positions[0].observedAt, capturedAt);
  assert.equal(retained.provenance.observedAt, '2026-09-15T00:01:00.000Z');
  assert.equal(result.federation.generatedAt, '2026-09-15T00:05:00.000Z');
});

test('reports agreement only for exactly comparable normalized Portfolio facts', () => {
  const result = federate([
    observation('synthetic-provider-a'),
    observation('synthetic-provider-b'),
  ]);

  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].agreement, FederationAgreement.Agree);
});

test('preserves conflicting quantities without averaging, summing, selecting, or canonicalizing', () => {
  const result = federate([
    observation('synthetic-provider-a'),
    observation('synthetic-provider-b', {
      payload: snapshot({ positions: [position({ quantity: 20 })] }),
    }),
  ]);

  assert.equal(result.comparisons[0].agreement, FederationAgreement.Differ);
  assert.equal(result.comparisons[0].factGroups.length, 2);
  assert.deepEqual(
    result.federation.observations.map(({ payload }) => payload.positions[0].quantity),
    [10, 20],
  );
  assert.equal('selectedObservationId' in result, false);
  assert.equal('canonicalPortfolio' in result, false);
});

test('same asset in different accounts is not treated as comparable or conflicting', () => {
  const accountB = {
    id: 'synthetic-account-b',
    sourceId: 'synthetic-source',
    label: 'Synthetic account B',
  };
  const accountBSnapshot = snapshot({
    portfolio: { ...snapshot().portfolio, accounts: [accountB] },
    positions: [position({ accountId: accountB.id })],
  });
  const result = federate([
    observation('synthetic-provider-a'),
    observation('synthetic-provider-b', { payload: accountBSnapshot }),
  ]);

  assert.equal(result.comparisons.length, 2);
  assert.ok(
    result.comparisons.every(({ agreement }) => agreement === FederationAgreement.NotApplicable),
  );
});

test('different snapshot capture boundaries are not compared', () => {
  const olderAt = '2026-09-14T00:00:00.000Z';
  const result = federate([
    observation('synthetic-provider-a'),
    observation('synthetic-provider-b', {
      payload: snapshot({
        capturedAt: olderAt,
        positions: [position({ observedAt: olderAt })],
      }),
    }),
  ]);

  assert.equal(result.comparisons.length, 2);
  assert.ok(
    result.comparisons.every(({ agreement }) => agreement === FederationAgreement.NotApplicable),
  );
});

test('retains stale observations as visible and explicitly ineligible', () => {
  const staleAt = '2026-09-14T00:00:00.000Z';
  const result = federate([
    observation('synthetic-provider-a', {
      provenance: {
        providerId: 'synthetic-provider-a',
        normalizationBoundary: 'synthetic-provider-a-synthetic-portfolio-normalizer',
        sourceId: 'synthetic-source',
        observedAt: staleAt,
      },
    }),
  ]);

  assert.equal(result.federation.observations[0].freshness, FederationFreshness.Stale);
  assert.equal(result.federation.observations[0].eligibility, FederationEligibility.Ineligible);
});

test('retains unavailable sources beside eligible observations without substitution', () => {
  const result = federate([
    unavailable('synthetic-provider-a'),
    observation('synthetic-provider-b'),
  ]);

  assert.equal(result.federation.observations.length, 2);
  assert.equal(result.federation.observations[0].eligibility, FederationEligibility.Unavailable);
  assert.equal(result.federation.observations[1].eligibility, FederationEligibility.Eligible);
  assert.equal('selectedObservationId' in result, false);
});

test('uses stable ordering for determinism without creating provider authority', () => {
  const forward = federate([
    observation('synthetic-provider-b'),
    observation('synthetic-provider-a'),
  ]);
  const reverse = federate([
    observation('synthetic-provider-a'),
    observation('synthetic-provider-b'),
  ]);

  assert.deepEqual(forward, reverse);
});

test('detaches and freezes immutable Portfolio federation output', () => {
  const input = observation('synthetic-provider-a');
  const result = federate([input]);
  input.payload.positions[0].quantity = 999;

  assert.equal(result.federation.observations[0].payload.positions[0].quantity, 10);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.federation.observations[0].payload.positions[0]), true);
});

test('fails closed when provenance source is absent from normalized Portfolio identity', () => {
  assert.throws(
    () =>
      federate([
        observation('synthetic-provider-a', {
          provenance: {
            providerId: 'synthetic-provider-a',
            normalizationBoundary: 'synthetic-provider-a-synthetic-portfolio-normalizer',
            sourceId: 'unknown-source',
            observedAt: '2026-09-15T00:01:00.000Z',
          },
        }),
      ]),
    PortfolioFederationValidationError,
  );
});

test('fails closed on provider provenance mismatch', () => {
  assert.throws(
    () =>
      federate([
        observation('synthetic-provider-a', {
          provenance: {
            providerId: 'synthetic-provider-b',
            normalizationBoundary: 'synthetic-portfolio-normalizer',
            sourceId: 'synthetic-source',
            observedAt: '2026-09-15T00:01:00.000Z',
          },
        }),
      ]),
    FederationValidationError,
  );
});

test('fails closed on malformed or provider-specific raw Portfolio payloads', () => {
  assert.throws(
    () => federate([observation('synthetic-provider-a', { payload: snapshot({ rpcResult: {} }) })]),
    PortfolioFederationValidationError,
  );
  assert.throws(
    () => createPortfolioFederation({ id: 'missing-fields' }),
    PortfolioFederationValidationError,
  );
});

test('rejects non-normalized snapshots at the federation boundary', () => {
  const nonNormalized = snapshot({
    portfolio: {
      ...snapshot().portfolio,
      sources: [
        { id: 'synthetic-source-z', label: 'Synthetic source Z' },
        { id: 'synthetic-source', label: 'Synthetic source' },
      ],
    },
  });
  assert.throws(
    () => federate([observation('synthetic-provider-a', { payload: nonNormalized })]),
    PortfolioFederationValidationError,
  );
});

test('does not alter existing deterministic Portfolio normalization and analysis ownership', () => {
  const result = federate([observation('synthetic-provider-a')]);

  assert.equal(result.federation.observations[0].payload.positions[0].quantity, 10);
  assert.equal('valuation' in result, false);
  assert.equal('allocation' in result, false);
  assert.equal('risk' in result, false);
  assert.equal('insights' in result, false);
});
