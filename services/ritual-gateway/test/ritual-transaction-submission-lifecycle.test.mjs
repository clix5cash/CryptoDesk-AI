import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  RitualTransactionLifecycleFailureKind,
  createRitualInferenceTransactionConstructor,
  createRitualTransactionSigningBoundary,
  createRitualTransactionSubmissionLifecycle,
} from '../dist/index.js';

function request(overrides = {}) {
  return {
    executionId: 'execution-1',
    signedTransaction: {
      status: 'signed',
      signingRequestId: 'execution-1',
      signerId: 'operator-signer',
      signedPayload: 'sensitive-signed-material',
    },
    ...overrides,
  };
}

function authorized(input) {
  return { status: 'authorized', ...input };
}

function submitted(input, submissionId = 'opaque-submission-1') {
  return { status: 'submitted', executionId: input.executionId, submissionId };
}

function settled(input, status = 'settled') {
  return { status, executionId: input.executionId, submissionId: input.submissionId };
}

function lifecycle(overrides = {}, configuration = {}) {
  const calls = { authorization: [], submission: [], settlement: [] };
  const instance = createRitualTransactionSubmissionLifecycle(
    configuration,
    overrides.authorize ?? (async (input) => authorized(input)),
    overrides.submit ??
      (async (input) => {
        calls.submission.push(structuredClone(input));
        return submitted(input);
      }),
    overrides.settle ??
      (async (input) => {
        calls.settlement.push(structuredClone(input));
        return settled(input);
      }),
  );
  return { instance, calls };
}

test('requires explicit authorization before one submission and one settlement', async () => {
  const calls = { authorize: 0, submit: 0, settle: 0 };
  const instance = createRitualTransactionSubmissionLifecycle(
    {},
    async (input) => {
      calls.authorize += 1;
      return authorized(input);
    },
    async (input) => {
      calls.submit += 1;
      return submitted(input);
    },
    async (input) => {
      calls.settle += 1;
      return settled(input);
    },
  );

  assert.deepEqual(await instance.execute(request()), {
    status: 'settled',
    executionId: 'execution-1',
    submissionId: 'opaque-submission-1',
  });
  assert.deepEqual(calls, { authorize: 1, submit: 1, settle: 1 });

  let unauthorizedSubmissions = 0;
  const unauthorized = createRitualTransactionSubmissionLifecycle(
    {},
    async () => ({ status: 'denied' }),
    async () => {
      unauthorizedSubmissions += 1;
      return {};
    },
    async () => ({}),
  );
  assert.deepEqual(await unauthorized.execute(request()), {
    status: 'failed',
    executionId: 'execution-1',
    failureKind: RitualTransactionLifecycleFailureKind.Unauthorized,
  });
  assert.equal(unauthorizedSubmissions, 0);
});

test('rejects malformed input and configuration before authorization or submission', async () => {
  for (const configuration of [
    { timeoutMs: 0 },
    { timeoutMs: 1.5 },
    { extra: true },
    Object.assign(Object.create({ timeoutMs: 5 }), {}),
  ]) {
    assert.throws(
      () =>
        createRitualTransactionSubmissionLifecycle(
          configuration,
          async () => ({}),
          async () => ({}),
          async () => ({}),
        ),
      /configuration is invalid/u,
    );
  }
  assert.throws(
    () =>
      createRitualTransactionSubmissionLifecycle(
        {},
        undefined,
        async () => ({}),
        async () => ({}),
      ),
    /capability is invalid/u,
  );

  let authorizations = 0;
  const { instance } = lifecycle({
    authorize: async () => {
      authorizations += 1;
      return {};
    },
  });
  for (const invalid of [
    {},
    request({ executionId: '' }),
    request({ extra: true }),
    request({ signedTransaction: { ...request().signedTransaction, signingRequestId: 'other' } }),
    request({ signedTransaction: { ...request().signedTransaction, signedPayload: '' } }),
    request({ signedTransaction: { ...request().signedTransaction, receipt: 'forbidden' } }),
    Object.assign(Object.create({ executionId: 'execution-1' }), request()),
  ]) {
    await assert.rejects(() => instance.execute(invalid), /submission request is invalid/u);
  }
  assert.equal(authorizations, 0);
});

