import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AutonomousActionKind,
  BoundedActionCapabilityFailureKind,
  BoundedActionExecutionFailureKind,
  createControlledAutonomousRuntime,
} from '../dist/index.js';

function policy(overrides = {}) {
  return { policyId: 'policy-1', authorityId: 'operator-1', ...overrides };
}

function candidate(overrides = {}, candidatePolicy = policy()) {
  return {
    executionId: 'execution-1',
    actionId: 'action-1',
    actionKind: AutonomousActionKind.PrepareOperatorReview,
    targetId: 'review-target-1',
    policy: candidatePolicy,
    origin: { interpretationId: 'interpretation-1', candidateId: 'candidate-1' },
    ...overrides,
  };
}

function request(overrides = {}, candidateValue = candidate()) {
  return { runtimeOperationId: 'runtime-operation-1', candidate: candidateValue, ...overrides };
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
    authorize: async (value) => {
      calls.authorization.push(structuredClone(value));
      return { status: 'authorized', ...value };
    },
    execute: async (value) => {
      calls.execution.push(structuredClone(value));
      const { permissionState: _, maximumAttempts: __, ...boundedIdentity } = value;
      return { status: 'completed', ...boundedIdentity, output: 'operator-review-prepared' };
    },
    ...overrides,
  };
  return {
    calls,
    runtime: createControlledAutonomousRuntime(
      { policy: policy(), ...configuration },
      capabilities.authorize,
      capabilities.execute,
    ),
  };
}

test('runs one explicitly requested candidate through the existing boundaries exactly once', async () => {
  const { runtime, calls } = harness();
  const result = await runtime.run(request());

  assert.deepEqual(calls.authorization, [identity()]);
  assert.deepEqual(calls.execution, [
    { ...identity(), permissionState: 'authorized_for_single_attempt', maximumAttempts: 1 },
  ]);
  assert.deepEqual(result, {
    runtimeOperationId: 'runtime-operation-1',
    status: 'completed',
    ...identity(),
    output: 'operator-review-prepared',
  });
  assert.equal(calls.authorization.length, 1);
  assert.equal(calls.execution.length, 1);
});

test('rejects invalid explicit requests before authorization and stops denial before execution', async () => {
  const { runtime, calls } = harness();
  for (const invalid of [
    { ...request(), extra: true },
    { ...request(), runtimeOperationId: '' },
    request({}, { ...candidate(), actionKind: 'broadcast_transaction' }),
    request({}, { ...candidate(), policy: { ...policy(), extra: true } }),
    Object.assign(Object.create({ inherited: true }), request()),
  ]) {
    await assert.rejects(() => runtime.run(invalid), /runtime request is invalid/);
  }
  assert.equal(calls.authorization.length, 0);
  assert.equal(calls.execution.length, 0);

  const denied = harness({
    authorize: async (value) => {
      denied.calls.authorization.push(structuredClone(value));
      return { status: 'denied', ...value };
    },
  });
  const deniedResult = await denied.runtime.run(request());
  assert.equal(deniedResult.failureKind, BoundedActionExecutionFailureKind.AuthorizationDenied);
  assert.equal(denied.calls.authorization.length, 1);
  assert.equal(denied.calls.execution.length, 0);
});

test('preserves snapshots while authorization and execution are pending and detaches results', async () => {
  let releaseAuthorization;
  let releaseExecution;
  let firstAuthorization = true;
  let firstExecution = true;
  const { runtime, calls } = harness({
    authorize: async (value) => {
      calls.authorization.push(structuredClone(value));
      if (firstAuthorization) {
        firstAuthorization = false;
        await new Promise((resolve) => {
          releaseAuthorization = resolve;
        });
      }
      return { status: 'authorized', ...value };
    },
    execute: async (value) => {
      calls.execution.push(structuredClone(value));
      if (firstExecution) {
        firstExecution = false;
        await new Promise((resolve) => {
          releaseExecution = resolve;
        });
      }
      const { permissionState: _, maximumAttempts: __, ...boundedIdentity } = value;
      return { status: 'completed', ...boundedIdentity, output: 'prepared' };
    },
  });
  const source = request();
  const pending = runtime.run(source);
  source.runtimeOperationId = 'mutated';
  source.candidate.actionId = 'mutated';
  source.candidate.policy.policyId = 'mutated';
  releaseAuthorization();
  await new Promise((resolve) => setTimeout(resolve, 0));
  source.candidate.targetId = 'mutated';
  releaseExecution();
  const result = await pending;
  assert.equal(result.runtimeOperationId, 'runtime-operation-1');
  assert.deepEqual(calls.authorization[0], identity());
  assert.equal(calls.execution[0].targetId, 'review-target-1');

  result.output = 'local-only';
  assert.equal((await runtime.run(request())).output, 'prepared');
});

