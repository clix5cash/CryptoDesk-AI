import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createRitualInferenceTransactionConstructor,
  createRitualTransactionSigningBoundary,
} from '../dist/index.js';

function configuration(overrides = {}) {
  return {
    expectedChainId: 1979,
    targetId: 'explicit-inference-target',
    signerId: 'explicit-operator-signer',
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    executionId: 'inference-execution-1',
    chainId: 1979,
    targetId: 'explicit-inference-target',
    payload: 'opaque-inference-payload',
    ...overrides,
  };
}

test('constructs a deterministic detached signable request without signing or network access', () => {
  const sourceConfiguration = configuration();
  const sourceInput = input();
  const beforeConfiguration = structuredClone(sourceConfiguration);
  const beforeInput = structuredClone(sourceInput);
  const constructor = createRitualInferenceTransactionConstructor(sourceConfiguration);

  const first = constructor.construct(sourceInput);
  sourceConfiguration.targetId = 'mutated-target';
  sourceConfiguration.signerId = 'mutated-signer';
  sourceInput.payload = 'mutated-payload';
  const second = constructor.construct(beforeInput);

  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(first.signingRequest.payload), {
    chainId: 1979,
    targetId: 'explicit-inference-target',
    payload: 'opaque-inference-payload',
  });
  assert.deepEqual(beforeConfiguration, configuration());
  assert.deepEqual(beforeInput, input());
  assert.equal(first.signingRequest.signerId, 'explicit-operator-signer');
  assert.equal(first.signingRequest.signingRequestId, first.executionId);
});

test('fails closed for invalid configuration and construction input', () => {
  for (const invalidConfiguration of [
    {},
    configuration({ expectedChainId: 1 }),
    configuration({ targetId: '' }),
    configuration({ signerId: '' }),
    { ...configuration(), extra: true },
    Object.assign(Object.create({ expectedChainId: 1979 }), configuration()),
  ]) {
    assert.throws(
      () => createRitualInferenceTransactionConstructor(invalidConfiguration),
      /configuration is invalid/u,
    );
  }

  const constructor = createRitualInferenceTransactionConstructor(configuration());
  for (const invalidInput of [
    {},
    input({ executionId: '' }),
    input({ chainId: 1 }),
    input({ targetId: 'substituted-target' }),
    input({ payload: '' }),
    { ...input(), extra: true },
    Object.assign(Object.create({ payload: 'inherited' }), input()),
  ]) {
    assert.throws(() => constructor.construct(invalidInput), /construction input is invalid/u);
  }
});

test('returns independent results across mutation, concurrent calls, instances, and failures', async () => {
  const first = createRitualInferenceTransactionConstructor(configuration());
  const second = createRitualInferenceTransactionConstructor(
    configuration({ targetId: 'second-target', signerId: 'second-signer' }),
  );
  assert.throws(() => first.construct(input({ chainId: 1 })), /construction input is invalid/u);

  const [firstA, firstB, secondResult] = await Promise.all([
    Promise.resolve(first.construct(input({ executionId: 'first-a' }))),
    Promise.resolve(first.construct(input({ executionId: 'first-b' }))),
    Promise.resolve(
      second.construct(
        input({ executionId: 'second', targetId: 'second-target', payload: 'second-payload' }),
      ),
    ),
  ]);
  firstA.signingRequest.payload = 'mutated-result';

  assert.equal(firstB.signingRequest.signingRequestId, 'first-b');
  assert.equal(secondResult.targetId, 'second-target');
  assert.equal(secondResult.signingRequest.signerId, 'second-signer');
  assert.equal(
    first
      .construct(input({ executionId: 'first-a' }))
      .signingRequest.payload.includes('mutated-result'),
    false,
  );
});

test('integrates with the existing signer boundary only through explicit later invocation', async () => {
  let signerCalls = 0;
  const constructor = createRitualInferenceTransactionConstructor(configuration());
  const signer = createRitualTransactionSigningBoundary(
    { signerId: 'explicit-operator-signer' },
    async (request) => {
      signerCalls += 1;
      return {
        status: 'signed',
        signingRequestId: request.signingRequestId,
        signerId: request.signerId,
        signedPayload: 'opaque-signed-envelope',
      };
    },
  );

  assert.throws(
    () => constructor.construct(input({ targetId: 'invalid' })),
    /construction input is invalid/u,
  );
  assert.equal(signerCalls, 0);
  const constructed = constructor.construct(input());
  assert.equal(signerCalls, 0);
  assert.equal((await signer.sign(constructed.signingRequest)).status, 'signed');
  assert.equal(signerCalls, 1);
});

test('keeps construction root-contained and free of broadcast or credential-shaped contracts', async () => {
  const root = await import('../dist/index.js');
  assert.equal(typeof root.createRitualInferenceTransactionConstructor, 'function');
  await assert.rejects(
    () => import('@cryptodesk-ai/ritual-gateway/ritual-inference-transaction-construction'),
  );

  const declaration = await readFile(
    new URL('../dist/ritual-inference-transaction-construction.d.ts', import.meta.url),
    'utf8',
  );
  const contractText = declaration.replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.equal(
    /privateKey|seedPhrase|mnemonic|credential|walletFile|process\.env/u.test(contractText),
    false,
  );
  assert.equal(
    /broadcast|receipt|settlement|nonce|gas|fee|rpcEndpoint|sendRawTransaction/u.test(contractText),
    false,
  );
});
