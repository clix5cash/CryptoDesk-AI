import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRitualIntegrationHarness,
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
  requestId: 'synthetic-r4-request',
  input: 'offline input',
};
const block = {
  hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  timestamp: '0x65',
};
const networkTransport = async (rpc) =>
  rpc.method === 'eth_chainId'
    ? { jsonrpc: '2.0', id: rpc.id, result: '0x7bb' }
    : rpc.method === 'eth_blockNumber'
      ? { jsonrpc: '2.0', id: rpc.id, result: '0x10' }
      : rpc.method === 'eth_getBlockByNumber'
        ? { jsonrpc: '2.0', id: rpc.id, result: block }
        : { jsonrpc: '2.0', id: rpc.id, result: '0x6000' };

test('blocks inference on network mismatch and inconclusive evidence', async () => {
  let calls = 0;
  const harness = createRitualIntegrationHarness(
    network,
    registry,
    async (rpc) => {
      calls += 1;
      return { jsonrpc: '2.0', id: rpc.id, result: '0x1' };
    },
    async () => {
      throw new Error('must not run');
    },
  );
  const result = await harness.run(request, {
    requiredReferences: [{ identifier: 'llm', requireCodePresent: true }],
  });
  assert.equal(result.activation.status, 'blocked');
  assert.equal(result.inference, undefined);
  assert.equal(calls, 1);
});

test('requires reference evidence before allowing one simulated inference attempt', async () => {
  let inferenceCalls = 0;
  const harness = createRitualIntegrationHarness(
    network,
    registry,
    networkTransport,
    async (prepared) => {
      inferenceCalls += 1;
      return { requestId: prepared.requestId, status: 'completed', output: 'synthetic result' };
    },
  );
  const result = await harness.run(request, {
    requiredReferences: [{ identifier: 'llm', requireCodePresent: true }],
  });
  assert.equal(result.activation.status, 'read_only_verified');
  assert.equal(result.activation.evidenceMode, 'simulated');
  assert.equal(result.activation.aiTrustEntry, 'untrusted_model_execution');
  assert.equal(result.inference.status, 'completed');
  assert.equal(inferenceCalls, 1);
});

test('missing required reference and malformed policy fail closed without inference', async () => {
  let calls = 0;
  const harness = createRitualIntegrationHarness(network, registry, networkTransport, async () => {
    calls += 1;
    return {};
  });
  const missing = await harness.run(request, { requiredReferences: [{ identifier: 'onnx' }] });
  assert.equal(missing.activation.status, 'blocked');
  assert.equal(calls, 0);
  await assert.rejects(
    () =>
      harness.run(request, { requiredReferences: [{ identifier: 'llm' }, { identifier: 'llm' }] }),
    TypeError,
  );
});

test('activation is read-only and reports remain detached', async () => {
  const harness = createRitualIntegrationHarness(
    network,
    registry,
    networkTransport,
    async (prepared) => ({ requestId: prepared.requestId, status: 'completed', output: 'ok' }),
  );
  const result = await harness.run(request, { requiredReferences: [] });
  assert.equal(result.activation.status, 'read_only_verified');
  assert.equal(Object.isFrozen(result.activation), true);
  assert.equal(JSON.stringify(result).includes('write'), false);
});
