import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRitualInferenceSimulation,
  createRitualNetworkConfiguration,
  createRitualReferenceRegistry,
} from '../dist/index.js';

const network = createRitualNetworkConfiguration({
  networkId: 'ritual-testnet-fixture',
  chainId: 1979,
  httpRpcUrl: 'https://rpc.example.test',
  explorerBaseUrl: 'https://explorer.example.test',
  nativeCurrencySymbol: 'RITUAL',
});
const registry = createRitualReferenceRegistry({
  networkId: network.networkId,
  references: [
    {
      identifier: 'llm',
      category: 'precompile',
      address: '0x0000000000000000000000000000000000000802',
    },
  ],
});
const request = {
  networkId: network.networkId,
  targetIdentifier: 'llm',
  requestId: 'synthetic-r3-request',
  modelId: 'synthetic-model',
  input: 'synthetic local prompt',
};

test('constructs an explicit prepared request and executes one deterministic fake attempt', async () => {
  let calls = 0;
  const simulation = createRitualInferenceSimulation(network, registry, async (prepared) => {
    calls += 1;
    assert.equal(prepared.targetAddress, registry.lookup('llm').address);
    return { requestId: prepared.requestId, status: 'completed', output: 'synthetic output' };
  });
  const result = await simulation.execute(request);
  assert.equal(result.status, 'completed');
  assert.equal(result.evidence.mode, 'simulated');
  assert.equal(result.aiResult.authority, 'untrusted_model_execution');
  assert.equal(calls, 1);
  assert.equal('transactionHash' in result.prepared, false);
});

test('requires explicit target and fails missing targets without fallback', async () => {
  const simulation = createRitualInferenceSimulation(network, registry, async () => {
    throw new Error('must not execute');
  });
  const result = await simulation.execute({ ...request, targetIdentifier: 'onnx' });
  assert.deepEqual(result, { status: 'failed', reason: 'target_missing' });
});

test('transport and hostile/malformed results are terminal, bounded, and never retried', async () => {
  let calls = 0;
  const simulation = createRitualInferenceSimulation(network, registry, async () => {
    calls += 1;
    throw new Error('/private/path token');
  });
  const result = await simulation.execute(request);
  assert.equal(result.reason, 'transport_failure');
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(calls, 1);
  const malformed = createRitualInferenceSimulation(network, registry, async (prepared) => ({
    requestId: prepared.requestId,
    status: 'completed',
    output: 'x'.repeat(16_385),
  }));
  assert.equal((await malformed.execute(request)).reason, 'result_invalid');
});

test('request validation, immutability, deterministic hash, and authority separation hold', async () => {
  const simulation = createRitualInferenceSimulation(network, registry, async (prepared) => ({
    requestId: prepared.requestId,
    status: 'completed',
    output: 'ok',
  }));
  const first = await simulation.execute(request);
  const second = await simulation.execute({ ...request });
  assert.equal(first.status, 'completed');
  assert.equal(first.prepared.requestHash, second.prepared.requestHash);
  assert.equal(Object.isFrozen(first.prepared), true);
  assert.equal(Object.isFrozen(first.evidence), true);
  assert.equal(JSON.stringify(first).includes('canonical'), false);
  await assert.rejects(() => simulation.execute({ ...request, requestId: '' }), TypeError);
  await assert.rejects(
    () => simulation.execute({ ...request, input: 'x'.repeat(8193) }),
    TypeError,
  );
});
