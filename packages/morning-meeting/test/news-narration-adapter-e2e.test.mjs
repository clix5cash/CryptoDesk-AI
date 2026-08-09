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

function brief(
  items = [briefItem('bitcoin', 'bitcoin', 'high'), briefItem('ethereum', 'ethereum', 'normal')],
) {
  return { items };
}

function briefItem(id, targetId, priority) {
  const evidence = {
    kind: MorningMeetingEvidenceKind.NewsMarketIntelligence,
    assetId: targetId,
    marketId: `${targetId}-usd`,
    observedAt: '2026-08-04T01:00:00.000Z',
    newsTargetKind: NewsImpactTargetKind.Asset,
    newsTargetId: targetId,
  };
  return {
    id,
    targetKind: NewsImpactTargetKind.Asset,
    targetId,
    priority,
    direction: targetId === 'ethereum' ? NewsImpactDirection.Mixed : NewsImpactDirection.Positive,
    impactTypes: [NewsImpactType.Listing],
    articleIds: [`article-${id}`],
    eventGroupIds: [`event-${id}`],
    sourceIds: [`source-${id}`],
    sourceRecordIds: [`record-${id}`],
    firstPublishedAt: '2026-08-04T01:00:00.000Z',
    lastPublishedAt: '2026-08-04T01:00:00.000Z',
    evidence: { references: [evidence] },
  };
}

function completionItem(item, text = `Narrated ${item.briefItemId}.`) {
  return {
    briefItemId: item.briefItemId,
    text,
    targetKind: item.targetKind,
    targetId: item.targetId,
    evidence: item.evidence,
    providerGeneratedId: `untrusted-${item.briefItemId}`,
    unsupportedProviderMetadata: 'ignored',
  };
}

function adapter(providerId, completionClient, modelIds = ['model-a']) {
  return new ProviderNeutralMorningMeetingNewsNarratorAdapter({
    providerId,
    modelIds,
    completionClient,
  });
}

function service(registry, selection) {
  return new DefaultMorningMeetingNewsNarrationService({
    inputAssembler: new MorningMeetingNewsNarrationInputAssembler(),
    narrator: new RegistryMorningMeetingNewsNarrator(registry, selection),
    validator: new MorningMeetingNewsNarrationValidator(),
  });
}

test('validates the complete registry-selected completion path with canonical identity and provenance', async () => {
  const requests = [];
  const registry = new MorningMeetingNewsNarratorRegistry();
  let unselectedCalls = 0;
  registry.register(
    adapter('unselected', {
      complete: async () => {
        unselectedCalls += 1;
        return { items: [] };
      },
    }),
  );
  registry.register(
    adapter('selected', {
      complete: async (request) => {
        requests.push(request);
        return {
          items: [...request.items].reverse().map((item) => completionItem(item)),
          unsupportedTopLevelMetadata: 'ignored',
        };
      },
    }),
  );

  const meetingBrief = brief([
    briefItem('ethereum', 'ethereum', 'normal'),
    briefItem('bitcoin', 'bitcoin', 'high'),
  ]);
  const analyticalState = {
    bias: 'bullish',
    risk: 'moderate',
    snapshots: [{ id: 'snapshot-1' }],
    indicators: [{ id: 'indicator-1' }],
    signals: [{ id: 'signal-1' }],
    impact: { direction: 'positive', strength: 'strong' },
    eventGroups: [{ id: 'event-bitcoin' }],
    selection: meetingBrief.items,
    provenance: meetingBrief.items[0].evidence,
  };
  const beforeBrief = JSON.stringify(meetingBrief);
  const beforeAnalyticalState = JSON.stringify(analyticalState);

  const narration = await service(registry, { providerId: 'selected', modelId: 'model-a' }).narrate(
    meetingBrief,
  );

  assert.equal(unselectedCalls, 0);
  assert.equal(requests.length, 1);
  assert.deepEqual(
    requests[0].items.map((item) => item.briefItemId),
    ['bitcoin', 'ethereum'],
  );
  assert.deepEqual(
    narration.items.map((item) => item.briefItemId),
    ['bitcoin', 'ethereum'],
  );
  assert.equal(narration.items[0].targetId, 'bitcoin');
  assert.deepEqual(narration.items[0].evidence, requests[0].items[0].evidence);
  assert.equal('providerGeneratedId' in narration.items[0], false);
  assert.equal('unsupportedProviderMetadata' in narration.items[0], false);
  assert.equal(JSON.stringify(meetingBrief), beforeBrief);
  assert.equal(JSON.stringify(analyticalState), beforeAnalyticalState);
});

