import type { NewsArticle, NewsQuery } from './models.js';

/** Provider-neutral boundary for retrieving normalized news articles. */
export interface NewsProvider {
  getArticles(query: NewsQuery): Promise<ReadonlyArray<NewsArticle>>;
}
