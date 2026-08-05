import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import {
  MorningMeetingEvidenceKind,
  MorningMeetingNewsNarrationInputAssembler,
  MorningMeetingNewsNarrationValidator,
  MorningMeetingNewsPriority,
} from '../dist/index.js';

function evidence(id = 'evidence-1') {
  return {
    kind: MorningMeetingEvidenceKind.NewsMarketIntelligence,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    observedAt: '2026-08-03T01:00:00.000Z',
    newsTargetKind: NewsImpactTargetKind.Asset,
    newsTargetId: 'bitcoin',
    newsArticleIds: [`article-${id}`],
  };
}

function item({
  id,
  targetId = 'bitcoin',
  direction = NewsImpactDirection.Positive,
  priority = MorningMeetingNewsPriority.Normal,
  publishedAt = '2026-08-03T01:00:00.000Z',
  references = [evidence(id)],
} = {}) {
  return {
    id,
    targetKind: NewsImpactTargetKind.Asset,
    targetId,
    priority,
    direction,
    impactTypes: [NewsImpactType.Listing],
    articleIds: [`article-${id}`, `article-${id}`],
    eventGroupIds: [`group-${id}`, `group-${id}`],
    sourceIds: [`source-${id}`, `source-${id}`],
    sourceRecordIds: [`record-${id}`, `record-${id}`],
    firstPublishedAt: publishedAt,
    lastPublishedAt: publishedAt,
    evidence: { references },
  };
}

function assemble(items) {
  return new MorningMeetingNewsNarrationInputAssembler().assemble({ items });
}

test('assembles empty selected briefs into valid empty narration input', () => {
  const input = assemble([]);

  assert.deepEqual(input, { items: [] });
  new MorningMeetingNewsNarrationValidator().validateInput(input);
});

test('preserves selected item facts, directions, provenance, and priority without inference', () => {
  const directions = [
    NewsImpactDirection.Positive,
    NewsImpactDirection.Negative,
    NewsImpactDirection.Mixed,
    NewsImpactDirection.Neutral,
    NewsImpactDirection.Unknown,
  ];
  const input = assemble(
    directions.map((direction, index) =>
      item({ id: `item-${index}`, targetId: `target-${index}`, direction }),
    ),
  );

  assert.deepEqual(
    input.items.map((candidate) => candidate.direction).sort(),
    [...directions].sort(),
  );
  assert.deepEqual(input.items[0]?.articleIds, ['article-item-0']);
  assert.equal(input.items[0]?.evidence[0]?.newsTargetId, 'bitcoin');
  assert.equal(input.items[0]?.priority, MorningMeetingNewsPriority.Normal);
});

test('normalizes duplicate identifiers and is deterministic for reordered equivalent briefing items', () => {
  const firstItem = item({
    id: 'first',
    priority: MorningMeetingNewsPriority.High,
    publishedAt: '2026-08-03T02:00:00.000Z',
  });
  const secondItem = item({ id: 'second', targetId: 'ethereum' });
  const first = assemble([secondItem, firstItem]);
  const second = assemble([firstItem, secondItem]);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.items.map((candidate) => candidate.briefItemId),
    ['first', 'second'],
  );
  assert.deepEqual(first.items[0]?.articleIds, ['article-first']);
  assert.deepEqual(first.items[0]?.evidence, [evidence('first')]);
});

test('rejects malformed briefing input and duplicate briefing item identities', () => {
  const assembler = new MorningMeetingNewsNarrationInputAssembler();
  const validator = new MorningMeetingNewsNarrationValidator();

  assert.throws(() => assembler.assemble({ items: [item({ id: '' })] }));
  assert.throws(() =>
    assembler.assemble({ items: [item({ id: 'duplicate' }), item({ id: 'duplicate' })] }),
  );
  assert.throws(() =>
    validator.validateInput({
      items: [
        {
          ...assemble([item({ id: 'invalid-evidence' })]).items[0],
          evidence: [{ ...evidence(), observedAt: 'invalid-timestamp' }],
        },
      ],
    }),
  );
});

test('validates narration output against known item identity and exact provenance', () => {
  const input = assemble([item({ id: 'known' })]);
  const validator = new MorningMeetingNewsNarrationValidator();
  const valid = {
    items: [
      {
        briefItemId: 'known',
        targetKind: NewsImpactTargetKind.Asset,
        targetId: 'bitcoin',
        text: 'Presentation text supplied by a future narrator.',
        evidence: input.items[0]?.evidence ?? [],
      },
    ],
  };

  validator.validateOutput(input, valid);
  assert.throws(() =>
    validator.validateOutput(input, {
      items: [...valid.items, valid.items[0]],
    }),
  );
  assert.throws(() =>
    validator.validateOutput(input, {
      items: [{ ...valid.items[0], briefItemId: 'unknown' }],
    }),
  );
  assert.throws(() =>
    validator.validateOutput(input, {
      items: [{ ...valid.items[0], evidence: [evidence('changed')] }],
    }),
  );
});
