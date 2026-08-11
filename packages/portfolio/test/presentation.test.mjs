import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioInsightCategory,
  PortfolioInsightValidationError,
  PortfolioPositionKind,
  PortfolioPresentationSection,
  PortfolioRiskDataState,
  PortfolioRiskUnavailableReason,
  analyzePortfolioAllocation,
  analyzePortfolioRisk,
  createPortfolioPresentation,
  generatePortfolioInsights,
  normalizePortfolioSnapshot,
  prioritizePortfolioInsights,
  valuePortfolioSnapshot,
} from '../dist/index.js';

const thresholds = {
  thresholds: {
    asset: { moderatePercentage: '20', highPercentage: '50' },
    network: { moderatePercentage: '20', highPercentage: '50' },
    source: { moderatePercentage: '20', highPercentage: '50' },
    account: { moderatePercentage: '20', highPercentage: '50' },
  },
};

function asset(id, networkId, decimals = 0) {
  return {
    id,
    symbol: 'USDC',
    networkId,
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
      id: 'portfolio-presentation',
      label: 'Presentation',
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

function price(assetValue, value) {
  return {
    asset: assetValue,
    price: value,
    currency: 'USD',
    observedAt: '2026-08-11T00:30:00.000Z',
    sourceId: 'price-source',
    sourceRecordId: `price-${assetValue.id}`,
  };
}

function context(source, prices) {
  const canonical = normalizePortfolioSnapshot(source);
  const valuation = valuePortfolioSnapshot(canonical, prices, { currency: 'USD' });
  const allocation = analyzePortfolioAllocation(canonical, valuation);
  const risk = analyzePortfolioRisk(
    {
      analysisId: 'presentation-risk',
      asOf: valuation.asOf,
      snapshot: canonical,
      valuation,
      allocation,
    },
    thresholds,
  );
  const insights = generatePortfolioInsights({ snapshot: canonical, valuation, allocation, risk });
  return {
    snapshot: canonical,
    valuation,
    allocation,
    risk,
    insights,
    prioritizedInsights: prioritizePortfolioInsights(insights),
  };
}

test('presents supplied prioritized intelligence in canonical order with detached evidence', () => {
  const primary = asset('asset-a', 'network-a', 6);
  const secondary = asset('asset-b', 'network-b');
  const input = context(
    snapshot([
      position('position-a', '900719925474099312345678', primary, 'source-a', 'account-a'),
      position('position-b', '20', secondary, 'source-b', 'account-b'),
    ]),
    [price(primary, '1.25'), price(secondary, '2')],
  );
  const before = JSON.stringify(input);
  const presentation = createPortfolioPresentation(input);
  const items = presentation.sections[0].items;

  assert.equal(presentation.portfolioId, input.snapshot.portfolio.id);
  assert.equal(presentation.capturedAt, input.snapshot.capturedAt);
  assert.equal(presentation.asOf, input.valuation.asOf);
  assert.equal(presentation.totalValuedValue, input.valuation.totalValue);
  assert.equal(presentation.sections[0].section, PortfolioPresentationSection.PrioritizedInsights);
  assert.deepEqual(
    items.map((item) => item.id),
    input.prioritizedInsights.insights.map((item) => item.insight.id),
  );
  const concentration = items.find(
    (item) =>
      item.category === PortfolioInsightCategory.Concentration &&
      item.evidence.insight.asset?.id === 'asset-a',
  );
  assert.equal(concentration.evidence.insight.measuredPercentage, '100');
  assert.equal(concentration.evidence.insight.thresholdEvidence.matchedLevel, 'high');
  assert.equal(
    concentration.evidence.valuationPositions[0].unitPrice.sourceRecordId,
    'price-asset-a',
  );
  assert.equal(concentration.evidence.valuationPositions[0].value, '1125899906842624140.4320975');
  concentration.evidence.insight.asset.symbol = 'MUTATED';
  assert.equal(
    input.insights.insights.find((item) => item.id === concentration.id).evidence.asset.symbol,
    'USDC',
  );
  assert.equal(JSON.stringify(input), before);
  assert.ok(!JSON.stringify(presentation).match(/buy|sell|rebalance|recommend|predict|narrative/i));
});

test('preserves partial coverage, missing facts, same-symbol network identity, and deterministic output', () => {
  const first = asset('asset-network-a', 'network-a');
  const second = asset('asset-network-b', 'network-b');
  const missingDecimals = { ...asset('asset-missing-decimals', 'network-a'), decimals: undefined };
  const missingPrice = asset('asset-missing-price', 'network-b');
  const source = snapshot([
    position('position-a', '80', first, 'source-a', 'account-a'),
    position('position-b', '20', second, undefined, undefined),
    position('position-c', '1', missingDecimals, 'source-a', 'account-a'),
    position('position-d', '1', missingPrice, 'source-b', 'account-b'),
  ]);
  const prices = [price(first, '1'), price(second, '1'), price(missingDecimals, '1')];
  const firstInput = context(source, prices);
  const reordered = context(snapshot([...source.positions].reverse()), [...prices].reverse());
  const firstPresentation = createPortfolioPresentation(firstInput);

  assert.equal(firstPresentation.coverage.state, PortfolioRiskDataState.Partial);
  assert.equal(firstPresentation.coverage.valuation.valuedPositionCoveragePercentage, '50');
  assert.ok(
    firstPresentation.sections[0].items.some(
      (item) =>
        item.evidence.insight.unavailableReason === PortfolioRiskUnavailableReason.MissingDecimals,
    ),
  );
  assert.ok(
    firstPresentation.sections[0].items.some(
      (item) =>
        item.evidence.insight.unavailableReason === PortfolioRiskUnavailableReason.MissingPrice,
    ),
  );
  const crossNetwork = firstPresentation.sections[0].items.filter(
    (item) => item.evidence.insight.asset?.symbol === 'USDC',
  );
  assert.ok(new Set(crossNetwork.map((item) => item.targetIdentity)).size >= 2);
  assert.deepEqual(createPortfolioPresentation(reordered), firstPresentation);
  assert.deepEqual(createPortfolioPresentation(firstInput), firstPresentation);
});

test('supports valid empty presentation records and rejects contradictory prioritized evidence', () => {
  const input = context(snapshot([]), []);
  const emptyInsights = { ...input.insights, insights: [] };
  const emptyInput = {
    ...input,
    insights: emptyInsights,
    prioritizedInsights: prioritizePortfolioInsights(emptyInsights),
  };
  assert.deepEqual(createPortfolioPresentation(emptyInput).sections, [
    { section: PortfolioPresentationSection.PrioritizedInsights, items: [] },
  ]);
  assert.throws(
    () =>
      createPortfolioPresentation({
        ...input,
        prioritizedInsights: {
          ...input.prioritizedInsights,
          insights: [
            {
              ...input.prioritizedInsights.insights[0],
              insight: {
                ...input.prioritizedInsights.insights[0].insight,
                evidence: {
                  ...input.prioritizedInsights.insights[0].insight.evidence,
                  measuredPercentage: '99',
                },
              },
            },
          ],
        },
      }),
    PortfolioInsightValidationError,
  );
});
