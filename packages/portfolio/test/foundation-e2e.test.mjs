import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioAssetKind,
  PortfolioPositionKind,
  PortfolioValidationError,
  normalizePortfolioSnapshot,
  portfolioPositionIdentity,
  portfolioSnapshotIdentity,
  validatePortfolioSnapshotIdentity,
} from '../dist/index.js';

function position(overrides = {}) {
  return {
    id: 'position-1',
    sourceId: 'source-a',
    accountId: 'account-a',
    kind: PortfolioPositionKind.AssetBalance,
    asset: {
      id: 'asset-btc-a',
      symbol: 'BTC',
      kind: PortfolioAssetKind.Native,
      networkId: 'network-a',
    },
    quantity: 2,
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
        { id: 'source-b', label: 'B' },
        { id: 'source-a', label: 'A' },
      ],
      accounts: [{ id: 'account-a', sourceId: 'source-a', label: 'A' }],
    },
    capturedAt: '2026-08-10T00:00:00.000Z',
    positions,
    ...overrides,
  };
}

test('validates and canonicalizes a complete immutable portfolio snapshot end to end', () => {
  const raw = snapshot([
    position({
      id: 'position-eth',
      asset: { ...position().asset, id: 'asset-eth-a', symbol: 'ETH' },
    }),
    position({ id: 'position-btc' }),
  ]);
  const before = JSON.stringify(raw);

  validatePortfolioSnapshotIdentity(raw);
  const normalized = normalizePortfolioSnapshot(raw);

  assert.equal(JSON.stringify(raw), before);
  assert.notEqual(normalized, raw);
  assert.notEqual(normalized.portfolio, raw.portfolio);
  assert.notEqual(normalized.positions[0], raw.positions[0]);
  assert.deepEqual(
    normalized.portfolio.sources.map((source) => source.id),
    ['source-a', 'source-b'],
  );
  assert.deepEqual(
    normalized.positions.map((item) => item.id),
    ['position-btc', 'position-eth'],
  );
  assert.equal(portfolioSnapshotIdentity(normalized), portfolioSnapshotIdentity(raw));
  assert.equal(
    portfolioPositionIdentity(normalized.positions[0]),
    portfolioPositionIdentity(raw.positions[1]),
  );
});

test('keeps empty and permitted partial portfolio snapshots valid and deterministic', () => {
  const empty = snapshot([], { portfolio: { id: 'empty', label: 'Empty', sources: [] } });
  const normalizedEmpty = normalizePortfolioSnapshot(empty);
  assert.deepEqual(normalizedEmpty.positions, []);
  assert.equal(normalizedEmpty.portfolio.accounts, undefined);

  const partial = snapshot(
    [
      position({
        sourceId: undefined,
        accountId: undefined,
        asset: { id: 'asset', symbol: 'A' },
      }),
    ],
    { portfolio: { id: 'partial', label: 'Partial', sources: [], accounts: [] } },
  );
  assert.deepEqual(normalizePortfolioSnapshot(partial), normalizePortfolioSnapshot(partial));
});

test('rejects malformed domain invariants with deterministic PortfolioValidationError failures', () => {
  const invalidSnapshots = [
    snapshot([], {
      portfolio: {
        id: 'portfolio-1',
        label: 'Primary',
        sources: [
          { id: 'source-a', label: 'A' },
          { id: 'source-a', label: 'A duplicate' },
        ],
      },
    }),
    snapshot([], {
      portfolio: {
        id: 'portfolio-1',
        label: 'Primary',
        sources: [{ id: 'source-a', label: 'A' }],
        accounts: [
          { id: 'account-a', sourceId: 'source-a', label: 'A' },
          { id: 'account-a', sourceId: 'source-a', label: 'Duplicate' },
        ],
      },
    }),
    snapshot([position({ sourceId: 'source-a', accountId: 'account-a' })], {
      portfolio: {
        id: 'portfolio-1',
        label: 'Primary',
        sources: [
          { id: 'source-a', label: 'A' },
          { id: 'source-b', label: 'B' },
        ],
        accounts: [{ id: 'account-a', sourceId: 'source-b', label: 'Account' }],
      },
    }),
    snapshot([position({ quantity: -1 })]),
    snapshot([position({ quantity: Number.NaN })]),
    snapshot([position({ asset: { ...position().asset, networkId: ' ' } })]),
  ];

  for (const invalid of invalidSnapshots) {
    assert.throws(() => validatePortfolioSnapshotIdentity(invalid), PortfolioValidationError);
    assert.throws(() => normalizePortfolioSnapshot(invalid), PortfolioValidationError);
  }

  const first = snapshot([
    position({ sourceId: 'unknown-a' }),
    position({ sourceId: 'unknown-b' }),
  ]);
  const second = snapshot([...first.positions].reverse());
  assert.equal(
    failureMessage(() => normalizePortfolioSnapshot(first)),
    failureMessage(() => normalizePortfolioSnapshot(second)),
  );
});

test('does not aggregate quantities or drop provenance while normalizing duplicate observations', () => {
  const normalized = normalizePortfolioSnapshot(snapshot([position(), position()]));

  assert.equal(normalized.positions.length, 1);
  assert.equal(normalized.positions[0].quantity, 2);
  assert.equal(normalized.positions[0].sourceId, 'source-a');
  assert.equal(normalized.positions[0].accountId, 'account-a');
  assert.equal(normalized.positions[0].observedAt, '2026-08-10T00:00:00.000Z');
  assert.deepEqual(normalizePortfolioSnapshot(normalized), normalized);
});

function failureMessage(action) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return error.message;
  }
  throw new Error('Expected validation failure.');
}
