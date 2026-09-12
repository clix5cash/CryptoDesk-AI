import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AtrIndicator,
  EmaIndicator,
  IndicatorEngine,
  Timeframe,
  VolumeIndicator,
  VwapIndicator,
} from '@cryptodesk-ai/market-intelligence';
import { CoinGeckoMarketSnapshotProvider, CoinGeckoProviderError } from '../dist/index.js';

const bitcoinMarket = {
  coinId: 'bitcoin',
  marketId: 'bitcoin-usd',
  baseAssetId: 'bitcoin',
  quoteAssetId: 'usd',
  quoteCurrency: 'usd',
};

const ethereumMarket = {
  coinId: 'ethereum',
  marketId: 'ethereum-usd',
  baseAssetId: 'ethereum',
  quoteAssetId: 'usd',
  quoteCurrency: 'usd',
};

function createProvider(fetch, markets = [bitcoinMarket]) {
  return new CoinGeckoMarketSnapshotProvider({
    baseUrl: 'https://example.test/api/v3',
    fetch,
    defaultTimeframe: Timeframe.OneHour,
    markets,
  });
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function marketResponse({
  id = 'bitcoin',
  currentPrice = 100,
  high = 110,
  low = 90,
  volume = 1_000,
  priceChange = 5,
  lastUpdated = '2026-08-03T10:00:00+00:00',
} = {}) {
  return {
    id,
    symbol: id === 'bitcoin' ? 'btc' : 'eth',
    name: id === 'bitcoin' ? 'Bitcoin' : 'Ethereum',
    current_price: currentPrice,
    high_24h: high,
    low_24h: low,
    total_volume: volume,
    price_change_percentage_24h: priceChange,
    last_updated: lastUpdated,
  };
}

test('maps a successful CoinGecko market response to a normalized MarketSnapshot', async () => {
  const provider = createProvider(async (url) => {
    assert.match(url, /coins\/markets\?vs_currency=usd&ids=bitcoin&per_page=1$/);
    return jsonResponse([marketResponse()]);
  });

  const [snapshot] = await provider.getSnapshots({});

  assert.equal(snapshot.marketId, 'bitcoin-usd');
  assert.equal(snapshot.baseAssetId, 'bitcoin');
  assert.equal(snapshot.quoteAssetId, 'usd');
  assert.equal(snapshot.capturedAt, '2026-08-03T10:00:00.000Z');
  assert.equal(snapshot.lastPrice, 100);
  assert.equal(snapshot.high, 110);
  assert.equal(snapshot.low, 90);
  assert.equal(snapshot.volume, 1_000);
  assert.equal(snapshot.priceChangePercent, 5);
});

test('maps multiple CoinGecko responses to their configured CryptoDesk markets', async () => {
  const provider = createProvider(
    async () =>
      jsonResponse([
        marketResponse({ id: 'ethereum', currentPrice: 3_000 }),
        marketResponse({ id: 'bitcoin', currentPrice: 100 }),
      ]),
    [bitcoinMarket, ethereumMarket],
  );

  const snapshots = await provider.getSnapshots({});

  assert.deepEqual(
    snapshots.map((snapshot) => [snapshot.marketId, snapshot.baseAssetId, snapshot.lastPrice]),
    [
      ['bitcoin-usd', 'bitcoin', 100],
      ['ethereum-usd', 'ethereum', 3_000],
    ],
  );
});

test('fails explicitly when CoinGecko omits a configured market', async () => {
  const provider = createProvider(async () => jsonResponse([marketResponse({ id: 'ethereum' })]));

  await assert.rejects(
    () => provider.getSnapshots({}),
    (error) => error instanceof CoinGeckoProviderError && /no market data/.test(error.message),
  );
});

test('raises an adapter error for non-2xx CoinGecko responses', async () => {
  const providerControlledText =
    'synthetic-token and https://user:password@private.invalid/provider-stack';
  const provider = createProvider(async () =>
    jsonResponse({ error: providerControlledText }, 429),
  );

  await assert.rejects(
    () => provider.getSnapshots({}),
    (error) => {
      assert.ok(error instanceof CoinGeckoProviderError);
      assert.equal(error.message, 'CoinGecko market request failed with status 429.');
      assert.equal(error.message.includes(providerControlledText), false);
      assert.equal(error.message.includes('user:password'), false);
      return true;
    },
  );
});

test('sanitizes arbitrary transport exceptions and credential-shaped URLs', async () => {
  const providerControlledText =
    'synthetic authorization and https://user:password@private.invalid/provider-stack';
  const provider = createProvider(async () => {
    throw new Error(providerControlledText);
  });

  await assert.rejects(
    () => provider.getSnapshots({}),
    (error) => {
      assert.ok(error instanceof CoinGeckoProviderError);
      assert.equal(
        error.message,
        'CoinGecko market request failed before receiving a response.',
      );
      assert.equal(error.message.includes(providerControlledText), false);
      assert.equal(error.message.includes('user:password'), false);
      return true;
    },
  );
});

test('raises an adapter error for malformed CoinGecko responses', async () => {
  const provider = createProvider(async () => jsonResponse({ unexpected: true }));

  await assert.rejects(
    () => provider.getSnapshots({}),
    (error) => error instanceof CoinGeckoProviderError && /invalid entry/.test(error.message),
  );
});

test('raises an adapter error for malformed CoinGecko JSON', async () => {
  const providerControlledText = 'synthetic-token from malformed provider body and stack';
  const provider = createProvider(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError(providerControlledText);
    },
  }));

  await assert.rejects(
    () => provider.getSnapshots({ assetIds: ['bitcoin'] }),
    (error) => {
      assert.ok(error instanceof CoinGeckoProviderError);
      assert.equal(error.message, 'CoinGecko market request returned malformed JSON.');
      assert.equal(error.message.includes(providerControlledText), false);
      return true;
    },
  );
});

