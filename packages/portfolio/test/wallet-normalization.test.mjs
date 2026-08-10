import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioValidationError,
  normalizeWalletSnapshot,
  walletAssetIdentity,
} from '../dist/index.js';

function asset(overrides = {}) {
  return {
    id: 'asset-btc',
    networkId: 'network-a',
    symbol: 'BTC',
    name: 'Bitcoin',
    decimals: 8,
    ...overrides,
  };
}

function balance(overrides = {}) {
  return { asset: asset(), amount: '00000042', ...overrides };
}

function snapshot(overrides = {}) {
  return {
    wallet: { id: 'wallet-1', address: 'Address-A', networkId: 'network-a' },
    assets: [asset()],
    balances: [balance()],
    observedAt: '2026-08-10T00:00:00.000Z',
    blockHeight: '123',
    ...overrides,
  };
}

test('canonically orders assets and balances independent of provider input ordering', () => {
  const btc = asset();
  const eth = asset({ id: 'asset-eth', symbol: 'ETH', name: 'Ether', decimals: 18 });
  const first = normalizeWalletSnapshot(
    snapshot({ assets: [eth, btc], balances: [balance({ asset: eth, amount: '2' }), balance()] }),
  );
  const second = normalizeWalletSnapshot(
    snapshot({ assets: [btc, eth], balances: [...first.balances].reverse() }),
  );

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.assets.map((item) => item.id),
    ['asset-btc', 'asset-eth'],
  );
  assert.deepEqual(
    first.balances.map((item) => item.asset.id),
    ['asset-btc', 'asset-eth'],
  );
  assert.equal(walletAssetIdentity(first.assets[0]), walletAssetIdentity(btc));
});

test('collapses exact duplicates without changing raw balance, timestamps, block height, or provenance', () => {
  const raw = snapshot({ balances: [balance(), balance()] });
  const before = JSON.stringify(raw);
  const normalized = normalizeWalletSnapshot(raw);

  assert.equal(JSON.stringify(raw), before);
  assert.equal(normalized.balances.length, 1);
  assert.equal(normalized.balances[0].amount, '00000042');
  assert.equal(normalized.balances[0].asset.name, 'Bitcoin');
  assert.equal(normalized.observedAt, '2026-08-10T00:00:00.000Z');
  assert.equal(normalized.blockHeight, '123');
  assert.deepEqual(normalizeWalletSnapshot(normalized), normalized);
});

test('rejects conflicting balance and asset records while preserving distinct same-symbol assets and zero balances', () => {
  assert.throws(
    () => normalizeWalletSnapshot(snapshot({ balances: [balance(), balance({ amount: '43' })] })),
    PortfolioValidationError,
  );
  assert.throws(
    () => normalizeWalletSnapshot(snapshot({ assets: [asset(), asset({ symbol: 'XBT' })] })),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      normalizeWalletSnapshot(
        snapshot({ assets: [asset()], balances: [balance({ asset: asset({ id: 'unknown' }) })] }),
      ),
    PortfolioValidationError,
  );
  assert.throws(
    () => normalizeWalletSnapshot(snapshot({ assets: [asset({ networkId: 'network-b' })] })),
    PortfolioValidationError,
  );

  const sameSymbol = normalizeWalletSnapshot(
    snapshot({
      assets: [
        asset({ id: 'asset-a', contractAddress: 'contract-a' }),
        asset({ id: 'asset-b', contractAddress: 'contract-b' }),
      ],
      balances: [
        balance({ asset: asset({ id: 'asset-a', contractAddress: 'contract-a' }), amount: '0' }),
        balance({ asset: asset({ id: 'asset-b', contractAddress: 'contract-b' }), amount: '5' }),
      ],
    }),
  );
  assert.equal(sameSymbol.balances.length, 2);
  assert.equal(sameSymbol.balances[0].amount, '0');
});

test('supports empty and legacy partial snapshots without fabricating an asset catalog', () => {
  const empty = normalizeWalletSnapshot(
    snapshot({ assets: [], balances: [], blockHeight: undefined }),
  );
  assert.deepEqual(empty.assets, []);
  assert.deepEqual(empty.balances, []);
  assert.equal(empty.blockHeight, undefined);

  const legacy = normalizeWalletSnapshot(snapshot({ assets: undefined, balances: [balance()] }));
  assert.equal(legacy.assets, undefined);
  assert.equal(legacy.balances.length, 1);
});
