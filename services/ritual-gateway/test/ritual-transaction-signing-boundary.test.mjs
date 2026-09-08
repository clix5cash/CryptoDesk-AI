import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  RitualTransactionSigningFailureKind,
  createRitualTransactionSigningBoundary,
} from '../dist/index.js';

function request(overrides = {}) {
  return {
    signingRequestId: 'signing-request-1',
    signerId: 'operator-signer',
    payload: 'opaque-prepared-payload',
    ...overrides,
  };
}

function signed(input, signedPayload = 'opaque-signed-payload') {
  return {
    status: 'signed',
    signingRequestId: input.signingRequestId,
    signerId: input.signerId,
    signedPayload,
  };
}

test('uses one explicitly injected signer for one detached opaque request', async () => {
  const sourceConfiguration = { signerId: 'operator-signer' };
  const sourceRequest = request();
  const before = structuredClone(sourceRequest);
  const calls = [];
  const boundary = createRitualTransactionSigningBoundary(sourceConfiguration, async (input) => {
    calls.push(structuredClone(input));
    input.payload = 'mutated-by-capability';
    sourceConfiguration.signerId = 'mutated-signer';
    sourceRequest.signerId = 'mutated-request-signer';
    return signed(calls[0]);
  });

  assert.deepEqual(await boundary.sign(before), {
    status: 'signed',
    signingRequestId: 'signing-request-1',
    signerId: 'operator-signer',
    signedPayload: 'opaque-signed-payload',
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], before);
  assert.equal(before.payload, 'opaque-prepared-payload');
});

test('fails closed before invocation for invalid configuration, capability, and request', async () => {
  for (const configuration of [
    {},
    { signerId: '' },
    { signerId: 'signer', extra: true },
    Object.assign(Object.create({ signerId: 'signer' }), {}),
  ]) {
    assert.throws(
      () => createRitualTransactionSigningBoundary(configuration, async () => ({})),
      /configuration is invalid/u,
    );
  }
  assert.throws(
    () => createRitualTransactionSigningBoundary({ signerId: 'signer' }),
    /capability is invalid/u,
  );

  let calls = 0;
  const boundary = createRitualTransactionSigningBoundary(
    { signerId: 'operator-signer' },
    async () => {
      calls += 1;
      return {};
    },
  );
  for (const invalid of [
    {},
    request({ signerId: 'substituted' }),
    request({ payload: '' }),
    { ...request(), extra: true },
    Object.assign(Object.create({ payload: 'inherited' }), request()),
  ]) {
    await assert.rejects(() => boundary.sign(invalid), /request is invalid/u);
  }
  assert.equal(calls, 0);
});

test('sanitizes failures, rejects malformed results, and recovers without retained state', async () => {
  const sensitive = 'credential-sentinel endpoint-sentinel stack-sentinel';
  const outcomes = [
    async () => {
      throw new Error(sensitive);
    },
    async () => ({ status: 'signed' }),
    async (input) => ({ ...signed(input), signerId: 'substituted' }),
    async (input) => ({ ...signed(input), internalDetail: sensitive }),
    async (input) => signed(input, 'later-valid-signed-payload'),
  ];
  let calls = 0;
  const boundary = createRitualTransactionSigningBoundary(
    { signerId: 'operator-signer' },
    async (input) => {
      calls += 1;
      return outcomes.shift()(input);
    },
  );
  const expected = [
    RitualTransactionSigningFailureKind.SignerFailure,
    RitualTransactionSigningFailureKind.IdentityMismatch,
    RitualTransactionSigningFailureKind.IdentityMismatch,
    RitualTransactionSigningFailureKind.ResultInvalid,
  ];
  for (const failureKind of expected) {
    const result = await boundary.sign(request());
    assert.equal(result.status, 'failed');
    assert.equal(result.failureKind, failureKind);
    assert.equal(JSON.stringify(result).includes(sensitive), false);
  }
  assert.equal((await boundary.sign(request())).status, 'signed');
  assert.equal(calls, 5);
});

test('keeps concurrent signing calls and separate boundary instances isolated', async () => {
  const firstPending = [];
  const first = createRitualTransactionSigningBoundary(
    { signerId: 'first-signer' },
    (input) => new Promise((resolve) => firstPending.push({ input, resolve })),
  );
  const second = createRitualTransactionSigningBoundary(
    { signerId: 'second-signer' },
    async (input) => signed(input, 'second-signed'),
  );
  const firstA = first.sign(request({ signingRequestId: 'first-a', signerId: 'first-signer' }));
  const firstB = first.sign(request({ signingRequestId: 'first-b', signerId: 'first-signer' }));
  const secondResult = await second.sign(
    request({ signingRequestId: 'second', signerId: 'second-signer' }),
  );
  firstPending[1].resolve(signed(firstPending[1].input, 'first-b-signed'));
  firstPending[0].resolve(signed(firstPending[0].input, 'first-a-signed'));

  assert.equal(secondResult.signerId, 'second-signer');
  assert.deepEqual(
    (await Promise.all([firstA, firstB])).map((result) => result.signingRequestId),
    ['first-a', 'first-b'],
  );
});

test('keeps the signing boundary root-contained without credential-shaped public contracts', async () => {
  const root = await import('../dist/index.js');
  assert.equal(typeof root.createRitualTransactionSigningBoundary, 'function');
  await assert.rejects(
    () => import('@cryptodesk-ai/ritual-gateway/ritual-transaction-signing-boundary'),
  );

  const declaration = await readFile(
    new URL('../dist/ritual-transaction-signing-boundary.d.ts', import.meta.url),
    'utf8',
  );
  const contractText = declaration.replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.equal(
    /privateKey|seedPhrase|mnemonic|credential|walletFile|process\.env/u.test(contractText),
    false,
  );
  assert.equal(/broadcast|receipt|settlement|rpcEndpoint/u.test(contractText), false);
});
