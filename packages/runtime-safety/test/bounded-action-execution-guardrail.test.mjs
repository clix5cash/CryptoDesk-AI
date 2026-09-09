import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AutonomousActionKind,
  BoundedActionCapabilityFailureKind,
  BoundedActionExecutionFailureKind,
  createAutonomousRuntimeSafetyContract,
  createBoundedActionExecutionGuardrail,
} from '../dist/index.js';

function policy(overrides = {}) {
  return { policyId: 'policy-1', authorityId: 'operator-1', ...overrides };
}

function candidate(overrides = {}, candidatePolicy = policy()) {
  return createAutonomousRuntimeSafetyContract({ policy: candidatePolicy }).createCandidate({
    executionId: 'execution-1',
    actionId: 'action-1',
    actionKind: AutonomousActionKind.PrepareOperatorReview,
    targetId: 'review-target-1',
    policy: candidatePolicy,
    origin: { interpretationId: 'interpretation-1', candidateId: 'candidate-1' },
    ...overrides,
  });
}

function identity(overrides = {}) {
  return {
    executionId: 'execution-1',
    actionId: 'action-1',
    actionKind: AutonomousActionKind.PrepareOperatorReview,
    targetId: 'review-target-1',
    policyId: 'policy-1',
    authorityId: 'operator-1',
    interpretationId: 'interpretation-1',
    candidateId: 'candidate-1',
    ...overrides,
  };
}

function harness(overrides = {}, configuration = {}) {
  const calls = { authorization: [], execution: [] };
  const capabilities = {
    authorize: async (request) => {
      calls.authorization.push(structuredClone(request));
      return { status: 'authorized', ...request };
    },
    execute: async (request) => {
      calls.execution.push(structuredClone(request));
      const { permissionState: _, maximumAttempts: __, ...requestIdentity } = request;
      return { status: 'completed', ...requestIdentity, output: 'operator-review-prepared' };
    },
    ...overrides,
  };
  return {
    calls,
    guardrail: createBoundedActionExecutionGuardrail(
      { policy: policy(), ...configuration },
      capabilities.authorize,
      capabilities.execute,
    ),
  };
}

test('authorizes explicitly and executes one exact single-attempt permission', async () => {
  const { guardrail, calls } = harness();
  const result = await guardrail.execute(candidate());

  assert.deepEqual(calls.authorization, [identity()]);
  assert.deepEqual(calls.execution, [
    { ...identity(), permissionState: 'authorized_for_single_attempt', maximumAttempts: 1 },
  ]);
  assert.deepEqual(result, {
    status: 'completed',
    ...identity(),
    output: 'operator-review-prepared',
  });
  result.output = 'local-only';
  assert.equal((await guardrail.execute(candidate())).output, 'operator-review-prepared');
});

test('denial, malformed authorization, and substituted identity execute zero times', async () => {
  for (const authorize of [
    async (request) => ({ status: 'denied', ...request }),
    async (request) => ({ status: 'authorized', ...request, extra: true }),
    async (request) => ({ status: 'authorized', ...request, targetId: 'other' }),
    async () => Object.assign(Object.create({ status: 'authorized' }), identity()),
  ]) {
    const { guardrail, calls } = harness({ authorize });
    const result = await guardrail.execute(candidate());
    assert.equal(result.status, 'failed');
    assert.equal(calls.execution.length, 0);
    assert.equal(calls.authorization.length, 0);
  }

  const denied = harness({
    authorize: async (request) => {
      denied.calls.authorization.push(structuredClone(request));
      return { status: 'denied', ...request };
    },
  });
  assert.equal(
    (await denied.guardrail.execute(candidate())).failureKind,
    BoundedActionExecutionFailureKind.AuthorizationDenied,
  );
  assert.equal(denied.calls.authorization.length, 1);
  assert.equal(denied.calls.execution.length, 0);
});

