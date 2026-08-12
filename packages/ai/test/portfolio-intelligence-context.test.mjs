import assert from 'node:assert/strict';
import test from 'node:test';
import { PortfolioPresentationSection } from '@cryptodesk-ai/portfolio';
import {
  AiBoundaryValidationError,
  PortfolioAiTask,
  buildPortfolioAiContext,
  validatePortfolioAiBuiltContext,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-ai-context', section]);
}

function item(id, category, targetIdentity, evidence, overrides = {}) {
  return {
    id,
    category,
    priority: category === 'concentration' ? 'normal' : 'high',
    priorityReasons: ['canonical_identity'],
    targetIdentity,
    evidence: {
      insight: { portfolioId: 'portfolio-ai-context', ...evidence },
      valuationPositions: [],
    },
    ...overrides,
  };
}

function payload() {
  const dataQualityIds = [
    'missing-price',
    'missing-decimals',
    'missing-network',
    'missing-source',
    'missing-account',
  ];
  const items = [
    item('asset-network-a', 'concentration', 'asset-network-a', {
      asset: { id: 'asset-a', symbol: 'USDC', networkId: 'network-a', decimals: 6 },
      measuredValue: '900719925474099312345678.1234',
      measuredPercentage: '66.6667',
      coverageState: 'partial',
    }),
    item('asset-network-b', 'concentration', 'asset-network-b', {
      asset: { id: 'asset-b', symbol: 'USDC', networkId: 'network-b', decimals: 6 },
      measuredPercentage: '33.3333',
      coverageState: 'partial',
    }),
    ...dataQualityIds.map((id) =>
      item(id, 'data_quality', id.replace('-', '_'), {
        unavailableReason: id.replace('-', '_'),
        coverageState: 'partial',
      }),
    ),
  ];
  return {
    schemaVersion: '1',
    portfolioId: 'portfolio-ai-context',
    capturedAt: '2026-08-12T01:00:00.000Z',
    asOf: '2026-08-12T01:00:00.000Z',
    currency: 'USD',
    totalValuedValue: '900719925474099312345678.1234',
    coverage: {
      state: 'partial',
      valuation: {
        totalPositionCount: 4,
        valuedPositionCount: 2,
        unvaluedPositionCount: 2,
        valuedPositionCoveragePercentage: '50',
        unvaluedReasons: [
          { reason: 'missing_price', positionCount: 1 },
          { reason: 'missing_decimals', positionCount: 1 },
        ],
      },
    },
    items,
    sections: [
      { id: sectionId('overview'), section: 'overview', itemIds: [] },
      { id: sectionId('valuation'), section: 'valuation', itemIds: [] },
      { id: sectionId('coverage'), section: 'coverage', itemIds: [] },
      {
        id: sectionId('concentration'),
        section: 'concentration',
        itemIds: ['asset-network-a', 'asset-network-b'],
      },
      { id: sectionId('data_quality'), section: 'data_quality', itemIds: dataQualityIds },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: items.map((entry) => entry.id),
      },
    ],
  };
}

function input(overrides = {}) {
  return {
    analysisId: 'context-analysis-1',
    task: PortfolioAiTask.Explain,
    payload: payload(),
    ...overrides,
  };
}

test('builds a detached, grounded context from authoritative canonical payload facts', () => {
  const source = input();
  const before = JSON.stringify(source);
  const context = buildPortfolioAiContext(source);

  assert.equal(context.source.portfolioId, source.payload.portfolioId);
  assert.equal(context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(context.summary.coverage.state, 'partial');
  assert.deepEqual(
    context.facts.map((fact) => fact.presentationItemId),
    source.payload.items.map((entry) => entry.id),
  );
  assert.equal(context.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(context.facts[1].evidence.insight.asset.networkId, 'network-b');
  assert.notEqual(context.facts[0].id, context.facts[1].id);
  assert.deepEqual(context.facts[0].grounding, [
    { presentationItemId: 'asset-network-a', sectionIds: [sectionId('concentration')] },
    { presentationItemId: 'asset-network-a', sectionIds: [sectionId('prioritized_insights')] },
  ]);
  assert.equal(JSON.stringify(source), before);
  assert.ok(
    !JSON.stringify(context).match(/buy|sell|rebalance|diversify|recommend|predict|narrative/i),
  );
  validatePortfolioAiBuiltContext(context);
});

test('preserves canonical ordering and partial/unavailable facts through explicit selection without reranking', () => {
  const source = input();
  const context = buildPortfolioAiContext(source, {
    includedSections: [PortfolioPresentationSection.DataQuality],
    maxItems: 2,
  });

  assert.deepEqual(
    context.sections.map((section) => section.section),
    ['data_quality'],
  );
  assert.deepEqual(
    context.facts.map((fact) => fact.presentationItemId),
    ['missing-price', 'missing-decimals'],
  );
  assert.deepEqual(
    context.facts.map((fact) => fact.evidence.insight.unavailableReason),
    ['missing_price', 'missing_decimals'],
  );
  assert.equal(context.facts[0].coverageState, 'partial');
  assert.deepEqual(
    buildPortfolioAiContext(source, {
      includedSections: [PortfolioPresentationSection.DataQuality],
      maxItems: 2,
    }),
    context,
  );
});

test('rejects malformed payloads, contradictory options, and broken or duplicate context references without state', () => {
  const source = input();
  assert.throws(
    () =>
      buildPortfolioAiContext(
        input({
          payload: { ...source.payload, items: [source.payload.items[0], source.payload.items[0]] },
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      buildPortfolioAiContext(
        input({
          payload: {
            ...source.payload,
            coverage: {
              ...source.payload.coverage,
              valuation: {
                ...source.payload.coverage.valuation,
                unvaluedPositionCount: 6,
              },
            },
          },
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      buildPortfolioAiContext(source, {
        includedSections: [PortfolioPresentationSection.Concentration],
        excludedSections: [PortfolioPresentationSection.Concentration],
      }),
    AiBoundaryValidationError,
  );
  const valid = buildPortfolioAiContext(source);
  assert.throws(
    () =>
      validatePortfolioAiBuiltContext({
        ...valid,
        facts: [valid.facts[0], { ...valid.facts[0], id: valid.facts[0].id }],
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiBuiltContext({
        ...valid,
        facts: [
          {
            ...valid.facts[0],
            grounding: [
              { presentationItemId: valid.facts[0].presentationItemId, sectionIds: ['unknown'] },
            ],
          },
        ],
      }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(buildPortfolioAiContext(source), valid);
});
