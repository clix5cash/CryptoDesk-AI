import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AtrIndicator,
  EmaCrossSignalGenerator,
  EmaIndicator,
  IndicatorEngine,
  MarketSignalType,
  Timeframe,
  VolumeIndicator,
  VwapIndicator,
} from '../dist/index.js';

const snapshots = [
  {
    marketId: 'bitcoin-usd',
    baseAssetId: 'bitcoin',
    quoteAssetId: 'usd',
    timeframe: Timeframe.OneHour,
    capturedAt: '2026-08-04T00:00:00.000Z',
    lastPrice: 100,
    high: 102,
    low: 98,
    volume: 100,
  },
  {
    marketId: 'bitcoin-usd',
    baseAssetId: 'bitcoin',
    quoteAssetId: 'usd',
    timeframe: Timeframe.OneHour,
    capturedAt: '2026-08-04T01:00:00.000Z',
    lastPrice: 100,
    high: 102,
    low: 98,
    volume: 100,
  },
  {
    marketId: 'bitcoin-usd',
    baseAssetId: 'bitcoin',
    quoteAssetId: 'usd',
    timeframe: Timeframe.OneHour,
    capturedAt: '2026-08-04T02:00:00.000Z',
    lastPrice: 200,
    high: 202,
    low: 198,
    volume: 300,
  },
];

test('registers independent EMA configurations and feeds both snapshots to EMA Cross', () => {
  const engine = new IndicatorEngine();
  const fastEma = new EmaIndicator(9);
  const slowEma = new EmaIndicator(26);

  engine.register(fastEma);
  engine.register(slowEma);

  assert.deepEqual(
    engine.listByFamily('ema').map((indicator) => indicator.id),
    ['ema:9', 'ema:26'],
  );
  assert.equal(engine.get('ema:9'), fastEma);
  assert.equal(engine.get('ema:26'), slowEma);
  assert.throws(() => engine.calculate('ema', snapshots), /multiple registered configurations/);

  const fastSnapshot = engine.calculate('ema:9', snapshots);
  const slowSnapshot = engine.calculate('ema:26', snapshots);

  assert.equal(fastSnapshot.indicator, 'ema');
  assert.equal(slowSnapshot.indicator, 'ema');
  assert.equal(fastSnapshot.values.period, 9);
  assert.equal(slowSnapshot.values.period, 26);
  assert.notEqual(fastSnapshot.values.value, slowSnapshot.values.value);
  assert.deepEqual(
    new EmaCrossSignalGenerator(9, 26)
      .generate([fastSnapshot, slowSnapshot])
      .map((signal) => signal.type),
    [MarketSignalType.BullishCross],
  );
});

test('preserves single-family lookup and calculations for VWAP, ATR, and Volume', () => {
  const engine = new IndicatorEngine();
  engine.register(new VwapIndicator());
  engine.register(new AtrIndicator(2));
  engine.register(new VolumeIndicator(2));

  const vwap = engine.calculate('vwap', snapshots);
  const atr = engine.calculate('atr', snapshots);
  const volume = engine.calculate('volume', snapshots);

  assert.equal(vwap.indicator, 'vwap');
  assert.equal(atr.indicator, 'atr');
  assert.equal(volume.indicator, 'volume');
  assert.equal(atr.values.period, 2);
  assert.equal(volume.values.period, 2);
});
