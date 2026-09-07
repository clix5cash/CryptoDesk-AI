import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RitualRpcConnectivityFailureKind,
  createRitualLiveRpcConnectivityChecker,
} from '../dist/index.js';
import { createRitualLiveRpcConnectivityCheckerWithTransport } from '../dist/ritual-live-rpc-connectivity.js';

const endpoint = 'https://rpc.ritualfoundation.org';
const expectedRequest = {
  jsonrpc: '2.0',
  id: 'cryptodesk-ritual-chain-id',
  method: 'eth_chainId',
  params: [],
};

function configuration(overrides = {}) {
  return { endpoint, expectedChainId: 1979, ...overrides };
}

function response(value, ok = true) {
  return {
    ok,
    async text() {
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  };
}

function rpcResult(result = '0x7bb', overrides = {}) {
  return { jsonrpc: '2.0', id: 'cryptodesk-ritual-chain-id', result, ...overrides };
}

test('performs one detached read-only chain-ID request and preserves explicit configuration', async () => {
  const source = configuration();
  const before = structuredClone(source);
  const calls = [];
  const checker = createRitualLiveRpcConnectivityCheckerWithTransport(source, async (request) => {
    calls.push({ endpoint: request.endpoint, body: request.body, aborted: request.signal.aborted });
    source.endpoint = 'https://mutated.invalid';
    return response(rpcResult());
  });

  assert.deepEqual(await checker.check(), { status: 'connected', chainId: 1979 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, before.endpoint);
  assert.deepEqual(JSON.parse(calls[0].body), expectedRequest);
  assert.equal(calls[0].aborted, false);
});

test('fails closed for wrong chains and hostile or malformed JSON-RPC responses without retry', async () => {
  const cases = [
    [rpcResult('0x1'), RitualRpcConnectivityFailureKind.ChainMismatch],
    ['not-json', RitualRpcConnectivityFailureKind.ResponseInvalid],
    [[], RitualRpcConnectivityFailureKind.ResponseInvalid],
    [rpcResult('1979'), RitualRpcConnectivityFailureKind.ResponseInvalid],
    [rpcResult('0x07bb'), RitualRpcConnectivityFailureKind.ResponseInvalid],
    [rpcResult('0x7bb', { id: 'substituted' }), RitualRpcConnectivityFailureKind.ResponseInvalid],
    [
      { jsonrpc: '1.0', id: expectedRequest.id, result: '0x7bb' },
      RitualRpcConnectivityFailureKind.ResponseInvalid,
    ],
    [{ jsonrpc: '2.0', id: expectedRequest.id }, RitualRpcConnectivityFailureKind.ResponseInvalid],
    [
      { ...rpcResult(), error: { code: -1, message: 'secret' } },
      RitualRpcConnectivityFailureKind.ResponseInvalid,
    ],
    [{ ...rpcResult(), vendorBody: 'secret' }, RitualRpcConnectivityFailureKind.ResponseInvalid],
    [
      { jsonrpc: '2.0', id: expectedRequest.id, error: { code: -1, message: 'secret' } },
      RitualRpcConnectivityFailureKind.RpcFailure,
    ],
    [
      {
        jsonrpc: '2.0',
        id: expectedRequest.id,
        error: { code: -1, message: 'secret', data: 'secret' },
      },
      RitualRpcConnectivityFailureKind.ResponseInvalid,
    ],
    [
      Object.assign(Object.create({ result: '0x7bb' }), { jsonrpc: '2.0', id: expectedRequest.id }),
      RitualRpcConnectivityFailureKind.ResponseInvalid,
    ],
  ];

  for (const [body, failureKind] of cases) {
    let calls = 0;
    const checker = createRitualLiveRpcConnectivityCheckerWithTransport(
      configuration(),
      async () => {
        calls += 1;
        return response(body);
      },
    );
    const result = await checker.check();
    assert.deepEqual(result, { status: 'failed', failureKind });
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});

test('sanitizes HTTP, transport, oversized-body, and timeout failures and recovers', async () => {
  const secret = 'https://user:token@private.invalid vendor body and stack';
  const outcomes = [
    async () => response(secret, false),
    async () => {
      throw new Error(secret);
    },
    async () => response('x'.repeat(16_385)),
    async (request) =>
      new Promise((resolve) => {
        request.signal.addEventListener('abort', () => resolve(response(rpcResult())));
      }),
    async () => response(rpcResult()),
  ];
  const expected = [
    RitualRpcConnectivityFailureKind.RpcFailure,
    RitualRpcConnectivityFailureKind.TransportFailure,
    RitualRpcConnectivityFailureKind.ResponseInvalid,
    RitualRpcConnectivityFailureKind.Timeout,
    undefined,
  ];
  let calls = 0;
  const checker = createRitualLiveRpcConnectivityCheckerWithTransport(
    configuration({ timeoutMs: 5 }),
    async (request) => {
      calls += 1;
      return outcomes.shift()(request);
    },
  );

  for (const failureKind of expected) {
    const result = await checker.check();
    assert.deepEqual(
      result,
      failureKind === undefined
        ? { status: 'connected', chainId: 1979 }
        : { status: 'failed', failureKind },
    );
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  assert.equal(calls, expected.length);
});

test('rejects invalid and prototype-shaped configuration before any network operation', () => {
  const inherited = Object.assign(Object.create({ endpoint }), { expectedChainId: 1979 });
  const invalid = [
    {},
    { endpoint, expectedChainId: 1 },
    { endpoint: 'http://rpc.ritualfoundation.org', expectedChainId: 1979 },
    { endpoint: 'file:///tmp/rpc', expectedChainId: 1979 },
    { endpoint: 'https://user:secret@rpc.ritualfoundation.org', expectedChainId: 1979 },
    { endpoint: `${endpoint}#fragment`, expectedChainId: 1979 },
    { endpoint, expectedChainId: 1979, timeoutMs: 0 },
    { endpoint, expectedChainId: 1979, unknown: true },
    inherited,
  ];

  for (const value of invalid) {
    assert.throws(
      () =>
        createRitualLiveRpcConnectivityCheckerWithTransport(value, async () =>
          response(rpcResult()),
        ),
      { name: 'TypeError', message: 'Ritual live RPC configuration is invalid.' },
    );
  }
});

test('keeps live connectivity instances and failure history isolated', async () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const first = createRitualLiveRpcConnectivityCheckerWithTransport(
    configuration({ endpoint: 'https://first.example' }),
    async (request) => {
      firstCalls += 1;
      assert.equal(request.endpoint, 'https://first.example');
      throw new Error('first-instance private failure');
    },
  );
  const second = createRitualLiveRpcConnectivityCheckerWithTransport(
    configuration({ endpoint: 'https://second.example' }),
    async (request) => {
      secondCalls += 1;
      assert.equal(request.endpoint, 'https://second.example');
      return response(rpcResult());
    },
  );

  assert.deepEqual(await first.check(), {
    status: 'failed',
    failureKind: RitualRpcConnectivityFailureKind.TransportFailure,
  });
  assert.deepEqual(await second.check(), { status: 'connected', chainId: 1979 });
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
});

test('keeps the native live factory public while HTTP and decoder contracts stay root-private', async () => {
  assert.equal(typeof createRitualLiveRpcConnectivityChecker, 'function');
  const root = await import('../dist/index.js');
  assert.equal('createRitualLiveRpcConnectivityCheckerWithTransport' in root, false);
  assert.equal('decodeChainIdResponse' in root, false);
});
