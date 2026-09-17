import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRitualExecutionEvidence,
  createRitualNetworkConfiguration,
  createRitualReferenceRegistry,
  createRitualRpcRequest,
  validateRitualRpcResponse,
  verifyRitualNetwork,
} from '../dist/index.js';

const config = () =>
  createRitualNetworkConfiguration({
    networkId: 'ritual-testnet-fixture',
    chainId: 1979,
    httpRpcUrl: 'https://rpc.example.test',
    wsRpcUrl: 'wss://rpc.example.test/ws',
    explorerBaseUrl: 'https://explorer.example.test',
    nativeCurrencySymbol: 'RITUAL',
  });

test('requires explicit immutable network configuration with no default', () => {
  const value = config();
  assert.equal(Object.isFrozen(value), true);
  assert.throws(
    () =>
      createRitualNetworkConfiguration({
        chainId: 1979,
        httpRpcUrl: 'https://x.test',
        explorerBaseUrl: 'https://x.test',
        nativeCurrencySymbol: 'RITUAL',
      }),
    TypeError,
  );
  assert.throws(
    () => createRitualNetworkConfiguration({ ...value, httpRpcUrl: 'http://x.test' }),
    TypeError,
  );
});

test('registry is explicit, network-scoped, detached, and rejects duplicates', () => {
  const registry = createRitualReferenceRegistry({
    networkId: 'ritual-testnet-fixture',
    references: [
      {
        identifier: 'llm',
        category: 'precompile',
        address: '0x0000000000000000000000000000000000000802',
      },
    ],
  });
  assert.equal(registry.lookup('llm').address, '0x0000000000000000000000000000000000000802');
  assert.equal(registry.lookup('missing'), undefined);
  assert.throws(
    () =>
      createRitualReferenceRegistry({
        networkId: 'x',
        references: [
          {
            identifier: 'llm',
            category: 'precompile',
            address: '0x0000000000000000000000000000000000000802',
          },
          {
            identifier: 'llm',
            category: 'precompile',
            address: '0x0000000000000000000000000000000000000803',
          },
        ],
      }),
    TypeError,
  );
});

test('RPC request and response models are deterministic and sanitized', () => {
  const request = createRitualRpcRequest({ id: 'r1', method: 'eth_chainId', params: [] });
  assert.deepEqual(request, { jsonrpc: '2.0', id: 'r1', method: 'eth_chainId', params: [] });
  assert.deepEqual(
    validateRitualRpcResponse(
      { jsonrpc: '2.0', id: 'r1', error: { code: -1, message: 'secret' } },
      request,
    ),
    { jsonrpc: '2.0', id: 'r1', error: { code: -1 } },
  );
  assert.throws(
    () =>
      validateRitualRpcResponse({ jsonrpc: '2.0', id: 'r1', result: 'ok', extra: 'x' }, request),
    TypeError,
  );
});

test('network verification is evidence-driven', () => {
  const network = config();
  assert.equal(
    verifyRitualNetwork({ configuration: network, observed: {} }).status,
    'inconclusive',
  );
  assert.equal(
    verifyRitualNetwork({ configuration: network, observed: { chainId: 1, blockNumber: 2 } })
      .status,
    'mismatch',
  );
  assert.equal(
    verifyRitualNetwork({ configuration: network, observed: { chainId: 1979, blockNumber: 2 } })
      .status,
    'verified',
  );
});

test('execution evidence is detached and has no authority fields', () => {
  const evidence = createRitualExecutionEvidence({
    networkId: 'ritual-testnet-fixture',
    chainId: 1979,
    referenceIdentifier: 'llm',
    requestId: 'synthetic-request',
    receiptStatus: 'unknown',
  });
  assert.equal(Object.isFrozen(evidence), true);
  assert.throws(
    () =>
      createRitualExecutionEvidence({
        networkId: 'x',
        chainId: 1979,
        referenceIdentifier: 'llm',
        transactionHash: 'secret',
      }),
    TypeError,
  );
});
