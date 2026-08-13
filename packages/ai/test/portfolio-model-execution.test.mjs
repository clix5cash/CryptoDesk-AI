import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  validatePortfolioAiGroundedInterpretationResult,
  validatePortfolioAiModelExecutionRequest,
  validatePortfolioAiModelExecutionResult,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-execution', section]);
}

function payload() {
  const items = [
    {
      id: 'usdc-network-a',
      category: 'concentration',
      severity: 'significant',
      priority: 'high',
      priorityReasons: ['significant_severity', 'canonical_identity'],
      targetIdentity: 'asset-network-a',
      evidence: {
        insight: {
          portfolioId: 'portfolio-execution',
          asset: {
            id: 'asset-network-a',
            symbol: 'USDC',
            networkId: 'network-a',
            contractAddress: 'contract-a',
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
      id: 'missing-price',
      category: 'data_quality',
      priority: 'high',
      priorityReasons: ['data_quality_limitation', 'canonical_identity'],
      targetIdentity: 'missing_price',
      evidence: {
        insight: {
          portfolioId: 'portfolio-execution',
          unavailableReason: 'missing_price',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
  ];
  return {
    schemaVersion: '1',
    portfolioId: 'portfolio-execution',
    capturedAt: '2026-08-13T01:00:00.000Z',
    asOf: '2026-08-13T01:00:00.000Z',
    currency: 'USD',
    totalValuedValue: '900719925474099312345678.1234',
    coverage: {
      state: 'partial',
      valuation: {
        totalPositionCount: 2,
        valuedPositionCount: 1,
        unvaluedPositionCount: 1,
        valuedPositionCoveragePercentage: '50',
        unvaluedReasons: [{ reason: 'missing_price', positionCount: 1 }],
      },
    },
    items,
    sections: [
      { id: sectionId('overview'), section: 'overview', itemIds: [] },
      { id: sectionId('valuation'), section: 'valuation', itemIds: [] },
      { id: sectionId('coverage'), section: 'coverage', itemIds: [] },
      { id: sectionId('concentration'), section: 'concentration', itemIds: ['usdc-network-a'] },
      { id: sectionId('data_quality'), section: 'data_quality', itemIds: ['missing-price'] },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: items.map((item) => item.id),
      },
    ],
  };
}

function request(overrides = {}) {
  return {
    executionId: 'execution-portfolio-1',
    context: buildPortfolioAiContext({
      analysisId: 'analysis-portfolio-1',
      task: PortfolioAiTask.Interpret,
      payload: payload(),
    }),
    model: { providerId: 'opaque-provider', modelId: 'opaque-model' },
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    executionId: 'execution-portfolio-1',
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque untrusted output.',
    model: { providerId: 'opaque-provider', modelId: 'opaque-model' },
    usage: { inputUnits: 3, outputUnits: 2 },
    ...overrides,
  };
}

test('validates a detached provider-neutral execution request and untrusted raw result', () => {
  const input = request();
  const raw = result();
  const inputBefore = JSON.stringify(input);
  const rawBefore = JSON.stringify(raw);

  validatePortfolioAiModelExecutionRequest(input);
  validatePortfolioAiModelExecutionResult(input, raw);

  assert.equal(input.context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(input.context.facts[0].evidence.insight.asset.networkId, 'network-a');
  assert.equal(input.context.facts[1].evidence.insight.unavailableReason, 'missing_price');
  assert.equal(raw.authority, 'untrusted_model_execution');
  assert.equal(raw.model.providerId, 'opaque-provider');
  assert.equal(JSON.stringify(input), inputBefore);
  assert.equal(JSON.stringify(raw), rawBefore);
  validatePortfolioAiModelExecutionResult(input, raw);
});

test('keeps raw execution separate from grounded interpretation and rejects malformed, contradictory, or fabricated boundary data', () => {
  const input = request();
  const raw = result();

  assert.throws(
    () => validatePortfolioAiGroundedInterpretationResult(input.context, raw),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => validatePortfolioAiModelExecutionRequest(request({ executionId: ' ' })),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiModelExecutionRequest(
        request({
          context: { ...input.context, source: { ...input.context.source, portfolioId: 'other' } },
        }),
      ),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiModelExecutionResult(input, {
        ...raw,
        model: { providerId: 'other-provider' },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioAiModelExecutionResult(input, {
        ...raw,
        status: AiExecutionStatus.Failed,
      }),
    AiBoundaryValidationError,
  );
  for (const field of [
    'portfolioId',
    'assetId',
    'positionId',
    'networkId',
    'price',
    'measuredPercentage',
    'coverageState',
    'riskLevel',
    'capturedAt',
    'provenance',
    'interpretations',
  ]) {
    assert.throws(
      () => validatePortfolioAiModelExecutionResult(input, { ...raw, [field]: 'fabricated' }),
      AiBoundaryValidationError,
    );
  }
  assert.throws(
    () =>
      validatePortfolioAiModelExecutionResult(input, {
        ...raw,
        usage: { inputUnits: -1 },
      }),
    AiBoundaryValidationError,
  );
  validatePortfolioAiModelExecutionResult(input, raw);
});

test('validates explicit failed execution results without provider state or canonical data changes', () => {
  const input = request({ model: undefined });
  const failed = result({
    model: undefined,
    status: AiExecutionStatus.Failed,
    output: undefined,
    failure: { code: 'opaque_failure', message: 'Execution was not completed.' },
  });
  validatePortfolioAiModelExecutionResult(input, failed);
  assert.equal(failed.authority, 'untrusted_model_execution');
  assert.equal(failed.failure.code, 'opaque_failure');
});