test('uses explicit provider and model selection without fallback or substitution', async () => {
  const registry = new MorningMeetingNewsNarratorRegistry();
  const selected = adapter('alpha', {
    complete: async (request) => ({ items: request.items.map((item) => completionItem(item)) }),
  });
  const alternate = adapter(
    'beta',
    {
      complete: async () => {
        throw new Error('must not be selected');
      },
    },
    ['model-b'],
  );
  registry.register(alternate);
  registry.register(selected);

  assert.equal(registry.resolve({ providerId: 'alpha' }), selected);
  assert.equal(registry.resolve({ providerId: 'alpha', modelId: 'model-a' }), selected);
  assert.throws(
    () => registry.resolve({ providerId: 'unknown' }),
    MorningMeetingNarratorProviderError,
  );
  assert.throws(
    () => registry.resolve({ providerId: 'alpha', modelId: 'model-b' }),
    MorningMeetingNarratorProviderError,
  );
  assert.throws(() => registry.register(selected), MorningMeetingNarratorProviderError);
  assert.equal(registry.unregister('alpha'), true);
  assert.throws(
    () => registry.resolve({ providerId: 'alpha' }),
    MorningMeetingNarratorProviderError,
  );
});

test('skips the registry and completion client for an empty selected brief', async () => {
  let calls = 0;
  const registry = new MorningMeetingNewsNarratorRegistry();
  registry.register(
    adapter('selected', {
      complete: async () => {
        calls += 1;
        return { items: [] };
      },
    }),
  );

  assert.deepEqual(
    await service(registry, { providerId: 'unknown', modelId: 'missing' }).narrate({ items: [] }),
    { items: [] },
  );
  assert.equal(calls, 0);
});

test('isolates completion failures and rejects untrusted completion claims without partial narration', async () => {
  let response = { items: null };
  const registry = new MorningMeetingNewsNarratorRegistry();
  registry.register(adapter('selected', { complete: async () => response }));
  const narrationService = service(registry, { providerId: 'selected' });
  const meetingBrief = brief();
  const beforeBrief = JSON.stringify(meetingBrief);

  await assert.rejects(
    () => narrationService.narrate(meetingBrief),
    MorningMeetingNarratorProviderError,
  );
  assert.equal(JSON.stringify(meetingBrief), beforeBrief);

  const canonicalInput = new MorningMeetingNewsNarrationInputAssembler().assemble(meetingBrief);
  response = {
    items: [completionItem(canonicalInput.items[0]), completionItem(canonicalInput.items[0])],
  };
  await assert.rejects(
    () => narrationService.narrate(meetingBrief),
    MorningMeetingNarratorProviderError,
  );

  response = {
    items: [{ ...completionItem(canonicalInput.items[0]), targetId: 'mutated-target' }],
  };
  await assert.rejects(
    () => narrationService.narrate(meetingBrief),
    MorningMeetingNarratorProviderError,
  );

  response = { items: canonicalInput.items.map((item) => completionItem(item)) };
  assert.equal((await narrationService.narrate(meetingBrief)).items.length, 2);
});

test('has deterministic registry and completion behavior across equivalent orderings', async () => {
  const createNarration = async (registrationOrder, inputOrder) => {
    const requests = [];
    const registry = new MorningMeetingNewsNarratorRegistry();
    const configured = {
      alpha: adapter('alpha', {
        complete: async (request) => {
          requests.push(request);
          return { items: [...request.items].reverse().map((item) => completionItem(item)) };
        },
      }),
      beta: adapter('beta', { complete: async () => ({ items: [] }) }),
    };
    registrationOrder.forEach((providerId) => registry.register(configured[providerId]));
    const narration = await service(registry, { providerId: 'alpha', modelId: 'model-a' }).narrate(
      brief(inputOrder.map(([id, targetId, priority]) => briefItem(id, targetId, priority))),
    );
    return {
      narration,
      request: requests[0],
      providers: registry.list().map((item) => item.providerId),
    };
  };

  const first = await createNarration(
    ['beta', 'alpha'],
    [
      ['ethereum', 'ethereum', 'normal'],
      ['bitcoin', 'bitcoin', 'high'],
    ],
  );
  const second = await createNarration(
    ['alpha', 'beta'],
    [
      ['bitcoin', 'bitcoin', 'high'],
      ['ethereum', 'ethereum', 'normal'],
    ],
  );

  assert.deepEqual(first.providers, ['alpha', 'beta']);
  assert.deepEqual(first, second);
});
