import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  PortfolioAiResultAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  validatePortfolioAiGroundedInterpretationResult,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-grounded', section]);
}

function payload() {
  const items = [
    {
      id: 'asset-network-a',
      category: 'concentration',
      severity: 'significant',
      priority: 'high',
      priorityReasons: ['significant_severity', 'canonical_identity'],
      targetIdentity: 'asset-network-a',
      evidence: {
        insight: {
          portfolioId: 'portfolio-grounded',
          asset: {
            id: 'asset-a',
            symbol: 'USDC',
            networkId: 'network-a',
            contractAddress: 'contract-a',
            decimals: 6,
          },
          sourceId: 'source-a',
          accountId: 'account-a',
          measuredValue: '900719925474099312345678.1234',
          measuredPercentage: '66.6667',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
    {
      id: 'asset-network-b',
      category: 'concentration',
      severity: 'notable',
      priority: 'normal',
      priorityReasons: ['notable_severity', 'canonical_identity'],
      targetIdentity: 'asset-network-b',
      evidence: {
        insight: {
          portfolioId: 'portfolio-grounded',
          asset: {
            id: 'asset-b',
            symbol: 'USDC',
            networkId: 'network-b',
            contractAddress: 'contract-b',
            decimals: 6,
          },
          measuredPercentage: '33.3333',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
    {
      id: 'missing-price',
      category: 'data_quality',
      priority: 'high',
      priorityReasons: ['data_quality_limitation', 'canonical_identity'],
      targetIdentity: 'missing_price',
      evidence: {
        insight: {
          portfolioId: 'portfolio-grounded',
          unavailableReason: 'missing_price',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
  ];
  return {
    schemaVersion: '1',
    portfolioId: 'portfolio-grounded',
    capturedAt: '2026-08-12T02:00:00.000Z',
    asOf: '2026-08-12T02:00:00.000Z',
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
      { id: sectionId('data_quality'), section: 'data_quality', itemIds: ['missing-price'] },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: ['asset-network-a', 'asset-network-b', 'missing-price'],
      },
    ],
  };
}

function context() {
  return buildPortfolioAiContext({
    analysisId: 'grounded-analysis-1',
    task: PortfolioAiTask.Explain,
    payload: payload(),
  });
}

function reference(fact) {
  return {
    factId: fact.id,
    presentationItemId: fact.presentationItemId,
    sectionIds: fact.grounding.map((item) => item.sectionIds[0]),
  };
}

function result(source, overrides = {}) {
  return {
    analysisId: source.analysisId,
    task: source.task,
    authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
    coverageState: source.summary.coverage.state,
    interpretations: [
      {
        id: 'grounded-interpretation-1',
        authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
        content: 'Non-authoritative interpretation content.',
        coverageState: source.summary.coverage.state,
        factReferences: [reference(source.facts[0])],
      },
    ],
    ...overrides,
  };
}

test('validates grounded interpretations against multiple canonical context facts without changing provenance', () => {
  const source = context();
  const output = result(source, {
    interpretations: [
      {
        ...result(source).interpretations[0],
        factReferences: [reference(source.facts[0]), reference(source.facts[2])],
      },
    ],
  });
  const sourceBefore = JSON.stringify(source);
  const outputBefore = JSON.stringify(output);

  validatePortfolioAiGroundedInterpretationResult(source, output);

  assert.equal(source.facts[0].evidence.insight.measuredValue, '900719925474099312345678.1234');
  assert.equal(source.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(source.facts[1].evidence.insight.asset.networkId, 'network-b');
  assert.equal(source.facts[0].evidence.insight.sourceId, 'source-a');
  assert.equal(source.facts[2].evidence.insight.unavailableReason, 'missing_price');
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(output), outputBefore);
  validatePortfolioAiGroundedInterpretationResult(source, output);
});

test('rejects unknown, duplicate, contradictory, and fabricated canonical result fields without state', () => {
  const source = context();
  const valid = result(source);
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(
        source,
        result(source, {
          interpretations: [
            {
              ...valid.interpretations[0],
              factReferences: [{ ...reference(source.facts[0]), factId: 'unknown-fact' }],
            },
          ],
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(
        source,
        result(source, {
          interpretations: [
            {
              ...valid.interpretations[0],
              factReferences: [
                { ...reference(source.facts[0]), sectionIds: ['unknown-source-section'] },
              ],
            },
          ],
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(
        source,
        result(source, {
          interpretations: [valid.interpretations[0], { ...valid.interpretations[0] }],
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(
        source,
        result(source, {
          interpretations: [
            {
              ...valid.interpretations[0],
              factReferences: [
                {
                  ...reference(source.facts[0]),
                  presentationItemId: source.facts[1].presentationItemId,
                },
              ],
            },
          ],
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(
        source,
        result(source, {
          interpretations: [{ ...valid.interpretations[0], measuredPercentage: '100' }],
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiGroundedInterpretationResult(source, { ...valid, totalValuedValue: '0' }),
    AiBoundaryValidationError,
  );
  validatePortfolioAiGroundedInterpretationResult(source, valid);
});
