import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  createPortfolioAiProviderRequest,
  invokePortfolioAiProviderAdapterBridge,
  mapPortfolioAiProviderRequest,
} from '@cryptodesk-ai/ai';
import {
  RitualInferenceFailureKind,
  RitualInferenceStatus,
  createRitualPortfolioModelProviderAdapter,
} from '../dist/index.js';

function context() {
  const sectionId = JSON.stringify(['ritual-portfolio', 'overview']);
  return buildPortfolioAiContext({
    analysisId: 'ritual-analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'ritual-portfolio',
      capturedAt: '2026-09-06T00:00:00.000Z',
      asOf: '2026-09-06T00:00:00.000Z',
      currency: 'USD',
      totalValuedValue: '900719925474099312345678.123456789',
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

function descriptor(model = { providerId: 'ritual', modelId: 'explicit-model' }) {
  const builtContext = context();
  const input = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context: builtContext,
    factIds: [],
    sectionIds: builtContext.sections.map((section) => section.id),
  });
  return mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({
      executionId: 'ritual-execution',
      model,
      promptDocument: createPortfolioAiPromptDocument(createPortfolioAiMessagePlan(input)),
    }),
  );
}

function completed(invocation, output = 'opaque ritual output') {
  return {
    executionId: invocation.executionId,
    providerId: invocation.providerId,
    ...(invocation.modelId === undefined ? {} : { modelId: invocation.modelId }),
    targetId: invocation.targetId,
    status: RitualInferenceStatus.Completed,
    output,
  };
}

test('executes one injected Ritual attempt with exact identity and opaque untrusted output', async () => {
  const calls = [];
  const source = descriptor();
  const before = JSON.stringify(source);
  const rawOutput = '{"recommendation":"BUY","canonicalValue":"999","secret":"raw-looking-only"}';
  const adapter = createRitualPortfolioModelProviderAdapter(
    { targetId: 'injected-target' },
    async (invocation) => {
      calls.push(invocation);
      return completed(invocation, rawOutput);
    },
  );
  const registry = new PortfolioAiModelProviderRegistry();
  registry.register(adapter);

  const result = await invokePortfolioAiProviderAdapterBridge(registry, source);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].executionId, source.executionId);
  assert.equal(calls[0].providerId, 'ritual');
  assert.equal(calls[0].modelId, 'explicit-model');
  assert.equal(calls[0].targetId, 'injected-target');
  assert.deepEqual(JSON.parse(calls[0].payload), source.request.promptDocument);
  assert.deepEqual(result, {
    executionId: source.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output: rawOutput,
    model: { providerId: 'ritual', modelId: 'explicit-model' },
  });
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(registry.list(), [{ providerId: 'ritual' }]);
});

test('preserves optional model identity through the legacy execution seam', async () => {
  let received;
  const adapter = createRitualPortfolioModelProviderAdapter(
    { targetId: 'optional-model-target' },
    async (invocation) => {
      received = invocation;
      return completed(invocation);
    },
  );

  const result = await adapter.execute({
    executionId: 'optional-model-execution',
    context: context(),
    model: { providerId: 'ritual' },
  });

  assert.equal(received.modelId, undefined);
  assert.deepEqual(result.model, { providerId: 'ritual' });
  assert.equal(result.executionId, 'optional-model-execution');
});

test('maps terminal and thrown failures deterministically without runtime detail leakage', async () => {
  const secret = 'ritual-secret-never-exposed';
  const privateTarget = 'private-runtime-target';
  const outcomes = [
    async (invocation) => ({
      executionId: invocation.executionId,
      providerId: invocation.providerId,
      modelId: invocation.modelId,
      targetId: invocation.targetId,
      status: RitualInferenceStatus.Failed,
      failureKind: RitualInferenceFailureKind.RuntimeFailure,
    }),
    async (invocation) => ({
      executionId: invocation.executionId,
      providerId: invocation.providerId,
      modelId: invocation.modelId,
      targetId: invocation.targetId,
      status: RitualInferenceStatus.Failed,
      failureKind: RitualInferenceFailureKind.Timeout,
    }),
    async () => {
      throw new Error(`${secret} at ${privateTarget}`);
    },
  ];
  const expected = ['ritual_execution_failed', 'ritual_timeout', 'ritual_invocation_failed'];

  for (const [index, invoke] of outcomes.entries()) {
    let calls = 0;
    const adapter = createRitualPortfolioModelProviderAdapter(
      { targetId: privateTarget },
      async (invocation) => {
        calls += 1;
        return invoke(invocation);
      },
    );
    const result = await adapter.execute({
      executionId: 'failed-execution',
      context: context(),
      model: { providerId: 'ritual', modelId: 'explicit-model' },
    });

    assert.equal(calls, 1);
    assert.equal(result.status, AiExecutionStatus.Failed);
    assert.equal(result.failure.code, expected[index]);
    assert.equal(result.authority, PortfolioAiRawExecutionAuthority.UntrustedModelExecution);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(result).includes(privateTarget), false);
  }
});

