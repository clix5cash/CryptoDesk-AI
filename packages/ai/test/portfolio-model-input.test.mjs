import assert from 'node:assert/strict';
import test from 'node:test';
import { PortfolioPresentationSection } from '@cryptodesk-ai/portfolio';
import {
  AiBoundaryValidationError,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiModelInput,
  validatePortfolioAiModelInput,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-ai-model-input', section]);
}

function item(id, evidence) {
  return {
    id,
    category: id.startsWith('asset') ? 'concentration' : 'data_quality',
    priority: 'high',
    priorityReasons: ['canonical_identity'],
    targetIdentity: id,
    evidence: {
      insight: { portfolioId: 'portfolio-ai-model-input', ...evidence },
      valuationPositions: [],
    },
  };
}

function payload() {
  const items = [
    item('asset-network-a', {
      asset: { id: 'asset-a', symbol: 'USDC', networkId: 'network-a', decimals: 6 },
      measuredValue: '900719925474099312345678.1234',
      measuredPercentage: '66.6667',
      coverageState: 'partial',
    }),
    item('asset-network-b', {
      asset: { id: 'asset-b', symbol: 'USDC', networkId: 'network-b', decimals: 6 },
      measuredPercentage: '33.3333',
      coverageState: 'partial',
    }),
    item('missing-price', { unavailableReason: 'missing_price', coverageState: 'partial' }),
    item('missing-decimals', { unavailableReason: 'missing_decimals', coverageState: 'partial' }),
    item('missing-source', {
      unavailableReason: 'missing_source_provenance',
      coverageState: 'partial',
    }),
    item('missing-account', {
      unavailableReason: 'missing_account_provenance',
      coverageState: 'partial',
    }),
  ];
  return {
    schemaVersion: '1',
    portfolioId: 'portfolio-ai-model-input',
    capturedAt: '2026-08-14T01:00:00.000Z',
    asOf: '2026-08-14T01:00:00.000Z',
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
      {
        id: sectionId('data_quality'),
        section: 'data_quality',
        itemIds: ['missing-price', 'missing-decimals', 'missing-source', 'missing-account'],
      },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: items.map((itemValue) => itemValue.id),
      },
    ],
  };
}

function context() {
  return buildPortfolioAiContext({
    analysisId: 'model-input-analysis',
    task: PortfolioAiTask.Interpret,
    payload: payload(),
  });
}

function unavailableContext() {
  const source = payload();
  const items = source.items.filter((itemValue) => itemValue.category === 'data_quality');
  return buildPortfolioAiContext({
    analysisId: 'model-input-unavailable-analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      ...source,
      totalValuedValue: '0',
      coverage: {
        state: 'unavailable',
        valuation: {
          totalPositionCount: 2,
          valuedPositionCount: 0,
          unvaluedPositionCount: 2,
          valuedPositionCoveragePercentage: '0',
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
          id: sectionId('data_quality'),
          section: 'data_quality',
          itemIds: items.map((itemValue) => itemValue.id),
        },
        {
          id: sectionId('prioritized_insights'),
          section: 'prioritized_insights',
          itemIds: items.map((itemValue) => itemValue.id),
        },
      ],
    },
  });
}

function input(contextValue = context()) {
  const networkA = contextValue.facts.find(
    (fact) => fact.evidence.insight.asset?.networkId === 'network-a',
  );
  const networkB = contextValue.facts.find(
    (fact) => fact.evidence.insight.asset?.networkId === 'network-b',
  );
  assert.ok(networkA);
  assert.ok(networkB);
  return {
    task: PortfolioAiTask.Interpret,
    context: contextValue,
    factIds: [networkA.id, networkB.id],
    sectionIds: [
      sectionId(PortfolioPresentationSection.Concentration),
      sectionId(PortfolioPresentationSection.PrioritizedInsights),
    ],
  };
}

