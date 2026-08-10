import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioAllocationDimension,
  PortfolioPositionKind,
  PortfolioUnvaluedPositionReason,
  PortfolioValidationError,
  analyzePortfolioAllocation,
  valuePortfolioSnapshot,
} from '../dist/index.js';

function asset(overrides = {}) {
  return {
    id: 'asset-a',
    symbol: 'TOKEN',
    networkId: 'network-a',
    contractAddress: 'contract-a',
    decimals: 0,
    ...overrides,
  };
}

function position(overrides = {}) {
  return {
    id: 'position-a',
    sourceId: 'source-a',
    accountId: 'account-a',
    kind: PortfolioPositionKind.AssetBalance,
    asset: asset(),
    quantity: '1',
    observedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(positions = [position()]) {
  return {
    portfolio: {
      id: 'portfolio-a',
      label: 'Primary',
      sources: [
        { id: 'source-a', label: 'Source A' },
        { id: 'source-b', label: 'Source B' },
      ],
      accounts: [
        { id: 'account-a', sourceId: 'source-a', label: 'Account A' },
        { id: 'account-b', sourceId: 'source-b', label: 'Account B' },
      ],
    },
    capturedAt: '2026-08-10T01:00:00.000Z',
    positions,
  };
}

function price(assetValue, value, overrides = {}) {
  return {
    asset: assetValue,
    price: value,
    currency: 'USD',
    observedAt: '2026-08-10T00:30:00.000Z',
    sourceId: 'price-source-a',
    sourceRecordId: `record-${assetValue.id}`,
    ...overrides,
  };
}

function valuation(source, prices) {
  return valuePortfolioSnapshot(source, prices, { currency: 'USD' });
}

test('returns a single asset, network, source, and account at 100% of valued value', () => {
  const source = snapshot();
  const analysis = analyzePortfolioAllocation(source, valuation(source, [price(asset(), '5')]));

  assert.equal(analysis.totalValuedValue, '5');
  assert.equal(analysis.coverage.valuedPositionCoveragePercentage, '100');
  assert.equal(analysis.assetAllocation.dimension, PortfolioAllocationDimension.Asset);
  assert.equal(analysis.assetAllocation.items[0].percentage, '100');
  assert.equal(analysis.exposure.network.items[0].networkId, 'network-a');
  assert.equal(analysis.exposure.network.items[0].percentage, '100');
  assert.equal(analysis.exposure.source.items[0].sourceId, 'source-a');
  assert.equal(analysis.exposure.account.items[0].accountId, 'account-a');
  assert.equal(analysis.largestHoldings[0].positionId, 'position-a');
});

test('keeps same-symbol cross-network assets distinct with exact deterministic percentages and stable largest holdings', () => {
  const first = asset({ id: 'asset-a', networkId: 'network-a', contractAddress: 'contract-a' });
  const second = asset({ id: 'asset-b', networkId: 'network-b', contractAddress: 'contract-b' });
  const positions = [
    position({
      id: 'position-b',
      sourceId: 'source-b',
      accountId: 'account-b',
      asset: second,
      quantity: '2',
    }),
    position({ id: 'position-a', asset: first, quantity: '1' }),
  ];
  const source = snapshot(positions);
  const prices = [price(first, '1'), price(second, '1')];
  const analysis = analyzePortfolioAllocation(source, valuation(source, prices));

  assert.equal(analysis.assetAllocation.items.length, 2);
  assert.deepEqual(
    analysis.assetAllocation.items.map((item) => item.percentage),
    ['33.3333', '66.6667'],
  );
  assert.deepEqual(
    analysis.exposure.network.items.map((item) => item.networkId),
    ['network-a', 'network-b'],
  );
  assert.deepEqual(
    analysis.exposure.source.items.map((item) => item.sourceId),
    ['source-a', 'source-b'],
  );
  assert.deepEqual(
    analysis.exposure.account.items.map((item) => item.accountId),
    ['account-a', 'account-b'],
  );
  assert.equal(analysis.largestHoldings[0].positionId, 'position-b');

  const tied = analyzePortfolioAllocation(
    snapshot([position({ id: 'z', asset: second }), position({ id: 'a', asset: first })]),
    valuation(
      snapshot([position({ id: 'z', asset: second }), position({ id: 'a', asset: first })]),
      [price(first, '1'), price(second, '1')],
    ),
  );
  assert.deepEqual(
    tied.largestHoldings.map((item) => item.positionId),
    ['a', 'z'],
  );
});

test('reports partial coverage without treating unvalued holdings as zero allocation', () => {
  const valued = position({ id: 'valued', quantity: '4' });
  const missingPrice = position({ id: 'missing-price', asset: asset({ id: 'asset-missing' }) });
  const missingDecimals = position({
    id: 'missing-decimals',
    asset: asset({ id: 'asset-no-decimals', decimals: undefined }),
  });
  const source = snapshot([valued, missingPrice, missingDecimals]);
  const analysis = analyzePortfolioAllocation(
    source,
    valuation(source, [price(valued.asset, '2'), price(missingDecimals.asset, '2')]),
  );

  assert.equal(analysis.totalValuedValue, '8');
  assert.equal(analysis.assetAllocation.items.length, 1);
  assert.equal(analysis.assetAllocation.items[0].percentage, '100');
  assert.equal(analysis.coverage.totalPositionCount, 3);
  assert.equal(analysis.coverage.valuedPositionCoveragePercentage, '33.3333');
  assert.deepEqual(analysis.coverage.unvaluedReasons, [
    { reason: PortfolioUnvaluedPositionReason.MissingDecimals, positionCount: 1 },
    { reason: PortfolioUnvaluedPositionReason.MissingPrice, positionCount: 1 },
  ]);
});

test('returns valid empty allocation for zero-valued or entirely unvalued snapshots', () => {
  const zero = snapshot([position({ quantity: '0' })]);
  const zeroAnalysis = analyzePortfolioAllocation(zero, valuation(zero, [price(asset(), '0')]));
  assert.equal(zeroAnalysis.totalValuedValue, '0');
  assert.deepEqual(zeroAnalysis.assetAllocation.items, []);
  assert.deepEqual(zeroAnalysis.largestHoldings, []);

  const unvalued = snapshot([position()]);
  const unvaluedAnalysis = analyzePortfolioAllocation(unvalued, valuation(unvalued, []));
  assert.equal(unvaluedAnalysis.totalValuedValue, '0');
  assert.equal(unvaluedAnalysis.coverage.valuedPositionCoveragePercentage, '0');
  assert.deepEqual(unvaluedAnalysis.exposure.network.items, []);
});

test('is invariant to input order, does not mutate inputs, and rejects valuation/snapshot mismatches', () => {
  const first = asset({ id: 'asset-a' });
  const second = asset({ id: 'asset-b', networkId: undefined, contractAddress: undefined });
  const positions = [
    position({ id: 'first', asset: first, quantity: '1' }),
    position({
      id: 'second',
      asset: second,
      quantity: '2',
      sourceId: undefined,
      accountId: undefined,
    }),
  ];
  const source = snapshot(positions);
  const prices = [price(first, '3'), price(second, '4')];
  const result = valuation(source, prices);
  const sourceBefore = JSON.stringify(source);
  const valuationBefore = JSON.stringify(result);
  const firstAnalysis = analyzePortfolioAllocation(source, result);
  const secondAnalysis = analyzePortfolioAllocation(
    snapshot([...positions].reverse()),
    valuation(snapshot([...positions].reverse()), [...prices].reverse()),
  );
  assert.deepEqual(firstAnalysis, secondAnalysis);
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(result), valuationBefore);
  assert.equal(
    firstAnalysis.exposure.network.items.find((item) => item.unclassified)?.unclassified,
    true,
  );
  assert.equal(
    firstAnalysis.exposure.source.items.find((item) => item.unclassified)?.unclassified,
    true,
  );
  assert.equal(
    firstAnalysis.exposure.account.items.find((item) => item.unclassified)?.unclassified,
    true,
  );

  assert.throws(
    () => analyzePortfolioAllocation(source, { ...result, portfolioId: 'other' }),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      analyzePortfolioAllocation(source, {
        ...result,
        positions: [{ ...result.positions[0], positionIdentity: 'unknown' }],
      }),
    PortfolioValidationError,
  );
});
