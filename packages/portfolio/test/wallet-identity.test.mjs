import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioValidationError,
  normalizeWalletAddress,
  validateWalletMetadata,
  validateWalletMetadataCollection,
  validateWalletSnapshotIdentity,
  validateWalletSnapshotQuery,
  walletIdentity,
} from '../dist/index.js';

function wallet(overrides = {}) {
  return {
    id: 'wallet-1',
    address: 'AbC-123._~',
    networkId: 'network-a',
    ...overrides,
  };
}

test('derives stable logical identity from network and unchanged address text', () => {
  assert.equal(walletIdentity(wallet()), walletIdentity(wallet({ label: 'Display only' })));
  assert.notEqual(walletIdentity(wallet()), walletIdentity(wallet({ networkId: 'network-b' })));
  assert.equal(normalizeWalletAddress('AbC-123._~'), 'AbC-123._~');
});

test('rejects conflicting or duplicate wallet identities deterministically', () => {
  assert.throws(
    () => validateWalletMetadataCollection([wallet(), wallet({ address: 'other' })]),
    PortfolioValidationError,
  );
  assert.throws(
    () => validateWalletMetadataCollection([wallet(), wallet({ id: 'wallet-2' })]),
    PortfolioValidationError,
  );
  assert.throws(
    () => validateWalletMetadataCollection([wallet(), wallet()]),
    PortfolioValidationError,
  );

  const records = [wallet({ id: 'wallet-b', networkId: 'network-b' }), wallet({ id: 'wallet-a' })];
  validateWalletMetadataCollection(records);
  validateWalletMetadataCollection([...records].reverse());
});

test('uses safe generic validation and delegates optional network-specific rules only through injection', () => {
  for (const invalid of [
    wallet({ id: '' }),
    wallet({ address: ' ' }),
    wallet({ address: 'abc def' }),
    wallet({ networkId: '' }),
  ]) {
    assert.throws(() => validateWalletMetadata(invalid), PortfolioValidationError);
  }

  const calls = [];
  const validator = {
    validate(networkId, address) {
      calls.push([networkId, address]);
      if (address === 'rejected') throw new Error('local rule');
    },
  };
  validateWalletMetadata(wallet(), validator);
  assert.deepEqual(calls, [['network-a', 'AbC-123._~']]);
  assert.throws(
    () => validateWalletMetadata(wallet({ address: 'rejected' }), validator),
    PortfolioValidationError,
  );
});

test('validates unambiguous snapshot queries and raw snapshot identity without network transport', () => {
  validateWalletSnapshotQuery({ walletId: 'wallet-1', networkId: 'network-a' });
  assert.throws(
    () => validateWalletSnapshotQuery({ walletId: 'wallet-1', networkId: '' }),
    PortfolioValidationError,
  );
  assert.throws(
    () => validateWalletSnapshotQuery({ walletId: '', networkId: 'network-a' }),
    PortfolioValidationError,
  );

  const snapshot = {
    wallet: wallet(),
    balances: [],
    observedAt: '2026-08-10T00:00:00.000Z',
  };
  validateWalletSnapshotIdentity(snapshot);
  assert.throws(
    () => validateWalletSnapshotIdentity({ ...snapshot, observedAt: 'invalid' }),
    PortfolioValidationError,
  );
});
