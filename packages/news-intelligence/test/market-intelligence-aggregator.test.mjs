import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NewsEventType,
  NewsImpactDirection,
  NewsImpactStrength,
  NewsImpactTargetKind,
  NewsImpactType,
  NewsMarketIntelligenceAggregator,
} from '../dist/index.js';

function target(kind, id) {
  if (kind === NewsImpactTargetKind.Asset) {
    return { kind, assetId: id };
  }

  if (kind === NewsImpactTargetKind.Market) {
    return { kind, marketId: id };
  }

  return { kind, topicId: id };
}

function impact(articleId, impactTarget, direction = NewsImpactDirection.Positive, overrides = {}) {
  return {
    articleId,
    type: overrides.type ?? NewsImpactType.Listing,
    direction,
    strength: overrides.strength ?? NewsImpactStrength.Explicit,
    target: impactTarget,
    evidence: overrides.evidence ?? [],
  };
}

function eventGroup(id, eventTarget, overrides = {}) {
  const articleIds = overrides.articleIds ?? [`article-${id}`];
  const sourceIds = overrides.sourceIds ?? [`source-${id}`];
  const firstPublishedAt = overrides.firstPublishedAt ?? '2026-08-05T01:00:00.000Z';
  const lastPublishedAt = overrides.lastPublishedAt ?? firstPublishedAt;

  return {
    id,
    eventType: overrides.eventType ?? NewsEventType.TokenListing,
    target: eventTarget,
    articleIds,
    sourceIds,
    assetIds: overrides.assetIds ?? [],
    marketIds: overrides.marketIds ?? [],
    topicIds: overrides.topicIds ?? [],
    impacts: overrides.impacts ?? [],
    firstPublishedAt,
    lastPublishedAt,
    evidence: overrides.evidence ?? [],
  };
}

function aggregate(input) {
  return new NewsMarketIntelligenceAggregator().aggregate(input);
}

test('returns no views when neither impacts nor explicit event-group targets are available', () => {
  assert.deepEqual(aggregate({}), []);
});

test('aggregates explicit asset, market, and topic targets without inferring additional views', () => {
  const bitcoin = target(NewsImpactTargetKind.Asset, 'bitcoin');
  const market = target(NewsImpactTargetKind.Market, 'btc-usd');
  const topic = target(NewsImpactTargetKind.Topic, 'defi');
  const views = aggregate({
    impacts: [impact('asset-article', bitcoin), impact('market-article', market)],
    eventGroups: [eventGroup('topic-group', topic, { topicIds: ['defi'] })],
  });

  assert.deepEqual(
    views.map((view) => view.target),
    [bitcoin, market, topic],
  );
  assert.equal(views[0]?.direction, NewsImpactDirection.Positive);
  assert.equal(views[1]?.direction, NewsImpactDirection.Positive);
  assert.equal(views[2]?.direction, undefined);
  assert.deepEqual(views[2]?.eventGroupIds, ['topic-group']);
});

test('aggregates multiple event groups and sources with derived time range metadata', () => {
  const bitcoin = target(NewsImpactTargetKind.Asset, 'bitcoin');
  const views = aggregate({
    eventGroups: [
      eventGroup('later', bitcoin, {
        articleIds: ['article-2'],
        sourceIds: ['source-b', 'source-a'],
        firstPublishedAt: '2026-08-05T08:00:00.000Z',
        lastPublishedAt: '2026-08-05T09:00:00.000Z',
      }),
      eventGroup('earlier', bitcoin, {
        articleIds: ['article-1'],
        sourceIds: ['source-a'],
        firstPublishedAt: '2026-08-05T01:00:00.000Z',
        lastPublishedAt: '2026-08-05T02:00:00.000Z',
      }),
    ],
  });

  assert.deepEqual(views[0]?.articleIds, ['article-1', 'article-2']);
  assert.deepEqual(views[0]?.eventGroupIds, ['earlier', 'later']);
  assert.deepEqual(views[0]?.sourceIds, ['source-a', 'source-b']);
  assert.equal(views[0]?.sourceCount, 2);
  assert.equal(views[0]?.firstPublishedAt, '2026-08-05T01:00:00.000Z');
  assert.equal(views[0]?.lastPublishedAt, '2026-08-05T09:00:00.000Z');
  assert.equal(views[0]?.direction, undefined);
});

test('preserves impact directions conservatively without event-count strength inflation', () => {
  const bitcoin = target(NewsImpactTargetKind.Asset, 'bitcoin');
  const positive = impact('article-1', bitcoin, NewsImpactDirection.Positive);
  const negative = impact('article-2', bitcoin, NewsImpactDirection.Negative, {
    type: NewsImpactType.Security,
    strength: NewsImpactStrength.Strong,
  });

  assert.equal(
    aggregate({ impacts: [positive, positive] })[0]?.direction,
    NewsImpactDirection.Positive,
  );
  assert.equal(aggregate({ impacts: [negative] })[0]?.direction, NewsImpactDirection.Negative);

  const mixed = aggregate({ impacts: [positive, negative] })[0];
  assert.equal(mixed?.direction, NewsImpactDirection.Mixed);
  assert.equal(mixed?.impacts.length, 2);
  assert.deepEqual(
    mixed?.impacts.map((item) => item.strength),
    [NewsImpactStrength.Explicit, NewsImpactStrength.Strong],
  );
});

test('keeps impact-only, group-only, and unrelated-target intelligence isolated', () => {
  const bitcoin = target(NewsImpactTargetKind.Asset, 'bitcoin');
  const ethereum = target(NewsImpactTargetKind.Asset, 'ethereum');
  const views = aggregate({
    impacts: [impact('impact-only', bitcoin)],
    eventGroups: [eventGroup('ethereum-group', ethereum, { articleIds: ['group-only'] })],
  });

  assert.equal(views.length, 2);
  assert.deepEqual(views[0]?.articleIds, ['impact-only']);
  assert.deepEqual(views[0]?.eventGroupIds, []);
  assert.equal(views[0]?.firstPublishedAt, undefined);
  assert.deepEqual(views[1]?.articleIds, ['group-only']);
  assert.deepEqual(views[1]?.impacts, []);
  assert.equal(views[1]?.direction, undefined);
});

test('is invariant to impact and event-group input order with deterministic evidence', () => {
  const bitcoin = target(NewsImpactTargetKind.Asset, 'bitcoin');
  const first = impact('article-1', bitcoin);
  const second = impact('article-2', bitcoin, NewsImpactDirection.Neutral);
  const firstGroup = eventGroup('group-a', bitcoin, {
    articleIds: ['article-1'],
    sourceIds: ['source-a'],
    impacts: [first],
  });
  const secondGroup = eventGroup('group-b', bitcoin, {
    articleIds: ['article-2'],
    sourceIds: ['source-b'],
    impacts: [second],
  });

  const expected = aggregate({ impacts: [first, second], eventGroups: [firstGroup, secondGroup] });
  const actual = aggregate({
    impacts: [second, first, first],
    eventGroups: [secondGroup, firstGroup],
  });

  assert.deepEqual(actual, expected);
  assert.equal(actual[0]?.impacts.length, 2);
  assert.equal(actual[0]?.evidence.length, 4);
});
