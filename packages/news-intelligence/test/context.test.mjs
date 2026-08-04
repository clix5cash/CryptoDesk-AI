import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DefaultNewsIntelligenceService,
  NewsCategory,
  NewsClassificationField,
  NewsClassifier,
  NewsContextError,
  NewsContextValidator,
  NewsEventType,
  normalizeNewsArticles,
} from '../dist/index.js';

const clock = { now: () => '2026-08-04T04:00:00.000Z' };

function article(overrides = {}) {
  return {
    id: 'article-1',
    sourceId: 'source-a',
    title: 'ETH listed after governance vote',
    publishedAt: '2026-08-04T01:00:00.000Z',
    observedAt: '2026-08-04T02:00:00.000Z',
    ...overrides,
  };
}

function createService(articles, classifier = createClassifier()) {
  return new DefaultNewsIntelligenceService(
    {
      async getArticles() {
        return articles;
      },
    },
    { classifier, validator: new NewsContextValidator(), clock },
  );
}

function createClassifier() {
  return new NewsClassifier({
    assets: [{ assetId: 'ethereum', symbols: ['ETH'] }],
    rules: [
      {
        id: 'listing',
        category: NewsCategory.Listing,
        event: NewsEventType.TokenListing,
        field: NewsClassificationField.Title,
        matches: ['listed'],
      },
      {
        id: 'governance',
        category: NewsCategory.Governance,
        event: NewsEventType.GovernanceVote,
        field: NewsClassificationField.Title,
        matches: ['governance vote'],
      },
    ],
  });
}

test('assembles a validated full provider-to-context pipeline', async () => {
  const context = await createService([
    article({ assetIds: ['ethereum'], marketIds: ['eth-usd'], topicIds: ['defi'] }),
  ]).getContext({ sourceIds: ['source-a', 'source-a'] });

  assert.equal(context.assembledAt, '2026-08-04T04:00:00.000Z');
  assert.deepEqual(context.query, { sourceIds: ['source-a'] });
  assert.equal(context.articles.length, 1);
  assert.deepEqual(
    context.classifications.map((classification) => classification.articleId),
    ['article-1'],
  );
  assert.deepEqual(context.metadata, {
    articleCount: 1,
    sourceIds: ['source-a'],
    assetIds: ['ethereum'],
    marketIds: ['eth-usd'],
    topicIds: ['defi'],
    categoryCounts: [
      { category: NewsCategory.Governance, count: 1 },
      { category: NewsCategory.Listing, count: 1 },
    ],
    eventCounts: [
      { type: NewsEventType.GovernanceVote, count: 1 },
      { type: NewsEventType.TokenListing, count: 1 },
    ],
  });
});

test('is deterministic for reordered provider output and deduplicates records in context', async () => {
  const first = article({ id: 'article-1', sourceRecordId: 'record-1', assetIds: ['ethereum'] });
  const second = article({
    id: 'article-2',
    sourceRecordId: 'record-2',
    title: 'Routine update',
    publishedAt: '2026-08-03T01:00:00.000Z',
  });
  const forward = await createService([first, second, first]).getContext({});
  const reverse = await createService([first, first, second]).getContext({});

  assert.deepEqual(forward, reverse);
  assert.deepEqual(
    forward.classifications.map((classification) => classification.articleId),
    ['article-1', 'article-2'],
  );
});

test('returns a valid empty context when the provider returns no articles', async () => {
  const context = await createService([]).getContext({});

  assert.deepEqual(context.articles, []);
  assert.deepEqual(context.classifications, []);
  assert.deepEqual(context.metadata, {
    articleCount: 0,
    sourceIds: [],
    assetIds: [],
    marketIds: [],
    topicIds: [],
    categoryCounts: [],
    eventCounts: [],
  });
});

test('retains an article classification with empty results when rules do not match', async () => {
  const context = await createService([article({ title: 'Routine update' })]).getContext({});
  assert.deepEqual(context.classifications, [
    { articleId: 'article-1', assets: [], markets: [], categories: [], events: [] },
  ]);
});

test('rejects orphan and duplicate classifications during context validation', () => {
  const validator = new NewsContextValidator();
  const [normalizedArticle] = normalizeNewsArticles([article()]);

  assert.ok(normalizedArticle);
  const base = {
    query: {},
    assembledAt: '2026-08-04T04:00:00.000Z',
    articles: [normalizedArticle],
    classifications: [{ articleId: 'orphan', assets: [], markets: [], categories: [], events: [] }],
    metadata: {
      articleCount: 1,
      sourceIds: ['source-a'],
      assetIds: [],
      marketIds: [],
      topicIds: [],
      categoryCounts: [],
      eventCounts: [],
    },
  };

  assert.throws(() => validator.validate(base), NewsContextError);

  const duplicate = {
    ...base,
    classifications: [
      { articleId: 'article-1', assets: [], markets: [], categories: [], events: [] },
      { articleId: 'article-1', assets: [], markets: [], categories: [], events: [] },
    ],
  };

  assert.throws(() => validator.validate(duplicate), /Duplicate News context classification/);
});

test('preserves getArticles compatibility while context dependencies remain explicit', async () => {
  const service = new DefaultNewsIntelligenceService({
    async getArticles() {
      return [article()];
    },
  });

  assert.equal((await service.getArticles({})).length, 1);
  await assert.rejects(() => service.getContext({}), NewsContextError);
});
