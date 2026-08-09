import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DefaultMorningMeetingNewsNarrationService,
  MorningMeetingEvidenceKind,
  MorningMeetingNewsNarrationInputAssembler,
  MorningMeetingNewsNarrationValidator,
  MorningMeetingNewsNarratorRegistry,
  MorningMeetingNarratorProviderError,
  ProviderNeutralMorningMeetingNewsNarratorAdapter,
  RegistryMorningMeetingNewsNarrator,
} from '../dist/index.js';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';

function input() {
  const item = (id, targetId, priority) => ({
    briefItemId: id,
    targetKind: NewsImpactTargetKind.Asset,
    targetId,
    priority,
    direction: NewsImpactDirection.Positive,
    impactTypes: [NewsImpactType.Listing],
    articleIds: [`article-${id}`],
    eventGroupIds: [`group-${id}`],
    sourceIds: [`source-${id}`],
    sourceRecordIds: [`record-${id}`],
    firstPublishedAt: '2026-08-03T01:00:00.000Z',
    lastPublishedAt: '2026-08-03T01:00:00.000Z',
    evidence: [
      {
        kind: MorningMeetingEvidenceKind.NewsMarketIntelligence,
        assetId: 'bitcoin',
        marketId: 'bitcoin-usd',
        observedAt: '2026-08-03T01:00:00.000Z',
        newsTargetKind: NewsImpactTargetKind.Asset,
        newsTargetId: targetId,
      },
    ],
  });
  return { items: [item('high', 'bitcoin', 'high'), item('normal', 'ethereum', 'normal')] };
}

function responseFor(item, text = `Text ${item.briefItemId}.`) {
  return {
    briefItemId: item.briefItemId,
    text,
    targetKind: item.targetKind,
    targetId: item.targetId,
    evidence: item.evidence,
    providerGeneratedId: `provider-${item.briefItemId}`,
  };
}

function adapter(client) {
  return new ProviderNeutralMorningMeetingNewsNarratorAdapter({
    providerId: 'future-provider',
    modelIds: ['future-model'],
    completionClient: client,
  });
}

test('assembles deterministic detached completion requests and preserves canonical ordering', async () => {
  const requests = [];
  const client = {
    complete: async (request) => {
      requests.push(request);
      request.items[0].articleIds.push('provider-mutation');
      return { items: request.items.map((item) => responseFor(item)) };
    },
  };
  const narrator = adapter(client);
  const canonicalInput = input();
  const beforeInput = JSON.stringify(canonicalInput);

  const first = await narrator.narrate(canonicalInput);
  const second = await narrator.narrate(input());

  assert.equal(JSON.stringify(canonicalInput), beforeInput);
  assert.deepEqual(requests[0], requests[1]);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.items.map((item) => item.briefItemId),
    ['high', 'normal'],
  );
});

test('does not invoke the completion client for empty canonical input', async () => {
  let calls = 0;
  const narrator = adapter({
    complete: async () => {
      calls += 1;
      return { items: [] };
    },
  });

  assert.deepEqual(await narrator.narrate({ items: [] }), { items: [] });
  assert.equal(calls, 0);
});

test('maps only provider text while protecting canonical identity, target, and provenance', async () => {
  const canonicalInput = input();
  const narrator = adapter({
    complete: async (request) => ({
      items: [...request.items]
        .reverse()
        .map((item) => responseFor(item, `Narrated ${item.briefItemId}.`)),
    }),
  });

  const narration = await narrator.narrate(canonicalInput);

  assert.deepEqual(
    narration.items.map((item) => item.briefItemId),
    ['high', 'normal'],
  );
  assert.deepEqual(narration.items[0]?.evidence, canonicalInput.items[0]?.evidence);
  assert.equal(narration.items[0]?.targetId, 'bitcoin');
});

test('rejects malformed, unknown, duplicate, target-mutated, and provenance-mutated responses', async () => {
  const canonicalInput = input();
  const invalidResponses = [
    { items: null },
    { items: [{ briefItemId: '', text: 'Invalid.' }] },
    { items: [{ briefItemId: 'unknown', text: 'Unknown.' }] },
    {
      items: [responseFor(canonicalInput.items[0]), responseFor(canonicalInput.items[0])],
    },
    {
      items: [{ ...responseFor(canonicalInput.items[0]), targetId: 'changed' }],
    },
    {
      items: [{ ...responseFor(canonicalInput.items[0]), evidence: [] }],
    },
  ];

  for (const response of invalidResponses) {
    await assert.rejects(
      () => adapter({ complete: async () => response }).narrate(canonicalInput),
      MorningMeetingNarratorProviderError,
    );
  }
});

test('normalizes invocation failure and supports registry and direct-narrator composition', async () => {
  let fail = true;
  const concreteAdapter = adapter({
    complete: async (request) => {
      if (fail) throw new Error('client failed');
      return { items: request.items.map((item) => responseFor(item)) };
    },
  });
  await assert.rejects(() => concreteAdapter.narrate(input()), MorningMeetingNarratorProviderError);
  fail = false;
  assert.equal((await concreteAdapter.narrate(input())).items.length, 2);

  const registry = new MorningMeetingNewsNarratorRegistry();
  registry.register(concreteAdapter);
  const resolved = new RegistryMorningMeetingNewsNarrator(registry, {
    providerId: 'future-provider',
    modelId: 'future-model',
  });
  const directService = new DefaultMorningMeetingNewsNarrationService({
    inputAssembler: new MorningMeetingNewsNarrationInputAssembler(),
    narrator: concreteAdapter,
    validator: new MorningMeetingNewsNarrationValidator(),
  });
  const registryService = new DefaultMorningMeetingNewsNarrationService({
    inputAssembler: new MorningMeetingNewsNarrationInputAssembler(),
    narrator: resolved,
    validator: new MorningMeetingNewsNarrationValidator(),
  });
  const brief = {
    items: input().items.map((item) => ({
      id: item.briefItemId,
      targetKind: item.targetKind,
      targetId: item.targetId,
      priority: item.priority,
      direction: item.direction,
      impactTypes: item.impactTypes,
      articleIds: item.articleIds,
      eventGroupIds: item.eventGroupIds,
      sourceIds: item.sourceIds,
      sourceRecordIds: item.sourceRecordIds,
      firstPublishedAt: item.firstPublishedAt,
      lastPublishedAt: item.lastPublishedAt,
      evidence: { references: item.evidence },
    })),
  };

  assert.deepEqual(await directService.narrate(brief), await registryService.narrate(brief));
});
