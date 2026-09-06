import assert from 'node:assert/strict';
import test from 'node:test';
import { executeInjectedRitualTransport } from '../dist/ritual-inference-transport.js';

function invocation(overrides = {}) {
  return {
    executionId: 'transport-execution',
    providerId: 'ritual',
    modelId: 'transport-model',
    targetId: 'transport-target',
    payload: '{"opaque":"payload"}',
    ...overrides,
  };
}

function completed(request, output = 'opaque output') {
  return {
    executionId: request.executionId,
    providerId: request.providerId,
    modelId: request.modelId,
    targetId: request.targetId,
    status: 'completed',
    output,
  };
}

test('prepares one exact detached transport request and decodes one completed response', async () => {
  const source = invocation();
  const before = structuredClone(source);
  const calls = [];

  const outcome = await executeInjectedRitualTransport(source, async (request) => {
    calls.push(structuredClone(request));
    request.executionId = 'mutated-by-transport';
    request.payload = 'mutated-by-transport';
    return completed(calls[0]);
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], before);
  assert.deepEqual(source, before);
  assert.deepEqual(outcome, { kind: 'completed', output: 'opaque output' });
  outcome.output = 'mutated-return';

  const repeated = await executeInjectedRitualTransport(source, async (request) =>
    completed(request),
  );
  assert.deepEqual(repeated, { kind: 'completed', output: 'opaque output' });
});

test('decodes terminal failures and rejects malformed transport responses without leakage or retry', async () => {
  const source = invocation();
  const secret = 'secret transport exception and endpoint';
  const responses = [
    (request) => ({
      executionId: request.executionId,
      providerId: request.providerId,
      modelId: request.modelId,
      targetId: request.targetId,
      status: 'failed',
      failureKind: 'runtime_failure',
    }),
    (request) => ({
      executionId: request.executionId,
      providerId: request.providerId,
      modelId: request.modelId,
      targetId: request.targetId,
      status: 'failed',
      failureKind: 'timeout',
    }),
    (request) => ({ ...completed(request), status: 'pending' }),
    (request) => ({ ...completed(request), failureKind: 'runtime_failure' }),
    (request) => ({ ...completed(request), executionId: 'substituted' }),
    (request) => ({ ...completed(request), targetId: 'substituted' }),
    (request) => ({ ...completed(request), vendorBody: secret }),
    () => {
      throw new Error(secret);
    },
    (request) => completed(request, 'recovered'),
  ];
  const expected = [
    { kind: 'failed', failureKind: 'runtime_failure' },
    { kind: 'failed', failureKind: 'timeout' },
    { kind: 'result_invalid' },
    { kind: 'result_invalid' },
    { kind: 'identity_mismatch' },
    { kind: 'identity_mismatch' },
    { kind: 'result_invalid' },
    { kind: 'invocation_failed' },
    { kind: 'completed', output: 'recovered' },
  ];
  let calls = 0;

  for (const [index, response] of responses.entries()) {
    const outcome = await executeInjectedRitualTransport(source, async (request) => {
      calls += 1;
      return response(request);
    });
    assert.deepEqual(outcome, expected[index]);
    assert.equal(JSON.stringify(outcome).includes(secret), false);
  }

  assert.equal(calls, responses.length);
  assert.deepEqual(
    await executeInjectedRitualTransport({ ...source, payload: '' }, async () => {
      throw new Error('must not run');
    }),
    { kind: 'result_invalid' },
  );
});