test('maps submission and settlement failures once without leaking hostile details', async () => {
  const sensitive = 'signed-secret endpoint-secret provider-body stack-secret';
  const scenarios = [
    {
      submit: async () => {
        throw new Error(sensitive);
      },
      expected: RitualTransactionLifecycleFailureKind.SubmissionFailed,
    },
    {
      submit: async () => ({ status: 'submitted' }),
      expected: RitualTransactionLifecycleFailureKind.IdentityMismatch,
    },
    {
      submit: async (input) => ({ ...submitted(input), detail: sensitive }),
      expected: RitualTransactionLifecycleFailureKind.SubmissionInvalid,
    },
    {
      submit: async (input) => ({ ...submitted(input), executionId: 'substituted' }),
      expected: RitualTransactionLifecycleFailureKind.IdentityMismatch,
    },
    {
      settle: async () => {
        throw new Error(sensitive);
      },
      expected: RitualTransactionLifecycleFailureKind.SettlementFailed,
    },
    {
      settle: async () => ({ status: 'settled' }),
      expected: RitualTransactionLifecycleFailureKind.IdentityMismatch,
    },
    {
      settle: async (input) => ({ ...settled(input), detail: sensitive }),
      expected: RitualTransactionLifecycleFailureKind.SettlementInvalid,
    },
    {
      settle: async (input) => settled(input, 'failed'),
      expected: RitualTransactionLifecycleFailureKind.SettlementFailed,
    },
  ];

  for (const scenario of scenarios) {
    let submissions = 0;
    let settlements = 0;
    const instance = createRitualTransactionSubmissionLifecycle(
      {},
      async (input) => authorized(input),
      async (input) => {
        submissions += 1;
        return scenario.submit === undefined ? submitted(input) : scenario.submit(input);
      },
      async (input) => {
        settlements += 1;
        return scenario.settle === undefined ? settled(input) : scenario.settle(input);
      },
    );
    const result = await instance.execute(request());
    assert.equal(result.failureKind, scenario.expected);
    assert.equal(submissions, 1);
    assert.equal(settlements, scenario.submit === undefined ? 1 : 0);
    assert.equal(JSON.stringify(result).includes(sensitive), false);
    assert.equal(JSON.stringify(result).includes('signed-secret'), false);
  }
});