test('fails closed for malformed, incomplete, and substituted runtime results, then recovers', async () => {
  const results = [];
  let calls = 0;
  const adapter = createRitualPortfolioModelProviderAdapter(
    { targetId: 'isolated-target' },
    async (invocation) => {
      calls += 1;
      const next = results.shift();
      return typeof next === 'function' ? next(invocation) : next;
    },
  );
  const request = {
    executionId: 'isolated-execution',
    context: context(),
    model: { providerId: 'ritual', modelId: 'explicit-model' },
  };
  results.push(
    { status: RitualInferenceStatus.Completed },
    (invocation) => Object.assign(Object.create({ inherited: 'secret' }), completed(invocation)),
    (invocation) => ({ ...completed(invocation), failureKind: undefined }),
    (invocation) => ({
      executionId: invocation.executionId,
      providerId: invocation.providerId,
      modelId: invocation.modelId,
      targetId: invocation.targetId,
      status: RitualInferenceStatus.Failed,
      failureKind: RitualInferenceFailureKind.RuntimeFailure,
      output: undefined,
    }),
    (invocation) => ({ ...completed(invocation), executionId: 'substituted-execution' }),
    (invocation) => ({ ...completed(invocation), internalReceipt: 'secret-receipt' }),
    (invocation) => completed(invocation, 'later valid output'),
  );

  const malformed = await adapter.execute(request);
  const prototypeShaped = await adapter.execute(request);
  const mixedCompleted = await adapter.execute(request);
  const mixedFailed = await adapter.execute(request);
  const substituted = await adapter.execute(request);
  const injected = await adapter.execute(request);
  const valid = await adapter.execute(request);

  assert.equal(calls, 7);
  assert.equal(malformed.failure.code, 'ritual_result_invalid');
  assert.equal(prototypeShaped.failure.code, 'ritual_result_invalid');
  assert.equal(mixedCompleted.failure.code, 'ritual_result_invalid');
  assert.equal(mixedFailed.failure.code, 'ritual_result_invalid');
  assert.equal(substituted.failure.code, 'ritual_identity_mismatch');
  assert.equal(injected.failure.code, 'ritual_result_invalid');
  assert.equal(valid.status, AiExecutionStatus.Completed);
  assert.equal(valid.output, 'later valid output');
  assert.equal(JSON.stringify(injected).includes('secret-receipt'), false);
});

test('validates direct execution and configuration as closed plain records before invocation', async () => {
  const invalidConfigurations = [
    undefined,
    {},
    { targetId: '' },
    { targetId: 'target', extra: true },
    Object.create({ targetId: 'inherited-target' }),
    Object.assign(Object.create(null), { targetId: 'prototype-less-target' }),
  ];
  for (const configuration of invalidConfigurations) {
    assert.throws(
      () => createRitualPortfolioModelProviderAdapter(configuration, async () => undefined),
      (error) =>
        error instanceof TypeError && error.message === 'Ritual runtime configuration is invalid.',
    );
  }
  assert.throws(
    () => createRitualPortfolioModelProviderAdapter({ targetId: 'target' }, undefined),
    (error) => error instanceof TypeError && error.message === 'Ritual runtime invoker is invalid.',
  );

  let calls = 0;
  const adapter = createRitualPortfolioModelProviderAdapter(
    { targetId: 'closed-target' },
    async (invocation) => {
      calls += 1;
      return completed(invocation);
    },
  );
  const valid = {
    executionId: 'closed-execution',
    context: context(),
    model: { providerId: 'ritual', modelId: 'closed-model' },
  };
  const invalidRequests = [
    { ...valid, executionId: '' },
    { ...valid, unexpected: 'secret-looking-runtime-detail' },
    Object.assign(Object.create({ inherited: true }), valid),
    { ...valid, model: { ...valid.model, prototype: 'injected' } },
  ];
  for (const request of invalidRequests) {
    await assert.rejects(() => adapter.execute(request), AiBoundaryValidationError);
  }
  assert.equal(calls, 0);
});

test('keeps configuration, invocation, result, and failure state isolated between instances', async () => {
  const calls = { first: 0, second: 0 };
  const first = createRitualPortfolioModelProviderAdapter(
    { targetId: 'first-target' },
    async (invocation) => {
      calls.first += 1;
      throw new Error(`secret for ${invocation.targetId}`);
    },
  );
  const second = createRitualPortfolioModelProviderAdapter(
    { targetId: 'second-target' },
    async (invocation) => {
      calls.second += 1;
      return completed(invocation, 'second-instance-output');
    },
  );
  const request = {
    executionId: 'instance-execution',
    context: context(),
    model: { providerId: 'ritual', modelId: 'instance-model' },
  };

  const failed = await first.execute(request);
  const succeeded = await second.execute(request);

  assert.equal(calls.first, 1);
  assert.equal(calls.second, 1);
  assert.equal(failed.failure.code, 'ritual_invocation_failed');
  assert.equal(JSON.stringify(failed).includes('first-target'), false);
  assert.equal(succeeded.status, AiExecutionStatus.Completed);
  assert.equal(succeeded.output, 'second-instance-output');
});

