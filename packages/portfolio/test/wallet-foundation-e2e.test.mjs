import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioValidationError,
  normalizeWalletSnapshot,
  validateWalletMetadata,
  validateWalletMetadataCollection,
  validateWalletSnapshotIdentity,
  validateWalletSnapshotQuery,
  walletIdentity,
} from '../dist/index.js';

function asset(overrides = {}) {
  return {
    id: 'asset-a',
    networkId: 'network-a',
    symbol: 'TOKEN',
    decimals: 18,
    contractAddress: 'contract-a',
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    wallet: { id: 'wallet-a', address: 'Address-A', networkId: 'network-a', label: 'Display' },
    assets: [asset()],
    balances: [{ asset: asset(), amount: '00042' }],
    observedAt: '2026-08-10T00:00:00.000Z',
    blockHeight: '123',
    ...overrides,
  };
}

test('validates and canonicalizes the full immutable wallet-domain path', () => {
  const raw = snapshot({
    assets: [asset({ id: 'asset-b', symbol: 'TOKEN', contractAddress: 'contract-b' }), asset()],
    balances: [
      {
        asset: asset({ id: 'asset-b', symbol: 'TOKEN', contractAddress: 'contract-b' }),
        amount: '0',
      },
      { asset: asset(), amount: '00042' },
    ],
  });
  const before = JSON.stringify(raw);
  const validatorCalls = [];
  const validator = {
    validate(networkId, address) {
      validatorCalls.push([networkId, address]);
    },
  };

  validateWalletMetadata(raw.wallet, validator);
  validateWalletSnapshotIdentity(raw, validator);
  const normalized = normalizeWalletSnapshot(raw, { addressValidator: validator });

  assert.equal(JSON.stringify(raw), before);
  assert.notEqual(normalized, raw);
  assert.notEqual(normalized.wallet, raw.wallet);
  assert.notEqual(normalized.assets[0], raw.assets[0]);
  assert.equal(walletIdentity(normalized.wallet), walletIdentity(raw.wallet));
  assert.deepEqual(
    normalized.assets.map((item) => item.id),
    ['asset-a', 'asset-b'],
  );
  assert.deepEqual(
    normalized.balances.map((item) => item.amount),
    ['00042', '0'],
  );
  assert.deepEqual(validatorCalls, [
    ['network-a', 'Address-A'],
    ['network-a', 'Address-A'],
    ['network-a', 'Address-A'],
  ]);
});

test('keeps legacy, empty, and optional wallet fields valid without fabricating data', () => {
  const empty = normalizeWalletSnapshot(
    snapshot({ assets: [], balances: [], blockHeight: undefined }),
  );
  assert.deepEqual(empty.assets, []);
  assert.deepEqual(empty.balances, []);
  assert.equal(empty.blockHeight, undefined);

  const legacy = normalizeWalletSnapshot(
    snapshot({
      assets: undefined,
      balances: [{ asset: asset({ contractAddress: undefined }), amount: '0' }],
    }),
  );
  assert.equal(legacy.assets, undefined);
  assert.equal(legacy.balances[0].asset.contractAddress, undefined);
});

test('rejects deterministic asset, balance, and metadata conflicts without mutation or repair', () => {
  const cases = [
    snapshot({ assets: [asset(), asset({ symbol: 'OTHER' })] }),
    snapshot({
      balances: [
        { asset: asset(), amount: '1' },
        { asset: asset(), amount: '2' },
      ],
    }),
    snapshot({ balances: [{ asset: asset({ id: 'unknown' }), amount: '1' }] }),
    snapshot({ assets: [asset({ networkId: 'network-b' })] }),
    snapshot({ balances: [{ asset: asset(), amount: '12.5' }] }),
    snapshot({ blockHeight: '0x12' }),
  ];
  for (const value of cases) {
    const before = JSON.stringify(value);
    assert.throws(() => normalizeWalletSnapshot(value), PortfolioValidationError);
    assert.equal(JSON.stringify(value), before);
  }

  const first = snapshot({
    balances: [
      { asset: asset(), amount: '1' },
      { asset: asset(), amount: '2' },
    ],
  });
  const second = snapshot({ balances: [...first.balances].reverse() });
  assert.equal(
    failureMessage(() => normalizeWalletSnapshot(first)),
    failureMessage(() => normalizeWalletSnapshot(second)),
  );
});

test('keeps wallet identity and query failures explicit without chain-specific assumptions', () => {
  assert.throws(
    () => validateWalletMetadata({ id: '', address: 'A', networkId: 'network-a' }),
    PortfolioValidationError,
  );
  assert.throws(
    () => validateWalletMetadata({ id: 'w', address: 'A B', networkId: 'network-a' }),
    PortfolioValidationError,
  );
  assert.throws(
    () => validateWalletMetadata({ id: 'w', address: 'A', networkId: '' }),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      validateWalletMetadataCollection([
        { id: 'w', address: 'A', networkId: 'network-a' },
        { id: 'w', address: 'B', networkId: 'network-a' },
      ]),
    PortfolioValidationError,
  );
  assert.notEqual(
    walletIdentity({ id: 'w-a', address: 'Address-A', networkId: 'network-a' }),
    walletIdentity({ id: 'w-b', address: 'Address-A', networkId: 'network-b' }),
  );
  validateWalletSnapshotQuery({ walletId: 'wallet-a', networkId: 'network-a' });
  assert.throws(
    () => validateWalletSnapshotQuery({ walletId: 'wallet-a', networkId: '' }),
    PortfolioValidationError,
  );
});

function failureMessage(action) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return error.message;
  }
  throw new Error('Expected validation failure.');
}
