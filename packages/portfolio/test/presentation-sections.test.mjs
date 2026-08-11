import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioInsightCategory,
  PortfolioInsightPriority,
  PortfolioInsightPriorityReason,
  PortfolioInsightValidationError,
  PortfolioPresentationSection,
  composePortfolioPresentationSections,
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
    evidence: { insight: { portfolioId: 'portfolio-sections' }, valuationPositions: [] },
    ...overrides,
  };
}

function presentation(items, overrides = {}) {
  return {
    portfolioId: 'portfolio-sections',
    capturedAt: '2026-08-11T01:00:00.000Z',
    asOf: '2026-08-11T01:00:00.000Z',
    currency: 'USD',
    totalValuedValue: '900719925474099312345678.5',
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
    sections: [{ section: PortfolioPresentationSection.PrioritizedInsights, items }],
    ...overrides,
  };
}

test('composes canonical section order and preserves prioritized item ordering through references', () => {
  const source = presentation([
    item('concentration-network-a', PortfolioInsightCategory.Concentration, 'asset-network-a'),
    item('concentration-network-b', PortfolioInsightCategory.Concentration, 'asset-network-b'),
    item('exposure-source', PortfolioInsightCategory.Exposure, 'source-a'),
    item('data-quality', PortfolioInsightCategory.DataQuality, 'missing_price'),
  ]);
  const before = JSON.stringify(source);
  const composed = composePortfolioPresentationSections(source);

  assert.deepEqual(
    composed.sections.map((section) => section.section),
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
  assert.equal(
    composed.sections[0].id,
    JSON.stringify(['portfolio-sections', PortfolioPresentationSection.Overview]),
  );
  assert.deepEqual(
    composed.sections.at(-1).itemIds,
    source.sections[0].items.map((candidate) => candidate.id),
  );
  assert.deepEqual(
    composed.sections.find(
      (section) => section.section === PortfolioPresentationSection.Concentration,
    ).itemIds,
    ['concentration-network-a', 'concentration-network-b'],
  );
  assert.equal(JSON.stringify(source), before);
  assert.equal(composed.totalValuedValue, source.totalValuedValue);
});

test('applies only explicit section selection and caps without reranking or suppressing applicable coverage by default', () => {
  const source = presentation([
    item('concentration-a', PortfolioInsightCategory.Concentration, 'asset-a'),
    item('concentration-b', PortfolioInsightCategory.Concentration, 'asset-b'),
    item('data-quality', PortfolioInsightCategory.DataQuality, 'missing_decimals'),
  ]);

  assert.deepEqual(
    composePortfolioPresentationSections(source, {
      includedSections: [
        PortfolioPresentationSection.Coverage,
        PortfolioPresentationSection.Concentration,
      ],
      maxItemsPerSection: 1,
    }).sections,
    [
      {
        id: JSON.stringify(['portfolio-sections', PortfolioPresentationSection.Coverage]),
        section: PortfolioPresentationSection.Coverage,
        itemIds: [],
      },
      {
        id: JSON.stringify(['portfolio-sections', PortfolioPresentationSection.Concentration]),
        section: PortfolioPresentationSection.Concentration,
        itemIds: ['concentration-a'],
      },
    ],
  );
  assert.ok(
    composePortfolioPresentationSections(source).sections.some(
      (section) => section.section === PortfolioPresentationSection.Coverage,
    ),
  );
  assert.equal(
    composePortfolioPresentationSections(source, {
      excludedSections: [PortfolioPresentationSection.Coverage],
    }).sections.some((section) => section.section === PortfolioPresentationSection.Coverage),
    false,
  );
  assert.deepEqual(
    composePortfolioPresentationSections(source, { maxItemsPerSection: 0 }).sections.map(
      (section) => section.section,
    ),
    [
      PortfolioPresentationSection.Overview,
      PortfolioPresentationSection.Valuation,
      PortfolioPresentationSection.Coverage,
    ],
  );
});

test('omits empty optional item sections and rejects invalid section or item configuration without state', () => {
  const empty = presentation([], {
    coverage: {
      state: 'complete',
      valuation: {
        totalPositionCount: 0,
        valuedPositionCount: 0,
        unvaluedPositionCount: 0,
        valuedPositionCoveragePercentage: '0',
        unvaluedReasons: [],
      },
    },
  });
  const expected = composePortfolioPresentationSections(empty);
  assert.deepEqual(
    expected.sections.map((section) => section.section),
    [PortfolioPresentationSection.Overview, PortfolioPresentationSection.Valuation],
  );
  assert.throws(
    () => composePortfolioPresentationSections(empty, { maxItemsPerSection: -1 }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      composePortfolioPresentationSections(empty, {
        includedSections: [
          PortfolioPresentationSection.Coverage,
          PortfolioPresentationSection.Coverage,
        ],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      composePortfolioPresentationSections(empty, {
        includedSections: [PortfolioPresentationSection.Coverage],
        excludedSections: [PortfolioPresentationSection.Coverage],
      }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () =>
      composePortfolioPresentationSections(
        presentation([
          item('duplicate', PortfolioInsightCategory.Exposure, 'network-a'),
          item('duplicate', PortfolioInsightCategory.Exposure, 'network-b'),
        ]),
      ),
    PortfolioInsightValidationError,
  );
  assert.deepEqual(composePortfolioPresentationSections(empty), expected);
});
