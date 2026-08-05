import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompositeNewsProvider,
  DefaultNewsIntelligenceService,
  NewsCategory,
  NewsClassificationField,
  NewsClassifier,
  NewsContextValidator,
  NewsEventType,
  NewsProviderCompositionError,
  NewsSourceRegistry,
} from '@cryptodesk-ai/news-intelligence';
import { RssNewsProvider, XmlNewsFeedParser } from '../dist/index.js';

const rssFeed = `<?xml version="1.0"?>
<rss version="2.0"><channel><item>
  <guid>rss-listing-1</guid><title>Bitcoin listed</title>
  <link>https://rss.example/listing</link><pubDate>Tue, 05 Aug 2026 01:00:00 GMT</pubDate>
  <category>markets</category>
</item><item>
  <guid>rss-listing-1</guid><title>Bitcoin listed</title>
  <link>https://rss.example/listing</link><pubDate>Tue, 05 Aug 2026 01:00:00 GMT</pubDate>
  <category>markets</category>
</item></channel></rss>`;

const atomFeed = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <id>atom-governance-1</id><title>Ethereum governance vote</title>
  <link href="https://atom.example/governance" />
  <published>2026-08-04T01:00:00Z</published><category term="defi" />
</entry></feed>`;

const rssSource = { id: 'rss-source', name: 'RSS Source', type: 'publication' };
const atomSource = { id: 'atom-source', name: 'Atom Source', type: 'protocol' };
const fixedClock = { now: () => '2026-08-05T04:00:00.000Z' };

function feedDefinition(url, source, overrides = {}) {
  return { url, source, defaultLanguage: 'en', ...overrides };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

function createRssProvider(feed, payload) {
  return new RssNewsProvider({
    feeds: [feed],
    fetch: async () => (payload instanceof Error ? Promise.reject(payload) : payload),
    parser: new XmlNewsFeedParser(),
    clock: fixedClock,
  });
}

function createService({
  rssPayload = response(rssFeed),
  atomPayload = response(atomFeed),
  rules,
  reverseProviderRegistrations = false,
} = {}) {
  const rssDefinition = feedDefinition('https://rss.example/feed.xml', rssSource, {
    defaultAssetIds: ['bitcoin'],
    defaultMarketIds: ['btc-usd'],
  });
  const atomDefinition = feedDefinition('https://atom.example/feed.xml', atomSource, {
    defaultAssetIds: ['ethereum'],
    defaultMarketIds: ['eth-usd'],
  });
  const registrations = [
    {
      id: 'rss-provider',
      provider: createRssProvider(rssDefinition, rssPayload),
      sourceIds: [rssSource.id],
    },
    {
      id: 'atom-provider',
      provider: createRssProvider(atomDefinition, atomPayload),
      sourceIds: [atomSource.id],
    },
  ];
  const composite = new CompositeNewsProvider(
    new NewsSourceRegistry([rssSource, atomSource]),
    reverseProviderRegistrations ? registrations.reverse() : registrations,
  );

  return new DefaultNewsIntelligenceService(composite, {
    classifier: new NewsClassifier({
      assets: [
        { assetId: 'bitcoin', symbols: ['BTC'], aliases: ['Bitcoin'] },
        { assetId: 'ethereum', symbols: ['ETH'], aliases: ['Ethereum'] },
      ],
      rules: rules ?? [
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
    }),
    validator: new NewsContextValidator(),
    clock: fixedClock,
  });
}

test('assembles real RSS and Atom providers into a validated deterministic NewsContext', async () => {
  const context = await createService().getContext({
    sourceIds: [rssSource.id, atomSource.id],
    assetIds: ['bitcoin', 'ethereum'],
  });

  assert.equal(context.assembledAt, '2026-08-05T04:00:00.000Z');
  assert.equal(context.metadata.articleCount, 2);
  assert.deepEqual(context.metadata.sourceIds, ['atom-source', 'rss-source']);
  assert.deepEqual(context.metadata.assetIds, ['bitcoin', 'ethereum']);
  assert.deepEqual(context.metadata.marketIds, ['btc-usd', 'eth-usd']);
  assert.deepEqual(context.metadata.topicIds, ['defi', 'markets']);
  assert.deepEqual(context.metadata.categoryCounts, [
    { category: NewsCategory.Governance, count: 1 },
    { category: NewsCategory.Listing, count: 1 },
  ]);
  assert.deepEqual(context.metadata.eventCounts, [
    { type: NewsEventType.GovernanceVote, count: 1 },
    { type: NewsEventType.TokenListing, count: 1 },
  ]);
  assert.deepEqual(
    context.articles.map((article) => article.sourceId),
    ['rss-source', 'atom-source'],
  );
  assert.equal(context.articles[0]?.sourceRecordId, 'rss-listing-1');
  assert.equal(context.articles[1]?.sourceRecordId, 'atom-governance-1');
  assert.deepEqual(
    context.classifications.map((classification) => classification.articleId).sort(),
    context.articles.map((article) => article.id).sort(),
  );
});

test('propagates source, time, structured association, topic, and global limit queries', async () => {
  const service = createService();

  assert.equal((await service.getContext({ sourceIds: ['rss-source'] })).articles.length, 1);
  assert.equal((await service.getContext({ from: '2026-08-05T00:00:00.000Z' })).articles.length, 1);
  assert.equal((await service.getContext({ to: '2026-08-04T23:59:59.000Z' })).articles.length, 1);
  assert.equal((await service.getContext({ assetIds: ['ethereum'] })).articles.length, 1);
  assert.equal((await service.getContext({ marketIds: ['btc-usd'] })).articles.length, 1);
  assert.equal((await service.getContext({ topicIds: ['defi'] })).articles.length, 1);
  assert.deepEqual(
    (await service.getContext({ limit: 1 })).articles.map((article) => article.sourceId),
    ['rss-source'],
  );
});

test('keeps empty data distinct from fail-fast RSS and Atom provider failures', async () => {
  const emptyService = createService({
    rssPayload: response('<rss version="2.0"><channel><title>Empty RSS</title></channel></rss>'),
    atomPayload: response('<feed xmlns="http://www.w3.org/2005/Atom" />'),
  });
  assert.equal((await emptyService.getContext({})).metadata.articleCount, 0);

  await assert.rejects(
    () => createService({ rssPayload: new Error('offline') }).getContext({}),
    NewsProviderCompositionError,
  );
  await assert.rejects(
    () =>
      createService({
        rssPayload: new Error('rss unavailable'),
        atomPayload: new Error('atom unavailable'),
      }).getContext({}),
    (error) =>
      error instanceof NewsProviderCompositionError && error.message.includes('atom-provider'),
  );
  await assert.rejects(
    () =>
      createService({
        atomPayload: response('<feed xmlns="http://www.w3.org/2005/Atom">'),
      }).getContext({}),
    NewsProviderCompositionError,
  );
});

test('returns valid empty contexts for out-of-range data and unmatched classifier rules', async () => {
  const outOfRange = await createService().getContext({
    from: '2026-08-06T00:00:00.000Z',
  });
  assert.equal(outOfRange.metadata.articleCount, 0);
  assert.deepEqual(outOfRange.articles, []);

  const noMatches = await createService({ rules: [] }).getContext({});
  assert.equal(noMatches.metadata.articleCount, 2);
  assert.deepEqual(
    noMatches.classifications.map((classification) => [
      classification.categories,
      classification.events,
    ]),
    [
      [[], []],
      [[], []],
    ],
  );
});

test('produces an equivalent context when provider and classifier rule configuration order changes', async () => {
  const query = { sourceIds: [atomSource.id, rssSource.id] };
  const expected = await createService().getContext(query);
  const actual = await createService({
    reverseProviderRegistrations: true,
    rules: [
      {
        id: 'governance',
        category: NewsCategory.Governance,
        event: NewsEventType.GovernanceVote,
        field: NewsClassificationField.Title,
        matches: ['governance vote'],
      },
      {
        id: 'listing',
        category: NewsCategory.Listing,
        event: NewsEventType.TokenListing,
        field: NewsClassificationField.Title,
        matches: ['listed'],
      },
    ],
  }).getContext(query);

  assert.deepEqual(actual, expected);
});
