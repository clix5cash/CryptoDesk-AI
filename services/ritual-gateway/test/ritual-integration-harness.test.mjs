import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRitualIntegrationHarness,
  assessRitualActivation,
  createRitualReadOnlyVerificationAdapter,
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
  number: '0x10',
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

const policy = { requiredReferences: [{ identifier: 'llm', requireCodePresent: true }] };
async function evidence() {
  return createRitualReadOnlyVerificationAdapter(network, registry, networkTransport).verify({
    referenceIdentifiers: ['llm'],
  });
}

test('evidence-only assessment has zero network/inference calls and no authority promotion', async () => {
  const report = await evidence();
  let networkCalls = 0;
  let inferenceCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    networkCalls++;
    throw new Error('offline only');
  };
  try {
    // Constructing the legacy harness does not execute either supplied capability.
    createRitualIntegrationHarness(
      network,
      registry,
      () => {
        networkCalls++;
        throw new Error('unexpected');
      },
      () => {
        inferenceCalls++;
        throw new Error('unexpected');
      },
    );
    const assessed = assessRitualActivation(network, registry, report, policy);
    assert.equal(assessed.status, 'read_only_verified');
    assert.deepEqual(assessed.requiredReferences, [{ identifier: 'llm', status: 'code_present' }]);
    assert.equal(Object.isFrozen(assessed.requiredReferences[0]), true);
    assert.equal(assessed.aiTrustEntry, undefined);
    assert.equal(assessed.inferenceStatus, undefined);
    assert.equal(assessed.evidenceMode, undefined);
    assert.equal(networkCalls, 0);
    assert.equal(inferenceCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const [name, mutate] of [
  [
    'missing reference',
    (r) => {
      r.references = [];
    },
  ],
  [
    'wrong network',
    (r) => {
      r.network.networkId = 'another';
    },
  ],
  [
    'wrong chain',
    (r) => {
      r.network.observedChainId = 784;
    },
  ],
  [
    'inconclusive',
    (r) => {
      r.network.status = 'inconclusive';
    },
  ],
  [
    'missing block hash',
    (r) => {
      delete r.network.latestBlockHash;
    },
  ],
  [
    'bad timestamp',
    (r) => {
      r.network.latestBlockTimestamp = -1;
    },
  ],
  [
    'duplicate references',
    (r) => {
      r.references.push({ ...r.references[0] });
    },
  ],
  [
    'contradictory references',
    (r) => {
      r.references.push({ ...r.references[0], status: 'code_absent', codeLength: 0 });
    },
  ],
  [
    'wrong reference block',
    (r) => {
      r.references[0].blockNumber++;
    },
  ],
  [
    'wrong reference network',
    (r) => {
      r.references[0].networkId = 'another';
    },
  ],
  [
    'wrong address',
    (r) => {
      r.references[0].address = '0x' + 'f'.repeat(40);
    },
  ],
  [
    'contradictory length',
    (r) => {
      r.references[0].codeLength = 0;
    },
  ],
  [
    'unknown authority field',
    (r) => {
      r.authority = 'trusted';
    },
  ],
  [
    'reference failure',
    (r) => {
      r.references[0].status = 'inconclusive';
      r.references[0].reason = 'transport_failure';
      delete r.references[0].codeLength;
    },
  ],
])
  test(`evidence-only fails closed: ${name}`, async () => {
    const report = structuredClone(await evidence());
    mutate(report);
    assert.equal(assessRitualActivation(network, registry, report, policy).status, 'blocked');
  });

test('malformed, cyclic and oversized evidence fails closed', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const report of [null, {}, cyclic, { huge: 'x'.repeat(16385) }])
    assert.equal(assessRitualActivation(network, registry, report, policy).status, 'blocked');
});

test('explicit absence policy and detached assessment preserve limited authority', async () => {
  const report = structuredClone(await evidence());
  Object.assign(report.references[0], { status: 'code_absent', codeLength: 0 });
  assert.equal(assessRitualActivation(network, registry, report, policy).status, 'blocked');
  const assessed = assessRitualActivation(network, registry, report, {
    requiredReferences: [{ identifier: 'llm' }],
  });
  assert.equal(assessed.status, 'read_only_verified');
  report.references[0].status = 'code_present';
  assert.equal(assessed.requiredReferences[0].status, 'code_absent');
});
