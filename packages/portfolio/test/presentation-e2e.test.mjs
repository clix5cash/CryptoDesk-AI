import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioInsightCategory,
  PortfolioInsightPriority,
  PortfolioInsightPriorityReason,
  PortfolioPositionKind,
  PortfolioPresentationSection,
  PortfolioRiskDataState,
  PortfolioRiskUnavailableReason,
  PortfolioInsightValidationError,
  analyzePortfolioAllocation,
  analyzePortfolioRisk,
  composePortfolioPresentationSections,
  createPortfolioPresentation,
  generatePortfolioInsights,
  normalizePortfolioSnapshot,
  portfolioAssetIdentity,
  prioritizePortfolioInsights,
  serializePortfolioPresentation,
  stringifyPortfolioPresentationPayload,
  validatePortfolioPresentationPayload,
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

function asset(id, networkId, decimals) {
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
      id: 'portfolio-presentation-e2e',
      label: 'Presentation E2E',
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

function pipeline(source, prices, prioritizationOptions) {
  const canonical = normalizePortfolioSnapshot(source);
  const valuation = valuePortfolioSnapshot(canonical, prices, { currency: 'USD' });
  const allocation = analyzePortfolioAllocation(canonical, valuation);
  const risk = analyzePortfolioRisk(
    {
      analysisId: 'risk-presentation-e2e',
      asOf: valuation.asOf,
      snapshot: canonical,
      valuation,
      allocation,
    },
    thresholds,
  );
  const insights = generatePortfolioInsights({ snapshot: canonical, valuation, allocation, risk });
  const prioritized = prioritizePortfolioInsights(insights, prioritizationOptions);
  const presentation = createPortfolioPresentation({
    snapshot: canonical,
    valuation,
    allocation,
    risk,
    insights,
    prioritizedInsights: prioritized,
  });
  const sections = composePortfolioPresentationSections(presentation);
  const payload = serializePortfolioPresentation(presentation, sections);
  return {
    canonical,
    valuation,
    allocation,
    risk,
    insights,
    prioritized,
    presentation,
    sections,
    payload,
    json: stringifyPortfolioPresentationPayload(payload),
  };
}

test('preserves canonical Portfolio facts, evidence, identity, ordering, and partial coverage through payload JSON', () => {
  const networkA = asset('asset-usdc-network-a', 'network-a', 6);
  const networkB = asset('asset-usdc-network-b', 'network-b', 0);
  const unclassified = asset('asset-usdc-unclassified', undefined, 0);
  const missingDecimals = asset('asset-missing-decimals', 'network-a', undefined);
  const missingPrice = asset('asset-missing-price', 'network-b', 0);
  const source = snapshot([
    position('position-large', '900719925474099312345678', networkA, 'source-a', 'account-a'),
    position('position-network-b', '20', networkB, 'source-b', 'account-b'),
    position('position-unclassified', '10', unclassified, undefined, undefined),
    position('position-missing-decimals', '1', missingDecimals, 'source-a', 'account-a'),
    position('position-missing-price', '1', missingPrice, 'source-b', 'account-b'),
  ]);
  const prices = [
    price(networkA, '1.25'),
    price(networkB, '2'),
    price(unclassified, '1'),
    price(missingDecimals, '1'),
  ];
  const sourceBefore = JSON.stringify(source);
  const pricesBefore = JSON.stringify(prices);
  const result = pipeline(source, prices);

  assert.equal(result.valuation.totalValue, '1125899906842624190.4320975');
  assert.equal(result.risk.coverage.state, PortfolioRiskDataState.Partial);
  assert.equal(result.payload.coverage.state, PortfolioRiskDataState.Partial);
  assert.equal(result.payload.coverage.valuation.valuedPositionCoveragePercentage, '60');
  assert.equal(result.payload.schemaVersion, '1');

  const highRisk = result.prioritized.insights.find(
    (entry) =>
      entry.insight.category === PortfolioInsightCategory.Concentration &&
      entry.insight.evidence.asset?.id === networkA.id,
  );
  assert.equal(highRisk.priority, PortfolioInsightPriority.High);
  assert.ok(highRisk.reasons.includes(PortfolioInsightPriorityReason.SignificantSeverity));
  assert.equal(highRisk.insight.evidence.riskLevel, 'high');
  assert.equal(highRisk.insight.evidence.thresholdEvidence.highPercentage, '50');

  const presented = result.payload.items.find((item) => item.id === highRisk.insight.id);
  assert.equal(presented.id, highRisk.insight.id);
  assert.equal(presented.targetIdentity, highRisk.insight.evidence.allocation.identity);
  assert.equal(presented.evidence.valuationPositions[0].positionId, 'position-large');
  assert.equal(
    presented.evidence.valuationPositions[0].unitPrice.sourceRecordId,
    'price-record-asset-usdc-network-a',
  );

  const crossNetworkAssets = result.payload.items
    .map((item) => item.evidence.insight.asset)
    .filter((item) => item?.symbol === 'USDC' && item.networkId !== undefined);
  assert.ok(crossNetworkAssets.some((item) => item.id === networkA.id));
  assert.ok(crossNetworkAssets.some((item) => item.id === networkB.id));
  assert.equal(new Set(crossNetworkAssets.map(portfolioAssetIdentity)).size >= 2, true);
  assert.ok(
    result.payload.items.some(
      (item) =>
        item.evidence.insight.unavailableReason === PortfolioRiskUnavailableReason.MissingPrice,
    ),
  );
  assert.ok(
    result.payload.items.some(
      (item) =>
        item.evidence.insight.unavailableReason === PortfolioRiskUnavailableReason.MissingDecimals,
    ),
  );
  assert.ok(
    result.payload.items.some(
      (item) =>
        item.evidence.insight.unavailableReason ===
        PortfolioRiskUnavailableReason.MissingNetworkProvenance,
    ),
  );

  assert.deepEqual(
    result.sections.sections.map((section) => section.section),
    [
      PortfolioPresentationSection.Overview,
      PortfolioPresentationSection.Valuation,
      PortfolioPresentationSection.Coverage,
      PortfolioPresentationSection.Concentration,
      PortfolioPresentationSection.Exposure,
      PortfolioPresentationSection.DataQuality,
      PortfolioPresentationSection.PrioritizedInsights,
    ],
  );
  for (const section of result.payload.sections) {
    assert.equal(section.id, JSON.stringify([result.payload.portfolioId, section.section]));
    for (const itemId of section.itemIds) {
      assert.ok(result.payload.items.some((item) => item.id === itemId));
    }
  }
  assert.equal(result.json, JSON.stringify(JSON.parse(result.json)));
  assert.ok(!result.json.match(/buy|sell|rebalance|diversify|recommend|predict|narrative/i));
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(prices), pricesBefore);
});

