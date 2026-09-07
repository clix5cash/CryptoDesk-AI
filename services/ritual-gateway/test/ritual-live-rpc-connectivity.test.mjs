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
  const bytes =
    value instanceof Uint8Array
      ? value
      : new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return {
    ok,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
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
  assert.deepEqual(await checker.check(), { status: 'connected', chainId: 1979 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].endpoint, before.endpoint);
  assert.equal(calls[1].endpoint, before.endpoint);
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
    [rpcResult('-0x7bb'), RitualRpcConnectivityFailureKind.ResponseInvalid],
    [rpcResult('0x'), RitualRpcConnectivityFailureKind.ResponseInvalid],
    [rpcResult('0x7bb', { id: 'substituted' }), RitualRpcConnectivityFailureKind.ResponseInvalid],
    [rpcResult('0x7bb', { id: null }), RitualRpcConnectivityFailureKind.ResponseInvalid],
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
    [
      `{"jsonrpc":"2.0","id":"${expectedRequest.id}","result":"0x7bb","__proto__":{}}`,
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

test('keeps concurrent timeout and successful operations isolated with operation-local abort state', async () => {
  const signals = [];
  let calls = 0;
  const checker = createRitualLiveRpcConnectivityCheckerWithTransport(
    configuration({ timeoutMs: 5 }),
    async (request) => {
      calls += 1;
      signals.push(request.signal);
      if (calls === 1) return new Promise(() => {});
      return response(rpcResult());
    },
  );

  const first = checker.check();
  const second = checker.check();
  assert.deepEqual(await second, { status: 'connected', chainId: 1979 });
  assert.deepEqual(await first, {
    status: 'failed',
    failureKind: RitualRpcConnectivityFailureKind.Timeout,
  });
  assert.equal(calls, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
});

test('keeps timeout terminal when an abort-ignoring transport resolves late', async () => {
  let settle;
  let calls = 0;
  const checker = createRitualLiveRpcConnectivityCheckerWithTransport(
    configuration({ timeoutMs: 5 }),
    async () => {
      calls += 1;
      return new Promise((resolve) => {
        settle = resolve;
      });
    },
  );

  const operation = checker.check();
  assert.deepEqual(await operation, {
    status: 'failed',
    failureKind: RitualRpcConnectivityFailureKind.Timeout,
  });
  settle(response(rpcResult()));
  await Promise.resolve();
  assert.equal(calls, 1);
});

test('applies the operation timeout through response-body consumption', async () => {
  let calls = 0;
  const checker = createRitualLiveRpcConnectivityCheckerWithTransport(
    configuration({ timeoutMs: 5 }),
    async () => {
      calls += 1;
      return {
        ok: true,
        body: new ReadableStream({ pull() {} }),
      };
    },
  );

  assert.deepEqual(await checker.check(), {
    status: 'failed',
    failureKind: RitualRpcConnectivityFailureKind.Timeout,
  });
  assert.equal(calls, 1);
});

test('bounds streamed bodies, rejects malformed UTF-8, sanitizes read failures, and recovers', async () => {
  const secret = 'secret response-reader exception';
  let cancelled = false;
  const oversized = {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(16_385));
      },
      cancel() {
        cancelled = true;
      },
    }),
  };
  const readFailure = {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.error(new Error(secret));
      },
    }),
  };
  const outcomes = [
    oversized,
    response(new Uint8Array([0xc3, 0x28])),
    readFailure,
    response(rpcResult()),
  ];
  const expected = [
    RitualRpcConnectivityFailureKind.ResponseInvalid,
    RitualRpcConnectivityFailureKind.ResponseInvalid,
    RitualRpcConnectivityFailureKind.TransportFailure,
    undefined,
  ];
  const checker = createRitualLiveRpcConnectivityCheckerWithTransport(configuration(), async () =>
    outcomes.shift(),
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
  assert.equal(cancelled, true);
});

test('recovers immediately after every supported live connectivity failure category', async () => {
  const secret = 'private endpoint response and stack';
  const failures = [
    [async () => response(secret, false), RitualRpcConnectivityFailureKind.RpcFailure],
    [
      async () => {
        throw new Error(secret);
      },
      RitualRpcConnectivityFailureKind.TransportFailure,
    ],
    [async () => response('x'.repeat(16_385)), RitualRpcConnectivityFailureKind.ResponseInvalid],
    [async () => response('not-json'), RitualRpcConnectivityFailureKind.ResponseInvalid],
    [
      async () => response({ jsonrpc: '2.0', id: expectedRequest.id }),
      RitualRpcConnectivityFailureKind.ResponseInvalid,
    ],
    [async () => response(rpcResult('0x1')), RitualRpcConnectivityFailureKind.ChainMismatch],
    [async () => new Promise(() => {}), RitualRpcConnectivityFailureKind.Timeout],
  ];

  for (const [failure, failureKind] of failures) {
    let calls = 0;
    const checker = createRitualLiveRpcConnectivityCheckerWithTransport(
      configuration({ timeoutMs: 5 }),
      async () => {
        calls += 1;
        return calls === 1 ? failure() : response(rpcResult());
      },
    );

    const failed = await checker.check();
    assert.deepEqual(failed, { status: 'failed', failureKind });
    assert.equal(JSON.stringify(failed).includes(secret), false);
    assert.deepEqual(await checker.check(), { status: 'connected', chainId: 1979 });
    assert.equal(calls, 2);
  }
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
    { endpoint: 'https://rpc.ritualfoundation.org\n.evil.example', expectedChainId: 1979 },
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
