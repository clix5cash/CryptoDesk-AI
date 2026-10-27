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
  number: '0x10',
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

function capturedTransport(calls, overrides = {}) {
  return async (rpc) => {
    calls.push(rpc);
    const value = overrides[rpc.method];
    if (value instanceof Error) throw value;
    return result(
      rpc.id,
      value ??
        {
          eth_chainId: '0x7bb',
          eth_blockNumber: '0x10',
          eth_getBlockByNumber: {
            ...block,
            gasUsed: '0x1',
            transactions: ['0x' + 'b'.repeat(64)],
            withdrawals: [],
            extraData: '0x',
          },
          eth_getCode: '0x6000',
        }[rpc.method],
    );
  };
}

test('full block fields and code evidence share the fixed observed block and immutable provenance', async () => {
  const calls = [];
  const report = await createRitualReadOnlyVerificationAdapter(
    network,
    registry,
    capturedTransport(calls),
  ).verify({ referenceIdentifiers: ['llm'] });
  assert.equal(report.network.status, 'verified');
  assert.deepEqual(
    calls.map(({ method, params }) => [method, params]),
    [
      ['eth_chainId', []],
      ['eth_blockNumber', []],
      ['eth_getBlockByNumber', ['0x10', false]],
      ['eth_getCode', [registry.lookup('llm').address, '0x10']],
    ],
  );
  assert.deepEqual(report.references[0], {
    ...registry.lookup('llm'),
    networkId: network.networkId,
    chainId: 1979,
    blockNumber: 16,
    status: 'code_present',
    codeLength: 2,
  });
  assert.equal(Object.isFrozen(report.references[0]), true);
  assert.equal(Object.isFrozen(report.references), true);
});

for (const [name, value] of Object.entries({
  mismatch: { ...block, number: '0x11' },
  missingNumber: { hash: block.hash, timestamp: block.timestamp },
  badNumber: { ...block, number: '0x010' },
  missingHash: { number: '0x10', timestamp: '0x1' },
  badHash: { ...block, hash: '0x1234' },
  missingTimestamp: { number: '0x10', hash: block.hash },
  badTimestamp: { ...block, timestamp: '0x01' },
  unsafeTimestamp: { ...block, timestamp: '0x20000000000000' },
  excessiveExtra: { ...block, extraData: 'x'.repeat(16385) },
}))
  test(`rejects ${name} block evidence and stops before references`, async () => {
    const calls = [];
    const report = await createRitualReadOnlyVerificationAdapter(
      network,
      registry,
      capturedTransport(calls, { eth_getBlockByNumber: value }),
    ).verify({ referenceIdentifiers: ['llm'] });
    assert.equal(report.network.status, 'inconclusive');
    assert.equal(report.reason, 'response_invalid');
    assert.equal(calls.length, 3);
    assert.deepEqual(report.references, []);
  });

for (const [name, code, status] of [
  ['absent', '0x', 'code_absent'],
  ['present', '0x6000', 'code_present'],
  ['malformed', '0x1', 'inconclusive'],
  ['transport failure', new Error('sensitive-fixture'), 'inconclusive'],
])
  test(`fixed reference ${name} without retry`, async () => {
    const calls = [];
    const report = await createRitualReadOnlyVerificationAdapter(
      network,
      registry,
      capturedTransport(calls, { eth_getCode: code }),
    ).verify({ referenceIdentifiers: ['llm'] });
    assert.equal(report.references[0].status, status);
    assert.equal(report.references[0].blockNumber, 16);
    assert.equal(calls.length, 4);
    assert.equal(JSON.stringify(report).includes('sensitive-fixture'), false);
  });

test('selection bounds and duplicates fail before transport', async () => {
  const calls = [];
  const adapter = createRitualReadOnlyVerificationAdapter(
    network,
    registry,
    capturedTransport(calls),
  );
  await assert.rejects(() => adapter.verify({ referenceIdentifiers: ['llm', 'llm'] }), TypeError);
  await assert.rejects(
    () => adapter.verify({ referenceIdentifiers: Array.from({ length: 65 }, (_, i) => `ref${i}`) }),
    TypeError,
  );
  assert.equal(calls.length, 0);
});

for (const method of ['eth_blockNumber', 'eth_getBlockByNumber'])
  test(`stops on ${method} transport failure`, async () => {
    const calls = [];
    const report = await createRitualReadOnlyVerificationAdapter(
      network,
      registry,
      capturedTransport(calls, { [method]: new Error('private-fixture') }),
    ).verify({ referenceIdentifiers: ['llm'] });
    assert.equal(report.reason, 'transport_failure');
    assert.equal(calls.length, method === 'eth_blockNumber' ? 2 : 3);
  });

test('rejects bad envelope without weakening ID or extra-field checks', async () => {
  for (const envelope of [
    { jsonrpc: '2.0', id: 'wrong', result: '0x7bb' },
    { jsonrpc: '2.0', id: 'ritual-network-chain-id', result: '0x7bb', extra: true },
  ]) {
    let calls = 0;
    const report = await createRitualReadOnlyVerificationAdapter(network, registry, async () => {
      calls++;
      return envelope;
    }).verify();
    assert.equal(report.reason, 'response_invalid');
    assert.equal(calls, 1);
  }
});

test('explicit Mainnet configuration verifies observed 784 and preserves selected order', async () => {
  const mainnet = createRitualNetworkConfiguration({
    ...network,
    networkId: 'ritual-mainnet-fixture',
    chainId: 784,
  });
  const refs = createRitualReferenceRegistry({
    networkId: mainnet.networkId,
    references: [
      registry.lookup('llm'),
      { identifier: 'wallet', category: 'system_contract', address: '0x' + '1'.repeat(40) },
    ],
  });
  const calls = [];
  const report = await createRitualReadOnlyVerificationAdapter(
    mainnet,
    refs,
    capturedTransport(calls, { eth_chainId: '0x310' }),
  ).verify({ referenceIdentifiers: ['wallet', 'llm'] });
  assert.equal(report.network.observedChainId, 784);
  assert.deepEqual(
    report.references.map(({ identifier }) => identifier),
    ['wallet', 'llm'],
  );
  assert.deepEqual(
    calls.slice(3).map(({ params }) => params),
    [
      [refs.lookup('wallet').address, '0x10'],
      [refs.lookup('llm').address, '0x10'],
    ],
  );
});
