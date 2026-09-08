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
  RitualInferenceResultRetrievalFailureKind,
  createRitualInferenceResultVerifier,
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
    mappingRequest: {
      inferenceRequestId: 'inference-1',
      targetId: 'target-1',
      descriptor: descriptor(),
    },
    submissionId: 'submission-1',
    settlementId: 'settlement-1',
    invocationId: 'invocation-1',
    ...overrides,
  };
}

function identity(overrides = {}) {
  return {
    inferenceRequestId: 'inference-1',
    executionId: 'execution-1',
    providerId: 'ritual',
    modelId: 'model-1',
    targetId: 'target-1',
    submissionId: 'submission-1',
    settlementId: 'settlement-1',
    invocationId: 'invocation-1',
    ...overrides,
  };
}

function harness(overrides = {}, configuration = {}) {
  const calls = { retrieve: [], verify: [] };
  const capabilities = {
    retrieveResult: async (input) => {
      calls.retrieve.push(structuredClone(input));
      return {
        status: 'completed',
        ...input,
        provenanceId: 'provenance-1',
        output: '{"candidates":[]}',
      };
    },
    verifyProvenance: async (input) => {
      calls.verify.push(structuredClone(input));
      return { status: 'verified', ...input };
    },
    ...overrides,
  };
  return {
    calls,
    verifier: createRitualInferenceResultVerifier(
      { providerId: 'ritual', targetId: 'target-1', ...configuration },
      capabilities,
    ),
  };
}

test('retrieves once, verifies exact lifecycle provenance once, and maps untrusted output', async () => {
  const { verifier, calls } = harness();
  const source = request();
  const before = structuredClone(source);
  const result = await verifier.verify(source);

  assert.deepEqual(calls.retrieve, [identity()]);
  assert.deepEqual(calls.verify, [{ ...identity(), provenanceId: 'provenance-1' }]);
  assert.equal(result.status, AiExecutionStatus.Completed);
  assert.equal(result.authority, PortfolioAiRawExecutionAuthority.UntrustedModelExecution);
  assert.equal(result.output, '{"candidates":[]}');
  assert.deepEqual(source, before);
  validatePortfolioAiModelExecutionResult(
    {
      executionId: 'execution-1',
      context: request().mappingRequest.descriptor.request.promptDocument.plan.input.context,
      model: request().mappingRequest.descriptor.model,
    },
    result,
  );
});

