import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NewsClassificationField,
  NewsClassificationStrength,
  NewsEventGrouper,
  NewsEventType,
  NewsImpactDirection,
  NewsImpactStrength,
  NewsImpactTargetKind,
  NewsImpactType,
} from '../dist/index.js';

function article(id, publishedAt, overrides = {}) {
  return {
    id,
    sourceId: overrides.sourceId ?? `source-${id}`,
    sourceRecordId: overrides.sourceRecordId ?? `record-${id}`,
    title: 'Token listing announced',
    publishedAt,
    observedAt: publishedAt,
    assetIds: overrides.assetIds ?? ['bitcoin'],
    marketIds: overrides.marketIds,
    topicIds: overrides.topicIds,
  };
}

function classification(
  articleValue,
  eventType = NewsEventType.TokenListing,
  evidence = listingEvidence(),
) {
  return {
    articleId: articleValue.id,
    assets: (articleValue.assetIds ?? []).map((assetId) => ({
      assetId,
      strength: NewsClassificationStrength.Explicit,
      evidence: [{ field: NewsClassificationField.AssetIds, matchedValue: assetId }],
    })),
    markets: (articleValue.marketIds ?? []).map((marketId) => ({
      marketId,
      strength: NewsClassificationStrength.Explicit,
      evidence: [{ field: NewsClassificationField.MarketIds, matchedValue: marketId }],
    })),
    categories: [],
    events: [
      {
        type: eventType,
        strength: NewsClassificationStrength.Strong,
        evidence,
      },
    ],
  };
}

function listingEvidence(ruleId = 'listing-rule') {
  return [{ ruleId, field: NewsClassificationField.Title, matchedValue: 'listing announced' }];
}

function impact(articleValue, type = NewsImpactType.Listing) {
  return {
    articleId: articleValue.id,
    type,
    direction: NewsImpactDirection.Positive,
    strength: NewsImpactStrength.Explicit,
    target: { kind: NewsImpactTargetKind.Asset, assetId: 'bitcoin' },
    evidence: [],
  };
}

function group(input, configuration = {}) {
  return new NewsEventGrouper({ timeWindowHours: 24, ...configuration }).group(input);
}

test('groups same-asset token-listing coverage inside the configured time window', () => {
  const first = article('article-1', '2026-08-05T01:00:00.000Z');
  const second = article('article-2', '2026-08-05T12:00:00.000Z');
  const [eventGroup] = group({
    articles: [first, second],
    classifications: [classification(first), classification(second)],
    impacts: [impact(first), impact(second)],
  });

  assert.equal(eventGroup?.eventType, NewsEventType.TokenListing);
  assert.deepEqual(eventGroup?.articleIds, ['article-1', 'article-2']);
  assert.deepEqual(eventGroup?.sourceIds, ['source-article-1', 'source-article-2']);
  assert.deepEqual(eventGroup?.target, { kind: NewsImpactTargetKind.Asset, assetId: 'bitcoin' });
  assert.equal(eventGroup?.impacts.length, 2);
  assert.deepEqual(
    eventGroup?.evidence.map((evidence) => evidence.sourceRecordId),
    ['record-article-1', 'record-article-2'],
  );
});

test('keeps distinct assets, event types, and time-window occurrences separate', () => {
  const bitcoin = article('bitcoin', '2026-08-05T01:00:00.000Z');
  const ethereum = article('ethereum', '2026-08-05T02:00:00.000Z', { assetIds: ['ethereum'] });
  const security = article('security', '2026-08-05T03:00:00.000Z');
  const later = article('later', '2026-08-06T02:00:01.000Z');
  const groups = group({
    articles: [bitcoin, ethereum, security, later],
    classifications: [
      classification(bitcoin),
      classification(ethereum),
      classification(security, NewsEventType.SecurityIncident, listingEvidence('security-rule')),
      classification(later),
    ],
  });

  assert.equal(groups.length, 4);
  assert.deepEqual(
    groups.map((item) => item.articleIds),
    [['later'], ['security'], ['ethereum'], ['bitcoin']],
  );
});

test('keeps insufficiently evidenced events separate rather than speculatively merging them', () => {
  const first = article('article-1', '2026-08-05T01:00:00.000Z');
  const second = article('article-2', '2026-08-05T02:00:00.000Z');
  const unkeyedEvidence = [
    { field: NewsClassificationField.Title, matchedValue: 'listing announced' },
  ];
  const groups = group({
    articles: [first, second],
    classifications: [
      classification(first, NewsEventType.TokenListing, unkeyedEvidence),
      classification(second, NewsEventType.TokenListing, unkeyedEvidence),
    ],
  });

  assert.equal(groups.length, 2);
  assert.notEqual(groups[0]?.id, groups[1]?.id);
});

test('is invariant to input and event-evidence ordering with stable deterministic group IDs', () => {
  const first = article('article-1', '2026-08-05T01:00:00.000Z');
  const second = article('article-2', '2026-08-05T12:00:00.000Z');
  const evidence = [...listingEvidence('listing-rule-b'), ...listingEvidence('listing-rule-a')];
  const expected = group({
    articles: [first, second],
    classifications: [
      classification(first, NewsEventType.TokenListing, evidence),
      classification(second, NewsEventType.TokenListing, evidence),
    ],
    impacts: [impact(first), impact(second)],
  });
  const actual = group({
    articles: [second, first, first],
    classifications: [
      classification(second, NewsEventType.TokenListing, [...evidence].reverse()),
      classification(first, NewsEventType.TokenListing, [...evidence].reverse()),
    ],
    impacts: [impact(second), impact(first), impact(first)],
  });

  assert.deepEqual(actual, expected);
  assert.equal(actual[0]?.articleIds.length, 2);
  assert.deepEqual(
    actual[0]?.impacts.map((item) => item.strength),
    [NewsImpactStrength.Explicit, NewsImpactStrength.Explicit],
  );
});
