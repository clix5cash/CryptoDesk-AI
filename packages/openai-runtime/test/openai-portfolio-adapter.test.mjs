import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiBoundaryValidationError,
  AiExecutionStatus,
  PortfolioAiModelProviderRegistry,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderExchange,
  createPortfolioAiProviderRequest,
  createPortfolioAiProviderResponse,
  invokePortfolioAiProviderAdapterBridge,
  mapPortfolioAiProviderRequest,
  normalizePortfolioAiProviderResponse,
  validatePortfolioAiProviderExchange,
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

function descriptor(model = { providerId: 'openai', modelId: 'explicit-model' }) {
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
      model,
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

function exchange(sourceDescriptor, result) {
  const providerResponse = createPortfolioAiProviderResponse(sourceDescriptor, result);
  const normalized = normalizePortfolioAiProviderResponse(sourceDescriptor, providerResponse);
  const providerExchange = createPortfolioAiProviderExchange(sourceDescriptor, normalized);
  validatePortfolioAiProviderExchange(providerExchange);
  return providerExchange;
}

test('closes concrete Completed and Failed exchanges with opaque output and contained credentials', async () => {
  const adversarial =
    '```json\n{"recommendation":"BUY BTC","trade":"SELL ETH","value":"900719925474099312345678.1234","candidateId":"candidate-looking"}\n```';
  const secret = 'closure-secret-never-exposed';
  const privateEndpoint = 'https://private-runtime.openai.test/v1/responses';
  let calls = 0;
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: secret, endpoint: privateEndpoint, timeoutMs: 50 },
    async () => {
      calls += 1;
      if (calls === 2) {
        return response(false, { error: { type: 'vendor_error', message: secret } }, 503);
      }
      return response(true, {
        status: 'completed',
        model: 'explicit-model',
        output: [{ content: [{ type: 'output_text', text: adversarial }] }],
      });
    },
  );
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register(adapter);
  const sourceDescriptor = descriptor();
  const before = JSON.stringify(sourceDescriptor);

  const completedRaw = await invokePortfolioAiProviderAdapterBridge(registry, sourceDescriptor);
  const completed = exchange(sourceDescriptor, completedRaw);
  const failedRaw = await invokePortfolioAiProviderAdapterBridge(registry, sourceDescriptor);
  const failed = exchange(sourceDescriptor, failedRaw);
  const laterRaw = await invokePortfolioAiProviderAdapterBridge(registry, sourceDescriptor);

  assert.equal(calls, 3);
  assert.equal(completed.status, AiExecutionStatus.Completed);
  assert.equal(completed.authority, 'untrusted_model_execution');
  assert.equal(completed.response.output, adversarial);
  assert.equal(completed.response.source.result.output, adversarial);
  assert.deepEqual(completed.model, sourceDescriptor.model);
  assert.equal(failed.status, AiExecutionStatus.Failed);
  assert.equal(failed.response.failure.code, 'provider_request_failed');
  assert.equal(failed.response.output, undefined);
  assert.deepEqual(failed.model, sourceDescriptor.model);
  assert.equal(laterRaw.output, adversarial);
  assert.equal(JSON.stringify(sourceDescriptor), before);
  for (const artifact of [completedRaw, completed, failedRaw, failed, laterRaw, registry.list()]) {
    const serialized = JSON.stringify(artifact);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes(privateEndpoint), false);
  }
});

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
  const sourceDescriptor = descriptor();
  const before = JSON.stringify(sourceDescriptor);

  const result = await invokePortfolioAiProviderAdapterBridge(registry, sourceDescriptor);

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(adapter).sort(), [
    'execute',
    'executeProviderRequest',
    'providerId',
  ]);
  assert.deepEqual(registry.list(), [{ providerId: 'openai' }]);
  assert.equal(calls[0].body.model, 'explicit-model');
  assert.deepEqual(JSON.parse(calls[0].body.input), sourceDescriptor.request.promptDocument);
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
  assert.equal(JSON.stringify(sourceDescriptor), before);
});

