import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DefaultNewsIntelligenceService,
  NewsArticleError,
  normalizeNewsArticles,
} from '../dist/index.js';

const publishedAt = '2026-08-04T01:00:00.000Z';
const observedAt = '2026-08-04T02:00:00.000Z';

function article(overrides = {}) {
  return {
    id: 'article-1',
    sourceId: 'source-a',
    title: ' Bitcoin  update ',
    publishedAt,
    observedAt,
    ...overrides,
  };
}

test('normalizes provider-neutral article fields and associations', () => {
  const [normalized] = normalizeNewsArticles([
    article({
      canonicalUrl: 'HTTPS://Example.COM:443/news?b=2&a=1',
      authors: [' Ada  Lovelace ', 'Ada Lovelace', ' Bob '],
      language: ' EN-us ',
      assetIds: ['bitcoin', ' bitcoin ', 'ethereum'],
      marketIds: ['btc-usd', 'btc-usd'],
      topicIds: ['markets', ' markets '],
    }),
  ]);

  assert.deepEqual(normalized, {
    id: 'article-1',
    sourceId: 'source-a',
    title: 'Bitcoin update',
    canonicalUrl: 'https://example.com/news?b=2&a=1',
    authors: ['Ada Lovelace', 'Bob'],
    language: 'en-us',
    publishedAt,
    observedAt,
    assetIds: ['bitcoin', 'ethereum'],
    marketIds: ['btc-usd'],
    topicIds: ['markets'],
  });
});

test('deduplicates by source record ID and merges non-conflicting provenance metadata', () => {
  const result = normalizeNewsArticles([
    article({ sourceRecordId: 'record-1', observedAt: '2026-08-04T02:00:00.000Z' }),
    article({
      sourceRecordId: 'record-1',
      observedAt: '2026-08-04T03:00:00.000Z',
      authors: ['Ada'],
      topicIds: ['markets'],
    }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.observedAt, '2026-08-04T03:00:00.000Z');
  assert.deepEqual(result[0]?.authors, ['Ada']);
  assert.deepEqual(result[0]?.topicIds, ['markets']);
});

test('deduplicates by canonical URL when source record ID is absent', () => {
  const result = normalizeNewsArticles([
    article({ canonicalUrl: 'https://example.com/news' }),
    article({ canonicalUrl: 'HTTPS://EXAMPLE.COM:443/news' }),
  ]);

  assert.equal(result.length, 1);
});

test('deduplicates by stable fallback identity when no source record or canonical URL exists', () => {
  const result = normalizeNewsArticles([article(), article()]);
  assert.equal(result.length, 1);
});

test('keeps distinct source records and deterministically orders articles', () => {
  const result = normalizeNewsArticles([
    article({ id: 'later-source-b', sourceId: 'source-b', sourceRecordId: 'record-b' }),
    article({
      id: 'earlier-source-a',
      sourceId: 'source-a',
      sourceRecordId: 'record-a',
      publishedAt: '2026-08-03T01:00:00.000Z',
    }),
    article({ id: 'later-source-a', sourceId: 'source-a', sourceRecordId: 'record-c' }),
  ]);

  assert.deepEqual(
    result.map((item) => item.id),
    ['later-source-a', 'later-source-b', 'earlier-source-a'],
  );
});

test('is repeatable for reordered input without metadata inflation', () => {
  const left = article({ sourceRecordId: 'record-1', authors: ['Ada'], assetIds: ['bitcoin'] });
  const right = article({ sourceRecordId: 'record-1', authors: ['Bob'], assetIds: ['ethereum'] });

  assert.deepEqual(normalizeNewsArticles([left, right]), normalizeNewsArticles([right, left]));
  assert.equal(normalizeNewsArticles([left, right]).length, 1);
});

test('rejects malformed articles explicitly', () => {
  assert.throws(() => normalizeNewsArticles([article({ title: ' ' })]), NewsArticleError);
  assert.throws(
    () => normalizeNewsArticles([article({ canonicalUrl: 'not-a-url' })]),
    NewsArticleError,
  );
});

test('the injected service retrieves normalized, deduplicated provider output', async () => {
  const queries = [];
  const provider = {
    async getArticles(query) {
      queries.push(query);
      return [article({ sourceRecordId: 'record-1' }), article({ sourceRecordId: 'record-1' })];
    },
  };
  const query = { sourceIds: ['source-a'] };
  const service = new DefaultNewsIntelligenceService(provider);

  const result = await service.getArticles(query);

  assert.deepEqual(queries, [query]);
  assert.equal(result.length, 1);
});
