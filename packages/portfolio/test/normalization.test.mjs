import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioAssetKind,
  PortfolioPositionKind,
  PortfolioValidationError,
  normalizePortfolioSnapshot,
  portfolioPositionIdentity,
  portfolioSnapshotIdentity,
} from '../dist/index.js';

function position(overrides = {}) {
  return {
    id: 'position-btc',
    sourceId: 'source-a',
    accountId: 'account-a',
    kind: PortfolioPositionKind.AssetBalance,
    asset: {
      id: 'btc-network-a',
      symbol: 'BTC',
      kind: PortfolioAssetKind.Native,
      networkId: 'network-a',
    },
    quantity: 1,
    observedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(positions = [position()], overrides = {}) {
  return {
    portfolio: {
      id: 'portfolio-1',
      label: 'Primary',
      sources: [
        { id: 'source-b', label: 'Source B' },
        { id: 'source-a', label: 'Source A' },
      ],
      accounts: [{ id: 'account-a', sourceId: 'source-a', label: 'Account A' }],
    },
    capturedAt: '2026-08-10T00:00:00.000Z',
    positions,
    ...overrides,
  };
}

test('orders sources, accounts, and positions canonically regardless of input ordering', () => {
  const first = normalizePortfolioSnapshot(
    snapshot([
      position({ id: 'z-position' }),
      position({
        id: 'a-position',
        asset: { ...position().asset, id: 'eth-network-a', symbol: 'ETH' },
      }),
    ]),
  );
  const second = normalizePortfolioSnapshot(
    snapshot([...first.positions].reverse(), {
      portfolio: { ...first.portfolio, sources: [...first.portfolio.sources].reverse() },
    }),
  );

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.portfolio.sources.map((source) => source.id),
    ['source-a', 'source-b'],
  );
  assert.deepEqual(
    first.positions.map((item) => item.id),
    ['z-position', 'a-position'],
  );
});

test('collapses exact equivalent observations without changing identity, quantity, timestamps, or provenance', () => {
  const duplicate = position();
  const normalized = normalizePortfolioSnapshot(snapshot([position(), duplicate]));

  assert.equal(normalized.positions.length, 1);
  assert.equal(normalized.positions[0].quantity, 1);
  assert.equal(normalized.positions[0].observedAt, '2026-08-10T00:00:00.000Z');
  assert.equal(normalized.positions[0].sourceId, 'source-a');
  assert.equal(
    portfolioPositionIdentity(normalized.positions[0]),
    portfolioPositionIdentity(position()),
  );
  assert.equal(portfolioSnapshotIdentity(normalized), portfolioSnapshotIdentity(snapshot()));
  assert.deepEqual(normalizePortfolioSnapshot(normalized), normalized);
});

test('rejects conflicting duplicate observations and preserves independent same-asset positions', () => {
  assert.throws(
    () => normalizePortfolioSnapshot(snapshot([position(), position({ quantity: 2 })])),
    PortfolioValidationError,
  );

  const normalized = normalizePortfolioSnapshot(
    snapshot([
      position({ id: 'spot-btc', quantity: 1 }),
      position({ id: 'lending-btc', kind: PortfolioPositionKind.Lending, quantity: 3 }),
    ]),
  );
  assert.equal(normalized.positions.length, 2);
  assert.deepEqual(
    normalized.positions.map((item) => item.quantity),
    [3, 1],
  );
});

test('preserves same assets from distinct sources and supports empty or partial contract data', () => {
  const multiSource = normalizePortfolioSnapshot(
    snapshot([
      position({ id: 'position-btc', sourceId: 'source-a', accountId: 'account-a' }),
      position({ id: 'position-btc', sourceId: 'source-b', accountId: undefined }),
    ]),
  );
  assert.equal(multiSource.positions.length, 2);

  const empty = normalizePortfolioSnapshot(snapshot([]));
  assert.deepEqual(empty.positions, []);
  const partial = normalizePortfolioSnapshot(
    snapshot(
      [
        position({
          sourceId: undefined,
          accountId: undefined,
          kind: undefined,
          externalRecordId: undefined,
        }),
      ],
      { portfolio: { id: 'portfolio-2', label: 'Partial', sources: [] } },
    ),
  );
  assert.equal(partial.positions[0].sourceId, undefined);
  assert.equal(partial.positions[0].asset.networkId, 'network-a');
});