test('maps request-chain failures once and isolates the next descriptor invocation', async () => {
  let calls = 0;
  const secret = 'request-chain-secret';
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: secret, endpoint: 'https://api.openai.test/v1/responses' },
    async () => {
      calls += 1;
      if (calls === 1) return response(false, { error: { message: secret } }, 503);
      return response(true, {
        status: 'completed',
        model: 'explicit-model',
        output: [{ content: [{ type: 'output_text', text: 'Recovered opaque output.' }] }],
      });
    },
  );
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register(adapter);
  const sourceDescriptor = descriptor();

  const failed = await invokePortfolioAiProviderAdapterBridge(registry, sourceDescriptor);
  const completed = await invokePortfolioAiProviderAdapterBridge(registry, sourceDescriptor);

  assert.equal(calls, 2);
  assert.equal(failed.status, AiExecutionStatus.Failed);
  assert.equal(failed.failure.code, 'provider_request_failed');
  assert.deepEqual(failed.model, sourceDescriptor.model);
  assert.equal(JSON.stringify(failed).includes(secret), false);
  assert.equal(completed.status, AiExecutionStatus.Completed);
});

test('rejects malformed request-chain identity and arbitrary prompt bypass before transport', async () => {
  let calls = 0;
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: 'secret', endpoint: 'https://api.openai.test/v1/responses' },
    async () => {
      calls += 1;
      return response(true, {});
    },
  );
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register(adapter);
  const valid = descriptor();

  assert.throws(
    () =>
      invokePortfolioAiProviderAdapterBridge(registry, {
        ...valid,
        model: { providerId: 'openai', modelId: 'different-model' },
      }),
    AiBoundaryValidationError,
  );
  assert.throws(
    () =>
      invokePortfolioAiProviderAdapterBridge(registry, {
        ...valid,
        request: {
          ...valid.request,
          promptDocument: { ...valid.request.promptDocument, prompt: 'caller bypass' },
        },
      }),
    AiBoundaryValidationError,
  );
  const otherProvider = {
    ...valid,
    model: { providerId: 'other-provider', modelId: 'explicit-model' },
    request: {
      ...valid.request,
      model: { providerId: 'other-provider', modelId: 'explicit-model' },
    },
  };
  await assert.rejects(
    () => invokePortfolioAiProviderAdapterBridge(registry, otherProvider),
    AiBoundaryValidationError,
  );
  assert.equal(calls, 0);
});

test('keeps direct legacy execution-request callers compatible', async () => {
  const calls = [];
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: 'secret', endpoint: 'https://api.openai.test/v1/responses' },
    async (request) => {
      calls.push(request);
      return response(true, {
        status: 'completed',
        model: 'explicit-model',
        output: [{ content: [{ type: 'output_text', text: 'Legacy opaque output.' }] }],
      });
    },
  );
  const request = executionRequest();
  const result = await adapter.execute(request);

  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body.input), request.context);
  assert.equal(result.status, AiExecutionStatus.Completed);
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

  const registry = new PortfolioAiModelProviderRegistry();
  registry.register(adapter);
  const missingDescriptorModel = await invokePortfolioAiProviderAdapterBridge(
    registry,
    descriptor({ providerId: 'openai' }),
  );
  assert.equal(calls, 0);
  assert.deepEqual(missingDescriptorModel.model, { providerId: 'openai' });
  assert.equal(missingDescriptorModel.failure.code, 'model_required');
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

