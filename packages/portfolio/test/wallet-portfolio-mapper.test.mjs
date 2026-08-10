import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioPositionKind,
  PortfolioSourceKind,
  PortfolioValidationError,
  mapWalletAssetToPortfolioAsset,
  mapWalletSnapshotToPortfolioSnapshot,
  normalizePortfolioSnapshot,
  normalizeWalletSnapshot,
  portfolioAssetIdentity,
  validatePortfolioSnapshotIdentity,
} from '../dist/index.js';

function asset(overrides = {}) {
  return {
    id: 'wallet-asset-usdc',
    networkId: 'network-a',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    contractAddress: 'contract-usdc',
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  const usdc = asset();
  return {
    wallet: {
      id: 'wallet-a',
      address: 'Address-A',
      networkId: 'network-a',
      externalRecordId: 'source-wallet-a',
    },
    assets: [usdc],
    balances: [{ asset: usdc, amount: '000001234567890123456789' }],
    observedAt: '2026-08-10T00:00:00.000Z',
    blockHeight: '123',
    ...overrides,
  };
}

function mapping(overrides = {}) {
  return {
    portfolioId: 'portfolio-a',
    portfolioLabel: 'Primary portfolio',
    sourceId: 'source-wallet-a',
    sourceLabel: 'Wallet source',
    accountId: 'account-wallet-a',
    accountLabel: 'Wallet account',
    ...overrides,
  };
}

test('maps a canonical wallet snapshot into validated source, account, asset, and position records', () => {
  const raw = snapshot();
  const before = JSON.stringify(raw);
  const mapped = mapWalletSnapshotToPortfolioSnapshot(normalizeWalletSnapshot(raw), mapping());

  assert.equal(JSON.stringify(raw), before);
  assert.equal(mapped.capturedAt, raw.observedAt);
  assert.deepEqual(mapped.portfolio.sources, [
    {
      id: 'source-wallet-a',
      label: 'Wallet source',
      kind: PortfolioSourceKind.Wallet,
      externalRecordId: 'wallet-a',
      networkId: 'network-a',
      externalLocator: 'Address-A',
    },
  ]);
  assert.deepEqual(mapped.portfolio.accounts, [
    {
      id: 'account-wallet-a',
      sourceId: 'source-wallet-a',
      label: 'Wallet account',
      externalRecordId: 'source-wallet-a',
    },
  ]);
  assert.equal(mapped.positions.length, 1);
  const [position] = mapped.positions;
  assert.equal(position.quantity, '000001234567890123456789');
  assert.equal(position.kind, PortfolioPositionKind.AssetBalance);
  assert.equal(position.observedAt, raw.observedAt);
  assert.equal(position.asset.id, 'wallet-asset-usdc');
  assert.equal(position.asset.networkId, 'network-a');
  assert.equal(position.asset.contractAddress, 'contract-usdc');
  assert.equal(position.asset.decimals, 6);
  assert.equal(position.externalRecordId, 'wallet-asset-usdc');
  validatePortfolioSnapshotIdentity(mapped);
  assert.deepEqual(normalizePortfolioSnapshot(mapped), mapped);
});

test('is invariant to wallet input ordering and preserves zero, duplicate, and legacy inline balances exactly', () => {
  const alpha = asset({ id: 'asset-alpha', symbol: 'ALPHA', contractAddress: 'contract-alpha' });
  const beta = asset({ id: 'asset-beta', symbol: 'BETA', contractAddress: 'contract-beta' });
  const first = snapshot({
    assets: [beta, alpha],
    balances: [
      { asset: beta, amount: '0' },
      { asset: alpha, amount: '00042' },
      { asset: alpha, amount: '00042' },
    ],
  });
  const second = snapshot({
    assets: [alpha, beta],
    balances: [
      { asset: alpha, amount: '00042' },
      { asset: beta, amount: '0' },
    ],
  });

  const mappedFirst = mapWalletSnapshotToPortfolioSnapshot(first, mapping());
  const mappedSecond = mapWalletSnapshotToPortfolioSnapshot(second, mapping());
  assert.deepEqual(mappedFirst, mappedSecond);
  assert.deepEqual(
    mappedFirst.positions.map((position) => position.quantity),
    ['00042', '0'],
  );

  const legacy = mapWalletSnapshotToPortfolioSnapshot(
    snapshot({ assets: undefined, balances: [{ asset: alpha, amount: '7' }] }),
    mapping(),
  );
  assert.equal(legacy.positions[0].asset.id, 'asset-alpha');
  assert.equal(legacy.positions[0].quantity, '7');
});

test('keeps same-symbol assets on different networks distinct and maps empty snapshots without fabrication', () => {
  const mappedA = mapWalletSnapshotToPortfolioSnapshot(snapshot(), mapping());
  const networkBAsset = asset({ id: 'wallet-asset-usdc-b', networkId: 'network-b' });
  const mappedB = mapWalletSnapshotToPortfolioSnapshot(
    snapshot({
      wallet: { id: 'wallet-b', address: 'Address-B', networkId: 'network-b' },
      assets: [networkBAsset],
      balances: [{ asset: networkBAsset, amount: '9' }],
    }),
    mapping({ sourceId: 'source-wallet-b', accountId: 'account-wallet-b' }),
  );
  assert.notEqual(
    portfolioAssetIdentity(mappedA.positions[0].asset),
    portfolioAssetIdentity(mappedB.positions[0].asset),
  );

  const empty = mapWalletSnapshotToPortfolioSnapshot(
    snapshot({ assets: [], balances: [], blockHeight: undefined }),
    mapping(),
  );
  assert.deepEqual(empty.positions, []);
  assert.equal(empty.portfolio.sources[0].externalRecordId, 'wallet-a');
  assert.equal(empty.portfolio.accounts[0].id, 'account-wallet-a');
});

test('rejects invalid mapping or wallet conflicts explicitly without aggregation or mutation', () => {
  const raw = snapshot();
  const before = JSON.stringify(raw);
  assert.throws(
    () => mapWalletSnapshotToPortfolioSnapshot(raw, mapping({ portfolioId: ' ' })),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      mapWalletSnapshotToPortfolioSnapshot(
        snapshot({
          balances: [
            { asset: asset(), amount: '1' },
            { asset: asset(), amount: '2' },
          ],
        }),
        mapping(),
      ),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      mapWalletSnapshotToPortfolioSnapshot(
        snapshot({
          assets: [asset()],
          balances: [{ asset: asset({ id: 'unknown' }), amount: '1' }],
        }),
        mapping(),
      ),
    PortfolioValidationError,
  );
  assert.equal(JSON.stringify(raw), before);

  const native = mapWalletAssetToPortfolioAsset(
    asset({ id: 'native', contractAddress: undefined, name: undefined }),
  );
  assert.equal(native.contractAddress, undefined);
  assert.equal(native.decimals, 6);
});
