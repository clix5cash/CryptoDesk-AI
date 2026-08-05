import assert from 'node:assert/strict';
import test from 'node:test';
import { CompositeNewsProvider, NewsSourceRegistry } from '@cryptodesk-ai/news-intelligence';
import {
  RssNewsFeedParseError,
  RssNewsProvider,
  RssNewsProviderError,
  XmlNewsFeedParser,
} from '../dist/index.js';

const rssFeed = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example RSS</title>
    <language>en</language>
    <item>
      <guid>rss-record-1</guid>
      <title>First RSS update</title>
      <link>https://rss.example/articles/1</link>
      <pubDate>Mon, 04 Aug 2026 01:00:00 GMT</pubDate>
      <dc:creator>Ada</dc:creator>
      <description>RSS excerpt</description>
      <content:encoded><![CDATA[RSS content]]></content:encoded>
      <category>defi</category>
    </item>
    <item>
      <title>Second RSS update</title>
      <link>https://rss.example/articles/2</link>
      <pubDate>Mon, 03 Aug 2026 01:00:00 GMT</pubDate>
      <category>markets</category>
    </item>
  </channel>
</rss>`;

const atomFeed = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <title>Example Atom</title>
  <entry>
    <id>atom-record-1</id>
    <title>First Atom update</title>
    <link rel="alternate" href="https://atom.example/articles/1" />
    <published>2026-08-04T01:00:00Z</published>
    <updated>2026-08-04T01:30:00Z</updated>
    <author><name>Ada</name></author>
    <summary>Atom excerpt</summary>
    <content>Atom content</content>
    <category term="defi" />
  </entry>
</feed>`;

function definition({ url, sourceId, ...overrides }) {
  return {
    url,
    source: { id: sourceId, name: sourceId, type: 'publication' },
    defaultLanguage: 'en',
    ...overrides,
  };
}

