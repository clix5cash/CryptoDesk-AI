import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompositeNewsProvider,
  NewsArticleError,
  NewsProviderCompositionError,
  NewsSourceRegistry,
  NewsSourceRegistryError,
} from '../dist/index.js';

const sourceA = { id: 'source-a', name: 'Source A', type: 'publication' };
const sourceB = { id: 'source-b', name: 'Source B', type: 'research' };

function article(overrides = {}) {
  return {
    id: 'article-1',
    sourceId: 'source-a',
    title: 'Article update',
    publishedAt: '2026-08-05T01:00:00.000Z',
    observedAt: '2026-08-05T02:00:00.000Z',
    ...overrides,
  };
}

function provider(articles, receivedQueries) {
  return {
    async getArticles(query) {
      receivedQueries?.push(query);
      return articles;
    },
  };
}

test('lists registered sources deterministically and rejects duplicate configuration', () => {
  const registry = new NewsSourceRegistry([sourceB, sourceA]);

  assert.deepEqual(
    registry.list().map((source) => source.id),
    ['source-a', 'source-b'],
  );
  assert.equal(registry.resolve('source-a').name, 'Source A');
  assert.throws(() => registry.register(sourceA), NewsSourceRegistryError);
  assert.throws(() => new NewsSourceRegistry([sourceA, sourceA]), NewsSourceRegistryError);
});

test('composes providers independently of registration and response order', async () => {
  const registry = new NewsSourceRegistry([sourceA, sourceB]);
  const sourceAArticle = article({ sourceRecordId: 'record-a' });
  const sourceBArticle = article({
    id: 'article-2',
    sourceId: 'source-b',
    sourceRecordId: 'record-b',
    publishedAt: '2026-08-04T01:00:00.000Z',
  });
  const forward = new CompositeNewsProvider(registry, [
    { id: 'b-provider', provider: provider([sourceBArticle]), sourceIds: ['source-b'] },
    { id: 'a-provider', provider: provider([sourceAArticle]), sourceIds: ['source-a'] },
  ]);
  const reversed = new CompositeNewsProvider(registry, [
    { id: 'a-provider', provider: provider([sourceAArticle]), sourceIds: ['source-a'] },
    { id: 'b-provider', provider: provider([sourceBArticle]), sourceIds: ['source-b'] },
  ]);

  assert.deepEqual(await forward.getArticles({}), await reversed.getArticles({}));

  const responseOrderOne = new CompositeNewsProvider(registry, [
    {
      id: 'a-provider',
      provider: provider([
        sourceAArticle,
        article({ id: 'article-3', sourceRecordId: 'record-c' }),
      ]),
      sourceIds: ['source-a'],
    },
  ]);
  const responseOrderTwo = new CompositeNewsProvider(registry, [
    {
      id: 'a-provider',
      provider: provider([
        article({ id: 'article-3', sourceRecordId: 'record-c' }),
        sourceAArticle,
      ]),
      sourceIds: ['source-a'],
    },
  ]);

  assert.deepEqual(await responseOrderOne.getArticles({}), await responseOrderTwo.getArticles({}));
});

test('deduplicates through existing normalization while preserving provenance', async () => {
  const registry = new NewsSourceRegistry([sourceA]);
  const duplicate = article({ sourceRecordId: 'record-a', authors: ['Ada'] });
  const richerDuplicate = article({
    sourceRecordId: 'record-a',
    observedAt: '2026-08-05T03:00:00.000Z',
    topicIds: ['markets'],
  });
  const composite = new CompositeNewsProvider(registry, [
    { id: 'provider-a', provider: provider([duplicate, richerDuplicate]), sourceIds: ['source-a'] },
  ]);

  const [result] = await composite.getArticles({});

  assert.ok(result);
  assert.equal(result.sourceRecordId, 'record-a');
  assert.equal(result.observedAt, '2026-08-05T03:00:00.000Z');
  assert.deepEqual(result.authors, ['Ada']);
  assert.deepEqual(result.topicIds, ['markets']);
});

