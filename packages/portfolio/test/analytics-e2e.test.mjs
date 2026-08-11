import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PortfolioValidationError,
  PortfolioUnvaluedPositionReason,
  analyzePortfolioAllocation,
  mapWalletSnapshotToPortfolioSnapshot,
  normalizePortfolioSnapshot,
  normalizeWalletSnapshot,
  portfolioAssetIdentity,
  validatePortfolioSnapshotIdentity,
  validateWalletSnapshotIdentity,
  valuePortfolioSnapshot,
} from '../dist/index.js';

function asset(overrides = {}) {
  return {
    id: 'asset-alpha',
    networkId: 'network-a',
    symbol: 'ALPHA',
    name: 'Alpha',
    decimals: 6,
    contractAddress: 'contract-alpha',
    ...overrides,
  };
}

function walletSnapshot(overrides = {}) {
  const alpha = asset();
  const beta = asset({
    id: 'asset-beta',
    symbol: 'BETA',
    name: 'Beta',
    contractAddress: 'contract-beta',
  });
  return {
    wallet: {
      id: 'wallet-a',
      address: 'Address-A',
      networkId: 'network-a',
      externalRecordId: 'wallet-record-a',
    },
    assets: [beta, alpha],
    balances: [
      { asset: beta, amount: '2000000' },
      { asset: alpha, amount: '900719925474099312345678' },
      { asset: alpha, amount: '900719925474099312345678' },
    ],
    observedAt: '2026-08-11T01:00:00.000Z',
    blockHeight: '987654321',
    ...overrides,
  };
}

function mapping(overrides = {}) {
  return {
    portfolioId: 'portfolio-a',
    portfolioLabel: 'Primary',
    sourceId: 'wallet-source-a',
    sourceLabel: 'Wallet A',
    accountId: 'wallet-account-a',
    accountLabel: 'Wallet account A',
    ...overrides,
  };
}

function price(assetValue, value, observedAt, overrides = {}) {
  return {
    asset: assetValue,
    price: value,
    currency: 'USD',
    observedAt,
    sourceId: 'price-source-a',
    sourceRecordId: `price-${assetValue.id}-${observedAt}`,
    ...overrides,
  };
}

function completePipeline(raw, configuredMapping, prices) {
  validateWalletSnapshotIdentity(raw);
  const normalizedWallet = normalizeWalletSnapshot(raw);
  const mapped = mapWalletSnapshotToPortfolioSnapshot(normalizedWallet, configuredMapping);
  validatePortfolioSnapshotIdentity(mapped);
  const normalizedPortfolio = normalizePortfolioSnapshot(mapped);
  const valuation = valuePortfolioSnapshot(normalizedPortfolio, prices, { currency: 'USD' });
  const analysis = analyzePortfolioAllocation(normalizedPortfolio, valuation);
  return { normalizedWallet, mapped, normalizedPortfolio, valuation, analysis };
}

test('preserves identity, provenance, exact large quantities, and temporal price selection end to end', () => {
  const raw = walletSnapshot();
  const configuredMapping = mapping();
  const mappedForPrices = mapWalletSnapshotToPortfolioSnapshot(raw, configuredMapping);
  const alpha = mappedForPrices.positions.find((item) => item.asset.id === 'asset-alpha').asset;
  const beta = mappedForPrices.positions.find((item) => item.asset.id === 'asset-beta').asset;
  const prices = [
    price(alpha, '1.25', '2026-08-11T00:00:00.000Z'),
    price(alpha, '1.5', '2026-08-11T00:30:00.000Z'),
    price(alpha, '99', '2026-08-11T02:00:00.000Z'),
    price(beta, '2', '2026-08-11T00:30:00.000Z'),
  ];
  const { normalizedWallet, mapped, normalizedPortfolio, valuation, analysis } = completePipeline(
    raw,
    configuredMapping,
    prices,
  );

  assert.equal(normalizedWallet.balances.length, 2);
  assert.equal(normalizedWallet.balances[0].amount, '900719925474099312345678');
  assert.equal(mapped.capturedAt, raw.observedAt);
  assert.equal(mapped.portfolio.sources[0].externalRecordId, raw.wallet.id);
  assert.equal(mapped.portfolio.sources[0].networkId, raw.wallet.networkId);
  assert.equal(mapped.portfolio.sources[0].externalLocator, raw.wallet.address);
  assert.equal(mapped.portfolio.accounts[0].id, configuredMapping.accountId);
  assert.equal(mapped.positions[0].asset.contractAddress, 'contract-alpha');
  assert.equal(mapped.positions[0].quantity, '900719925474099312345678');
  assert.equal(mapped.positions[0].observedAt, raw.observedAt);
  assert.equal(normalizedPortfolio.capturedAt, raw.observedAt);
  assert.equal(valuation.asOf, raw.observedAt);
  assert.equal(valuation.positions[0].unitPrice.price, '1.5');
  assert.equal(valuation.positions[0].unitPrice.sourceId, 'price-source-a');
  assert.equal(
    valuation.positions[0].unitPrice.sourceRecordId,
    'price-asset-alpha-2026-08-11T00:30:00.000Z',
  );
  assert.equal(valuation.positions[0].value, '1351079888211148968.518517');
  assert.equal(valuation.totalValue, '1351079888211148972.518517');
  assert.equal(analysis.totalValuedValue, valuation.totalValue);
  assert.equal(analysis.coverage.valuedPositionCoveragePercentage, '100');
  assert.equal(analysis.largestHoldings[0].asset.id, 'asset-alpha');
  assert.equal('risk' in analysis, false);
  assert.equal('recommendation' in analysis, false);
});

