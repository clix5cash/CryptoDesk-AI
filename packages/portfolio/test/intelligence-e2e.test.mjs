import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioInsightCategory,
  PortfolioInsightPriority,
  PortfolioInsightPriorityReason,
  PortfolioPositionKind,
  PortfolioRiskDataState,
  PortfolioRiskUnavailableReason,
  PortfolioInsightValidationError,
  analyzePortfolioAllocation,
  analyzePortfolioRisk,
  generatePortfolioInsights,
  normalizePortfolioSnapshot,
  portfolioAssetIdentity,
  prioritizePortfolioInsights,
  valuePortfolioSnapshot,
} from '../dist/index.js';

const thresholds = Object.freeze({
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
      id: 'portfolio-intelligence-e2e',
      label: 'Portfolio Intelligence E2E',
      sources: [
        { id: 'source-a', label: 'Source A' },
        { id: 'source-b', label: 'Source B' },
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

function price(assetValue, priceValue) {
  return {
    asset: assetValue,
    price: priceValue,
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
  const risk = analyzePortfolioRisk(
    {
      analysisId: 'portfolio-intelligence-risk',
      asOf: valuation.asOf,
      snapshot: canonical,
      valuation,
      allocation,
    },
    thresholds,
  );
  const insights = generatePortfolioInsights({ snapshot: canonical, valuation, allocation, risk });
  return {
    canonical,
    valuation,
    allocation,
    risk,
    insights,
    prioritized: prioritizePortfolioInsights(insights),
  };
}

test('traces canonical partial Portfolio facts through deterministic prioritized insight output', () => {
  const largeNetworkA = asset('asset-usdc-network-a', 'network-a', 6);
  const networkB = asset('asset-usdc-network-b', 'network-b');
  const unclassified = asset('asset-usdc-unclassified', undefined);
  const missingDecimals = { ...asset('asset-missing-decimals', 'network-a'), decimals: undefined };
  const missingPrice = asset('asset-missing-price', 'network-b');
  const source = snapshot([
    position('position-large', '900719925474099312345678', largeNetworkA, 'source-a', 'account-a'),
    position('position-network-b', '20', networkB, 'source-b', 'account-b'),
    position('position-unclassified', '10', unclassified, undefined, undefined),
    position('position-missing-decimals', '1', missingDecimals, 'source-a', 'account-a'),
    position('position-missing-price', '1', missingPrice, 'source-b', 'account-b'),
  ]);
  const prices = [
    price(largeNetworkA, '1.25'),
    price(networkB, '2'),
    price(unclassified, '1'),
    price(missingDecimals, '1'),
  ];
  const sourceBefore = JSON.stringify(source);
  const pricesBefore = JSON.stringify(prices);
  const thresholdsBefore = JSON.stringify(thresholds);
  const result = pipeline(source, prices);

  assert.equal(result.valuation.totalValue, '1125899906842624190.4320975');
  assert.equal(
    result.valuation.positions.find((item) => item.asset.id === 'asset-usdc-network-a').unitPrice
      .sourceRecordId,
    'price-record-asset-usdc-network-a',
  );
  assert.equal(result.risk.coverage.state, PortfolioRiskDataState.Partial);
  assert.equal(result.insights.coverageState, PortfolioRiskDataState.Partial);
  assert.equal(result.prioritized.coverageState, PortfolioRiskDataState.Partial);
  assert.equal(result.allocation.coverage.valuedPositionCoveragePercentage, '60');

  const crossNetworkAssets = result.allocation.assetAllocation.items.filter(
    (item) => item.asset.symbol === 'USDC',
  );
  assert.equal(crossNetworkAssets.length, 3);
  assert.equal(
    new Set(crossNetworkAssets.map((item) => portfolioAssetIdentity(item.asset))).size,
    3,
  );

  const significant = result.prioritized.insights.find(
    (item) =>
      item.insight.category === PortfolioInsightCategory.Concentration &&
      item.insight.evidence.asset?.id === 'asset-usdc-network-a',
  );
  assert.equal(significant.priority, PortfolioInsightPriority.High);
  assert.ok(significant.reasons.includes(PortfolioInsightPriorityReason.SignificantSeverity));
  assert.ok(significant.reasons.includes(PortfolioInsightPriorityReason.MeasuredMagnitude));
  assert.equal(significant.insight.evidence.measuredPercentage, '100');
  assert.equal(significant.insight.evidence.thresholdEvidence.matchedLevel, 'high');
  assert.equal(
    significant.insight.evidence.allocation.asset.contractAddress,
    'contract-asset-usdc-network-a',
  );

  assert.ok(
    result.prioritized.insights.some(
      (item) =>
        item.insight.category === PortfolioInsightCategory.Coverage &&
        item.reasons.includes(PortfolioInsightPriorityReason.CoverageLimitation),
    ),
  );
  assert.ok(
    result.prioritized.insights.some(
      (item) =>
        item.insight.evidence.unavailableReason === PortfolioRiskUnavailableReason.MissingPrice &&
        item.reasons.includes(PortfolioInsightPriorityReason.DataQualityLimitation),
    ),
  );
  assert.ok(
    result.prioritized.insights.some(
      (item) =>
        item.insight.evidence.unavailableReason ===
        PortfolioRiskUnavailableReason.MissingNetworkProvenance,
    ),
  );
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(prices), pricesBefore);
  assert.equal(JSON.stringify(thresholds), thresholdsBefore);
  assert.ok(
    !JSON.stringify(result.prioritized).match(/buy|sell|rebalance|diversify|predict|recommend/i),
  );
});

test('is order-invariant, repeatable, immutable, and isolates failed insight calls', () => {
  const first = asset('asset-a', 'network-a');
  const second = asset('asset-b', 'network-b');
  const source = snapshot([
    position('position-a', '80', first, 'source-a', 'account-a'),
    position('position-b', '20', second, 'source-b', 'account-b'),
  ]);
  const prices = [price(first, '1'), price(second, '1')];
  const before = JSON.stringify(source);
  const pricesBefore = JSON.stringify(prices);
  const firstResult = pipeline(source, prices);
  const reordered = pipeline(snapshot([...source.positions].reverse()), [...prices].reverse());

  assert.deepEqual(reordered, firstResult);
  assert.deepEqual(pipeline(source, prices), firstResult);
  assert.throws(
    () =>
      prioritizePortfolioInsights({
        ...firstResult.insights,
        insights: [firstResult.insights.insights[0], firstResult.insights.insights[0]],
      }),
    PortfolioInsightValidationError,
  );
  assert.deepEqual(pipeline(source, prices), firstResult);
  assert.equal(JSON.stringify(source), before);
  assert.equal(JSON.stringify(prices), pricesBefore);
});

test('keeps empty and unavailable analysis explicit without generating filler priority', () => {
  const empty = pipeline(snapshot([]), []);
  assert.equal(empty.valuation.totalValue, '0');
  assert.equal(empty.allocation.assetAllocation.items.length, 0);
  assert.equal(empty.risk.concentrationObservations.length, 0);
  assert.equal(empty.risk.coverage.state, PortfolioRiskDataState.InsufficientData);
  assert.ok(
    empty.insights.insights.some((item) => item.category === PortfolioInsightCategory.Coverage),
  );
  assert.deepEqual(prioritizePortfolioInsights(empty.insights, { maxItems: 0 }).insights, []);
});