test('invalid and prototype-shaped candidates fail before authorization or execution', async () => {
  const { guardrail, calls } = harness();
  for (const invalid of [
    { ...candidate(), extra: true },
    { ...candidate(), actionKind: 'broadcast_transaction' },
    { ...candidate(), authorizationState: 'authorized' },
    { ...candidate(), executable: true },
    { ...candidate(), policy: { policyId: 'other', authorityId: 'operator-1' } },
    Object.assign(Object.create({ inherited: true }), candidate()),
  ]) {
    await assert.rejects(() => guardrail.execute(invalid), /candidate is invalid/);
  }
  assert.equal(calls.authorization.length, 0);
  assert.equal(calls.execution.length, 0);
});

test('sanitizes authorizer and executor failures, rejects malformed results, and recovers', async () => {
  const sentinel = 'secret endpoint stack callback source';
  let authorizationAttempts = 0;
  let executionAttempts = 0;
  const { guardrail, calls } = harness({
    authorize: async (request) => {
      calls.authorization.push(structuredClone(request));
      authorizationAttempts += 1;
      if (authorizationAttempts === 1) throw new Error(sentinel);
      return { status: 'authorized', ...request };
    },
    execute: async (request) => {
      calls.execution.push(structuredClone(request));
      const { permissionState: _, maximumAttempts: __, ...requestIdentity } = request;
      executionAttempts += 1;
      if (executionAttempts === 1) throw new Error(sentinel);
      if (executionAttempts === 2) {
        return { status: 'completed', ...requestIdentity, output: '', extra: sentinel };
      }
      return { status: 'completed', ...requestIdentity, output: 'recovered' };
    },
  });

  for (const expected of [
    BoundedActionExecutionFailureKind.AuthorizationFailed,
    BoundedActionExecutionFailureKind.ExecutionFailed,
    BoundedActionExecutionFailureKind.ExecutionInvalid,
  ]) {
    const result = await guardrail.execute(candidate());
    assert.equal(result.failureKind, expected);
    assert.equal(JSON.stringify(result).includes(sentinel), false);
  }
  assert.equal((await guardrail.execute(candidate())).status, 'completed');
  assert.equal(calls.execution.length, 3);
});

test('makes execution timeout final and ignores late completion without retry', async () => {
  let release;
  let first = true;
  const { guardrail, calls } = harness(
    {
      execute: async (request) => {
        calls.execution.push(structuredClone(request));
        if (first) {
          first = false;
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        const { permissionState: _, maximumAttempts: __, ...requestIdentity } = request;
        return { status: 'completed', ...requestIdentity, output: 'prepared' };
      },
    },
    { executionTimeoutMs: 5 },
  );
  const timedOut = await guardrail.execute(candidate());
  assert.equal(timedOut.failureKind, BoundedActionExecutionFailureKind.Timeout);
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.execution.length, 1);
  assert.equal((await guardrail.execute(candidate())).status, 'completed');
  assert.equal(calls.execution.length, 2);
});

test('snapshots candidate identity while authorization and execution are pending', async () => {
  let releaseAuthorization;
  let releaseExecution;
  const { guardrail, calls } = harness({
    authorize: async (request) => {
      calls.authorization.push(structuredClone(request));
      await new Promise((resolve) => {
        releaseAuthorization = resolve;
      });
      return { status: 'authorized', ...request };
    },
    execute: async (request) => {
      calls.execution.push(structuredClone(request));
      await new Promise((resolve) => {
        releaseExecution = resolve;
      });
      const { permissionState: _, maximumAttempts: __, ...requestIdentity } = request;
      return { status: 'completed', ...requestIdentity, output: 'prepared' };
    },
  });
  const source = candidate();
  const pending = guardrail.execute(source);
  source.actionId = 'mutated';
  source.policy.policyId = 'mutated';
  releaseAuthorization();
  await new Promise((resolve) => setTimeout(resolve, 0));
  source.targetId = 'mutated';
  releaseExecution();
  const result = await pending;
  assert.deepEqual(calls.authorization[0], identity());
  assert.equal(calls.execution[0].actionId, 'action-1');
  assert.equal(result.targetId, 'review-target-1');
});