function createProvider(feeds, payloads) {
  return new RssNewsProvider({
    feeds,
    fetch: async (url) => {
      const payload = payloads[url];

      if (payload instanceof Error) {
        throw payload;
      }

      return payload;
    },
    parser: new XmlNewsFeedParser(),
    clock: { now: () => '2026-08-04T02:00:00.000Z' },
  });
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

test('fetches RSS 2.0 records with source provenance and source fields', async () => {
  const provider = createProvider(
    [definition({ url: 'https://rss.example/feed.xml', sourceId: 'rss-source' })],
    { 'https://rss.example/feed.xml': response(rssFeed) },
  );

  const articles = await provider.getArticles({});

  assert.equal(articles.length, 2);
  assert.deepEqual(articles[0], {
    id: '["rss-source","rss-record-1","https://rss.example/articles/1","First RSS update","2026-08-04T01:00:00.000Z"]',
    sourceId: 'rss-source',
    sourceRecordId: 'rss-record-1',
    title: 'First RSS update',
    canonicalUrl: 'https://rss.example/articles/1',
    authors: ['Ada'],
    excerpt: 'RSS excerpt',
    content: 'RSS content',
    language: 'en',
    publishedAt: '2026-08-04T01:00:00.000Z',
    observedAt: '2026-08-04T02:00:00.000Z',
    topicIds: ['defi'],
  });
});

test('fetches Atom records with equivalent normalized article semantics', async () => {
  const provider = createProvider(
    [definition({ url: 'https://atom.example/feed.xml', sourceId: 'atom-source' })],
    { 'https://atom.example/feed.xml': response(atomFeed) },
  );

  const [article] = await provider.getArticles({});

  assert.ok(article);
  assert.equal(article.sourceRecordId, 'atom-record-1');
  assert.equal(article.canonicalUrl, 'https://atom.example/articles/1');
  assert.equal(article.publishedAt, '2026-08-04T01:00:00.000Z');
  assert.equal(article.observedAt, '2026-08-04T02:00:00.000Z');
  assert.deepEqual(article.authors, ['Ada']);
  assert.deepEqual(article.topicIds, ['defi']);
});

test('processes configured feeds deterministically and fails the whole request on feed errors', async () => {
  const feeds = [
    definition({ url: 'https://z.example/feed.xml', sourceId: 'z-source' }),
    definition({ url: 'https://a.example/feed.xml', sourceId: 'a-source' }),
  ];
  const provider = createProvider(feeds, {
    'https://z.example/feed.xml': response(rssFeed),
    'https://a.example/feed.xml': response(atomFeed),
  });

  assert.deepEqual(
    (await provider.getArticles({})).map((article) => article.sourceId),
    ['a-source', 'z-source', 'z-source'],
  );
  assert.deepEqual(
    await provider.getArticles({}),
    await createProvider([...feeds].reverse(), {
      'https://z.example/feed.xml': response(rssFeed),
      'https://a.example/feed.xml': response(atomFeed),
    }).getArticles({}),
  );

  const failingProvider = createProvider(feeds, {
    'https://z.example/feed.xml': response(rssFeed),
    'https://a.example/feed.xml': response('', 503),
  });
  await assert.rejects(() => failingProvider.getArticles({}), RssNewsProviderError);
});

test('normalizes fetch, body, parser, and mapping failures as adapter errors', async () => {
  const feed = definition({ url: 'https://example.com/feed.xml', sourceId: 'source' });

  await assert.rejects(
    () => createProvider([feed], { [feed.url]: new Error('offline') }).getArticles({}),
    RssNewsProviderError,
  );
  await assert.rejects(
    () => createProvider([feed], { [feed.url]: response('', 200) }).getArticles({}),
    RssNewsProviderError,
  );
  await assert.rejects(
    () => createProvider([feed], { [feed.url]: response('<rss>') }).getArticles({}),
    RssNewsProviderError,
  );
  await assert.rejects(
    () =>
      createProvider([feed], {
        [feed.url]: response(
          '<rss><channel><item><title>Missing date</title></item></channel></rss>',
        ),
      }).getArticles({}),
    RssNewsProviderError,
  );
});

test('uses deterministic source, structured association, time-range, and limit filtering', async () => {
  const feeds = [
    definition({
      url: 'https://rss.example/feed.xml',
      sourceId: 'rss-source',
      defaultAssetIds: ['bitcoin'],
      defaultMarketIds: ['btc-usd'],
      defaultTopicIds: ['configured'],
    }),
    definition({ url: 'https://atom.example/feed.xml', sourceId: 'atom-source' }),
  ];
  const provider = createProvider(feeds, {
    'https://rss.example/feed.xml': response(rssFeed),
    'https://atom.example/feed.xml': response(atomFeed),
  });

  assert.equal((await provider.getArticles({ sourceIds: ['atom-source'] })).length, 1);
  assert.equal((await provider.getArticles({ assetIds: ['bitcoin'] })).length, 2);
  assert.equal((await provider.getArticles({ marketIds: ['btc-usd'] })).length, 2);
  assert.equal((await provider.getArticles({ topicIds: ['defi'] })).length, 2);
  assert.deepEqual(
    (await provider.getArticles({ from: '2026-08-04T00:00:00.000Z', limit: 1 })).map(
      (article) => article.sourceId,
    ),
    ['atom-source'],
  );
});

test('keeps no-guid canonical URL article identity deterministic', async () => {
  const provider = createProvider(
    [definition({ url: 'https://rss.example/feed.xml', sourceId: 'rss-source' })],
    { 'https://rss.example/feed.xml': response(rssFeed) },
  );

  const [first] = await provider.getArticles({ sourceIds: ['rss-source'], limit: 2 });
  const [, second] = await provider.getArticles({ sourceIds: ['rss-source'], limit: 2 });

  assert.ok(first);
  assert.ok(second);
  assert.equal(second.sourceRecordId, undefined);
  assert.equal(
    second.id,
    (await provider.getArticles({ sourceIds: ['rss-source'], limit: 2 }))[1]?.id,
  );
});

test('rejects malformed XML directly through the concrete parser', () => {
  assert.throws(() => new XmlNewsFeedParser().parse('<rss>'), RssNewsFeedParseError);
});

test('plugs multiple explicit RSS/Atom providers into provider-neutral composition', async () => {
  const rssDefinition = definition({ url: 'https://rss.example/feed.xml', sourceId: 'rss-source' });
  const atomDefinition = definition({
    url: 'https://atom.example/feed.xml',
    sourceId: 'atom-source',
  });
  const rssProvider = createProvider([rssDefinition], { [rssDefinition.url]: response(rssFeed) });
  const atomProvider = createProvider([atomDefinition], {
    [atomDefinition.url]: response(atomFeed),
  });
  const composite = new CompositeNewsProvider(
    new NewsSourceRegistry([rssDefinition.source, atomDefinition.source]),
    [
      { id: 'rss', provider: rssProvider, sourceIds: ['rss-source'] },
      { id: 'atom', provider: atomProvider, sourceIds: ['atom-source'] },
    ],
  );

  assert.deepEqual(
    (await composite.getArticles({ sourceIds: ['rss-source', 'atom-source'] })).map(
      (article) => article.sourceId,
    ),
    ['atom-source', 'rss-source', 'rss-source'],
  );
});