test('makes submission and settlement timeout terminal despite late completion', async () => {
  let settleCalls = 0;
  let resolveSubmission;
  const submissionTimeout = createRitualTransactionSubmissionLifecycle(
    { timeoutMs: 5 },
    async (input) => authorized(input),
    () =>
      new Promise((resolve) => {
        resolveSubmission = resolve;
      }),
    async () => {
      settleCalls += 1;
      return {};
    },
  );
  const first = submissionTimeout.execute(request());
  assert.equal((await first).failureKind, RitualTransactionLifecycleFailureKind.Timeout);
  resolveSubmission(submitted(request()));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(settleCalls, 0);

  let resolveSettlement;
  const settlementTimeout = createRitualTransactionSubmissionLifecycle(
    { timeoutMs: 5 },
    async (input) => authorized(input),
    async (input) => submitted(input),
    () =>
      new Promise((resolve) => {
        resolveSettlement = resolve;
      }),
  );
  const second = settlementTimeout.execute(request());
  assert.equal((await second).failureKind, RitualTransactionLifecycleFailureKind.Timeout);
  resolveSettlement(settled({ executionId: 'execution-1', submissionId: 'opaque-submission-1' }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('snapshots caller material and isolates concurrent calls and instances', async () => {
  const pending = [];
  const seen = [];
  const first = createRitualTransactionSubmissionLifecycle(
    {},
    (input) => new Promise((resolve) => pending.push({ input, resolve })),
    async (input) => {
      seen.push(structuredClone(input));
      return submitted(input, `submission-${input.executionId}`);
    },
    async (input) => settled(input),
  );
  const second = lifecycle().instance;
  const sourceA = request({
    executionId: 'a',
    signedTransaction: { ...request().signedTransaction, signingRequestId: 'a' },
  });
  const sourceB = request({
    executionId: 'b',
    signedTransaction: { ...request().signedTransaction, signingRequestId: 'b' },
  });
  const operationA = first.execute(sourceA);
  const operationB = first.execute(sourceB);
  sourceA.signedTransaction.signedPayload = 'mutated-a';
  sourceB.executionId = 'mutated-b';
  pending[1].resolve(authorized(pending[1].input));
  pending[0].resolve(authorized(pending[0].input));
  const independent = await second.execute(request());
  const [resultA, resultB] = await Promise.all([operationA, operationB]);

  assert.deepEqual(
    seen.map((value) => value.signedPayload),
    ['sensitive-signed-material', 'sensitive-signed-material'],
  );
  assert.deepEqual([resultA.executionId, resultB.executionId], ['a', 'b']);
  assert.equal(independent.status, 'settled');
  resultA.submissionId = 'mutated-result';
  assert.equal((await second.execute(request())).submissionId, 'opaque-submission-1');
});

test('recovers after every lifecycle failure without retrying the failed operation', async () => {
  const outcomes = ['authorization', 'submission', 'settlement', 'success'];
  let submissions = 0;
  const instance = createRitualTransactionSubmissionLifecycle(
    {},
    async (input) =>
      outcomes[0] === 'authorization'
        ? (outcomes.shift(), { status: 'denied' })
        : authorized(input),
    async (input) => {
      submissions += 1;
      return outcomes[0] === 'submission' ? (outcomes.shift(), {}) : submitted(input);
    },
    async (input) => (outcomes[0] === 'settlement' ? (outcomes.shift(), {}) : settled(input)),
  );
  assert.equal(
    (await instance.execute(request())).failureKind,
    RitualTransactionLifecycleFailureKind.Unauthorized,
  );
  assert.equal(
    (await instance.execute(request())).failureKind,
    RitualTransactionLifecycleFailureKind.IdentityMismatch,
  );
  assert.equal(
    (await instance.execute(request())).failureKind,
    RitualTransactionLifecycleFailureKind.IdentityMismatch,
  );
  assert.equal((await instance.execute(request())).status, 'settled');
  assert.equal(submissions, 3);
});

test('preserves explicit construction, signing, authorization, submission, and settlement separation', async () => {
  const constructor = createRitualInferenceTransactionConstructor({
    expectedChainId: 1979,
    targetId: 'target',
    signerId: 'operator-signer',
  });
  const constructed = constructor.construct({
    executionId: 'execution-1',
    chainId: 1979,
    targetId: 'target',
    payload: 'opaque-inference',
  });
  let signing = 0;
  let submission = 0;
  const signer = createRitualTransactionSigningBoundary(
    { signerId: 'operator-signer' },
    async (input) => {
      signing += 1;
      return {
        status: 'signed',
        signingRequestId: input.signingRequestId,
        signerId: input.signerId,
        signedPayload: 'opaque-signed',
      };
    },
  );
  const lifecycleInstance = createRitualTransactionSubmissionLifecycle(
    {},
    async (input) => authorized(input),
    async (input) => {
      submission += 1;
      return submitted(input);
    },
    async (input) => settled(input),
  );
  assert.equal(signing, 0);
  assert.equal(submission, 0);
  const signedTransaction = await signer.sign(constructed.signingRequest);
  assert.equal(signing, 1);
  assert.equal(submission, 0);
  assert.equal(
    (await lifecycleInstance.execute({ executionId: constructed.executionId, signedTransaction }))
      .status,
    'settled',
  );
  assert.equal(submission, 1);
});

test('keeps public declarations free of concrete broadcaster, receipt, and credential machinery', async () => {
  const root = await import('../dist/index.js');
  assert.equal(typeof root.createRitualTransactionSubmissionLifecycle, 'function');
  await assert.rejects(
    () => import('@cryptodesk-ai/ritual-gateway/ritual-transaction-submission-lifecycle'),
  );
  const declaration = await readFile(
    new URL('../dist/ritual-transaction-submission-lifecycle.d.ts', import.meta.url),
    'utf8',
  );
  const contractText = declaration.replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.equal(
    /privateKey|mnemonic|credential|walletFile|process\.env|rpcEndpoint/u.test(contractText),
    false,
  );
  assert.equal(
    /AbortController|AbortSignal|Http|JsonRpc|RawReceipt|poll/u.test(contractText),
    false,
  );
});
