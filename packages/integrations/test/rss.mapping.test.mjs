import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapNewsFeedItemToArticle,
  RssNewsMappingError,
  RssNewsProvider,
  RssNewsProviderError,
} from '../dist/index.js';

const definition = {
  url: 'https://example.com/feed.xml',
  source: { id: 'example-publication', name: 'Example Publication', type: 'publication' },
  defaultLanguage: 'en',
  defaultTopicIds: ['markets'],
};

test('maps RSS/Atom-local fields into provider-neutral article provenance', () => {
  const article = mapNewsFeedItemToArticle(
    definition,
    {
      guid: '  source-record-1 ',
      title: ' Feed update ',
      link: 'https://example.com/articles/1',
      publishedAt: '2026-08-04T01:00:00+00:00',
      authors: [{ name: ' Ada ' }],
      categories: ['defi', 'defi'],
    },
    '2026-08-04T02:00:00.000Z',
  );

  assert.equal(article.sourceId, 'example-publication');
  assert.equal(article.sourceRecordId, 'source-record-1');
  assert.equal(article.canonicalUrl, 'https://example.com/articles/1');
  assert.equal(article.publishedAt, '2026-08-04T01:00:00.000Z');
  assert.equal(article.observedAt, '2026-08-04T02:00:00.000Z');
  assert.deepEqual(article.authors, ['Ada']);
  assert.deepEqual(article.topicIds, ['defi', 'markets']);
});

test('creates a deterministic article ID without fabricating a source record ID', () => {
  const item = { title: 'Feed update', publishedAt: '2026-08-04T01:00:00.000Z' };
  const first = mapNewsFeedItemToArticle(definition, item, '2026-08-04T02:00:00.000Z');
  const second = mapNewsFeedItemToArticle(definition, item, '2026-08-04T02:00:00.000Z');

  assert.equal(first.sourceRecordId, undefined);
  assert.equal(first.id, second.id);
});

test('rejects feed items without source-provided publication timestamps', () => {
  assert.throws(
    () =>
      mapNewsFeedItemToArticle(definition, { title: 'Feed update' }, '2026-08-04T02:00:00.000Z'),
    RssNewsMappingError,
  );
});

test('validates explicit provider configuration without starting retrieval', async () => {
  const provider = new RssNewsProvider({
    feeds: [definition],
    fetch: async () => ({ ok: true, status: 200, text: async () => '<rss />' }),
    parser: { parse: () => ({ items: [] }) },
    clock: { now: () => '2026-08-04T02:00:00.000Z' },
  });

  await assert.rejects(() => provider.getArticles({}), RssNewsProviderError);
});
