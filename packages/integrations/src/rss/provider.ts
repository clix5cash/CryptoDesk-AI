import type { NewsArticle, NewsProvider, NewsQuery } from '@cryptodesk-ai/news-intelligence';
import { mapNewsFeedItemToArticle, RssNewsMappingError } from './mappers.js';
import { RssNewsFeedParseError } from './parser.js';
import type { RssNewsProviderConfig } from './types.js';

export class RssNewsProviderError extends Error {}

/**
 * RSS/Atom adapter for the provider-neutral NewsProvider contract. It fetches,
 * parses, and maps configured feeds without domain-level analysis or mutation.
 */
export class RssNewsProvider implements NewsProvider {
  constructor(private readonly config: RssNewsProviderConfig) {
    if (config.feeds.length === 0) {
      throw new RssNewsProviderError('At least one RSS/Atom feed must be configured.');
    }

    for (const feed of config.feeds) {
      if (!feed.url.trim()) {
        throw new RssNewsProviderError('RSS/Atom feed URL is required.');
      }

      if (!feed.source.id.trim()) {
        throw new RssNewsProviderError('RSS/Atom feed source ID is required.');
      }
    }
  }

  async getArticles(query: NewsQuery): Promise<ReadonlyArray<NewsArticle>> {
    this.validateQuery(query);
    const feeds = this.selectFeeds(query);
    const articles = (await Promise.all(feeds.map((feed) => this.getFeedArticles(feed)))).flat();

    return this.applyQuery(articles, query);
  }

  private async getFeedArticles(
    feed: RssNewsProviderConfig['feeds'][number],
  ): Promise<ReadonlyArray<NewsArticle>> {
    let response;

    try {
      response = await this.config.fetch(feed.url, {});
    } catch {
      throw new RssNewsProviderError('RSS/Atom feed request failed before receiving a response.');
    }

    if (!response.ok) {
      throw new RssNewsProviderError(
        `RSS/Atom feed request failed with status ${response.status}.`,
      );
    }

    let body: string;

    try {
      body = await response.text();
    } catch {
      throw new RssNewsProviderError('RSS/Atom feed response body could not be read.');
    }

    if (!body.trim()) {
      throw new RssNewsProviderError('RSS/Atom feed returned an empty body.');
    }

    let document;

    try {
      document = this.config.parser.parse(body);
    } catch (error) {
      if (error instanceof RssNewsFeedParseError) {
        throw new RssNewsProviderError('RSS/Atom feed could not be parsed.');
      }

      throw new RssNewsProviderError('RSS/Atom feed parser failed.');
    }

    const observedAt = this.config.clock.now();

    try {
      return document.items.map((item) => mapNewsFeedItemToArticle(feed, item, observedAt));
    } catch (error) {
      if (error instanceof RssNewsMappingError) {
        throw new RssNewsProviderError('RSS/Atom feed contains an invalid item.');
      }

      throw new RssNewsProviderError('RSS/Atom feed item mapping failed.');
    }
  }

  private selectFeeds(query: NewsQuery): ReadonlyArray<RssNewsProviderConfig['feeds'][number]> {
    return this.config.feeds
      .filter((feed) => !query.sourceIds || query.sourceIds.includes(feed.source.id))
      .sort((left, right) =>
        compareTuple([left.source.id, left.url], [right.source.id, right.url]),
      );
  }

  private applyQuery(
    articles: ReadonlyArray<NewsArticle>,
    query: NewsQuery,
  ): ReadonlyArray<NewsArticle> {
    const filtered = articles.filter((article) => {
      const matchesAssets =
        !query.assetIds ||
        query.assetIds.some((assetId) => article.assetIds?.includes(assetId) ?? false);
      const matchesMarkets =
        !query.marketIds ||
        query.marketIds.some((marketId) => article.marketIds?.includes(marketId) ?? false);
      const matchesTopics =
        !query.topicIds ||
        query.topicIds.some((topicId) => article.topicIds?.includes(topicId) ?? false);
      const matchesFrom = !query.from || article.publishedAt >= new Date(query.from).toISOString();
      const matchesTo = !query.to || article.publishedAt <= new Date(query.to).toISOString();

      return matchesAssets && matchesMarkets && matchesTopics && matchesFrom && matchesTo;
    });

    const ordered = [...filtered].sort((left, right) =>
      compareTuple(
        [left.sourceId, right.publishedAt, left.id],
        [right.sourceId, left.publishedAt, right.id],
      ),
    );

    return query.limit === undefined ? ordered : ordered.slice(0, query.limit);
  }

  private validateQuery(query: NewsQuery): void {
    for (const [label, value] of [
      ['from', query.from],
      ['to', query.to],
    ] as const) {
      if (value !== undefined && Number.isNaN(Date.parse(value))) {
        throw new RssNewsProviderError(`RSS/Atom NewsQuery "${label}" must be a valid timestamp.`);
      }
    }

    if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
      throw new RssNewsProviderError('RSS/Atom NewsQuery "from" must not be after "to".');
    }

    if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 0)) {
      throw new RssNewsProviderError('RSS/Atom NewsQuery "limit" must be a non-negative integer.');
    }
  }
}

function compareTuple(left: ReadonlyArray<string>, right: ReadonlyArray<string>): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = compareText(left[index] ?? '', right[index] ?? '');

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
