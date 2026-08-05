import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import { MorningMeetingEvidenceKind, MorningMeetingNewsBriefAssembler } from '../dist/index.js';

function reference({
  targetId = 'bitcoin',
  direction = NewsImpactDirection.Positive,
  articleIds = ['article-1'],
  eventGroupIds = ['group-1'],
  sourceIds = ['source-1'],
  sourceRecordIds = ['record-1'],
  publishedAt = '2026-08-03T01:00:00.000Z',
} = {}) {
  return {
    kind: MorningMeetingEvidenceKind.NewsMarketIntelligence,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    observedAt: publishedAt,
    newsTargetKind: NewsImpactTargetKind.Asset,
    newsTargetId: targetId,
    newsDirection: direction,
    newsImpactTypes: [NewsImpactType.Listing],
    newsFirstPublishedAt: publishedAt,
    newsLastPublishedAt: publishedAt,
    newsArticleIds: articleIds,
    newsEventGroupIds: eventGroupIds,
    newsSourceIds: sourceIds,
    newsSourceRecordIds: sourceRecordIds,
  };
}

test('returns a valid empty structured briefing when no news evidence exists', () => {
  assert.deepEqual(new MorningMeetingNewsBriefAssembler().assemble([]), { items: [] });
});

test('preserves every explicit upstream direction without reinterpretation', () => {
  const directions = [
    NewsImpactDirection.Positive,
    NewsImpactDirection.Negative,
    NewsImpactDirection.Mixed,
    NewsImpactDirection.Neutral,
    NewsImpactDirection.Unknown,
  ];
  const brief = new MorningMeetingNewsBriefAssembler().assemble(
    directions.map((direction, index) =>
      reference({ direction, targetId: `target-${index}`, eventGroupIds: [`group-${index}`] }),
    ),
  );

  assert.deepEqual(
    [...brief.items]
      .sort((left, right) => left.targetId.localeCompare(right.targetId))
      .map((item) => item.direction),
    directions,
  );
});

test('deduplicates equivalent event evidence and preserves partial provenance deterministically', () => {
  const duplicate = reference({
    articleIds: ['article-b', 'article-a', 'article-a'],
    eventGroupIds: ['group-a'],
    sourceIds: ['source-b', 'source-a'],
    sourceRecordIds: [],
  });
  const assembler = new MorningMeetingNewsBriefAssembler();
  const first = assembler.assemble([duplicate, duplicate]);
  const second = assembler.assemble([duplicate]);

  assert.deepEqual(first, second);
  assert.deepEqual(first.items[0]?.articleIds, ['article-a', 'article-b']);
  assert.deepEqual(first.items[0]?.sourceRecordIds, []);
  assert.equal(first.items[0]?.evidence.references.length, 1);
});

test('recomputes merged event identity independently of duplicate evidence order', () => {
  const firstSource = reference({
    articleIds: ['article-a'],
    eventGroupIds: ['group-a'],
    sourceRecordIds: ['record-a'],
  });
  const secondSource = reference({
    articleIds: ['article-b'],
    eventGroupIds: ['group-a'],
    sourceRecordIds: ['record-b'],
  });
  const assembler = new MorningMeetingNewsBriefAssembler();

  const first = assembler.assemble([firstSource, secondSource]);
  const second = assembler.assemble([secondSource, firstSource]);

  assert.deepEqual(first, second);
  assert.deepEqual(first.items[0]?.articleIds, ['article-a', 'article-b']);
  assert.deepEqual(first.items[0]?.sourceRecordIds, ['record-a', 'record-b']);
});

test('keeps independent events separate and is invariant to input order', () => {
  const earlier = reference({
    eventGroupIds: ['group-a'],
    publishedAt: '2026-08-03T01:00:00.000Z',
  });
  const later = reference({
    eventGroupIds: ['group-b'],
    publishedAt: '2026-08-03T02:00:00.000Z',
  });
  const assembler = new MorningMeetingNewsBriefAssembler();
  const first = assembler.assemble([earlier, later]);
  const second = assembler.assemble([later, earlier]);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.items.map((item) => item.eventGroupIds),
    [['group-b'], ['group-a']],
  );
});
