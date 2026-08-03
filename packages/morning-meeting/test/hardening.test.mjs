import assert from 'node:assert/strict';
import test from 'node:test';
import { IndicatorEngine, SignalEngine, Timeframe } from '@cryptodesk-ai/market-intelligence';
import {
  DefaultMorningMeetingService,
  MorningMeetingAnalyzer,
  MorningMeetingBias,
  MorningMeetingEvidenceKind,
  MorningMeetingReportError,
  MorningMeetingReportValidator,
  MorningMeetingRiskLevel,
  MorningMeetingSectionKind,
  normalizeEvidence,
  normalizeSections,
} from '../dist/index.js';

function snapshot({
  assetId,
  marketId,
  capturedAt = '2026-08-03T02:00:00.000Z',
  lastPrice = 100,
  high = 102,
  low = 98,
  volume = 100,
}) {
  return {
    marketId,
    baseAssetId: assetId,
    quoteAssetId: 'usd',
    timeframe: Timeframe.OneHour,
    capturedAt,
    lastPrice,
    high,
    low,
    volume,
  };
}

function createService(
  suppliedSnapshots,
  indicatorEngine = new IndicatorEngine(),
  signalEngine = new SignalEngine(),
) {
  return new DefaultMorningMeetingService({
    snapshotProvider: { getSnapshots: async () => suppliedSnapshots },
    indicatorEngine,
    signalEngine,
    analyzer: new MorningMeetingAnalyzer(),
    reportValidator: new MorningMeetingReportValidator(),
    idGenerator: { generate: () => 'meeting:hardening' },
    clock: { now: () => '2026-08-03T06:00:00.000Z' },
  });
}

test('normalizes market views and sections independently of provider input order', async () => {
  const bitcoin = snapshot({ assetId: 'bitcoin', marketId: 'bitcoin-usd' });
  const ethereum = snapshot({ assetId: 'ethereum', marketId: 'ethereum-usd', lastPrice: 3_000 });
  const request = {
    assetIds: ['bitcoin', 'ethereum'],
    marketIds: ['bitcoin-usd', 'ethereum-usd'],
    timeframe: Timeframe.OneHour,
  };

  const firstReport = await createService([ethereum, bitcoin]).generate(request);
  const secondReport = await createService([bitcoin, ethereum]).generate(request);

  assert.deepEqual(firstReport, secondReport);
  assert.deepEqual(
    firstReport.marketViews.map((marketView) => marketView.marketId),
    ['bitcoin-usd', 'ethereum-usd'],
  );
  assert.deepEqual(
    firstReport.sections.map((section) => section.id),
    ['market_overview:bitcoin-usd', 'market_overview:ethereum-usd'],
  );
});

test('deduplicates and orders evidence using stable source identity fields', () => {
  const snapshotReference = {
    kind: MorningMeetingEvidenceKind.MarketSnapshot,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    observedAt: '2026-08-03T02:00:00.000Z',
  };
  const indicatorReference = {
    kind: MorningMeetingEvidenceKind.IndicatorSnapshot,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    observedAt: '2026-08-03T02:00:00.000Z',
    indicator: 'atr',
  };
  const signalReference = {
    kind: MorningMeetingEvidenceKind.MarketSignal,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    observedAt: '2026-08-03T02:00:00.000Z',
    signalId: 'signal:1',
  };

  assert.deepEqual(
    normalizeEvidence([signalReference, snapshotReference, indicatorReference, snapshotReference]),
    [snapshotReference, indicatorReference, signalReference],
  );
  assert.deepEqual(
    normalizeSections([
      {
        id: 'risk:bitcoin-usd',
        kind: MorningMeetingSectionKind.Risk,
        marketIds: ['bitcoin-usd'],
        evidence: [signalReference, signalReference],
      },
      {
        id: 'market_overview:bitcoin-usd',
        kind: MorningMeetingSectionKind.MarketOverview,
        marketIds: ['bitcoin-usd'],
        evidence: [snapshotReference],
      },
    ]).map((section) => section.kind),
    [MorningMeetingSectionKind.MarketOverview, MorningMeetingSectionKind.Risk],
  );
});

test('rejects empty provider results and missing requested markets explicitly', async () => {
  const emptyService = createService([]);

  await assert.rejects(
    () => emptyService.generate({ timeframe: Timeframe.OneHour }),
    (error) =>
      error instanceof MorningMeetingReportError && /at least one market view/.test(error.message),
  );

  const partialService = createService([snapshot({ assetId: 'bitcoin', marketId: 'bitcoin-usd' })]);

  await assert.rejects(
    () =>
      partialService.generate({
        marketIds: ['bitcoin-usd', 'ethereum-usd'],
        timeframe: Timeframe.OneHour,
      }),
    (error) =>
      error instanceof MorningMeetingReportError &&
      /No market snapshot was returned for requested market "ethereum-usd"/.test(error.message),
  );
});

test('fails explicitly when a registered indicator cannot calculate supplied snapshots', async () => {
  const indicatorEngine = new IndicatorEngine();
  indicatorEngine.register({
    id: 'unavailable-indicator',
    calculate: () => {
      throw new Error('Insufficient source data.');
    },
  });
  const service = createService(
    [snapshot({ assetId: 'bitcoin', marketId: 'bitcoin-usd' })],
    indicatorEngine,
  );

  await assert.rejects(
    () => service.generate({ timeframe: Timeframe.OneHour }),
    (error) =>
      error instanceof MorningMeetingReportError &&
      /Unable to calculate indicator "unavailable-indicator"/.test(error.message),
  );
});

test('keeps zero-signal, insufficient-evidence analysis conservative and deterministic', async () => {
  const service = createService([snapshot({ assetId: 'bitcoin', marketId: 'bitcoin-usd' })]);
  const report = await service.generate({ timeframe: Timeframe.OneHour });
  const [marketView] = report.marketViews;

  assert.deepEqual(marketView.signals, []);
  assert.equal(marketView.bias, MorningMeetingBias.Neutral);
  assert.equal(marketView.riskLevel, MorningMeetingRiskLevel.Moderate);
});

test('deduplicates identical provider snapshots and rejects conflicting duplicates', async () => {
  const bitcoin = snapshot({ assetId: 'bitcoin', marketId: 'bitcoin-usd' });
  const deduplicatedReport = await createService([bitcoin, bitcoin]).generate({
    timeframe: Timeframe.OneHour,
  });

  assert.equal(deduplicatedReport.marketViews.length, 1);
  assert.equal(deduplicatedReport.marketViews[0]?.evidence.length, 1);

  await assert.rejects(
    () =>
      createService([bitcoin, { ...bitcoin, lastPrice: 101 }]).generate({
        timeframe: Timeframe.OneHour,
      }),
    (error) =>
      error instanceof MorningMeetingReportError &&
      /Conflicting market snapshots/.test(error.message),
  );
});
