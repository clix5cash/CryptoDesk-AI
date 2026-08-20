import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiExecutionStatus,
  PortfolioAiModelProviderRegistry,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderRequest,
  invokePortfolioAiProviderAdapterBridge,
  mapPortfolioAiProviderRequest,
} from '@cryptodesk-ai/ai';
import { createOpenAiPortfolioModelProviderAdapter } from '../dist/index.js';

function context() {
  const sectionId = JSON.stringify(['runtime-portfolio', 'overview']);
  return buildPortfolioAiContext({
    analysisId: 'runtime-analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'runtime-portfolio',
      capturedAt: '2026-08-20T00:00:00.000Z',
      asOf: '2026-08-20T00:00:00.000Z',
      currency: 'USD',
      totalValuedValue: '9007199254740993.123456',
      coverage: {
        state: 'complete',
        valuation: {
          totalPositionCount: 0,
          valuedPositionCount: 0,
          unvaluedPositionCount: 0,
          valuedPositionCoveragePercentage: '100',
          unvaluedReasons: [],
        },
      },
      items: [],
      sections: [{ id: sectionId, section: 'overview', itemIds: [] }],
    },
  });
}

function executionRequest(model = { providerId: 'openai', modelId: 'explicit-model' }) {
  return { executionId: 'runtime-execution', context: context(), model };
}

function descriptor() {
  const builtContext = context();
  const input = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context: builtContext,
    factIds: [],
    sectionIds: builtContext.sections.map((section) => section.id),
  });
  const promptDocument = createPortfolioAiPromptDocument(createPortfolioAiMessagePlan(input));
  return mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({
      executionId: 'runtime-execution',
      model: { providerId: 'openai', modelId: 'explicit-model' },
      promptDocument,
    }),
  );
}

function response(ok, payload, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test('implements the existing adapter seam and maps one Completed response neutrally', async () => {
  const calls = [];
  const secret = 'credential-must-stay-runtime-only';
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: secret, endpoint: 'https://api.openai.test/v1/responses' },
    async (request) => {
      calls.push(request);
      return response(true, {
        status: 'completed',
        model: 'explicit-model',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Opaque output.' }] }],
        usage: { input_tokens: 17, output_tokens: 3 },
      });
    },
  );
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register(adapter);

  const result = await invokePortfolioAiProviderAdapterBridge(registry, descriptor());

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(adapter).sort(), ['execute', 'providerId']);
  assert.deepEqual(registry.list(), [{ providerId: 'openai' }]);
  assert.equal(calls[0].body.model, 'explicit-model');
  assert.equal(JSON.parse(calls[0].body.input).summary.totalValuedValue, '9007199254740993.123456');
  assert.equal(calls[0].authorization, `Bearer ${secret}`);
  assert.deepEqual(result, {
    executionId: 'runtime-execution',
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: 'Opaque output.',
    model: { providerId: 'openai', modelId: 'explicit-model' },
    usage: { inputUnits: 17, outputUnits: 3 },
  });
  assert.equal(JSON.stringify(adapter).includes(secret), false);
  assert.equal(JSON.stringify(registry.list()).includes(secret), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('maps HTTP, malformed response, and thrown transport failures without credential leakage', async () => {
  const secret = 'failure-secret';
  for (const [transport, code] of [
    [async () => response(false, { error: { message: secret } }, 401), 'provider_request_failed'],
    [
      async () => response(true, { status: 'completed', model: 'explicit-model', output: [] }),
      'provider_response_invalid',
    ],
    [
      async () => {
        throw new Error(secret);
      },
      'provider_transport_failed',
    ],
  ]) {
    const adapter = createOpenAiPortfolioModelProviderAdapter(
      { apiKey: secret, endpoint: 'https://api.openai.test/v1/responses' },
      transport,
    );
    const result = await adapter.execute(executionRequest());
    assert.equal(result.status, AiExecutionStatus.Failed);
    assert.equal(result.authority, 'untrusted_model_execution');
    assert.equal(result.failure.code, code);
    assert.deepEqual(result.model, { providerId: 'openai', modelId: 'explicit-model' });
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('preserves optional model identity and never defaults or repairs identity', async () => {
  let calls = 0;
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: 'secret', endpoint: 'https://api.openai.test/v1/responses' },
    async () => {
      calls += 1;
      return response(true, {});
    },
  );

  const missingModel = await adapter.execute(executionRequest({ providerId: 'openai' }));
  const wrongProvider = await adapter.execute(
    executionRequest({ providerId: 'another-provider', modelId: 'explicit-model' }),
  );

  assert.equal(calls, 0);
  assert.deepEqual(missingModel.model, { providerId: 'openai' });
  assert.equal(missingModel.failure.code, 'model_required');
  assert.deepEqual(wrongProvider.model, {
    providerId: 'another-provider',
    modelId: 'explicit-model',
  });
  assert.equal(wrongProvider.failure.code, 'provider_identity_mismatch');
});

test('is deterministic across equivalent calls and isolates a failed call from the next call', async () => {
  let calls = 0;
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: 'secret', endpoint: 'https://api.openai.test/v1/responses' },
    async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient but not retried');
      return response(true, {
        status: 'completed',
        model: 'explicit-model',
        output: [{ content: [{ type: 'output_text', text: 'Same opaque output.' }] }],
      });
    },
  );
  const request = executionRequest();
  const before = JSON.stringify(request);

  const failed = await adapter.execute(request);
  const completed = await adapter.execute(request);
  const repeated = await adapter.execute(request);

  assert.equal(calls, 3);
  assert.equal(failed.status, AiExecutionStatus.Failed);
  assert.deepEqual(completed, repeated);
  assert.equal(JSON.stringify(request), before);
});

test('fails closed on incomplete or conflicting vendor model identity', async () => {
  for (const [payload, code] of [
    [{ status: 'incomplete', model: 'explicit-model' }, 'provider_response_incomplete'],
    [
      { status: 'completed', model: 'substituted-model', output: [] },
      'provider_model_identity_mismatch',
    ],
  ]) {
    const adapter = createOpenAiPortfolioModelProviderAdapter(
      { apiKey: 'secret', endpoint: 'https://api.openai.test/v1/responses' },
      async () => response(true, payload),
    );
    const result = await adapter.execute(executionRequest());
    assert.equal(result.status, AiExecutionStatus.Failed);
    assert.equal(result.failure.code, code);
    assert.deepEqual(result.model, { providerId: 'openai', modelId: 'explicit-model' });
  }
});

test('rejects invalid runtime configuration without echoing credentials', () => {
  const secret = 'invalid-config-secret';
  for (const configuration of [
    { apiKey: secret, endpoint: 'http://api.openai.test/v1/responses' },
    { apiKey: '', endpoint: 'https://api.openai.test/v1/responses' },
    { apiKey: secret, endpoint: 'not-a-url' },
  ]) {
    assert.throws(
      () => createOpenAiPortfolioModelProviderAdapter(configuration),
      (error) => error instanceof TypeError && !error.message.includes(secret),
    );
  }
});
