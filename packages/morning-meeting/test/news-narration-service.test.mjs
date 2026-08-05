import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DefaultMorningMeetingNewsNarrationService,
  MorningMeetingEvidenceKind,
  MorningMeetingNewsNarrationInputAssembler,
  MorningMeetingNewsNarrationValidator,
  MorningMeetingNewsPriority,
} from '../dist/index.js';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';

function item({
  id,
  targetId = 'bitcoin',
  priority = MorningMeetingNewsPriority.Normal,
  publishedAt = '2026-08-03T01:00:00.000Z',
} = {}) {
  const reference = {
    kind: MorningMeetingEvidenceKind.NewsMarketIntelligence,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    observedAt: publishedAt,
    newsTargetKind: NewsImpactTargetKind.Asset,
    newsTargetId: targetId,
    newsDirection: NewsImpactDirection.Positive,
    newsArticleIds: [`article-${id}`],
  };
  return {
    id,
    targetKind: NewsImpactTargetKind.Asset,
    targetId,
    priority,
    direction: NewsImpactDirection.Positive,
    impactTypes: [NewsImpactType.Listing],
    articleIds: [`article-${id}`],
    eventGroupIds: [`group-${id}`],
    sourceIds: [`source-${id}`],
    sourceRecordIds: [`record-${id}`],
    firstPublishedAt: publishedAt,
    lastPublishedAt: publishedAt,
    evidence: { references: [reference] },
  };
}

function createService(narrator) {
  return new DefaultMorningMeetingNewsNarrationService({
    inputAssembler: new MorningMeetingNewsNarrationInputAssembler(),
    narrator,
    validator: new MorningMeetingNewsNarrationValidator(),
  });
}

test('orchestrates canonical input once and normalizes narrator output ordering', async () => {
  const received = [];
  const narrator = {
    narrate: async (input) => {
      received.push(input);
      return {
        items: [...input.items].reverse().map((candidate) => ({
          briefItemId: candidate.briefItemId,
          targetKind: candidate.targetKind,
          targetId: candidate.targetId,
          text: `Narration ${candidate.briefItemId}`,
          evidence: candidate.evidence,
        })),
      };
    },
  };
  const service = createService(narrator);
  const brief = { items: [item({ id: 'normal' }), item({ id: 'high', priority: 'high' })] };
  const beforeBrief = JSON.stringify(brief);
  const analysis = { bias: 'neutral', risk: 'moderate', signals: [{ id: 'signal-1' }] };
  const beforeAnalysis = JSON.stringify(analysis);

  const narration = await service.narrate(brief);
  const repeated = await service.narrate({ items: [...brief.items].reverse() });

  assert.equal(received.length, 2);
  assert.deepEqual(
    received[0].items.map((candidate) => candidate.briefItemId),
    ['high', 'normal'],
  );
  assert.deepEqual(
    narration.items.map((candidate) => candidate.briefItemId),
    ['high', 'normal'],
  );
  assert.deepEqual(repeated, narration);
  assert.equal(JSON.stringify(brief), beforeBrief);
  assert.equal(JSON.stringify(analysis), beforeAnalysis);
});

test('returns empty narration without invoking the narrator for an empty selected brief', async () => {
  let calls = 0;
  const service = createService({
    narrate: async () => {
      calls += 1;
      return { items: [] };
    },
  });

  assert.deepEqual(await service.narrate({ items: [] }), { items: [] });
  assert.equal(calls, 0);
});

test('propagates narrator failures without leaking state into later calls', async () => {
  let shouldFail = true;
  const service = createService({
    narrate: async (input) => {
      if (shouldFail) {
        throw new Error('narrator unavailable');
      }
      return {
        items: input.items.map((candidate) => ({
          briefItemId: candidate.briefItemId,
          targetKind: candidate.targetKind,
          targetId: candidate.targetId,
          text: 'Recovered narration.',
          evidence: candidate.evidence,
        })),
      };
    },
  });
  const brief = { items: [item({ id: 'recoverable' })] };

  await assert.rejects(() => service.narrate(brief), /narrator unavailable/);
  shouldFail = false;
  assert.equal((await service.narrate(brief)).items.length, 1);
});

test('rejects malformed, duplicate, unknown, target-mutated, and provenance-mutated narrator output', async () => {
  const brief = { items: [item({ id: 'protected' })] };
  const invalidOutputs = [
    { items: null },
    {
      items: [
        {
          briefItemId: 'unknown',
          targetKind: NewsImpactTargetKind.Asset,
          targetId: 'bitcoin',
          text: 'Unknown item.',
          evidence: [],
        },
      ],
    },
    {
      items: [
        {
          briefItemId: 'protected',
          targetKind: NewsImpactTargetKind.Asset,
          targetId: 'bitcoin',
          text: 'Changed provenance.',
          evidence: [],
        },
      ],
    },
    {
      items: [
        {
          briefItemId: 'protected',
          targetKind: NewsImpactTargetKind.Asset,
          targetId: 'ethereum',
          text: 'Changed target.',
          evidence: [item({ id: 'protected' }).evidence.references[0]],
        },
      ],
    },
  ];

  for (const output of invalidOutputs) {
    const service = createService({ narrate: async () => output });
    await assert.rejects(() => service.narrate(brief));
  }

  const duplicate = item({ id: 'protected' }).evidence.references[0];
  const service = createService({
    narrate: async () => ({
      items: [
        {
          briefItemId: 'protected',
          targetKind: NewsImpactTargetKind.Asset,
          targetId: 'bitcoin',
          text: 'Duplicate output.',
          evidence: [duplicate],
        },
        {
          briefItemId: 'protected',
          targetKind: NewsImpactTargetKind.Asset,
          targetId: 'bitcoin',
          text: 'Duplicate output.',
          evidence: [duplicate],
        },
      ],
    }),
  });
  await assert.rejects(() => service.narrate(brief));
});

test('permits a valid empty narrator result without changing the selected brief', async () => {
  const brief = { items: [item({ id: 'optional-text' })] };
  const beforeBrief = JSON.stringify(brief);
  const narration = await createService({ narrate: async () => ({ items: [] }) }).narrate(brief);

  assert.deepEqual(narration, { items: [] });
  assert.equal(JSON.stringify(brief), beforeBrief);
});
