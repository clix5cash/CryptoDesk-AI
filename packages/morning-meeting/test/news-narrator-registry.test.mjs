import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DefaultMorningMeetingNewsNarrationService,
  MorningMeetingEvidenceKind,
  MorningMeetingNewsNarrationInputAssembler,
  MorningMeetingNewsNarrationValidator,
  MorningMeetingNewsNarratorRegistry,
  MorningMeetingNarratorProviderError,
  NarratorCapability,
  RegistryMorningMeetingNewsNarrator,
} from '../dist/index.js';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';

function brief(id = 'brief-1') {
  const evidence = {
    kind: MorningMeetingEvidenceKind.NewsMarketIntelligence,
    assetId: 'bitcoin',
    marketId: 'bitcoin-usd',
    observedAt: '2026-08-03T01:00:00.000Z',
    newsTargetKind: NewsImpactTargetKind.Asset,
    newsTargetId: 'bitcoin',
  };
  return {
    items: [
      {
        id,
        targetKind: NewsImpactTargetKind.Asset,
        targetId: 'bitcoin',
        direction: NewsImpactDirection.Positive,
        impactTypes: [NewsImpactType.Listing],
        articleIds: [`article-${id}`],
        eventGroupIds: [`group-${id}`],
        sourceIds: [`source-${id}`],
        sourceRecordIds: [`record-${id}`],
        firstPublishedAt: '2026-08-03T01:00:00.000Z',
        lastPublishedAt: '2026-08-03T01:00:00.000Z',
        evidence: { references: [evidence] },
      },
    ],
  };
}

function adapter(providerId, behavior, modelIds = ['model-a']) {
  return {
    providerId,
    capabilities: [NarratorCapability.NewsNarration],
    modelIds,
    narrate: behavior,
  };
}

function service(narrator) {
  return new DefaultMorningMeetingNewsNarrationService({
    inputAssembler: new MorningMeetingNewsNarrationInputAssembler(),
    narrator,
    validator: new MorningMeetingNewsNarrationValidator(),
  });
}

function validOutput(input) {
  return {
    items: input.items.map((item) => ({
      briefItemId: item.briefItemId,
      targetKind: item.targetKind,
      targetId: item.targetId,
      text: `Narrated ${item.briefItemId}.`,
      evidence: item.evidence,
    })),
  };
}

test('registers, lists, gets, and unregisters adapters deterministically', () => {
  const registry = new MorningMeetingNewsNarratorRegistry();
  const beta = adapter('beta', async (input) => validOutput(input));
  const alpha = adapter('alpha', async (input) => validOutput(input));

  registry.register(beta);
  registry.register(alpha);

  assert.deepEqual(
    registry.list().map((candidate) => candidate.providerId),
    ['alpha', 'beta'],
  );
  assert.equal(registry.get('alpha'), alpha);
  assert.throws(() => registry.register(alpha), MorningMeetingNarratorProviderError);
  assert.equal(registry.unregister('alpha'), true);
  assert.equal(registry.get('alpha'), undefined);
  assert.equal(registry.unregister('alpha'), false);
});

test('resolves only an explicitly registered provider and supported model', async () => {
  const registry = new MorningMeetingNewsNarratorRegistry();
  const selected = adapter('selected', async (input) => validOutput(input), ['model-a', 'model-b']);
  registry.register(selected);

  const narrator = new RegistryMorningMeetingNewsNarrator(registry, {
    providerId: 'selected',
    modelId: 'model-b',
  });
  assert.equal((await narrator.narrate({ items: [] })).items.length, 0);
  assert.throws(
    () => registry.resolve({ providerId: 'unknown' }),
    MorningMeetingNarratorProviderError,
  );
  assert.throws(
    () => registry.resolve({ providerId: 'selected', modelId: 'missing' }),
    MorningMeetingNarratorProviderError,
  );
});

test('registry-resolved adapters remain behind the existing narration validation boundary', async () => {
  const registry = new MorningMeetingNewsNarratorRegistry();
  registry.register(adapter('malformed', async () => ({ items: null })));
  const narrator = new RegistryMorningMeetingNewsNarrator(registry, { providerId: 'malformed' });

  await assert.rejects(() => service(narrator).narrate(brief()), /items array/);
});

test('normalizes provider failures and preserves later independent calls', async () => {
  let fail = true;
  const registry = new MorningMeetingNewsNarratorRegistry();
  registry.register(
    adapter('recoverable', async (input) => {
      if (fail) throw new Error('vendor error');
      return validOutput(input);
    }),
  );
  const narrator = new RegistryMorningMeetingNewsNarrator(registry, { providerId: 'recoverable' });
  const narrationService = service(narrator);

  await assert.rejects(
    () => narrationService.narrate(brief('first')),
    MorningMeetingNarratorProviderError,
  );
  fail = false;
  assert.equal((await narrationService.narrate(brief('second'))).items.length, 1);
});
