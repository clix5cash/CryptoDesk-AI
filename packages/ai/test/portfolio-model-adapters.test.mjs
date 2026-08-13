import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiModelProviderRegistry,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  invokePortfolioAiModelAdapter,
} from '../dist/index.js';

function sectionId(section) {
  return JSON.stringify(['portfolio-adapter', section]);
}

function request(overrides = {}) {
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
          portfolioId: 'portfolio-adapter',
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
          portfolioId: 'portfolio-adapter',
          unavailableReason: 'missing_price',
          coverageState: 'partial',
        },
        valuationPositions: [],
      },
    },
  ];
  const payload = {
    schemaVersion: '1',
    portfolioId: 'portfolio-adapter',
    capturedAt: '2026-08-13T02:00:00.000Z',
    asOf: '2026-08-13T02:00:00.000Z',
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
      { id: sectionId('concentration'), section: 'concentration', itemIds: ['asset-network-a'] },
      { id: sectionId('data_quality'), section: 'data_quality', itemIds: ['missing-price'] },
      {
        id: sectionId('prioritized_insights'),
        section: 'prioritized_insights',
        itemIds: items.map((item) => item.id),
      },
    ],
  };
  return {
    executionId: 'adapter-execution-1',
    context: buildPortfolioAiContext({
      analysisId: 'adapter-analysis-1',
      task: PortfolioAiTask.Interpret,
      payload,
    }),
    model: { providerId: 'provider-a', modelId: 'model-a' },
    ...overrides,
  };
}

function adapter(providerId, supportedModels, execute) {
  return { providerId, supportedModels, execute };
}

function completed(request) {
  return {
    executionId: request.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque raw output.',
    model: request.model,
  };
}

test('registers, lists, resolves, and unregisters explicit adapters deterministically', () => {
  const registry = new PortfolioAiModelProviderRegistry();
  const adapterA = adapter('provider-a', ['model-a'], async (input) => completed(input));
  const adapterB = adapter('provider-b', undefined, async (input) => completed(input));
  registry.register(adapterB);
  registry.register(adapterA);

  assert.deepEqual(registry.list(), [
    { providerId: 'provider-a', supportedModels: ['model-a'] },
    { providerId: 'provider-b' },
  ]);
  assert.equal(registry.get('provider-a'), adapterA);
  assert.equal(registry.resolve({ providerId: 'provider-a', modelId: 'model-a' }), adapterA);
  assert.throws(() => registry.register(adapterA), AiBoundaryValidationError);
  assert.throws(
    () => registry.resolve({ providerId: 'provider-a', modelId: 'other-model' }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () => registry.resolve({ providerId: 'unknown-provider', modelId: 'model-a' }),
    AiBoundaryValidationError,
  );
  assert.equal(registry.unregister('provider-a'), true);
  assert.equal(registry.unregister('provider-a'), false);
  assert.deepEqual(registry.list(), [{ providerId: 'provider-b' }]);
  assert.equal(new PortfolioAiModelProviderRegistry().get('provider-b'), undefined);
});

test('invokes only the explicitly selected fake adapter and returns detached raw untrusted output', async () => {
  const registry = new PortfolioAiModelProviderRegistry();
  let received;
  registry.register(
    adapter('provider-a', ['model-a'], async (input) => {
      received = input;
      input.context.summary.coverage.state = 'complete';
      return completed(input);
    }),
  );
  registry.register(
    adapter('provider-b', ['model-a'], async () => {
      throw new Error('Fallback must not be invoked.');
    }),
  );
  const input = request();
  const before = JSON.stringify(input);
  const output = await invokePortfolioAiModelAdapter(registry, input);

  assert.equal(received.model.providerId, 'provider-a');
  assert.equal(output.authority, 'untrusted_model_execution');
  assert.equal(output.model.providerId, 'provider-a');
  assert.equal(input.context.summary.coverage.state, 'partial');
  assert.equal(input.context.summary.totalValuedValue, '900719925474099312345678.1234');
  assert.equal(JSON.stringify(input), before);
  assert.notEqual(output, received);
  await assert.rejects(
    () => invokePortfolioAiModelAdapter(registry, request({ model: undefined })),
    AiBoundaryValidationError,
  );
});

test('rejects malformed adapter output and provider/result conflicts without corrupting later invocation', async () => {
  const input = request();
  const malformedRegistry = new PortfolioAiModelProviderRegistry();
  malformedRegistry.register(
    adapter('provider-a', ['model-a'], async (value) => ({
      ...completed(value),
      portfolioId: 'bad',
    })),
  );
  await assert.rejects(
    () => invokePortfolioAiModelAdapter(malformedRegistry, input),
    AiBoundaryValidationError,
  );

  const mismatchRegistry = new PortfolioAiModelProviderRegistry();
  mismatchRegistry.register(
    adapter('provider-a', ['model-a'], async (value) => ({
      ...completed(value),
      executionId: 'other-execution',
    })),
  );
  await assert.rejects(
    () => invokePortfolioAiModelAdapter(mismatchRegistry, input),
    AiBoundaryValidationError,
  );

  const validRegistry = new PortfolioAiModelProviderRegistry();
  validRegistry.register(adapter('provider-a', ['model-a'], async (value) => completed(value)));
  assert.equal(
    (await invokePortfolioAiModelAdapter(validRegistry, input)).authority,
    'untrusted_model_execution',
  );
});