test('is invariant to wallet, balance, price, and derived position ordering without mutating inputs', () => {
  const first = walletSnapshot();
  const second = walletSnapshot({
    assets: [...walletSnapshot().assets].reverse(),
    balances: [...walletSnapshot().balances].reverse(),
  });
  const configuredMapping = mapping();
  const mappedForPrices = mapWalletSnapshotToPortfolioSnapshot(first, configuredMapping);
  const alpha = mappedForPrices.positions.find((item) => item.asset.id === 'asset-alpha').asset;
  const beta = mappedForPrices.positions.find((item) => item.asset.id === 'asset-beta').asset;
  const prices = [
    price(alpha, '1.5', '2026-08-11T00:30:00.000Z'),
    price(beta, '2', '2026-08-11T00:30:00.000Z'),
  ];
  const firstBefore = JSON.stringify(first);
  const secondBefore = JSON.stringify(second);
  const mappingBefore = JSON.stringify(configuredMapping);
  const pricesBefore = JSON.stringify(prices);
  const firstResult = completePipeline(first, configuredMapping, prices);
  const secondResult = completePipeline(second, configuredMapping, [...prices].reverse());

  assert.deepEqual(firstResult.normalizedWallet, secondResult.normalizedWallet);
  assert.deepEqual(firstResult.mapped, secondResult.mapped);
  assert.deepEqual(firstResult.normalizedPortfolio, secondResult.normalizedPortfolio);
  assert.deepEqual(firstResult.valuation, secondResult.valuation);
  assert.deepEqual(firstResult.analysis, secondResult.analysis);
  assert.deepEqual(completePipeline(first, configuredMapping, prices), firstResult);
  assert.equal(JSON.stringify(first), firstBefore);
  assert.equal(JSON.stringify(second), secondBefore);
  assert.equal(JSON.stringify(configuredMapping), mappingBefore);
  assert.equal(JSON.stringify(prices), pricesBefore);
});

test('keeps partial valuation explicit and uses unclassified exposure only for absent optional provenance', () => {
  const raw = walletSnapshot();
  const mapped = mapWalletSnapshotToPortfolioSnapshot(raw, mapping());
  const alpha = mapped.positions.find((item) => item.asset.id === 'asset-alpha');
  const beta = mapped.positions.find((item) => item.asset.id === 'asset-beta');
  const unpriced = {
    ...alpha,
    id: 'position-unpriced',
    asset: { ...alpha.asset, id: 'asset-unpriced', contractAddress: 'contract-unpriced' },
    quantity: '5',
  };
  const partial = normalizePortfolioSnapshot({
    ...mapped,
    positions: [
      {
        ...alpha,
        sourceId: undefined,
        accountId: undefined,
        asset: { ...alpha.asset, networkId: undefined },
      },
      { ...beta, asset: { ...beta.asset, decimals: undefined } },
      unpriced,
    ],
  });
  const priceInputs = [
    price(partial.positions[0].asset, '2', '2026-08-11T00:30:00.000Z'),
    price(partial.positions[1].asset, '2', '2026-08-11T00:30:00.000Z'),
  ];
  const valuation = valuePortfolioSnapshot(partial, priceInputs, { currency: 'USD' });
  const analysis = analyzePortfolioAllocation(partial, valuation);

  assert.equal(valuation.positions.length, 1);
  assert.equal(valuation.unvaluedPositions.length, 2);
  assert.equal(valuation.totalValue, valuation.positions[0].value);
  assert.deepEqual(
    valuation.unvaluedPositions.map((item) => item.reason),
    [PortfolioUnvaluedPositionReason.MissingDecimals, PortfolioUnvaluedPositionReason.MissingPrice],
  );
  assert.equal(analysis.assetAllocation.items.length, 1);
  assert.equal(analysis.assetAllocation.items[0].percentage, '100');
  assert.equal(analysis.coverage.valuedPositionCoveragePercentage, '33.3333');
  assert.equal(analysis.exposure.network.items[0].unclassified, true);
  assert.equal(analysis.exposure.source.items[0].unclassified, true);
  assert.equal(analysis.exposure.account.items[0].unclassified, true);
});

test('keeps cross-network same-symbol representations distinct and isolates failed calls', () => {
  const networkA = completePipeline(walletSnapshot(), mapping(), []);
  const networkBAsset = asset({
    id: 'asset-alpha-b',
    networkId: 'network-b',
    contractAddress: 'contract-alpha-b',
  });
  const networkB = completePipeline(
    walletSnapshot({
      wallet: { id: 'wallet-b', address: 'Address-B', networkId: 'network-b' },
      assets: [networkBAsset],
      balances: [{ asset: networkBAsset, amount: '1' }],
    }),
    mapping({ sourceId: 'wallet-source-b', accountId: 'wallet-account-b' }),
    [],
  );
  assert.notEqual(
    portfolioAssetIdentity(networkA.mapped.positions[0].asset),
    portfolioAssetIdentity(networkB.mapped.positions[0].asset),
  );

  assert.throws(
    () =>
      completePipeline(
        walletSnapshot({
          balances: [
            { asset: asset(), amount: '1' },
            { asset: asset(), amount: '2' },
          ],
        }),
        mapping(),
        [],
      ),
    PortfolioValidationError,
  );
  assert.throws(
    () =>
      completePipeline(walletSnapshot(), mapping(), [
        price(asset(), '1', '2026-08-11T00:30:00.000Z'),
        price(asset(), '2', '2026-08-11T00:30:00.000Z'),
      ]),
    PortfolioValidationError,
  );
  assert.doesNotThrow(() => completePipeline(walletSnapshot(), mapping(), []));
});