test('creates detached structured model input with exact canonical fact and section references', () => {
  const sourceContext = context();
  const source = input(sourceContext);
  const before = JSON.stringify(source);
  const output = createPortfolioAiModelInput(source);

  assert.deepEqual(output, source);
  assert.equal(output.context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(output.context.summary.coverage.state, 'partial');
  assert.equal(output.context.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(output.context.facts[1].evidence.insight.asset.networkId, 'network-b');
  assert.notEqual(output.factIds[0], output.factIds[1]);
  assert.equal(JSON.stringify(source), before);
  output.context.facts[0].grounding[0].sectionIds[0] = 'detached-change';
  assert.notEqual(source.context.facts[0].grounding[0].sectionIds[0], 'detached-change');
  validatePortfolioAiModelInput(source);
});

test('preserves partial missing-data evidence through explicit structured selection without reranking', () => {
  const sourceContext = context();
  const missingFacts = sourceContext.facts.filter((fact) =>
    [
      'missing_price',
      'missing_decimals',
      'missing_source_provenance',
      'missing_account_provenance',
    ].includes(fact.evidence.insight.unavailableReason),
  );
  const source = {
    task: PortfolioAiTask.Interpret,
    context: sourceContext,
    factIds: missingFacts.map((fact) => fact.id),
    sectionIds: [
      sectionId(PortfolioPresentationSection.DataQuality),
      sectionId(PortfolioPresentationSection.PrioritizedInsights),
    ],
  };
  const output = createPortfolioAiModelInput(source);

  assert.deepEqual(
    output.factIds,
    missingFacts.map((fact) => fact.id),
  );
  assert.deepEqual(
    output.factIds.map(
      (id) =>
        output.context.facts.find((fact) => fact.id === id).evidence.insight.unavailableReason,
    ),
    [
      'missing_price',
      'missing_decimals',
      'missing_source_provenance',
      'missing_account_provenance',
    ],
  );
  assert.deepEqual(createPortfolioAiModelInput(source), output);
});

test('preserves unavailable coverage and its exact missing-data references', () => {
  const sourceContext = unavailableContext();
  const source = {
    task: PortfolioAiTask.Interpret,
    context: sourceContext,
    factIds: sourceContext.facts.map((fact) => fact.id),
    sectionIds: [
      sectionId(PortfolioPresentationSection.DataQuality),
      sectionId(PortfolioPresentationSection.PrioritizedInsights),
    ],
  };
  const output = createPortfolioAiModelInput(source);

  assert.equal(output.context.summary.coverage.state, 'unavailable');
  assert.equal(output.context.summary.totalValuedValue, '0');
  assert.deepEqual(
    output.factIds.map(
      (id) =>
        output.context.facts.find((fact) => fact.id === id).evidence.insight.unavailableReason,
    ),
    [
      'missing_price',
      'missing_decimals',
      'missing_source_provenance',
      'missing_account_provenance',
    ],
  );
});

test('rejects malformed, unknown, duplicate, contradictory, and authority-injecting model input without state', () => {
  const valid = input();
  assert.throws(
    () => createPortfolioAiModelInput({ ...valid, task: PortfolioAiTask.Explain }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => createPortfolioAiModelInput({ ...valid, factIds: ['unknown-fact'] }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => createPortfolioAiModelInput({ ...valid, factIds: [valid.factIds[0], valid.factIds[0]] }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      createPortfolioAiModelInput({
        ...valid,
        sectionIds: [valid.sectionIds[0], valid.sectionIds[0]],
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      createPortfolioAiModelInput({
        ...valid,
        sectionIds: [sectionId(PortfolioPresentationSection.DataQuality)],
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => createPortfolioAiModelInput({ ...valid, authority: 'non_authoritative_interpretation' }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => createPortfolioAiModelInput({ ...valid, portfolioId: 'fabricated-portfolio' }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => createPortfolioAiModelInput({ ...valid, factIds: [], sectionIds: [] }),
    AiBoundaryValidationError,
  );
  assert.deepEqual(createPortfolioAiModelInput(valid), createPortfolioAiModelInput(valid));
});
