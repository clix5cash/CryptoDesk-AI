import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioInsightCategory,
  PortfolioInsightPriority,
  PortfolioInsightPriorityReason,
  PortfolioInsightSeverity,
  PortfolioInsightValidationError,
  prioritizePortfolioInsights,
} from '../dist/index.js';

const asOf = '2026-08-11T00:00:00.000Z';

function insight(id, category, severity, evidence = {}) {
  return {
    id,
    category,
    ...(severity === undefined ? {} : { severity }),
    evidence: { portfolioId: 'portfolio-priority', ...evidence },
  };
}

function analysis(insights = []) {
  return { portfolioId: 'portfolio-priority', asOf, coverageState: 'partial', insights };
}

test('prioritizes severity and explicit coverage/data-quality limitations with machine-readable reasons', () => {
  const result = prioritizePortfolioInsights(
    analysis([
      insight('allocation', PortfolioInsightCategory.Allocation, PortfolioInsightSeverity.Notable, {
        measuredPercentage: '90',
      }),
      insight(
        'risk',
        PortfolioInsightCategory.Concentration,
        PortfolioInsightSeverity.Significant,
        {
          measuredPercentage: '80',
        },
      ),
      insight('coverage', PortfolioInsightCategory.Coverage, PortfolioInsightSeverity.Info),
      insight(
        'missing-price',
        PortfolioInsightCategory.DataQuality,
        PortfolioInsightSeverity.Info,
        {
          unavailableReason: 'missing_price',
        },
      ),
    ]),
  );

  assert.deepEqual(
    result.insights.map((entry) => entry.insight.id),
    ['risk', 'coverage', 'missing-price', 'allocation'],
  );
  assert.equal(result.insights[0].priority, PortfolioInsightPriority.High);
  assert.deepEqual(result.insights[0].reasons, [
    PortfolioInsightPriorityReason.SignificantSeverity,
    PortfolioInsightPriorityReason.CategoryPrecedence,
    PortfolioInsightPriorityReason.MeasuredMagnitude,
    PortfolioInsightPriorityReason.CanonicalIdentity,
  ]);
  assert.ok(result.insights[1].reasons.includes(PortfolioInsightPriorityReason.CoverageLimitation));
  assert.ok(
    result.insights[2].reasons.includes(PortfolioInsightPriorityReason.DataQualityLimitation),
  );
});

test('uses category, exact decimal magnitude, and canonical identity as stable tie-breaks', () => {
  const input = analysis([
    insight('network-a', PortfolioInsightCategory.Exposure, PortfolioInsightSeverity.Notable, {
      measuredPercentage: '33.3333',
      positionIdentity: 'position-a',
    }),
    insight('network-b', PortfolioInsightCategory.Exposure, PortfolioInsightSeverity.Notable, {
      measuredPercentage: '66.6667',
      positionIdentity: 'position-b',
    }),
    insight('allocation', PortfolioInsightCategory.Allocation, PortfolioInsightSeverity.Notable, {
      measuredPercentage: '99.9999',
    }),
    insight('network-c', PortfolioInsightCategory.Exposure, PortfolioInsightSeverity.Notable, {
      measuredPercentage: '33.3333',
      positionIdentity: 'position-c',
    }),
  ]);

  const result = prioritizePortfolioInsights(input);
  assert.deepEqual(
    result.insights.map((entry) => entry.insight.id),
    ['network-b', 'network-a', 'network-c', 'allocation'],
  );
  assert.ok(result.insights[0].reasons.includes(PortfolioInsightPriorityReason.MeasuredMagnitude));
});

test('supports explicit deterministic selection without mutating input', () => {
  const input = analysis([
    insight('info', PortfolioInsightCategory.Valuation, PortfolioInsightSeverity.Info),
    insight('notable', PortfolioInsightCategory.Exposure, PortfolioInsightSeverity.Notable),
    insight(
      'significant',
      PortfolioInsightCategory.Concentration,
      PortfolioInsightSeverity.Significant,
    ),
  ]);
  const before = JSON.stringify(input);

  assert.deepEqual(
    prioritizePortfolioInsights(input, {
      minimumSeverity: PortfolioInsightSeverity.Notable,
      maxItems: 1,
    }).insights.map((entry) => entry.insight.id),
    ['significant'],
  );
  assert.equal(JSON.stringify(input), before);
  assert.throws(
    () => prioritizePortfolioInsights(input, { maxItems: -1 }),
    PortfolioInsightValidationError,
  );
  assert.throws(
    () => prioritizePortfolioInsights(input, { minimumSeverity: 'unknown' }),
    PortfolioInsightValidationError,
  );
});

test('is order-invariant, rejects duplicate identities, and has no state after failure', () => {
  const canonical = analysis([
    insight('a', PortfolioInsightCategory.Exposure, PortfolioInsightSeverity.Notable, {
      measuredPercentage: '50',
      positionIdentity: 'position-a',
    }),
    insight('b', PortfolioInsightCategory.Exposure, PortfolioInsightSeverity.Notable, {
      measuredPercentage: '50',
      positionIdentity: 'position-b',
    }),
  ]);
  const expected = prioritizePortfolioInsights(canonical);
  assert.deepEqual(
    prioritizePortfolioInsights({ ...canonical, insights: [...canonical.insights].reverse() }),
    expected,
  );
  assert.throws(
    () => prioritizePortfolioInsights(analysis([canonical.insights[0], canonical.insights[0]])),
    PortfolioInsightValidationError,
  );
  assert.deepEqual(prioritizePortfolioInsights(canonical), expected);
  assert.deepEqual(prioritizePortfolioInsights(analysis()), {
    portfolioId: 'portfolio-priority',
    asOf,
    coverageState: 'partial',
    insights: [],
  });
});