test('times out and aborts one attempt without retry or contamination', async () => {
  let calls = 0;
  let firstSignal;
  const secret = 'timeout-secret';
  const endpoint = 'https://private-endpoint.openai.test/v1/responses';
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: secret, endpoint, timeoutMs: 5 },
    async (request) => {
      calls += 1;
      if (calls === 1) {
        firstSignal = request.signal;
        return new Promise(() => {});
      }
      return response(true, {
        status: 'completed',
        model: 'explicit-model',
        output: [{ content: [{ type: 'output_text', text: 'Later opaque output.' }] }],
      });
    },
  );
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register(adapter);
  const sourceDescriptor = descriptor();
  const before = JSON.stringify(sourceDescriptor);

  const timedOut = await invokePortfolioAiProviderAdapterBridge(registry, sourceDescriptor);
  const completed = await invokePortfolioAiProviderAdapterBridge(registry, sourceDescriptor);

  assert.equal(calls, 2);
  assert.equal(firstSignal.aborted, true);
  assert.equal(timedOut.status, AiExecutionStatus.Failed);
  assert.equal(timedOut.failure.code, 'provider_timeout');
  assert.deepEqual(timedOut.model, sourceDescriptor.model);
  assert.equal(JSON.stringify(timedOut).includes(secret), false);
  assert.equal(JSON.stringify(timedOut).includes(endpoint), false);
  assert.equal(completed.status, AiExecutionStatus.Completed);
  assert.equal(JSON.stringify(sourceDescriptor), before);
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
    { apiKey: secret, endpoint: 'https://api.openai.test/v1/responses', timeoutMs: 0 },
    { apiKey: secret, endpoint: 'https://api.openai.test/v1/responses', timeoutMs: 1.5 },
  ]) {
    assert.throws(
      () => createOpenAiPortfolioModelProviderAdapter(configuration),
      (error) => error instanceof TypeError && !error.message.includes(secret),
    );
  }
});

test('rejects inherited runtime and vendor fields without retaining hostile failure data', async () => {
  const secret = 'prototype-secret-never-exposed';
  const endpoint = 'https://prototype-endpoint.openai.test/v1/responses';
  const inheritedConfiguration = Object.create({ apiKey: secret, endpoint });

  assert.throws(
    () => createOpenAiPortfolioModelProviderAdapter(inheritedConfiguration),
    (error) =>
      error instanceof TypeError &&
      !error.message.includes(secret) &&
      !error.message.includes(endpoint),
  );

  let calls = 0;
  const inheritedPayload = Object.create({
    status: 'completed',
    model: 'explicit-model',
    output: [{ content: [{ type: 'output_text', text: secret }] }],
  });
  const adapter = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: secret, endpoint },
    async () => {
      calls += 1;
      return response(
        true,
        calls === 1
          ? inheritedPayload
          : {
              status: 'completed',
              model: 'explicit-model',
              output: [{ content: [{ type: 'output_text', text: 'Isolated valid output.' }] }],
            },
      );
    },
  );

  const rejected = await adapter.execute(executionRequest());
  const recovered = await adapter.execute(executionRequest());

  assert.equal(calls, 2);
  assert.equal(rejected.status, AiExecutionStatus.Failed);
  assert.equal(rejected.failure.code, 'provider_response_invalid');
  assert.equal(JSON.stringify(rejected).includes(secret), false);
  assert.equal(JSON.stringify(rejected).includes(endpoint), false);
  assert.equal(recovered.status, AiExecutionStatus.Completed);
  assert.equal(recovered.output, 'Isolated valid output.');
});

test('keeps credentials and failure state isolated between runtime instances', async () => {
  const firstSecret = 'first-instance-secret';
  const secondSecret = 'second-instance-secret';
  const authorizations = [];
  const first = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: firstSecret, endpoint: 'https://first-runtime.openai.test/v1/responses' },
    async (request) => {
      authorizations.push(request.authorization);
      throw new Error(`${firstSecret}: vendor failure`);
    },
  );
  const second = createOpenAiPortfolioModelProviderAdapter(
    { apiKey: secondSecret, endpoint: 'https://second-runtime.openai.test/v1/responses' },
    async (request) => {
      authorizations.push(request.authorization);
      return response(true, {
        status: 'completed',
        model: 'explicit-model',
        output: [{ content: [{ type: 'output_text', text: 'Second instance output.' }] }],
      });
    },
  );

  const failed = await first.execute(executionRequest());
  const completed = await second.execute(executionRequest());

  assert.deepEqual(authorizations, [`Bearer ${firstSecret}`, `Bearer ${secondSecret}`]);
  assert.equal(failed.failure.code, 'provider_transport_failed');
  assert.equal(completed.status, AiExecutionStatus.Completed);
  assert.equal(completed.output, 'Second instance output.');
  for (const artifact of [first, second, failed, completed]) {
    assert.equal(JSON.stringify(artifact).includes(firstSecret), false);
    assert.equal(JSON.stringify(artifact).includes(secondSecret), false);
  }
});
