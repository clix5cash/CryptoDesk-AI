import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRitualNetworkConfiguration,
  createRitualReadOnlyVerificationAdapter,
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
const block = {
  hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  timestamp: '0x65',
};
const result = (id, value) => ({ jsonrpc: '2.0', id, result: value });

test('performs one deterministic network probe in fixed order and verifies matching evidence', async () => {
  const calls = [];
  const adapter = createRitualReadOnlyVerificationAdapter(network, registry, async (request) => {
    calls.push(request);
    return request.method === 'eth_chainId'
      ? result(request.id, '0x7bb')
      : request.method === 'eth_blockNumber'
        ? result(request.id, '0x10')
        : result(request.id, block);
  });
  const report = await adapter.verify();
  assert.equal(report.network.status, 'verified');
  assert.deepEqual(
    calls.map((call) => call.method),
    ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber'],
  );
  assert.equal(calls.length, 3);
});

test('terminates on chain mismatch without unnecessary later calls', async () => {
  let calls = 0;
  const adapter = createRitualReadOnlyVerificationAdapter(network, registry, async (request) => {
    calls += 1;
    return result(request.id, '0x1');
  });
  assert.equal((await adapter.verify()).network.status, 'mismatch');
  assert.equal(calls, 1);
});

test('maps transport and malformed evidence to bounded inconclusive reports without retry', async () => {
  let calls = 0;
  const adapter = createRitualReadOnlyVerificationAdapter(network, registry, async () => {
    calls += 1;
    throw new Error('private path and token');
  });
  const report = await adapter.verify();
  assert.equal(report.network.status, 'inconclusive');
  assert.equal(report.reason, 'transport_failure');
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.equal(calls, 1);
});

test('probes only explicitly selected references and preserves code presence/absence/missing states', async () => {
  const refs = createRitualReferenceRegistry({
    networkId: network.networkId,
    references: [
      {
        identifier: 'llm',
        category: 'precompile',
        address: '0x0000000000000000000000000000000000000802',
      },
      {
        identifier: 'http',
        category: 'precompile',
        address: '0x0000000000000000000000000000000000000803',
      },
    ],
  });
  const calls = [];
  const adapter = createRitualReadOnlyVerificationAdapter(network, refs, async (request) => {
    calls.push(request);
    if (request.method === 'eth_chainId') return result(request.id, '0x7bb');
    if (request.method === 'eth_blockNumber') return result(request.id, '0x10');
    if (request.method === 'eth_getBlockByNumber') return result(request.id, block);
    return result(request.id, request.params[0].endsWith('802') ? '0x6000' : '0x');
  });
  const report = await adapter.verify({ referenceIdentifiers: ['http', 'llm', 'missing'] });
  assert.deepEqual(
    report.references.map((reference) => reference.status),
    ['code_absent', 'code_present', 'inconclusive'],
  );
  assert.deepEqual(
    calls.slice(3).map((call) => call.params[0]),
    [refs.lookup('http').address, refs.lookup('llm').address],
  );
});

test('rejects invalid selections and malformed block/code responses fail closed', async () => {
  const adapter = createRitualReadOnlyVerificationAdapter(network, registry, async (request) =>
    request.method === 'eth_chainId'
      ? result(request.id, '0x7bb')
      : request.method === 'eth_blockNumber'
        ? result(request.id, '0x10')
        : result(request.id, { hash: 'bad', timestamp: '0x1' }),
  );
  assert.equal((await adapter.verify()).network.status, 'inconclusive');
  await assert.rejects(() => adapter.verify({ referenceIdentifiers: ['BAD'] }), TypeError);
});

test('verified network does not imply inference or canonical authority and reports are detached', async () => {
  const adapter = createRitualReadOnlyVerificationAdapter(network, registry, async (request) =>
    request.method === 'eth_chainId'
      ? result(request.id, '0x7bb')
      : request.method === 'eth_blockNumber'
        ? result(request.id, '0x10')
        : result(request.id, block),
  );
  const report = await adapter.verify();
  assert.equal(report.references.length, 0);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(JSON.stringify(report).includes('canonical'), false);
});
