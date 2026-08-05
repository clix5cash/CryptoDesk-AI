import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MarketSignalType,
  SignalDirection,
  SignalEngine,
  SignalStrength,
  Timeframe,
} from '@cryptodesk-ai/market-intelligence';
import {
  NewsImpactDirection,
  NewsImpactStrength,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import {
  DefaultMorningMeetingService,
  MorningMeetingAnalyzer,
  MorningMeetingBias,
  MorningMeetingEvidenceKind,
  MorningMeetingNewsPriority,
  MorningMeetingReportValidator,
  MorningMeetingRiskLevel,
  MorningMeetingSectionKind,
} from '../dist/index.js';

const latestSnapshot = {
  marketId: 'bitcoin-usd',
  baseAssetId: 'bitcoin',
  quoteAssetId: 'usd',
  timeframe: Timeframe.OneHour,
  capturedAt: '2026-08-03T02:00:00.000Z',
  lastPrice: 120,
  high: 124,
  low: 116,
  volume: 300,
};

function marketSignal(id, direction) {
  return {
    id,
    type:
      direction === SignalDirection.Bullish
        ? MarketSignalType.BullishCross
        : MarketSignalType.BearishCross,
    direction,
    strength: SignalStrength.Moderate,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    timeframe: Timeframe.OneHour,
    detectedAt: '2026-08-03T02:00:00.000Z',
    summary: 'Deterministic fixture signal.',
    evidence: [],
  };
}

function newsView({
  target = { kind: NewsImpactTargetKind.Asset, assetId: 'bitcoin' },
  direction = NewsImpactDirection.Positive,
  articleIds = ['article-1'],
  eventGroupIds = ['group-1'],
  sourceIds = ['source-a'],
  sourceRecordId = 'record-1',
  lastPublishedAt = '2026-08-03T01:00:00.000Z',
} = {}) {
  return {
    target,
    articleIds,
    eventGroupIds,
    impacts: [
      {
        articleId: articleIds[0],
        type: NewsImpactType.Listing,
        direction,
        strength: NewsImpactStrength.Explicit,
        target,
        evidence: [
          {
            articleId: articleIds[0],
            sourceRecordId,
            ruleId: 'listing-impact',
            triggerEvidence: [],
            targetEvidence: [],
          },
        ],
      },
    ],
    sourceIds,
    sourceCount: sourceIds.length,
    direction,
    firstPublishedAt: lastPublishedAt,
    lastPublishedAt,
    evidence: [],
  };
}

function analyze(newsMarketIntelligenceViews, signals = []) {
  return new MorningMeetingAnalyzer().analyze({
    latestSnapshot,
    indicators: [],
    signals,
    newsMarketIntelligenceViews,
  });
}

function service() {
  return new DefaultMorningMeetingService({
    snapshotProvider: { getSnapshots: async () => [latestSnapshot] },
    indicatorEngine: { list: () => [] },
    signalEngine: new SignalEngine(),
    analyzer: new MorningMeetingAnalyzer(),
    reportValidator: new MorningMeetingReportValidator(),
    idGenerator: { generate: () => 'meeting:news' },
    clock: { now: () => '2026-08-03T03:00:00.000Z' },
  });
}

test('preserves backward-compatible analysis when News Intelligence is absent or empty', () => {
  const withoutNews = analyze(undefined, [marketSignal('bullish-signal', SignalDirection.Bullish)]);
  const emptyNews = analyze([], [marketSignal('bullish-signal', SignalDirection.Bullish)]);

  assert.deepEqual(emptyNews, withoutNews);
  assert.equal(withoutNews.bias, MorningMeetingBias.Neutral);
  assert.equal(withoutNews.riskLevel, MorningMeetingRiskLevel.Moderate);
});

test('contributes at most one conservative directional news datum to existing market evidence', () => {
  const positiveOnly = analyze([newsView()]);
  const negativeOnly = analyze([newsView({ direction: NewsImpactDirection.Negative })]);
  const positive = analyze(
    [newsView(), newsView()],
    [marketSignal('bullish-signal', SignalDirection.Bullish)],
  );
  const negative = analyze(
    [newsView({ direction: NewsImpactDirection.Negative })],
    [marketSignal('bearish-signal', SignalDirection.Bearish)],
  );
  const mixed = analyze([
    newsView(),
    newsView({
      target: { kind: NewsImpactTargetKind.Market, marketId: 'bitcoin-usd' },
      direction: NewsImpactDirection.Negative,
      eventGroupIds: ['group-2'],
    }),
  ]);
  const neutral = analyze([newsView({ direction: NewsImpactDirection.Neutral })]);

  assert.equal(positiveOnly.bias, MorningMeetingBias.Neutral);
  assert.equal(negativeOnly.bias, MorningMeetingBias.Neutral);
  assert.equal(positive.bias, MorningMeetingBias.Bullish);
  assert.equal(negative.bias, MorningMeetingBias.Bearish);
  assert.equal(mixed.bias, MorningMeetingBias.Neutral);
  assert.equal(neutral.bias, MorningMeetingBias.Neutral);
  assert.equal(positive.riskLevel, MorningMeetingRiskLevel.Moderate);
  assert.equal(
    positive.evidence.filter(
      (reference) => reference.kind === MorningMeetingEvidenceKind.NewsMarketIntelligence,
    ).length,
    1,
  );
});

test('ignores unrelated and topic-only news targets without fabricating market evidence', () => {
  const analysis = analyze([
    newsView({ target: { kind: NewsImpactTargetKind.Asset, assetId: 'ethereum' } }),
    newsView({ target: { kind: NewsImpactTargetKind.Topic, topicId: 'defi' } }),
  ]);

  assert.equal(analysis.bias, MorningMeetingBias.Neutral);
  assert.deepEqual(analysis.evidence, []);
});

test('does not fabricate News Intelligence observation evidence when no publication time exists', () => {
  const withoutPublicationTime = {
    ...newsView(),
    firstPublishedAt: undefined,
    lastPublishedAt: undefined,
  };
  const analysis = analyze([withoutPublicationTime]);

  assert.equal(analysis.bias, MorningMeetingBias.Neutral);
  assert.deepEqual(analysis.evidence, []);
});

test('preserves News Intelligence provenance in a deterministic News report section', async () => {
  const providedNews = newsView({
    articleIds: ['article-b', 'article-a', 'article-a'],
    eventGroupIds: ['group-b', 'group-a', 'group-a'],
    sourceIds: ['source-b', 'source-a', 'source-a'],
    sourceRecordId: 'provider-record-1',
  });
  const report = await service().generate({
    timeframe: Timeframe.OneHour,
    newsMarketIntelligenceViews: [providedNews],
  });
  const newsEvidence = report.marketViews[0]?.evidence.find(
    (reference) => reference.kind === MorningMeetingEvidenceKind.NewsMarketIntelligence,
  );

  assert.deepEqual(newsEvidence?.newsArticleIds, ['article-a', 'article-b']);
  assert.deepEqual(newsEvidence?.newsEventGroupIds, ['group-a', 'group-b']);
  assert.deepEqual(newsEvidence?.newsSourceIds, ['source-a', 'source-b']);
  assert.deepEqual(newsEvidence?.newsSourceRecordIds, ['provider-record-1']);
  assert.equal(newsEvidence?.sourceRecordId, undefined);
  assert.equal(newsEvidence?.observedAt, '2026-08-03T01:00:00.000Z');
  assert.deepEqual(report.newsBrief?.items[0]?.articleIds, ['article-a', 'article-b']);
  assert.equal(report.newsBrief?.items[0]?.direction, NewsImpactDirection.Positive);
  assert.deepEqual(
    report.sections.map((section) => section.kind),
    [MorningMeetingSectionKind.MarketOverview, MorningMeetingSectionKind.News],
  );
});

test('normalizes equivalent News Intelligence view ordering into repeatable report output', async () => {
  const assetView = newsView();
  const marketView = newsView({
    target: { kind: NewsImpactTargetKind.Market, marketId: 'bitcoin-usd' },
    eventGroupIds: ['group-market'],
    sourceRecordId: 'record-market',
  });
  const request = { timeframe: Timeframe.OneHour };
  const first = await service().generate({
    ...request,
    newsMarketIntelligenceViews: [assetView, marketView],
  });
  const second = await service().generate({
    ...request,
    newsMarketIntelligenceViews: [marketView, assetView],
  });

  assert.deepEqual(first, second);
});

test('adds an empty news brief only for explicitly supplied empty news input', async () => {
  const withoutNews = await service().generate({ timeframe: Timeframe.OneHour });
  const withEmptyNews = await service().generate({
    timeframe: Timeframe.OneHour,
    newsMarketIntelligenceViews: [],
  });

  assert.equal('newsBrief' in withoutNews, false);
  assert.deepEqual(withEmptyNews.newsBrief, { items: [] });
  assert.equal(withEmptyNews.marketViews[0]?.bias, withoutNews.marketViews[0]?.bias);
  assert.equal(withEmptyNews.marketViews[0]?.riskLevel, withoutNews.marketViews[0]?.riskLevel);
});

test('news briefing selection changes presentation only, not market bias or risk', async () => {
  const views = [
    newsView({
      eventGroupIds: ['group-listing'],
      lastPublishedAt: '2026-08-03T01:00:00.000Z',
    }),
    newsView({
      target: { kind: NewsImpactTargetKind.Market, marketId: 'bitcoin-usd' },
      eventGroupIds: ['group-security'],
      lastPublishedAt: '2026-08-03T02:00:00.000Z',
    }),
  ];
  const unselected = await service().generate({
    timeframe: Timeframe.OneHour,
    newsMarketIntelligenceViews: views,
  });
  const selected = await service().generate({
    timeframe: Timeframe.OneHour,
    newsMarketIntelligenceViews: views,
    newsBriefSelectionPolicy: {
      maxItems: 1,
      rules: [
        {
          id: 'listing-high',
          impactTypes: [NewsImpactType.Listing],
          priority: MorningMeetingNewsPriority.High,
        },
      ],
    },
  });

  assert.equal(selected.newsBrief?.items.length, 1);
  assert.equal(selected.marketViews[0]?.bias, unselected.marketViews[0]?.bias);
  assert.equal(selected.marketViews[0]?.riskLevel, unselected.marketViews[0]?.riskLevel);
});