test('isolates concurrent success, failure, and timeout settlements', async () => {
  const { verifier, calls } = harness(
    {
      retrieveResult: async (input) => {
        calls.retrieve.push(structuredClone(input));
        if (input.submissionId === 'failed') {
          return {
            status: 'failed',
            ...input,
            failureKind: RitualInferenceResultRetrievalFailureKind.RetrievalFailed,
          };
        }
        if (input.submissionId === 'slow') {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return {
          status: 'completed',
          ...input,
          provenanceId: `provenance-${input.submissionId}`,
          output: input.submissionId,
        };
      },
    },
    { timeoutMs: 5 },
  );
  const [success, failed, timedOut] = await Promise.all([
    verifier.verify(request({ submissionId: 'success' })),
    verifier.verify(request({ submissionId: 'failed' })),
    verifier.verify(request({ submissionId: 'slow' })),
  ]);
  assert.equal(success.status, AiExecutionStatus.Completed);
  assert.equal(failed.failure.code, 'ritual_result_retrieval_failed');
  assert.equal(timedOut.failure.code, 'ritual_result_retrieval_timeout');
  assert.equal(calls.retrieve.length, 3);
  assert.equal(calls.verify.length, 1);
});

test('fails closed for malformed requests, identities, closed records, and hostile prototypes', async () => {
  const { verifier, calls } = harness();
  for (const invalid of [
    { ...request(), extra: true },
    { ...request(), submissionId: '' },
    Object.assign(Object.create({ inherited: true }), request()),
    { ...request(), mappingRequest: { ...request().mappingRequest, targetId: 'other' } },
  ]) {
    await assert.rejects(() => verifier.verify(invalid), /invalid/);
  }
  assert.equal(calls.retrieve.length, 0);
});

test('rejects substituted lifecycle identity, malformed terminals, and invalid provenance', async () => {
  for (const mutate of [
    (value) => ({ ...value, executionId: 'stale' }),
    (value) => ({ ...value, providerId: 'other' }),
    (value) => ({ ...value, modelId: 'other' }),
    (value) => ({ ...value, targetId: 'other' }),
    (value) => ({ ...value, submissionId: 'other' }),
    (value) => ({ ...value, settlementId: 'other' }),
    (value) => ({ ...value, invocationId: 'other' }),
    (value) => ({ ...value, inferenceRequestId: 'other' }),
    (value) => ({ ...value, extra: 'hostile' }),
    () => Object.assign(Object.create({ status: 'completed' }), {}),
  ]) {
    const { verifier, calls } = harness({
      retrieveResult: async (input) => {
        calls.retrieve.push(structuredClone(input));
        return mutate({
          status: 'completed',
          ...input,
          provenanceId: 'provenance-1',
          output: 'opaque',
        });
      },
    });
    const result = await verifier.verify(request());
    assert.equal(result.status, AiExecutionStatus.Failed);
    assert.match(result.failure.code, /^ritual_result_/);
    assert.equal(calls.verify.length, 0);
  }

  const { verifier } = harness({
    verifyProvenance: async (input) => ({ ...input, status: 'rejected' }),
  });
  assert.equal((await verifier.verify(request())).failure.code, 'ritual_provenance_invalid');
});

test('sanitizes retrieval and verification failures and recovers without retry', async () => {
  const sentinel = 'rpc://secret-host receipt-body private-key';
  let attempt = 0;
  const { verifier, calls } = harness({
    retrieveResult: async (input) => {
      calls.retrieve.push(structuredClone(input));
      attempt += 1;
      if (attempt === 1) throw new Error(sentinel);
      if (attempt === 2) return { status: 'failed', ...input, failureKind: 'retrieval_failed' };
      return {
        status: 'completed',
        ...input,
        provenanceId: 'provenance-1',
        output: 'opaque',
      };
    },
    verifyProvenance: async (input) => {
      calls.verify.push(structuredClone(input));
      if (attempt === 3) throw new Error(sentinel);
      return { status: 'verified', ...input };
    },
  });
  for (const code of [
    'ritual_result_retrieval_failed',
    'ritual_result_retrieval_failed',
    'ritual_provenance_verification_failed',
  ]) {
    const result = await verifier.verify(request());
    assert.equal(result.failure.code, code);
    assert.equal(JSON.stringify(result).includes(sentinel), false);
  }
  const recovered = await verifier.verify(request());
  assert.equal(recovered.status, AiExecutionStatus.Completed);
  assert.equal(calls.retrieve.length, 4);
});

test('makes timeout final despite late retrieval and keeps later calls isolated', async () => {
  let release;
  let first = true;
  const { verifier, calls } = harness(
    {
      retrieveResult: async (input) => {
        calls.retrieve.push(structuredClone(input));
        if (first) {
          first = false;
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        return {
          status: 'completed',
          ...input,
          provenanceId: 'provenance-1',
          output: 'opaque',
        };
      },
    },
    { timeoutMs: 5 },
  );
  const timedOut = await verifier.verify(request());
  assert.equal(timedOut.failure.code, 'ritual_result_retrieval_timeout');
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.verify.length, 0);
  assert.equal((await verifier.verify(request())).status, AiExecutionStatus.Completed);
  assert.equal(calls.retrieve.length, 2);
});

test('snapshots caller input and isolates concurrent calls, instances, and returned results', async () => {
  let release;
  const first = harness({
    retrieveResult: async (input) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      return {
        status: 'completed',
        ...input,
        provenanceId: 'provenance-1',
        output: 'first',
      };
    },
  });
  const source = request();
  const pending = first.verifier.verify(source);
  source.submissionId = 'mutated';
  source.mappingRequest.descriptor.executionId = 'mutated';
  release();
  const firstResult = await pending;
  assert.equal(firstResult.executionId, 'execution-1');
  assert.equal(firstResult.status, AiExecutionStatus.Completed);

  const second = harness({
    retrieveResult: async (input) => ({
      status: 'completed',
      ...input,
      provenanceId: 'provenance-2',
      output: 'second',
    }),
  });
  const [a, b] = await Promise.all([
    second.verifier.verify(request()),
    second.verifier.verify(request({ submissionId: 'submission-2' })),
  ]);
  a.output = 'local-only';
  assert.equal(b.output, 'second');
  assert.equal((await second.verifier.verify(request())).output, 'second');
});

test('keeps verification root-contained without provider-neutral or credential leakage', async () => {
  const source = await readFile(
    new URL('../dist/ritual-inference-result-verification.d.ts', import.meta.url),
    'utf8',
  );
  assert.equal(/privateKey|mnemonic|wallet|endpoint|rawReceipt|signedPayload/i.test(source), false);
  assert.equal(/retry|fallback|routing|polling/i.test(source), false);
  const aiDeclaration = await readFile(
    new URL('../../../packages/ai/dist/index.d.ts', import.meta.url),
    'utf8',
  );
  assert.equal(/ritual/i.test(aiDeclaration), false);
  await assert.rejects(
    import('@cryptodesk-ai/ritual-gateway/ritual-inference-result-verification'),
    /not defined|not exported/,
  );
  assert.equal(typeof createRitualInferenceResultVerifier, 'function');
  assert.equal(RitualInferenceResultRetrievalFailureKind.RetrievalFailed, 'retrieval_failed');
});
