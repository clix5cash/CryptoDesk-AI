import type { NewsArticle, NewsQuery } from './models.js';

/** Application-facing boundary for future News Intelligence orchestration. */
export interface NewsIntelligenceService {
  getArticles(query: NewsQuery): Promise<ReadonlyArray<NewsArticle>>;
}