test('keeps executor failure and timeout terminal, performs no second action, and recovers', async () => {
  let release;
  let attempt = 0;
  const { runtime, calls } = harness(
    {
      execute: async (value) => {
        calls.execution.push(structuredClone(value));
        const { permissionState: _, maximumAttempts: __, ...boundedIdentity } = value;
        attempt += 1;
        if (attempt === 1) {
          return {
            status: 'failed',
            ...boundedIdentity,
            failureKind: BoundedActionCapabilityFailureKind.ExecutionFailed,
          };
        }
        if (attempt === 2) {
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        return { status: 'completed', ...boundedIdentity, output: 'recovered' };
      },
    },
    { executionTimeoutMs: 5 },
  );
  assert.equal(
    (await runtime.run(request({ runtimeOperationId: 'failed-run' }))).failureKind,
    BoundedActionExecutionFailureKind.ExecutionFailed,
  );
  assert.equal(
    (await runtime.run(request({ runtimeOperationId: 'timed-out-run' }))).failureKind,
    BoundedActionExecutionFailureKind.Timeout,
  );
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.execution.length, 2);
  assert.equal(
    (await runtime.run(request({ runtimeOperationId: 'recovery-run' }))).status,
    'completed',
  );
  assert.equal(calls.execution.length, 3);
});

test('isolates concurrent outcomes and independently configured runtime instances', async () => {
  const { runtime, calls } = harness(
    {
      authorize: async (value) => {
        calls.authorization.push(structuredClone(value));
        return { status: value.actionId.startsWith('denied') ? 'denied' : 'authorized', ...value };
      },
      execute: async (value) => {
        calls.execution.push(structuredClone(value));
        const { permissionState: _, maximumAttempts: __, ...boundedIdentity } = value;
        if (value.actionId === 'failed') throw new Error('hostile executor secret');
        if (value.actionId === 'slow') await new Promise((resolve) => setTimeout(resolve, 20));
        return { status: 'completed', ...boundedIdentity, output: value.actionId };
      },
    },
    { executionTimeoutMs: 5 },
  );
  const [first, second, denied, failed, timedOut] = await Promise.all([
    runtime.run(
      request({ runtimeOperationId: 'run-success-1' }, candidate({ actionId: 'success-1' })),
    ),
    runtime.run(
      request({ runtimeOperationId: 'run-success-2' }, candidate({ actionId: 'success-2' })),
    ),
    runtime.run(request({ runtimeOperationId: 'run-denied' }, candidate({ actionId: 'denied-1' }))),
    runtime.run(request({ runtimeOperationId: 'run-failed' }, candidate({ actionId: 'failed' }))),
    runtime.run(request({ runtimeOperationId: 'run-timeout' }, candidate({ actionId: 'slow' }))),
  ]);
  assert.deepEqual(
    [first.status, second.status, denied.failureKind, failed.failureKind, timedOut.failureKind],
    [
      'completed',
      'completed',
      BoundedActionExecutionFailureKind.AuthorizationDenied,
      BoundedActionExecutionFailureKind.ExecutionFailed,
      BoundedActionExecutionFailureKind.Timeout,
    ],
  );
  assert.equal(calls.authorization.length, 5);
  assert.equal(calls.execution.length, 4);

  const secondPolicy = policy({ policyId: 'policy-2', authorityId: 'operator-2' });
  const secondRuntime = createControlledAutonomousRuntime(
    { policy: secondPolicy },
    async (value) => ({ status: 'authorized', ...value }),
    async (value) => {
      const { permissionState: _, maximumAttempts: __, ...boundedIdentity } = value;
      return { status: 'completed', ...boundedIdentity, output: 'second-instance' };
    },
  );
  const secondResult = await secondRuntime.run(
    request({ runtimeOperationId: 'second-instance-run' }, candidate({}, secondPolicy)),
  );
  assert.equal(secondResult.output, 'second-instance');
  assert.equal(secondResult.policyId, 'policy-2');
});

test('contains failures, exports only contracts, blocks deep imports, and adds no forbidden runtime', async () => {
  const sentinel = 'secret endpoint stack callback source';
  const { runtime } = harness({
    authorize: async () => {
      throw new Error(sentinel);
    },
  });
  const result = await runtime.run(request());
  assert.equal(result.failureKind, BoundedActionExecutionFailureKind.AuthorizationFailed);
  assert.equal(JSON.stringify(result).includes(sentinel), false);

  const declaration = await readFile(
    new URL('../dist/controlled-autonomous-runtime.d.ts', import.meta.url),
    'utf8',
  );
  const implementation = await readFile(
    new URL('../dist/controlled-autonomous-runtime.js', import.meta.url),
    'utf8',
  );
  assert.equal(
    /privateKey|mnemonic|wallet|keystore|credential|child_process|eth_sendRawTransaction/iu.test(
      declaration,
    ),
    false,
  );
  assert.equal(
    /process\.env|child_process|setInterval|eth_sendRawTransaction|retry|fallback/iu.test(
      implementation,
    ),
    false,
  );
  await assert.rejects(
    import('@cryptodesk-ai/runtime-safety/controlled-autonomous-runtime'),
    /not defined|not exported/,
  );
});