test('permits empty provider output and applies one deterministic global limit', async () => {
  const registry = new NewsSourceRegistry([sourceA, sourceB]);
  const receivedQueries = [];
  const composite = new CompositeNewsProvider(registry, [
    { id: 'empty', provider: provider([], receivedQueries), sourceIds: ['source-b'] },
    {
      id: 'records',
      provider: provider([article({ sourceRecordId: 'record-a' })], receivedQueries),
      sourceIds: ['source-a'],
    },
  ]);

  const results = await composite.getArticles({ limit: 1 });

  assert.equal(results.length, 1);
  assert.deepEqual(receivedQueries, [{ limit: undefined }, { limit: undefined }]);
});

test('respects source query filters through composition', async () => {
  const registry = new NewsSourceRegistry([sourceA, sourceB]);
  const sourceAQueries = [];
  const sourceBQueries = [];
  const composite = new CompositeNewsProvider(registry, [
    { id: 'a', provider: provider([article()], sourceAQueries), sourceIds: ['source-a'] },
    {
      id: 'b',
      provider: provider([article({ id: 'b', sourceId: 'source-b' })], sourceBQueries),
      sourceIds: ['source-b'],
    },
  ]);

  assert.deepEqual(
    (await composite.getArticles({ sourceIds: ['source-b'] })).map((item) => item.sourceId),
    ['source-b'],
  );
  assert.equal(sourceAQueries.length, 0);
  assert.equal(sourceBQueries.length, 1);
});

test('fails fast and explicitly for provider failures, unknown sources, and invalid ownership', async () => {
  const registry = new NewsSourceRegistry([sourceA, sourceB]);
  const composite = new CompositeNewsProvider(registry, [
    {
      id: 'a-failure',
      provider: {
        async getArticles() {
          throw new Error('unavailable');
        },
      },
      sourceIds: ['source-a'],
    },
    {
      id: 'b-success',
      provider: provider([article({ sourceId: 'source-b' })]),
      sourceIds: ['source-b'],
    },
  ]);

  await assert.rejects(() => composite.getArticles({}), /a-failure/);
  await assert.rejects(
    () => composite.getArticles({ sourceIds: ['unknown'] }),
    NewsSourceRegistryError,
  );
  assert.throws(
    () =>
      new CompositeNewsProvider(registry, [
        { id: 'invalid', provider: provider([]), sourceIds: ['unknown'] },
      ]),
    NewsSourceRegistryError,
  );
  assert.throws(
    () =>
      new CompositeNewsProvider(registry, [
        { id: 'duplicate', provider: provider([]), sourceIds: ['source-a'] },
        { id: 'duplicate', provider: provider([]), sourceIds: ['source-b'] },
      ]),
    NewsProviderCompositionError,
  );
});

test('rejects providers that claim the wrong source and preserves no fabricated source records', async () => {
  const registry = new NewsSourceRegistry([sourceA, sourceB]);
  const invalidOwnership = new CompositeNewsProvider(registry, [
    {
      id: 'source-a-provider',
      provider: provider([article({ sourceId: 'source-b' })]),
      sourceIds: ['source-a'],
    },
  ]);
  const noRecord = new CompositeNewsProvider(registry, [
    { id: 'source-a-provider', provider: provider([article()]), sourceIds: ['source-a'] },
  ]);

  await assert.rejects(() => invalidOwnership.getArticles({}), NewsProviderCompositionError);
  assert.equal((await noRecord.getArticles({}))[0]?.sourceRecordId, undefined);
});

test('keeps conflicting cross-source provenance explicit instead of silently collapsing it', async () => {
  const registry = new NewsSourceRegistry([sourceA, sourceB]);
  const composite = new CompositeNewsProvider(registry, [
    {
      id: 'a-provider',
      provider: provider([article({ id: 'a', canonicalUrl: 'https://example.com/article' })]),
      sourceIds: ['source-a'],
    },
    {
      id: 'b-provider',
      provider: provider([
        article({ id: 'b', sourceId: 'source-b', canonicalUrl: 'https://example.com/article' }),
      ]),
      sourceIds: ['source-b'],
    },
  ]);

  await assert.rejects(() => composite.getArticles({}), NewsArticleError);
});
