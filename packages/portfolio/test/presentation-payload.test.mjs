import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioInsightCategory,
  PortfolioInsightPriority,
  PortfolioInsightPriorityReason,
  PortfolioInsightValidationError,
  PortfolioPresentationSchemaVersion,
  PortfolioPresentationSection,
  composePortfolioPresentationSections,
  serializePortfolioPresentation,
  stringifyPortfolioPresentationPayload,
  validatePortfolioPresentationPayload,
} from '../dist/index.js';

function item(id, category, targetIdentity, overrides = {}) {
  return {
    id,
    category,
    priority: PortfolioInsightPriority.High,
    priorityReasons: [
      PortfolioInsightPriorityReason.CategoryPrecedence,
      PortfolioInsightPriorityReason.CanonicalIdentity,
    ],
    targetIdentity,
    evidence: { insight: { portfolioId: 'portfolio-payload' }, valuationPositions: [] },
    ...overrides,
  };
}

function presentation(items) {
  return {
    portfolioId: 'portfolio-payload',
    capturedAt: '2026-08-11T01:00:00.000Z',
    asOf: '2026-08-11T01:00:00.000Z',
    currency: 'USD',
    totalValuedValue: '900719925474099312345678.1234',
    coverage: {
      state: 'partial',
      valuation: {
        totalPositionCount: 3,
        valuedPositionCount: 2,
        unvaluedPositionCount: 1,
        valuedPositionCoveragePercentage: '66.6667',
        unvaluedReasons: [{ reason: 'missing_price', positionCount: 1 }],
      },
    },
    sections: [{ section: PortfolioPresentationSection.PrioritizedInsights, items }],
  };
}

test('serializes a JSON-safe normalized consumer payload with stable references and exact values', () => {
  const source = presentation([
    item('asset-network-a', PortfolioInsightCategory.Concentration, 'asset-network-a', {
      evidence: {
        insight: {
          portfolioId: 'portfolio-payload',
          asset: { id: 'asset-a', symbol: 'USDC', networkId: 'network-a' },
          measuredValue: '900719925474099312345678.1234',
          measuredPercentage: '66.6667',
        },
        valuationPositions: [],
      },
    }),
    item('asset-network-b', PortfolioInsightCategory.Concentration, 'asset-network-b', {
      evidence: {
        insight: {
          portfolioId: 'portfolio-payload',
          asset: { id: 'asset-b', symbol: 'USDC', networkId: 'network-b' },
          measuredPercentage: '33.3333',
        },
        valuationPositions: [],
      },
    }),
    item('missing-price', PortfolioInsightCategory.DataQuality, 'missing_price'),
  ]);
  const sections = composePortfolioPresentationSections(source);
  const before = JSON.stringify(source);
  const payload = serializePortfolioPresentation(source, sections);

  assert.equal(payload.schemaVersion, PortfolioPresentationSchemaVersion);
  assert.equal(payload.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(payload.coverage.valuation.valuedPositionCoveragePercentage, '66.6667');
  assert.deepEqual(
    payload.items.map((entry) => entry.id),
    source.sections[0].items.map((entry) => entry.id),
  );
  assert.deepEqual(payload.sections, sections.sections);
  assert.equal(new Set(payload.items.map((entry) => entry.targetIdentity)).size, 3);
  assert.equal(JSON.stringify(source), before);
  assert.equal(JSON.stringify(payload), JSON.stringify(JSON.parse(JSON.stringify(payload))));
  assert.ok(!JSON.stringify(payload).match(/buy|sell|rebalance|recommend|predict|narrative/i));
});

test('produces canonical byte-equivalent JSON and detached repeatable payloads', () => {
  const source = presentation([
    item('concentration-a', PortfolioInsightCategory.Concentration, 'asset-a'),
    item('data-quality', PortfolioInsightCategory.DataQuality, 'missing_decimals'),
  ]);
  const sections = composePortfolioPresentationSections(source);
  const first = serializePortfolioPresentation(source, sections);
  const second = serializePortfolioPresentation(
    source,
    composePortfolioPresentationSections(source),
  );
  const bytes = stringifyPortfolioPresentationPayload(first);

  assert.deepEqual(first, second);
  assert.equal(bytes, stringifyPortfolioPresentationPayload(second));
  assert.equal(bytes, JSON.stringify(JSON.parse(bytes)));
  first.items[0].targetIdentity = 'mutated';
  assert.equal(source.sections[0].items[0].targetIdentity, 'asset-a');
});

test('validates empty payloads and rejects broken references, duplicate records, and non-JSON-safe values', () => {
  const empty = presentation([]);
  const payload = serializePortfolioPresentation(
    empty,
    composePortfolioPresentationSections(empty),
  );
  validatePortfolioPresentationPayload(payload);
  assert.deepEqual(payload.items, []);
  assert.throws(
    () =>
      validatePortfolioPresentationPayload({
        ...payload,
        sections: [{ ...payload.sections[0], itemIds: ['unknown'] }],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioPresentationPayload({
        ...payload,
        items: [
          item('duplicate', PortfolioInsightCategory.Exposure, 'a'),
          item('duplicate', PortfolioInsightCategory.Exposure, 'b'),
        ],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioPresentationPayload({
        ...payload,
        items: [
          {
            ...item('invalid-priority', PortfolioInsightCategory.Exposure, 'a'),
            priority: 'invalid',
          },
        ],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioPresentationPayload({
        ...payload,
        items: [item('data-quality', PortfolioInsightCategory.DataQuality, 'missing_price')],
        sections: [
          {
            id: JSON.stringify(['portfolio-payload', PortfolioPresentationSection.Concentration]),
            section: PortfolioPresentationSection.Concentration,
            itemIds: ['data-quality'],
          },
        ],
      }),
    PortfolioInsightValidationError,
  );
  const unsafe = presentation([
    item('unsafe', PortfolioInsightCategory.Exposure, 'source-a', {
      evidence: {
        insight: { portfolioId: 'portfolio-payload', unsafe: 1n },
        valuationPositions: [],
      },
    }),
  ]);
  assert.throws(
    () => serializePortfolioPresentation(unsafe, composePortfolioPresentationSections(unsafe)),
    PortfolioInsightValidationError,
  );
  assert.deepEqual(
    serializePortfolioPresentation(empty, composePortfolioPresentationSections(empty)),
    payload,
  );
});
