import type { NewsArticle, NewsProvider, NewsQuery } from '@cryptodesk-ai/news-intelligence';
import type { RssNewsProviderConfig } from './types.js';

export class RssNewsProviderError extends Error {}

/**
 * Foundation adapter for the provider-neutral NewsProvider contract. Fetching,
 * parser invocation, feed iteration, and query filtering are deliberately
 * deferred to Sprint 6C.2.
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
    void query;

    throw new RssNewsProviderError('RSS/Atom feed retrieval is not implemented until Sprint 6C.2.');
  }
}