test('isolates concurrent success, denial, failure, timeout, and configured instances', async () => {
  const { guardrail, calls } = harness(
    {
      authorize: async (request) => {
        calls.authorization.push(structuredClone(request));
        return { status: request.actionId === 'denied' ? 'denied' : 'authorized', ...request };
      },
      execute: async (request) => {
        calls.execution.push(structuredClone(request));
        const { permissionState: _, maximumAttempts: __, ...requestIdentity } = request;
        if (request.actionId === 'failed') {
          return {
            status: 'failed',
            ...requestIdentity,
            failureKind: BoundedActionCapabilityFailureKind.ExecutionFailed,
          };
        }
        if (request.actionId === 'slow') await new Promise((resolve) => setTimeout(resolve, 20));
        return { status: 'completed', ...requestIdentity, output: request.actionId };
      },
    },
    { executionTimeoutMs: 5 },
  );
  const [success, denied, failed, timedOut] = await Promise.all([
    guardrail.execute(candidate({ actionId: 'success' })),
    guardrail.execute(candidate({ actionId: 'denied' })),
    guardrail.execute(candidate({ actionId: 'failed' })),
    guardrail.execute(candidate({ actionId: 'slow' })),
  ]);
  assert.equal(success.status, 'completed');
  assert.equal(denied.failureKind, BoundedActionExecutionFailureKind.AuthorizationDenied);
  assert.equal(failed.failureKind, BoundedActionExecutionFailureKind.ExecutionFailed);
  assert.equal(timedOut.failureKind, BoundedActionExecutionFailureKind.Timeout);
  assert.equal(calls.authorization.length, 4);
  assert.equal(calls.execution.length, 3);

  const secondPolicy = policy({ policyId: 'policy-2', authorityId: 'operator-2' });
  const second = createBoundedActionExecutionGuardrail(
    { policy: secondPolicy },
    async (request) => ({ status: 'authorized', ...request }),
    async (request) => {
      const { permissionState: _, maximumAttempts: __, ...requestIdentity } = request;
      return { status: 'completed', ...requestIdentity, output: 'second' };
    },
  );
  assert.equal((await second.execute(candidate({}, secondPolicy))).output, 'second');
});

test('validates configuration and contains public exports and forbidden capabilities', async () => {
  for (const configuration of [
    { policy: policy(), extra: true },
    { policy: { policyId: '*', authorityId: '' } },
    { policy: Object.assign(Object.create({}), policy()) },
    { policy: policy(), executionTimeoutMs: 0 },
    { policy: policy(), executionTimeoutMs: 2_147_483_648 },
  ]) {
    assert.throws(
      () =>
        createBoundedActionExecutionGuardrail(
          configuration,
          async () => ({}),
          async () => ({}),
        ),
      /configuration is invalid/,
    );
  }
  const declaration = await readFile(
    new URL('../dist/bounded-action-execution-guardrail.d.ts', import.meta.url),
    'utf8',
  );
  const implementation = await readFile(
    new URL('../dist/bounded-action-execution-guardrail.js', import.meta.url),
    'utf8',
  );
  assert.equal(
    /privateKey|mnemonic|wallet|credential|signedTransaction|shell|child_process|endpoint/iu.test(
      declaration,
    ),
    false,
  );
  assert.equal(
    /process\.env|fetch\s*\(|eval\s*\(|new Function|setInterval/u.test(implementation),
    false,
  );
  await assert.rejects(
    import('@cryptodesk-ai/runtime-safety/bounded-action-execution-guardrail'),
    /not defined|not exported/,
  );
  assert.equal(typeof createBoundedActionExecutionGuardrail, 'function');
});
