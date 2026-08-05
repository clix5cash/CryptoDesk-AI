import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import { MorningMeetingNewsBriefSelector, MorningMeetingNewsPriority } from '../dist/index.js';

const asOf = '2026-08-04T00:00:00.000Z';

function item({
  id,
  targetId = 'bitcoin',
  impactType = NewsImpactType.Listing,
  direction = NewsImpactDirection.Positive,
  eventGroupId = `group-${id}`,
  publishedAt = '2026-08-03T01:00:00.000Z',
  withoutPublicationTime = false,
} = {}) {
  return {
    id,
    targetKind: NewsImpactTargetKind.Asset,
    targetId,
    direction,
    impactTypes: [impactType],
    articleIds: [`article-${id}`],
    eventGroupIds: eventGroupId === undefined ? [] : [eventGroupId],
    sourceIds: [`source-${id}`],
    sourceRecordIds: [`record-${id}`],
    ...(withoutPublicationTime
      ? {}
      : { firstPublishedAt: publishedAt, lastPublishedAt: publishedAt }),
    evidence: { references: [] },
  };
}

function select(items, policy) {
  return new MorningMeetingNewsBriefSelector().select(
    { items },
    { asOf, ...(policy === undefined ? {} : { policy }) },
  );
}

test('places explicitly high-priority items before normal items', () => {
  const brief = select(
    [
      item({ id: 'listing', impactType: NewsImpactType.Listing }),
      item({ id: 'security', impactType: NewsImpactType.Security }),
    ],
    {
      rules: [
        {
          id: 'security-high',
          impactTypes: [NewsImpactType.Security],
          priority: MorningMeetingNewsPriority.High,
        },
      ],
    },
  );

  assert.deepEqual(
    brief.items.map((candidate) => [candidate.id, candidate.priority]),
    [
      ['security', MorningMeetingNewsPriority.High],
      ['listing', MorningMeetingNewsPriority.Normal],
    ],
  );
});

test('orders equal-priority items deterministically regardless of input and rule order', () => {
  const listingHigh = {
    id: 'listing-high',
    impactTypes: [NewsImpactType.Listing],
    priority: MorningMeetingNewsPriority.High,
  };
  const securityHigh = {
    id: 'security-high',
    impactTypes: [NewsImpactType.Security],
    priority: MorningMeetingNewsPriority.High,
  };
  const first = select(
    [
      item({ id: 'b', targetId: 'ethereum', impactType: NewsImpactType.Security }),
      item({ id: 'a', targetId: 'bitcoin', impactType: NewsImpactType.Listing }),
    ],
    { rules: [listingHigh, securityHigh] },
  );
  const second = select(
    [
      item({ id: 'a', targetId: 'bitcoin', impactType: NewsImpactType.Listing }),
      item({ id: 'b', targetId: 'ethereum', impactType: NewsImpactType.Security }),
    ],
    { rules: [securityHigh, listingHigh] },
  );

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.items.map((candidate) => candidate.id),
    ['a', 'b'],
  );
});

test('enforces explicit global and per-target briefing budgets', () => {
  const brief = select(
    [
      item({ id: 'a', targetId: 'bitcoin', publishedAt: '2026-08-03T03:00:00.000Z' }),
      item({ id: 'b', targetId: 'bitcoin', publishedAt: '2026-08-03T02:00:00.000Z' }),
      item({ id: 'c', targetId: 'ethereum', publishedAt: '2026-08-03T01:00:00.000Z' }),
    ],
    { maxItems: 2, maxItemsPerTarget: 1 },
  );

  assert.deepEqual(
    brief.items.map((candidate) => candidate.id),
    ['a', 'c'],
  );
});

test('lets independent events remain selectable while one grouped event consumes one slot', () => {
  const brief = select(
    [
      item({ id: 'same-normal', impactType: NewsImpactType.Governance, eventGroupId: 'group-a' }),
      item({ id: 'same-high', impactType: NewsImpactType.Security, eventGroupId: 'group-a' }),
      item({ id: 'independent', impactType: NewsImpactType.Listing, eventGroupId: 'group-b' }),
    ],
    {
      rules: [
        {
          id: 'security-high',
          impactTypes: [NewsImpactType.Security],
          priority: MorningMeetingNewsPriority.High,
        },
      ],
    },
  );

  assert.deepEqual(
    brief.items.map((candidate) => candidate.id),
    ['same-high', 'independent'],
  );
});

test('keeps neutral and unknown items selectable and preserves no-policy behavior', () => {
  const source = {
    items: [
      item({ id: 'neutral', direction: NewsImpactDirection.Neutral }),
      item({ id: 'unknown', direction: NewsImpactDirection.Unknown }),
    ],
  };
  const selector = new MorningMeetingNewsBriefSelector();

  assert.equal(selector.select(source, { asOf }), source);
  assert.deepEqual(
    select(source.items, { minimumPriority: MorningMeetingNewsPriority.Normal }).items.map(
      (candidate) => candidate.id,
    ),
    ['neutral', 'unknown'],
  );
});

test('validates invalid budgets, duplicate rule IDs, duplicate rule selectors, and enum values', () => {
  const selector = new MorningMeetingNewsBriefSelector();
  const brief = { items: [item({ id: 'a' })] };

  assert.throws(() => selector.select(brief, { asOf, policy: { maxItems: -1 } }));
  assert.throws(() =>
    selector.select(brief, {
      asOf,
      policy: {
        rules: [
          { id: 'same', priority: MorningMeetingNewsPriority.Normal },
          { id: 'same', priority: MorningMeetingNewsPriority.High },
        ],
      },
    }),
  );
  assert.throws(() =>
    selector.select(brief, {
      asOf,
      policy: {
        rules: [
          {
            id: 'first',
            impactTypes: [NewsImpactType.Listing],
            priority: MorningMeetingNewsPriority.Normal,
          },
          {
            id: 'second',
            impactTypes: [NewsImpactType.Listing],
            priority: MorningMeetingNewsPriority.High,
          },
        ],
      },
    }),
  );
  assert.throws(() =>
    selector.select(brief, {
      asOf,
      policy: { minimumPriority: 'invalid' },
    }),
  );
});

test('uses supplied as-of time for recency and keeps missing publication times deterministic', () => {
  const first = select(
    [
      item({ id: 'future', publishedAt: '2026-08-05T01:00:00.000Z' }),
      item({ id: 'past', publishedAt: '2026-08-03T01:00:00.000Z' }),
      item({ id: 'missing', withoutPublicationTime: true }),
    ],
    {},
  );
  const second = select(
    [
      item({ id: 'missing', withoutPublicationTime: true }),
      item({ id: 'past', publishedAt: '2026-08-03T01:00:00.000Z' }),
      item({ id: 'future', publishedAt: '2026-08-05T01:00:00.000Z' }),
    ],
    {},
  );

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.items.map((candidate) => candidate.id),
    ['past', 'future', 'missing'],
  );
});
