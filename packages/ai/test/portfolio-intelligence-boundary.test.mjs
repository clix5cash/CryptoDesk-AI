import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  PortfolioAiCanonicalSourceKind,
  PortfolioAiResultAuthority,
  PortfolioAiTask,
  validatePortfolioAiAnalysisResult,
  validatePortfolioAiContext,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-ai-boundary', section]);
}

function payload() {
  return {
    schemaVersion: '1',
    portfolioId: 'portfolio-ai-boundary',
    capturedAt: '2026-08-12T00:00:00.000Z',
    asOf: '2026-08-12T00:00:00.000Z',
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
    items: [
      {
        id: 'asset-network-a',
        category: 'concentration',
        severity: 'significant',
        priority: 'high',
        priorityReasons: ['significant_severity', 'canonical_identity'],
        targetIdentity: 'asset-network-a',
        evidence: {
          insight: {
            portfolioId: 'portfolio-ai-boundary',
            asset: {
              id: 'asset-a',
              symbol: 'USDC',
              networkId: 'network-a',
              decimals: 6,
            },
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
            portfolioId: 'portfolio-ai-boundary',
            asset: {
              id: 'asset-b',
              symbol: 'USDC',
              networkId: 'network-b',
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
            portfolioId: 'portfolio-ai-boundary',
            unavailableReason: 'missing_price',
            coverageState: 'partial',
          },
          valuationPositions: [],
        },
      },
    ],
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
        itemIds: ['missing-price'],
      },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: ['asset-network-a', 'asset-network-b', 'missing-price'],
      },
    ],
  };
}

function context(overrides = {}) {
  const source = payload();
  return {
    analysisId: 'portfolio-ai-analysis-1',
    task: PortfolioAiTask.Explain,
    source: {
      kind: PortfolioAiCanonicalSourceKind.PresentationPayload,
      schemaVersion: '1',
      portfolioId: source.portfolioId,
      capturedAt: source.capturedAt,
      asOf: source.asOf,
    },
    payload: source,
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    analysisId: 'portfolio-ai-analysis-1',
    task: PortfolioAiTask.Explain,
    authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
    coverageState: 'partial',
    interpretations: [
      {
        id: 'interpretation-network-a',
        authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
        content: 'Future interpretation content is explicitly non-authoritative.',
        coverageState: 'partial',
        grounding: [
          {
            presentationItemId: 'asset-network-a',
            sectionIds: [sectionId('concentration'), sectionId('prioritized_insights')],
          },
        ],
      },
    ],
    ...overrides,
  };
}

test('validates a grounded, precision-safe, partial Portfolio AI boundary without changing source facts', () => {
  const input = context();
  const output = result();
  const inputBefore = JSON.stringify(input);
  const outputBefore = JSON.stringify(output);

  validatePortfolioAiContext(input);
  validatePortfolioAiAnalysisResult(input, output);

  assert.equal(input.payload.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(input.payload.coverage.state, 'partial');
  assert.equal(output.authority, 'non_authoritative_interpretation');
  assert.notEqual(
    input.payload.items[0].evidence.insight.asset.networkId,
    input.payload.items[1].evidence.insight.asset.networkId,
  );
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(output), outputBefore);
  validatePortfolioAiAnalysisResult(input, output);
});

test('rejects source, coverage, duplicate identity, and unknown grounding contradictions explicitly', () => {
  const input = context();
  assert.throws(
    () =>
      validatePortfolioAiContext(context({ source: { ...input.source, portfolioId: 'other' } })),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiAnalysisResult(input, result({ coverageState: 'complete' })),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiAnalysisResult(
        input,
        result({
          interpretations: [result().interpretations[0], { ...result().interpretations[0] }],
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiAnalysisResult(
        input,
        result({
          interpretations: [
            {
              ...result().interpretations[0],
              grounding: [
                { presentationItemId: 'unknown', sectionIds: [sectionId('concentration')] },
              ],
            },
          ],
        }),
      ),
    AiBoundaryValidationError,
  );
  validatePortfolioAiAnalysisResult(input, result());
});
