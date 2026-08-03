import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AtrIndicator,
  EmaIndicator,
  IndicatorEngine,
  SignalEngine,
  Timeframe,
  VolumeExpansionSignalGenerator,
  VolumeIndicator,
  VwapIndicator,
} from '@cryptodesk-ai/market-intelligence';
import {
  DefaultMorningMeetingService,
  MorningMeetingAnalyzer,
  MorningMeetingBias,
  MorningMeetingEvidenceKind,
  MorningMeetingRiskLevel,
  MorningMeetingSectionKind,
} from '../dist/index.js';

const snapshots = [
  {
    marketId: 'bitcoin-usd',
    baseAssetId: 'bitcoin',
    quoteAssetId: 'usd',
    timeframe: Timeframe.OneHour,
    capturedAt: '2026-08-03T00:00:00.000Z',
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
    capturedAt: '2026-08-03T01:00:00.000Z',
    lastPrice: 110,
    high: 113,
    low: 107,
    volume: 200,
  },
  {
    marketId: 'bitcoin-usd',
    baseAssetId: 'bitcoin',
    quoteAssetId: 'usd',
    timeframe: Timeframe.OneHour,
    capturedAt: '2026-08-03T02:00:00.000Z',
    lastPrice: 120,
    high: 124,
    low: 116,
    volume: 300,
  },
];

test('assembles deterministic Market Intelligence into a Morning Meeting report', async () => {
  const receivedQueries = [];
  const snapshotProvider = {
    async getSnapshots(query) {
      receivedQueries.push(query);
      return snapshots;
    },
  };
  const indicatorEngine = new IndicatorEngine();
  indicatorEngine.register(new EmaIndicator(2));
  indicatorEngine.register(new VwapIndicator());
  indicatorEngine.register(new AtrIndicator(2));
  indicatorEngine.register(new VolumeIndicator(2));

  const signalEngine = new SignalEngine();
  signalEngine.register(new VolumeExpansionSignalGenerator(1.1));

  const service = new DefaultMorningMeetingService({
    snapshotProvider,
    indicatorEngine,
    signalEngine,
    analyzer: new MorningMeetingAnalyzer(),
    idGenerator: { generate: () => 'meeting:2026-08-03' },
    clock: { now: () => '2026-08-03T06:00:00.000Z' },
  });

  const report = await service.generate({
    assetIds: ['bitcoin'],
    marketIds: ['bitcoin-usd'],
    timeframe: Timeframe.OneHour,
  });

  assert.deepEqual(receivedQueries, [
    {
      assetIds: ['bitcoin'],
      marketIds: ['bitcoin-usd'],
      timeframe: Timeframe.OneHour,
      asOf: undefined,
    },
  ]);
  assert.equal(report.id, 'meeting:2026-08-03');
  assert.equal(report.generatedAt, '2026-08-03T06:00:00.000Z');
  assert.equal(report.asOf, '2026-08-03T06:00:00.000Z');
  assert.equal(report.timeframe, Timeframe.OneHour);
  assert.equal(report.marketViews.length, 1);

  const [marketView] = report.marketViews;
  assert.equal(marketView.assetId, 'bitcoin');
  assert.equal(marketView.marketId, 'bitcoin-usd');
  assert.deepEqual(marketView.latestSnapshot, snapshots[2]);
  assert.deepEqual(
    marketView.indicators.map((indicator) => indicator.indicator),
    ['ema', 'vwap', 'atr', 'volume'],
  );
  assert.equal(marketView.signals.length, 1);
  assert.equal(marketView.bias, MorningMeetingBias.Bullish);
  assert.equal(marketView.riskLevel, MorningMeetingRiskLevel.High);
  assert.equal(marketView.evidence.length, 8);
  assert.deepEqual(
    report.sections.map((section) => section.kind),
    [
      MorningMeetingSectionKind.MarketOverview,
      MorningMeetingSectionKind.Trend,
      MorningMeetingSectionKind.Volatility,
      MorningMeetingSectionKind.Volume,
      MorningMeetingSectionKind.Signals,
      MorningMeetingSectionKind.Risk,
    ],
  );
  assert.equal(
    marketView.evidence.filter(
      (reference) => reference.kind === MorningMeetingEvidenceKind.MarketSnapshot,
    ).length,
    3,
  );
});
