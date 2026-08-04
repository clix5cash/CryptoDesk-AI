import type { AssetId, IsoTimestamp, MarketId } from '@cryptodesk-ai/market-intelligence';
import type { NewsCategory, NewsClassification, NewsEventType } from './classification.js';
import type { NewsArticle, NewsQuery, NewsSourceId, NewsTopicId } from './models.js';

export interface NewsCategoryCount {
  readonly category: NewsCategory;
  readonly count: number;
}

export interface NewsEventCount {
  readonly type: NewsEventType;
  readonly count: number;
}

/** Deterministic aggregate metadata directly derived from a NewsContext. */
export interface NewsContextMetadata {
  readonly articleCount: number;
  readonly sourceIds: ReadonlyArray<NewsSourceId>;
  readonly assetIds: ReadonlyArray<AssetId>;
  readonly marketIds: ReadonlyArray<MarketId>;
  readonly topicIds: ReadonlyArray<NewsTopicId>;
  readonly categoryCounts: ReadonlyArray<NewsCategoryCount>;
  readonly eventCounts: ReadonlyArray<NewsEventCount>;
}

/**
 * Provider-neutral deterministic artifact for one News Intelligence query.
 * It contains only normalized records, deterministic classifications, and
 * structured provenance metadata; it contains no narrative or analysis prose.
 */
export interface NewsContext {
  readonly query: NewsQuery;
  readonly assembledAt: IsoTimestamp;
  readonly articles: ReadonlyArray<NewsArticle>;
  readonly classifications: ReadonlyArray<NewsClassification>;
  readonly metadata: NewsContextMetadata;
}
