import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioPositionKind,
  PortfolioRiskConcentrationLevel,
  PortfolioRiskDataState,
  PortfolioRiskUnavailableReason,
  PortfolioRiskValidationError,
  analyzePortfolioAllocation,
  analyzePortfolioRisk,
  validatePortfolioRiskAnalysis,
  valuePortfolioSnapshot,
} from '../dist/index.js';

const options = {
  thresholds: {
    asset: { moderatePercentage: '50', highPercentage: '80' },
    network: { moderatePercentage: '50', highPercentage: '80' },
    source: { moderatePercentage: '50', highPercentage: '80' },
    account: { moderatePercentage: '50', highPercentage: '80' },
  },
};

function asset(id, networkId) {
  return {
    id,
    symbol: 'USDC',
    ...(networkId === undefined ? {} : { networkId }),
    contractAddress: `contract-${id}`,
    decimals: 0,
  };
}

function position(id, quantity, assetValue, sourceId, accountId) {
  return {
    id,
    quantity,
    asset: assetValue,
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(accountId === undefined ? {} : { accountId }),
    kind: PortfolioPositionKind.AssetBalance,
    observedAt: '2026-08-11T00:00:00.000Z',
  };
}

function snapshot(positions) {
  return {
    portfolio: {
      id: 'portfolio-exposure',
      label: 'Exposure',
      sources: [
        { id: 'source-a', label: 'Shared label' },
        { id: 'source-b', label: 'Shared label' },
      ],
      accounts: [
        { id: 'account-a', sourceId: 'source-a', label: 'Shared label' },
        { id: 'account-b', sourceId: 'source-b', label: 'Shared label' },
      ],
    },
    capturedAt: '2026-08-11T01:00:00.000Z',
    positions,
  };
}

function price(assetValue) {
  return {
    asset: assetValue,
    price: '1',
    currency: 'USD',
    observedAt: '2026-08-11T00:30:00.000Z',
    sourceId: 'price-source',
  };
}

function inputFor(source, prices) {
  const valuation = valuePortfolioSnapshot(source, prices, { currency: 'USD' });
  return {
    analysisId: 'exposure-risk',
    asOf: valuation.asOf,
    snapshot: source,
    valuation,
    allocation: analyzePortfolioAllocation(source, valuation),
  };
}

function exposure(analysis, dimension, identity) {
  return analysis.exposureObservations.find(
    (observation) =>
      observation.allocation.dimension === dimension &&
      observation.allocation.identity === identity,
  );
}

test('classifies canonical network, source, and account exposure with stable ties', () => {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const source = snapshot([
    position('position-a', '50', first, 'source-a', 'account-a'),
    position('position-b', '50', second, 'source-b', 'account-b'),
  ]);
  const analysis = analyzePortfolioRisk(inputFor(source, [price(first), price(second)]), options);

  for (const [dimension, identity] of [
    ['network', 'network-a'],
    ['source', 'source-a'],
    ['account', 'account-a'],
  ]) {
    const item = exposure(analysis, dimension, identity);
    assert.equal(item.level, PortfolioRiskConcentrationLevel.Moderate);
    assert.equal(item.coverageState, PortfolioRiskDataState.Complete);
    assert.equal(item.thresholdEvidence.moderatePercentage, '50');
  }
  assert.deepEqual(
    analysis.exposureObservations
      .filter((item) => item.allocation.dimension === 'network')
      .map((item) => item.allocation.identity),
    ['network-a', 'network-b'],
  );
});

test('retains measured unclassified exposure and explicit provenance reasons without identity fabrication', () => {
  const known = asset('asset-known', 'network-a');
  const unknown = asset('asset-unknown', undefined);
  const source = snapshot([
    position('position-known', '40', known, 'source-a', 'account-a'),
    position('position-unknown', '60', unknown, undefined, undefined),
  ]);
  const analysis = analyzePortfolioRisk(inputFor(source, [price(known), price(unknown)]), options);

  for (const [dimension, reason] of [
    ['network', PortfolioRiskUnavailableReason.MissingNetworkProvenance],
    ['source', PortfolioRiskUnavailableReason.MissingSourceProvenance],
    ['account', PortfolioRiskUnavailableReason.MissingAccountProvenance],
  ]) {
    const item = exposure(analysis, dimension, 'unclassified');
    assert.equal(item.allocation.unclassified, true);
    assert.equal(item.allocation.percentage, '60');
    assert.equal(item.level, PortfolioRiskConcentrationLevel.Moderate);
    assert.equal(item.dataQualityReason, reason);
    assert.equal(item.coverageState, PortfolioRiskDataState.Complete);
  }
  assert.equal(analysis.unavailableObservations.length, 3);
  assert.ok(!JSON.stringify(analysis).match(/stablecoin|recommend|buy|sell|rebalance/i));
});

test('keeps partial coverage explicit and validates exposure data-quality evidence', () => {
  const valued = asset('asset-valued', 'network-a');
  const unvalued = asset('asset-unvalued', 'network-b');
  const source = snapshot([
    position('position-valued', '1', valued, 'source-a', 'account-a'),
    position('position-unvalued', '1', unvalued, 'source-b', 'account-b'),
  ]);
  const input = inputFor(source, [price(valued)]);
  const analysis = analyzePortfolioRisk(input, options);

  assert.equal(analysis.coverage.state, PortfolioRiskDataState.Partial);
  assert.ok(analysis.exposureObservations.every((item) => item.coverageState === 'partial'));
  assert.ok(
    analysis.unavailableObservations.some(
      (item) => item.reason === PortfolioRiskUnavailableReason.MissingPrice,
    ),
  );
  assert.throws(
    () =>
      validatePortfolioRiskAnalysis(input, {
        ...analysis,
        exposureObservations: analysis.exposureObservations.map((item, index) =>
          index === 0
            ? { ...item, dataQualityReason: PortfolioRiskUnavailableReason.MissingPrice }
            : item,
        ),
      }),
    PortfolioRiskValidationError,
  );
});

test('is order-invariant, immutable, and isolates invalid exposure configuration', () => {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const source = snapshot([
    position('position-a', '20', first, 'source-a', 'account-a'),
    position('position-b', '80', second, 'source-b', 'account-b'),
  ]);
  const input = inputFor(source, [price(first), price(second)]);
  const before = JSON.stringify(input);
  const firstResult = analyzePortfolioRisk(input, options);
  const reordered = inputFor(snapshot([...source.positions].reverse()), [
    price(second),
    price(first),
  ]);

  assert.deepEqual(analyzePortfolioRisk(reordered, options), firstResult);
  assert.equal(JSON.stringify(input), before);
  assert.throws(
    () =>
      analyzePortfolioRisk(input, {
        thresholds: {
          ...options.thresholds,
          network: { moderatePercentage: '90', highPercentage: '80' },
        },
      }),
    PortfolioRiskValidationError,
  );
  assert.deepEqual(analyzePortfolioRisk(input, options), firstResult);
});