test('is byte-stable, isolated after failures, immutable, and valid for empty selected presentation output', () => {
  const first = asset('asset-first', 'network-a', 0);
  const second = asset('asset-second', 'network-b', 0);
  const source = snapshot([
    position('position-first', '80', first, 'source-a', 'account-a'),
    position('position-second', '20', second, 'source-b', 'account-b'),
  ]);
  const prices = [price(first, '1'), price(second, '1')];
  const firstResult = pipeline(source, prices);
  const reordered = pipeline(snapshot([...source.positions].reverse()), [...prices].reverse());
  const presentationBefore = JSON.stringify(firstResult.presentation);
  const sectionsBefore = JSON.stringify(firstResult.sections);

  assert.deepEqual(reordered.payload, firstResult.payload);
  assert.equal(reordered.json, firstResult.json);
  assert.equal(pipeline(source, prices).json, firstResult.json);
  assert.throws(
    () => validatePortfolioPresentationPayload({ ...firstResult.payload, schemaVersion: '2' }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      serializePortfolioPresentation(firstResult.presentation, {
        ...firstResult.sections,
        sections: [
          {
            ...firstResult.sections.sections[0],
            itemIds: ['missing-presentation-item'],
          },
        ],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      composePortfolioPresentationSections(firstResult.presentation, {
        includedSections: [PortfolioPresentationSection.Overview],
        excludedSections: [PortfolioPresentationSection.Overview],
      }),
    PortfolioInsightValidationError,
  );
  assert.equal(pipeline(source, prices).json, firstResult.json);
  assert.equal(JSON.stringify(firstResult.presentation), presentationBefore);
  assert.equal(JSON.stringify(firstResult.sections), sectionsBefore);

  const empty = pipeline(snapshot([]), [], { maxItems: 0 });
  assert.deepEqual(empty.payload.items, []);
  assert.deepEqual(
    empty.payload.sections.map((section) => section.section),
    [
      PortfolioPresentationSection.Overview,
      PortfolioPresentationSection.Valuation,
      PortfolioPresentationSection.Coverage,
    ],
  );
  validatePortfolioPresentationPayload(empty.payload);
  assert.equal(empty.json, stringifyPortfolioPresentationPayload(empty.payload));
});