test('implements provider-neutral historical quote retrieval without candle fields', async () => {
  const provider = createProvider(async (url) => {
    assert.match(
      url,
      /coins\/bitcoin\/market_chart\/range\?vs_currency=usd&from=1785715200&to=1785801600$/,
    );

    return jsonResponse({
      prices: [
        [1785715200000, 100],
        [1785718800000, 101.5],
      ],
      total_volumes: [
        [1785715200000, 1_000],
        [1785718800000, 1_200],
      ],
    });
  });

  const historicalQuoteQuery = {
    marketId: 'bitcoin-usd',
    from: '2026-08-03T00:00:00.000Z',
    to: '2026-08-04T00:00:00.000Z',
  };
  const quotes = await provider.getHistoricalQuotes(historicalQuoteQuery);

  assert.deepEqual(quotes, [
    {
      marketId: 'bitcoin-usd',
      baseAssetId: 'bitcoin',
      quoteAssetId: 'usd',
      price: 100,
      observedAt: '2026-08-03T00:00:00.000Z',
    },
    {
      marketId: 'bitcoin-usd',
      baseAssetId: 'bitcoin',
      quoteAssetId: 'usd',
      price: 101.5,
      observedAt: '2026-08-03T01:00:00.000Z',
    },
  ]);
  assert.equal('open' in quotes[0], false);
  assert.equal('volume' in quotes[0], false);
});

test('feeds CoinGecko-normalized MarketSnapshots into the real indicator engine', async () => {
  const responses = [
    marketResponse({
      currentPrice: 100,
      high: 102,
      low: 98,
      volume: 100,
      lastUpdated: '2026-08-03T00:00:00.000Z',
    }),
    marketResponse({
      currentPrice: 110,
      high: 113,
      low: 107,
      volume: 200,
      lastUpdated: '2026-08-03T01:00:00.000Z',
    }),
    marketResponse({
      currentPrice: 120,
      high: 124,
      low: 116,
      volume: 300,
      lastUpdated: '2026-08-03T02:00:00.000Z',
    }),
  ];
  let responseIndex = 0;
  const provider = createProvider(async () => jsonResponse([responses[responseIndex++]]));
  const snapshots = [];

  for (const _ of responses) {
    snapshots.push(...(await provider.getSnapshots({})));
  }

  const engine = new IndicatorEngine();
  engine.register(new EmaIndicator(2));
  engine.register(new VwapIndicator());
  engine.register(new AtrIndicator(2));
  engine.register(new VolumeIndicator(2));

  const ema = engine.calculate('ema', snapshots);
  const vwap = engine.calculate('vwap', snapshots);
  const atr = engine.calculate('atr', snapshots);
  const volume = engine.calculate('volume', snapshots);

  assert.equal(ema.indicator, 'ema');
  assert.equal(ema.values.value, 115.55555555555556);
  assert.equal(vwap.indicator, 'vwap');
  assert.equal(vwap.values.value, 113.33333333333333);
  assert.equal(atr.indicator, 'atr');
  assert.equal(atr.values.value, 13.5);
  assert.equal(volume.indicator, 'volume');
  assert.equal(volume.values.relative, 1.2);
});