test('detaches configuration, invocation input, and results across equivalent calls', async () => {
  const configuration = { targetId: 'original-target' };
  const invocations = [];
  const adapter = createRitualPortfolioModelProviderAdapter(configuration, async (invocation) => {
    invocations.push(structuredClone(invocation));
    invocation.targetId = 'mutated-by-invoker';
    return completed(invocations.at(-1), 'stable output');
  });
  configuration.targetId = 'mutated-by-caller';
  const request = {
    executionId: 'detached-execution',
    context: context(),
    model: { providerId: 'ritual', modelId: 'explicit-model' },
  };

  const first = await adapter.execute(request);
  first.model.providerId = 'mutated-result';
  const second = await adapter.execute(request);

  assert.equal(invocations.length, 2);
  assert.equal(invocations[0].targetId, 'original-target');
  assert.deepEqual(invocations[0], invocations[1]);
  assert.equal(second.model.providerId, 'ritual');
  assert.equal(second.output, 'stable output');
});

test('settles against a pre-dispatch identity snapshot despite caller mutation while pending', async () => {
  let release;
  let observedInvocation;
  const adapter = createRitualPortfolioModelProviderAdapter(
    { targetId: 'settlement-target' },
    async (invocation) => {
      observedInvocation = structuredClone(invocation);
      return new Promise((resolve) => {
        release = () => resolve(completed(observedInvocation, 'settled output'));
      });
    },
  );
  const request = {
    executionId: 'settlement-execution',
    context: context(),
    model: { providerId: 'ritual', modelId: 'settlement-model' },
  };

  const pending = adapter.execute(request);
  request.executionId = 'caller-mutated-execution';
  request.model.providerId = 'caller-mutated-provider';
  request.model.modelId = 'caller-mutated-model';
  release();
  const result = await pending;

  assert.equal(observedInvocation.executionId, 'settlement-execution');
  assert.deepEqual(observedInvocation.modelId, 'settlement-model');
  assert.equal(result.executionId, 'settlement-execution');
  assert.deepEqual(result.model, { providerId: 'ritual', modelId: 'settlement-model' });
  assert.equal(result.output, 'settled output');
});

test('recovers cleanly after every lifecycle failure class', async () => {
  const failures = [
    (invocation) => ({
      executionId: invocation.executionId,
      providerId: invocation.providerId,
      modelId: invocation.modelId,
      targetId: invocation.targetId,
      status: RitualInferenceStatus.Failed,
      failureKind: RitualInferenceFailureKind.Timeout,
    }),
    () => {
      throw new Error('secret transport failure');
    },
    () => ({ status: RitualInferenceStatus.Completed }),
    (invocation) => ({ ...completed(invocation), executionId: 'stale-execution' }),
    (invocation) => ({ ...completed(invocation), targetId: 'wrong-target' }),
    (invocation) => Object.assign(Object.create({ inherited: true }), completed(invocation)),
  ];
  let calls = 0;
  let behavior;
  const adapter = createRitualPortfolioModelProviderAdapter(
    { targetId: 'recovery-target' },
    async (invocation) => {
      calls += 1;
      return behavior(invocation);
    },
  );
  const request = {
    executionId: 'recovery-execution',
    context: context(),
    model: { providerId: 'ritual', modelId: 'recovery-model' },
  };

  await assert.rejects(
    () => adapter.execute({ ...request, unexpected: true }),
    AiBoundaryValidationError,
  );
  behavior = (invocation) => completed(invocation, 'clean recovery');
  assert.equal((await adapter.execute(request)).status, AiExecutionStatus.Completed);

  for (const failure of failures) {
    behavior = failure;
    const failed = await adapter.execute(request);
    assert.equal(failed.status, AiExecutionStatus.Failed);

    behavior = (invocation) => completed(invocation, 'clean recovery');
    const recovered = await adapter.execute(request);
    assert.equal(recovered.status, AiExecutionStatus.Completed);
    assert.equal(recovered.output, 'clean recovery');
  }

  assert.equal(calls, failures.length * 2 + 1);
});

test('keeps the injected Ritual inference path network-free, root-contained, and inward-dependent', async () => {
  const [manifest, adapterSource, transportSource] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/ritual-portfolio-adapter.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/ritual-inference-transport.ts', import.meta.url), 'utf8'),
  ]);

  assert.deepEqual(Object.keys(manifest.exports), ['.']);
  assert.deepEqual(manifest.dependencies, { '@cryptodesk-ai/ai': 'workspace:*' });
  assert.equal(manifest.private, true);
  assert.equal(
    /process\.env|fetch\(|http\(|createWallet|privateKey|setTimeout|while\s*\(/iu.test(
      `${adapterSource}\n${transportSource}`,
    ),
    false,
  );
  await assert.rejects(
    () => import('@cryptodesk-ai/ritual-gateway/ritual-portfolio-adapter'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
  await assert.rejects(
    () => import('@cryptodesk-ai/ritual-gateway/ritual-inference-transport'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
  await assert.rejects(
    () => import('@cryptodesk-ai/ritual-gateway/ritual-live-rpc-connectivity'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
});
