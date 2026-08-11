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
  normalizePortfolioSnapshot,
  valuePortfolioSnapshot,
} from '../dist/index.js';

const options = Object.freeze({
  thresholds: {
    asset: { moderatePercentage: '20', highPercentage: '50' },
    network: { moderatePercentage: '20', highPercentage: '50' },
    source: { moderatePercentage: '20', highPercentage: '50' },
    account: { moderatePercentage: '20', highPercentage: '50' },
  },
});

function asset(id, networkId, decimals = 0) {
  return {
    id,
    symbol: 'USDC',
    ...(networkId === undefined ? {} : { networkId }),
    contractAddress: `contract-${id}`,
    ...(decimals === undefined ? {} : { decimals }),
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
      id: 'portfolio-risk-e2e',
      label: 'Risk E2E',
      sources: [
        { id: 'source-a', label: 'Source A', externalRecordId: 'source-record-a' },
        { id: 'source-b', label: 'Source B', externalRecordId: 'source-record-b' },
      ],
      accounts: [
        { id: 'account-a', sourceId: 'source-a', label: 'Account A' },
        { id: 'account-b', sourceId: 'source-b', label: 'Account B' },
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
    sourceRecordId: `price-record-${assetValue.id}`,
  };
}

function pipeline(source, prices) {
  const canonical = normalizePortfolioSnapshot(source);
  const valuation = valuePortfolioSnapshot(canonical, prices, { currency: 'USD' });
  const allocation = analyzePortfolioAllocation(canonical, valuation);
  const input = {
    analysisId: 'risk-e2e-analysis',
    asOf: valuation.asOf,
    snapshot: canonical,
    valuation,
    allocation,
  };
  return { canonical, valuation, allocation, input, risk: analyzePortfolioRisk(input, options) };
}

test('composes canonical Portfolio valuation, allocation, and risk without hiding partial coverage', () => {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const unclassified = asset('asset-c', undefined);
  const missingDecimals = { ...asset('asset-d', 'network-a'), decimals: undefined };
  const missingPrice = asset('asset-e', 'network-b');
  const source = snapshot([
    position('position-a', '50', first, 'source-a', 'account-a'),
    position('position-b', '30', second, 'source-b', 'account-b'),
    position('position-c', '20', unclassified, undefined, undefined),
    position('position-d', '1', missingDecimals, 'source-a', 'account-a'),
    position('position-e', '1', missingPrice, 'source-b', 'account-b'),
  ]);
  const prices = [price(first), price(second), price(unclassified), price(missingDecimals)];
  const sourceBefore = JSON.stringify(source);
  const pricesBefore = JSON.stringify(prices);
  const result = pipeline(source, prices);

  assert.equal(result.valuation.totalValue, '100');
  assert.equal(result.valuation.positions.length, 3);
  assert.deepEqual(
    result.valuation.unvaluedPositions.map((item) => item.reason),
    ['missing_decimals', 'missing_price'],
  );
  assert.equal(result.valuation.positions[0].unitPrice.sourceId, 'price-source');
  assert.equal(result.valuation.positions[0].unitPrice.sourceRecordId, 'price-record-asset-a');
  assert.equal(result.risk.analysisId, result.input.analysisId);
  assert.equal(result.risk.portfolioId, result.canonical.portfolio.id);
  assert.equal(result.risk.asOf, result.valuation.asOf);
  assert.equal(result.risk.coverage.state, PortfolioRiskDataState.Partial);
  assert.equal(result.risk.coverage.coverage.valuedPositionCoveragePercentage, '60');
  assert.equal(result.risk.concentrationObservations.length, 3);
  assert.equal(
    result.risk.concentrationObservations.find((item) => item.allocation.asset.id === 'asset-a')
      .level,
    PortfolioRiskConcentrationLevel.High,
  );
  assert.equal(
    result.risk.concentrationObservations.find((item) => item.allocation.asset.id === 'asset-b')
      .level,
    PortfolioRiskConcentrationLevel.Moderate,
  );
  assert.notEqual(
    result.risk.concentrationObservations.find((item) => item.allocation.asset.id === 'asset-a')
      .allocation.asset.networkId,
    result.risk.concentrationObservations.find((item) => item.allocation.asset.id === 'asset-b')
      .allocation.asset.networkId,
  );

  for (const [dimension, reason] of [
    ['network', PortfolioRiskUnavailableReason.MissingNetworkProvenance],
    ['source', PortfolioRiskUnavailableReason.MissingSourceProvenance],
    ['account', PortfolioRiskUnavailableReason.MissingAccountProvenance],
  ]) {
    const item = result.risk.exposureObservations.find(
      (observation) =>
        observation.allocation.dimension === dimension &&
        observation.allocation.identity === 'unclassified',
    );
    assert.equal(item.allocation.percentage, '20');
    assert.equal(item.level, PortfolioRiskConcentrationLevel.Moderate);
    assert.equal(item.coverageState, PortfolioRiskDataState.Partial);
    assert.equal(item.dataQualityReason, reason);
  }
  assert.deepEqual(
    result.risk.unavailableObservations.map((item) => item.reason),
    [
      PortfolioRiskUnavailableReason.MissingAccountProvenance,
      PortfolioRiskUnavailableReason.MissingDecimals,
      PortfolioRiskUnavailableReason.MissingNetworkProvenance,
      PortfolioRiskUnavailableReason.MissingPrice,
      PortfolioRiskUnavailableReason.MissingSourceProvenance,
    ],
  );
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(prices), pricesBefore);
  assert.ok(
    !JSON.stringify(result.risk).match(/score|var|volatility|recommend|buy|sell|rebalance/i),
  );
});

test('is deterministic through the complete risk pipeline and isolates malformed allocation input', () => {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const source = snapshot([
    position('position-a', '50', first, 'source-a', 'account-a'),
    position('position-b', '50', second, 'source-b', 'account-b'),
  ]);
  const prices = [price(first), price(second)];
  const firstResult = pipeline(source, prices);
  const reordered = pipeline(snapshot([...source.positions].reverse()), [...prices].reverse());

  assert.deepEqual(reordered, firstResult);
  assert.throws(
    () =>
      analyzePortfolioRisk(
        {
          ...firstResult.input,
          allocation: {
            ...firstResult.allocation,
            assetAllocation: {
              ...firstResult.allocation.assetAllocation,
              items: [
                { ...firstResult.allocation.assetAllocation.items[0], percentage: '-1' },
                ...firstResult.allocation.assetAllocation.items.slice(1),
              ],
            },
          },
        },
        options,
      ),
    PortfolioRiskValidationError,
  );
  assert.deepEqual(pipeline(source, prices), firstResult);
});
