import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiModelExecutionService,
  PortfolioAiModelProviderRegistry,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-execution-service', section]);
}

function executionRequest(executionId = 'service-execution-1', model = 'model-a') {
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
          portfolioId: 'portfolio-execution-service',
          asset: { id: 'asset-a', symbol: 'USDC', networkId: 'network-a', decimals: 6 },
          measuredValue: '900719925474099312345678.1234',
          measuredPercentage: '100',
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
          portfolioId: 'portfolio-execution-service',
          unavailableReason: 'missing_price',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
  ];
  return {
    executionId,
    model: { providerId: 'provider-a', modelId: model },
    context: buildPortfolioAiContext({
      analysisId: `analysis-${executionId}`,
      task: PortfolioAiTask.Interpret,
      payload: {
        schemaVersion: '1',
        portfolioId: 'portfolio-execution-service',
        capturedAt: '2026-08-13T03:00:00.000Z',
        asOf: '2026-08-13T03:00:00.000Z',
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
          {
            id: sectionId('concentration'),
            section: 'concentration',
            itemIds: ['asset-network-a'],
          },
          { id: sectionId('data_quality'), section: 'data_quality', itemIds: ['missing-price'] },
          {
            id: sectionId('prioritized_insights'),
            section: 'prioritized_insights',
            itemIds: items.map((item) => item.id),
          },
        ],
      },
    }),
  };
}

function adapter(execute) {
  return { providerId: 'provider-a', supportedModels: ['model-a'], execute };
}

function rawResult(input, overrides = {}) {
  return {
    executionId: input.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque raw result.',
    model: input.model,
    ...overrides,
  };
}

test('executes exactly one explicitly selected fake adapter and returns detached raw output', async () => {
  const registry = new PortfolioAiModelProviderRegistry();
  let calls = 0;
  registry.register(
    adapter(async (input) => {
      calls += 1;
      input.context.summary.coverage.state = 'complete';
      return rawResult(input);
    }),
  );
  const service = new PortfolioAiModelExecutionService(registry);
  const input = executionRequest();
  const before = JSON.stringify(input);
  const output = await service.execute(input);

  assert.equal(calls, 1);
  assert.equal(output.executionId, input.executionId);
  assert.equal(output.model.providerId, 'provider-a');
  assert.equal(output.authority, 'untrusted_model_execution');
  assert.equal(input.context.summary.coverage.state, 'partial');
  assert.equal(JSON.stringify(input), before);
});

test('preserves explicit resolution and normalizes failed or malformed adapter calls without retry or fallback', async () => {
  const request = executionRequest();
  const registry = new PortfolioAiModelProviderRegistry();
  let calls = 0;
  registry.register(
    adapter(async () => {
      calls += 1;
      throw new Error('opaque adapter failure');
    }),
  );
  const service = new PortfolioAiModelExecutionService(registry);
  await assert.rejects(() => service.execute(request), AiBoundaryValidationError);
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      service.execute({
        ...executionRequest('unknown-provider'),
        model: { providerId: 'unknown-provider', modelId: 'model-a' },
      }),
    AiBoundaryValidationError,
  );
  await assert.rejects(
    () => service.execute(executionRequest('unsupported-model', 'other-model')),
    AiBoundaryValidationError,
  );
  assert.equal(calls, 1);

  const malformedRegistry = new PortfolioAiModelProviderRegistry();
  malformedRegistry.register(
    adapter(async (input) => ({ ...rawResult(input), executionId: 'wrong-execution' })),
  );
  await assert.rejects(
    () => new PortfolioAiModelExecutionService(malformedRegistry).execute(request),
    AiBoundaryValidationError,
  );
  const validRegistry = new PortfolioAiModelProviderRegistry();
  validRegistry.register(adapter(async (input) => rawResult(input)));
  assert.equal(
    (await new PortfolioAiModelExecutionService(validRegistry).execute(request)).authority,
    'untrusted_model_execution',
  );
});

test('keeps service instances and concurrent-style requests isolated', async () => {
  const firstRegistry = new PortfolioAiModelProviderRegistry();
  firstRegistry.register(adapter(async (input) => rawResult(input)));
  const secondRegistry = new PortfolioAiModelProviderRegistry();
  const first = new PortfolioAiModelExecutionService(firstRegistry);
  const second = new PortfolioAiModelExecutionService(secondRegistry);
  assert.equal(secondRegistry.list().length, 0);
  await assert.rejects(() => second.execute(executionRequest()), AiBoundaryValidationError);

  const [one, two] = await Promise.all([
    first.execute(executionRequest('service-execution-one')),
    first.execute(executionRequest('service-execution-two')),
  ]);
  assert.deepEqual(
    [one.executionId, two.executionId],
    ['service-execution-one', 'service-execution-two'],
  );
  assert.deepEqual(firstRegistry.list(), [
    { providerId: 'provider-a', supportedModels: ['model-a'] },
  ]);
});
