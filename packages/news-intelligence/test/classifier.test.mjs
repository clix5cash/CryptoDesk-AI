import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DefaultNewsIntelligenceService,
  NewsCategory,
  NewsClassificationField,
  NewsClassificationStrength,
  NewsClassifier,
  NewsEventType,
} from '../dist/index.js';

const timestamps = {
  publishedAt: '2026-08-04T01:00:00.000Z',
  observedAt: '2026-08-04T02:00:00.000Z',
};

function article(overrides = {}) {
  return {
    id: 'article-1',
    sourceId: 'source-a',
    title: 'Ethereum governance vote approved',
    ...timestamps,
    ...overrides,
  };
}

const rules = [
  {
    id: 'governance-vote',
    category: NewsCategory.Governance,
    event: NewsEventType.GovernanceVote,
    field: NewsClassificationField.Title,
    matches: ['governance vote'],
  },
  {
    id: 'security-incident',
    category: NewsCategory.Security,
    event: NewsEventType.SecurityIncident,
    field: NewsClassificationField.Title,
    matches: ['security incident'],
  },
  {
    id: 'exchange-listing',
    category: NewsCategory.Listing,
    event: NewsEventType.TokenListing,
    field: NewsClassificationField.Title,
    matches: ['listed'],
  },
  {
    id: 'defi-topic',
    category: NewsCategory.Defi,
    field: NewsClassificationField.TopicIds,
    matches: ['defi'],
  },
];

function classifier(configuration = {}) {
  return new NewsClassifier({
    assets: [
      { assetId: 'bitcoin', symbols: ['BTC'], aliases: ['Bitcoin'] },
      { assetId: 'ethereum', symbols: ['ETH'], aliases: ['Ethereum'] },
    ],
    rules,
    ...configuration,
  });
}

test('uses explicit asset and market associations as explicit relevance', () => {
  const result = classifier().classify(article({ assetIds: ['bitcoin'], marketIds: ['btc-usd'] }));

  assert.deepEqual(result.assets[0], {
    assetId: 'bitcoin',
    strength: NewsClassificationStrength.Explicit,
    evidence: [{ field: NewsClassificationField.AssetIds, matchedValue: 'bitcoin' }],
  });
  assert.deepEqual(result.markets, [
    {
      marketId: 'btc-usd',
      strength: NewsClassificationStrength.Explicit,
      evidence: [{ field: NewsClassificationField.MarketIds, matchedValue: 'btc-usd' }],
    },
  ]);
});

test('matches configured symbols and aliases with token-aware boundaries', () => {
  const result = classifier().classify(article({ title: 'ETH and Ethereum protocol update' }));

  assert.deepEqual(result.assets, [
    {
      assetId: 'ethereum',
      strength: NewsClassificationStrength.Strong,
      evidence: [
        { field: NewsClassificationField.Title, matchedValue: 'ETH' },
        { field: NewsClassificationField.Title, matchedValue: 'Ethereum' },
      ],
    },
  ]);
});

test('does not classify symbols embedded in unrelated words', () => {
  const result = classifier().classify(article({ title: 'Methodology update published' }));
  assert.deepEqual(result.assets, []);
});

test('retains multiple asset associations', () => {
  const result = classifier().classify(article({ assetIds: ['ethereum', 'bitcoin'] }));
  assert.deepEqual(
    result.assets.map((item) => item.assetId),
    ['bitcoin', 'ethereum'],
  );
});

test('classifies a source-provided topic through an explicit configured rule', () => {
  const result = classifier().classify(article({ title: 'Update', topicIds: ['defi'] }));
  assert.deepEqual(result.categories, [
    {
      category: NewsCategory.Defi,
      strength: NewsClassificationStrength.Strong,
      evidence: [
        {
          ruleId: 'defi-topic',
          field: NewsClassificationField.TopicIds,
          matchedValue: 'defi',
        },
      ],
    },
  ]);
});

test('classifies configured listing, governance, and security events', () => {
  assert.deepEqual(
    classifier().classify(article({ title: 'Token listed on an exchange' })).events,
    [
      {
        type: NewsEventType.TokenListing,
        strength: NewsClassificationStrength.Strong,
        evidence: [
          {
            ruleId: 'exchange-listing',
            field: NewsClassificationField.Title,
            matchedValue: 'listed',
          },
        ],
      },
    ],
  );
  assert.deepEqual(
    classifier()
      .classify(article())
      .events.map((item) => item.type),
    [NewsEventType.GovernanceVote],
  );
  assert.deepEqual(
    classifier()
      .classify(article({ title: 'Protocol security incident reported' }))
      .events.map((item) => item.type),
    [NewsEventType.SecurityIncident],
  );
});

test('returns no inferred categories or events without configured matching evidence', () => {
  const result = classifier().classify(article({ title: 'Routine update published' }));
  assert.deepEqual(result.categories, []);
  assert.deepEqual(result.events, []);
});

test('is deterministic when equivalent configuration and input ordering changes', () => {
  const source = article({
    title: 'ETH governance vote approved',
    assetIds: ['bitcoin', 'bitcoin'],
  });
  const reordered = new NewsClassifier({
    assets: [...classifierConfiguration().assets].reverse(),
    rules: [...rules].reverse(),
  });

  assert.deepEqual(classifier().classify(source), reordered.classify(source));
});

test('keeps service retrieval and classification composition deterministic', async () => {
  const provider = {
    async getArticles() {
      return [article({ sourceRecordId: 'record-1' }), article({ sourceRecordId: 'record-1' })];
    },
  };
  const service = new DefaultNewsIntelligenceService(provider);
  const [normalized] = await service.getArticles({});

  assert.ok(normalized);
  assert.deepEqual(
    classifier()
      .classify(normalized)
      .events.map((item) => item.type),
    [NewsEventType.GovernanceVote],
  );
});

function classifierConfiguration() {
  return {
    assets: [
      { assetId: 'bitcoin', symbols: ['BTC'], aliases: ['Bitcoin'] },
      { assetId: 'ethereum', symbols: ['ETH'], aliases: ['Ethereum'] },
    ],
  };
}
