import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioAssetKind,
  PortfolioPositionKind,
  PortfolioValidationError,
  portfolioAssetIdentity,
  portfolioPositionIdentity,
  portfolioSnapshotIdentity,
  validatePortfolioSnapshotIdentity,
} from '../dist/index.js';

function position(overrides = {}) {
  return {
    id: 'position-btc',
    sourceId: 'source-a',
    accountId: 'account-a',
    kind: PortfolioPositionKind.AssetBalance,
    asset: {
      id: 'btc-mainnet',
      symbol: 'BTC',
      kind: PortfolioAssetKind.Native,
      networkId: 'network-a',
    },
    quantity: 1,
    observedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(positions = [position()]) {
  return {
    portfolio: {
      id: 'portfolio-1',
      label: 'Primary',
      sources: [
        { id: 'source-a', label: 'Source A' },
        { id: 'source-b', label: 'Source B' },
      ],
      accounts: [{ id: 'account-a', sourceId: 'source-a', label: 'Account A' }],
    },
    capturedAt: '2026-08-10T00:00:00.000Z',
    positions,
  };
}

test('keeps same-symbol representations on different networks distinct', () => {
  const first = portfolioAssetIdentity(position().asset);
  const second = portfolioAssetIdentity({
    ...position().asset,
    id: 'btc-network-b',
    networkId: 'network-b',
  });

  assert.notEqual(first, second);
});

test('derives stable position identity from explicit source, account, and position IDs', () => {
  const repeated = position({ quantity: 2, observedAt: '2026-08-10T01:00:00.000Z' });
  assert.equal(portfolioPositionIdentity(position()), portfolioPositionIdentity(repeated));
  assert.notEqual(
    portfolioPositionIdentity(position({ sourceId: 'source-b', accountId: undefined })),
    portfolioPositionIdentity(position()),
  );
  assert.notEqual(
    portfolioPositionIdentity(
      position({ id: 'position-btc-lending', kind: PortfolioPositionKind.Lending }),
    ),
    portfolioPositionIdentity(position()),
  );
});

test('validates duplicate and conflicting logical positions explicitly and independently of order', () => {
  const duplicate = position();
  assert.throws(
    () => validatePortfolioSnapshotIdentity(snapshot([position(), duplicate])),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioSnapshotIdentity(
        snapshot([position(), position({ asset: { ...position().asset, id: 'other-btc' } })]),
      ),
    PortfolioValidationError,
  );

  const first = snapshot([
    position({ id: 'a' }),
    position({ id: 'b', sourceId: 'source-b', accountId: undefined }),
  ]);
  const second = snapshot([...first.positions].reverse());
  validatePortfolioSnapshotIdentity(first);
  validatePortfolioSnapshotIdentity(second);
  assert.equal(portfolioSnapshotIdentity(first), portfolioSnapshotIdentity(second));
});

test('rejects malformed identifiers and invalid source or account references', () => {
  assert.throws(
    () => portfolioAssetIdentity({ ...position().asset, id: ' ' }),
    PortfolioValidationError,
  );
  assert.throws(() => portfolioPositionIdentity(position({ id: '' })), PortfolioValidationError);
  assert.throws(
    () => validatePortfolioSnapshotIdentity(snapshot([position({ sourceId: 'unknown' })])),
    PortfolioValidationError,
  );
  assert.throws(
    () => validatePortfolioSnapshotIdentity(snapshot([position({ accountId: 'unknown' })])),
    PortfolioValidationError,
  );
  assert.throws(
    () => portfolioSnapshotIdentity({ ...snapshot(), capturedAt: 'not-a-timestamp' }),
    PortfolioValidationError,
  );
});
