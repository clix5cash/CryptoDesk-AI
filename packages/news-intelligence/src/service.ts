import type { NewsArticle, NewsQuery } from './models.js';
import { normalizeNewsArticles } from './normalization.js';
import type { NewsProvider } from './providers.js';

/** Application-facing boundary for future News Intelligence orchestration. */
export interface NewsIntelligenceService {
  getArticles(query: NewsQuery): Promise<ReadonlyArray<NewsArticle>>;
}

/**
 * Thin provider-neutral orchestration that normalizes, validates, deduplicates,
 * and orders provider output without adding analysis or provider coupling.
 */
export class DefaultNewsIntelligenceService implements NewsIntelligenceService {
  constructor(private readonly provider: NewsProvider) {}

  async getArticles(query: NewsQuery): Promise<ReadonlyArray<NewsArticle>> {
    return normalizeNewsArticles(await this.provider.getArticles(query));
  }
}
