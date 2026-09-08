import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AiExecutionStatus,
  PortfolioAiRawExecutionAuthority,
  PortfolioAiTask,
  buildPortfolioAiContext,
  createPortfolioAiMessagePlan,
  createPortfolioAiModelInput,
  createPortfolioAiPromptDocument,
  createPortfolioAiProviderRequest,
  mapPortfolioAiProviderRequest,
  validatePortfolioAiModelExecutionResult,
} from '@cryptodesk-ai/ai';
import {
  RitualLiveInferenceCapabilityFailureKind,
  createRitualLiveInferenceInvoker,
} from '../dist/index.js';

function descriptor(model = { providerId: 'ritual', modelId: 'model-1' }) {
  const sectionId = JSON.stringify(['portfolio', 'overview']);
  const context = buildPortfolioAiContext({
    analysisId: 'analysis',
    task: PortfolioAiTask.Interpret,
    payload: {
      schemaVersion: '1',
      portfolioId: 'portfolio',
      capturedAt: '2026-09-08T00:00:00.000Z',
      asOf: '2026-09-08T00:00:00.000Z',
      currency: 'USD',
      totalValuedValue: '1',
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
  const input = createPortfolioAiModelInput({
    task: PortfolioAiTask.Interpret,
    context,
    factIds: [],
    sectionIds: [sectionId],
  });
  return mapPortfolioAiProviderRequest(
    createPortfolioAiProviderRequest({
      executionId: 'execution-1',
      model,
      promptDocument: createPortfolioAiPromptDocument(createPortfolioAiMessagePlan(input)),
    }),
  );
}

function request(overrides = {}) {
  return {
    inferenceRequestId: 'inference-1',
    targetId: 'target-1',
    descriptor: descriptor(),
    ...overrides,
  };
}

function configuration(overrides = {}) {
  return {
    providerId: 'ritual',
    expectedChainId: 1979,
    targetId: 'target-1',
    signerId: 'signer-1',
    ...overrides,
  };
}

function harness(overrides = {}, config = configuration()) {
  const calls = {
    signingAuthorization: [],
    signing: [],
    submissionAuthorization: [],
    submission: [],
    settlement: [],
    inference: [],
  };
  const capabilities = {
    authorizeSigning: async (input) => {
      calls.signingAuthorization.push(structuredClone(input));
      return { status: 'authorized', ...input };
    },
    sign: async (input) => {
      calls.signing.push(structuredClone(input));
      return {
        status: 'signed',
        signingRequestId: input.signingRequestId,
        signerId: input.signerId,
        signedPayload: 'opaque-signed',
      };
    },
    authorizeSubmission: async (input) => {
      calls.submissionAuthorization.push(structuredClone(input));
      return { status: 'authorized', ...input };
    },
    submit: async (input) => {
      calls.submission.push(structuredClone(input));
      return {
        status: 'submitted',
        executionId: input.executionId,
        submissionId: `submission-${input.executionId}`,
      };
    },
    observeSettlement: async (input) => {
      calls.settlement.push(structuredClone(input));
      return { status: 'settled', ...input };
    },
    invokeInference: async (input) => {
      calls.inference.push(structuredClone(input));
      return {
        status: 'completed',
        inferenceRequestId: input.inferenceRequestId,
        executionId: input.executionId,
        providerId: input.providerId,
        ...(input.modelId === undefined ? {} : { modelId: input.modelId }),
        targetId: input.targetId,
        output: 'opaque-output',
      };
    },
    ...overrides,
  };
  return { invoker: createRitualLiveInferenceInvoker(config, capabilities), calls };
}

test('runs the one explicit 10D-to-inference path with exact identity and untrusted output', async () => {
  const { invoker, calls } = harness();
  const source = request();
  const result = await invoker.execute(source);
  assert.deepEqual(
    Object.fromEntries(Object.entries(calls).map(([key, value]) => [key, value.length])),
    {
      signingAuthorization: 1,
      signing: 1,
      submissionAuthorization: 1,
      submission: 1,
      settlement: 1,
      inference: 1,
    },
  );
  assert.deepEqual(calls.inference[0], {
    inferenceRequestId: 'inference-1',
    executionId: 'execution-1',
    providerId: 'ritual',
    modelId: 'model-1',
    targetId: 'target-1',
    submissionId: 'submission-execution-1',
    payload: JSON.stringify(source.descriptor.request.promptDocument),
  });
  assert.equal(result.authority, PortfolioAiRawExecutionAuthority.UntrustedModelExecution);
  assert.equal(result.status, AiExecutionStatus.Completed);
  validatePortfolioAiModelExecutionResult(
    {
      executionId: 'execution-1',
      context: source.descriptor.request.promptDocument.plan.input.context,
      model: source.descriptor.model,
    },
    result,
  );
});

test('invokes inference zero times when mapping, signing, submission, or settlement fails', async () => {
  const scenarios = [
    { request: request({ descriptor: descriptor({ providerId: 'other' }) }), rejected: true },
    { override: { authorizeSigning: async () => ({ status: 'denied' }) } },
    {
      override: {
        sign: async (input) => ({
          status: 'failed',
          signingRequestId: input.signingRequestId,
          signerId: input.signerId,
          failureKind: 'signer_failure',
        }),
      },
    },
    { override: { authorizeSubmission: async () => ({ status: 'denied' }) } },
    {
      override: {
        submit: async () => {
          throw new Error('secret');
        },
      },
    },
    { override: { observeSettlement: async (input) => ({ status: 'failed', ...input }) } },
  ];
  for (const scenario of scenarios) {
    let inference = 0;
    const { invoker } = harness({
      ...scenario.override,
      invokeInference: async () => {
        inference += 1;
        return {};
      },
    });
    if (scenario.rejected)
      await assert.rejects(() => invoker.execute(scenario.request), /mapping/u);
    else assert.equal((await invoker.execute(request())).status, 'failed');
    assert.equal(inference, 0);
  }
});

test('performs one inference attempt and sanitizes failure, malformed, and substituted results', async () => {
  const secret = 'provider-secret endpoint-secret stack-secret';
  const outcomes = [
    async () => {
      throw new Error(secret);
    },
    async () => ({ status: 'completed' }),
    async (input) => ({
      status: 'completed',
      inferenceRequestId: input.inferenceRequestId,
      executionId: 'other',
      providerId: input.providerId,
      modelId: input.modelId,
      targetId: input.targetId,
      output: secret,
    }),
    async (input) => ({
      status: 'failed',
      inferenceRequestId: input.inferenceRequestId,
      executionId: input.executionId,
      providerId: input.providerId,
      modelId: input.modelId,
      targetId: input.targetId,
      failureKind: RitualLiveInferenceCapabilityFailureKind.InvocationFailed,
    }),
  ];
  for (const outcome of outcomes) {
    let attempts = 0;
    const { invoker } = harness({
      invokeInference: async (input) => {
        attempts += 1;
        return outcome(input);
      },
    });
    const result = await invoker.execute(request());
    assert.equal(attempts, 1);
    assert.equal(result.status, 'failed');
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('makes inference timeout terminal and ignores late completion without retry', async () => {
  let attempts = 0;
  let resolveInference;
  const { invoker } = harness(
    {
      invokeInference: () => {
        attempts += 1;
        return new Promise((resolve) => {
          resolveInference = resolve;
        });
      },
    },
    configuration({ inferenceTimeoutMs: 5 }),
  );
  const result = await invoker.execute(request());
  assert.equal(result.failure.code, 'ritual_inference_timeout');
  assert.equal(attempts, 1);
  resolveInference({
    status: 'completed',
    inferenceRequestId: 'inference-1',
    executionId: 'execution-1',
    providerId: 'ritual',
    modelId: 'model-1',
    targetId: 'target-1',
    output: 'late',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 1);
});

test('snapshots pending input and isolates concurrent calls, instances, and recovery', async () => {
  const pending = [];
  const { invoker } = harness({
    authorizeSigning: (input) => new Promise((resolve) => pending.push({ input, resolve })),
  });
  const a = request({ inferenceRequestId: 'a' });
  const b = request({ inferenceRequestId: 'b', descriptor: descriptor({ providerId: 'ritual' }) });
  b.descriptor.executionId = 'execution-b';
  b.descriptor.request.executionId = 'execution-b';
  const operationA = invoker.execute(a);
  const operationB = invoker.execute(b);
  a.inferenceRequestId = 'mutated';
  pending[1].resolve({ status: 'authorized', ...pending[1].input });
  pending[0].resolve({ status: 'authorized', ...pending[0].input });
  const [resultA, resultB] = await Promise.all([operationA, operationB]);
  assert.deepEqual([resultA.executionId, resultB.executionId], ['execution-1', 'execution-b']);
  resultA.output = 'mutated-result';
  assert.equal((await harness().invoker.execute(request())).output, 'opaque-output');
});

test('isolates concurrent inference success, failure, and timeout and then recovers', async () => {
  const { invoker } = harness(
    {
      invokeInference: async (input) => {
        if (input.inferenceRequestId === 'timeout') return new Promise(() => {});
        if (input.inferenceRequestId === 'failure') {
          return {
            status: 'failed',
            inferenceRequestId: input.inferenceRequestId,
            executionId: input.executionId,
            providerId: input.providerId,
            modelId: input.modelId,
            targetId: input.targetId,
            failureKind: RitualLiveInferenceCapabilityFailureKind.InvocationFailed,
          };
        }
        return {
          status: 'completed',
          inferenceRequestId: input.inferenceRequestId,
          executionId: input.executionId,
          providerId: input.providerId,
          modelId: input.modelId,
          targetId: input.targetId,
          output: `output-${input.inferenceRequestId}`,
        };
      },
    },
    configuration({ inferenceTimeoutMs: 5 }),
  );
  const [success, failure, timeout] = await Promise.all([
    invoker.execute(request({ inferenceRequestId: 'success' })),
    invoker.execute(request({ inferenceRequestId: 'failure' })),
    invoker.execute(request({ inferenceRequestId: 'timeout' })),
  ]);
  assert.equal(success.output, 'output-success');
  assert.equal(failure.failure.code, 'ritual_inference_failed');
  assert.equal(timeout.failure.code, 'ritual_inference_timeout');
  assert.equal(
    (await invoker.execute(request({ inferenceRequestId: 'recovery' }))).output,
    'output-recovery',
  );
});

test('validates closed configuration/capabilities and keeps invocation internals root-contained', async () => {
  const validCapabilities = harness().invoker;
  assert.ok(validCapabilities);
  for (const config of [
    configuration({ providerId: 'other' }),
    configuration({ expectedChainId: 1 }),
    configuration({ inferenceTimeoutMs: 0 }),
    configuration({ inferenceTimeoutMs: 2_147_483_648 }),
    { ...configuration(), extra: true },
  ]) {
    assert.throws(() => createRitualLiveInferenceInvoker(config, {}), /configuration/u);
  }
  assert.throws(() => createRitualLiveInferenceInvoker(configuration(), {}), /capabilities/u);
  const root = await import('../dist/index.js');
  assert.equal(typeof root.createRitualLiveInferenceInvoker, 'function');
  await assert.rejects(
    () => import('@cryptodesk-ai/ritual-gateway/ritual-live-inference-invocation'),
  );
  const declaration = await readFile(
    new URL('../dist/ritual-live-inference-invocation.d.ts', import.meta.url),
    'utf8',
  );
  const text = declaration.replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.equal(
    /privateKey|mnemonic|wallet|endpoint|header|receipt|AbortController|JsonRpc|precompile|\babi\b|selector/u.test(
      text,
    ),
    false,
  );
});
