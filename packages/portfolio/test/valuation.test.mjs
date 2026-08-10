import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioPositionKind,
  PortfolioUnvaluedPositionReason,
  PortfolioValidationError,
  validatePortfolioValuation,
  valuePortfolioSnapshot,
} from '../dist/index.js';

function asset(overrides = {}) {
  return {
    id: 'asset-token-a',
    symbol: 'TOKEN',
    networkId: 'network-a',
    contractAddress: 'contract-a',
    decimals: 6,
    ...overrides,
  };
}

function position(overrides = {}) {
  return {
    id: 'position-a',
    sourceId: 'source-a',
    accountId: 'account-a',
    kind: PortfolioPositionKind.AssetBalance,
    asset: asset(),
    quantity: '1234567',
    observedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(positions = [position()]) {
  return {
    portfolio: {
      id: 'portfolio-a',
      label: 'Primary',
      sources: [{ id: 'source-a', label: 'Source A' }],
      accounts: [{ id: 'account-a', sourceId: 'source-a', label: 'Account A' }],
    },
    capturedAt: '2026-08-10T01:00:00.000Z',
    positions,
  };
}

function price(overrides = {}) {
  return {
    asset: asset(),
    price: '2.5',
    currency: 'USD',
    observedAt: '2026-08-10T00:30:00.000Z',
    sourceId: 'price-source-a',
    sourceRecordId: 'price-record-a',
    ...overrides,
  };
}

test('values an exact base-unit position without binary conversion and preserves price provenance', () => {
  const source = snapshot();
  const prices = [price()];
  const sourceBefore = JSON.stringify(source);
  const pricesBefore = JSON.stringify(prices);
  const valuation = valuePortfolioSnapshot(source, prices, { currency: 'USD' });

  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(prices), pricesBefore);
  assert.equal(valuation.totalValue, '3.0864175');
  assert.equal(valuation.asOf, source.capturedAt);
  assert.equal(valuation.positions.length, 1);
  assert.equal(valuation.positions[0].quantity, '1234567');
  assert.equal(valuation.positions[0].value, '3.0864175');
  assert.equal(valuation.positions[0].unitPrice.sourceId, 'price-source-a');
  assert.equal(valuation.positions[0].unitPrice.sourceRecordId, 'price-record-a');
});

test('supports deterministic multiple-position, zero-quantity, and zero-price valuation without aggregation of positions', () => {
  const secondAsset = asset({ id: 'asset-token-b', symbol: 'B', contractAddress: 'contract-b' });
  const positions = [
    position({ id: 'position-b', asset: secondAsset, quantity: 2 }),
    position({ id: 'position-a', quantity: '0' }),
  ];
  const prices = [
    price({ asset: secondAsset, price: '4', sourceRecordId: 'price-b' }),
    price({ price: '0' }),
  ];
  const first = valuePortfolioSnapshot(snapshot(positions), prices, { currency: 'USD' });
  const second = valuePortfolioSnapshot(snapshot([...positions].reverse()), [...prices].reverse(), {
    currency: 'USD',
  });

  assert.deepEqual(first, second);
  assert.equal(first.positions.length, 2);
  assert.equal(first.positions[0].value, '0');
  assert.equal(first.positions[1].value, '8');
  assert.equal(first.totalValue, '8');
});

test('returns explicit partial valuation records for missing price or missing decimals', () => {
  const noDecimals = position({
    id: 'no-decimals',
    asset: asset({ id: 'asset-no-decimals', decimals: undefined }),
    quantity: '5',
  });
  const noPrice = position({
    id: 'no-price',
    asset: asset({ id: 'asset-no-price' }),
    quantity: '7',
  });
  const valuation = valuePortfolioSnapshot(
    snapshot([position(), noDecimals, noPrice]),
    [price(), price({ asset: noDecimals.asset, sourceRecordId: 'price-no-decimals' })],
    { currency: 'USD' },
  );

  assert.equal(valuation.valuedPositionCount, 1);
  assert.equal(valuation.totalPositionCount, 3);
  assert.equal(valuation.totalValue, '3.0864175');
  assert.deepEqual(
    valuation.unvaluedPositions.map((item) => [item.positionId, item.reason]),
    [
      ['no-decimals', PortfolioUnvaluedPositionReason.MissingDecimals],
      ['no-price', PortfolioUnvaluedPositionReason.MissingPrice],
    ],
  );
});

test('rejects conflicting or mismatched price identity while collapsing exact duplicates deterministically', () => {
  const exact = [price(), price()];
  const canonical = valuePortfolioSnapshot(snapshot(), exact, { currency: 'USD' });
  assert.equal(canonical.positions.length, 1);

  assert.throws(
    () => valuePortfolioSnapshot(snapshot(), [price(), price({ price: '3' })], { currency: 'USD' }),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      valuePortfolioSnapshot(snapshot(), [price({ asset: asset({ networkId: 'network-b' }) })], {
        currency: 'USD',
      }),
    PortfolioValidationError,
  );

  const sameSymbolOtherNetwork = valuePortfolioSnapshot(
    snapshot(),
    [price({ asset: asset({ id: 'asset-token-b', networkId: 'network-b' }) })],
    { currency: 'USD' },
  );
  assert.equal(sameSymbolOtherNetwork.positions.length, 0);
  assert.equal(sameSymbolOtherNetwork.unvaluedPositions[0].reason, 'missing_price');
});

test('uses explicit asOf as a deterministic price cutoff and validates malformed valuation inputs', () => {
  const prices = [
    price({ observedAt: '2026-08-10T00:30:00.000Z', price: '2' }),
    price({ observedAt: '2026-08-10T02:00:00.000Z', price: '9', sourceRecordId: 'later' }),
  ];
  const before = JSON.stringify(prices);
  const valuation = valuePortfolioSnapshot(snapshot(), prices, {
    currency: 'USD',
    asOf: '2026-08-10T01:00:00.000Z',
  });
  assert.equal(valuation.positions[0].unitPrice.price, '2');
  assert.equal(JSON.stringify(prices), before);
  assert.deepEqual(
    valuation,
    valuePortfolioSnapshot(snapshot(), [...prices].reverse(), {
      currency: 'USD',
      asOf: '2026-08-10T01:00:00.000Z',
    }),
  );

  assert.throws(
    () => valuePortfolioSnapshot(snapshot(), [price({ price: '-1' })], { currency: 'USD' }),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      valuePortfolioSnapshot(snapshot(), [price({ observedAt: 'invalid' })], { currency: 'USD' }),
    PortfolioValidationError,
  );
  assert.throws(
    () => valuePortfolioSnapshot(snapshot(), [], { currency: ' ' }),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      validatePortfolioValuation({
        ...valuation,
        totalPositionCount: 2,
      }),
    PortfolioValidationError,
  );
});
