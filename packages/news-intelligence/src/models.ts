import type { AssetId, IsoTimestamp, MarketId } from '@cryptodesk-ai/market-intelligence';

export type NewsArticleId = string;
export type NewsSourceId = string;
export type NewsSourceRecordId = string;
export type NewsTopicId = string;

export enum NewsSourceType {
  Publication = 'publication',
  Exchange = 'exchange',
  Protocol = 'protocol',
  Governance = 'governance',
  Research = 'research',
  Social = 'social',
  Regulatory = 'regulatory',
  OnChain = 'on_chain',
  System = 'system',
}

/** Provider-neutral identity and descriptive metadata for a news source. */
export interface NewsSource {
  readonly id: NewsSourceId;
  readonly name: string;
  readonly type: NewsSourceType;
  readonly homepageUrl?: string;
}

/** A source-supplied or otherwise normalized topic association. */
export interface NewsTopic {
  readonly id: NewsTopicId;
  readonly label: string;
}

/**
 * Normalized provider-neutral news record. Text fields, when available, are
 * source content only and do not represent generated summaries or analysis.
 */
export interface NewsArticle {
  readonly id: NewsArticleId;
  readonly sourceId: NewsSourceId;
  readonly sourceRecordId?: NewsSourceRecordId;
  readonly title: string;
  readonly canonicalUrl?: string;
  readonly authors?: ReadonlyArray<string>;
  readonly excerpt?: string;
  readonly content?: string;
  readonly language?: string;
  readonly publishedAt: IsoTimestamp;
  readonly observedAt: IsoTimestamp;
  readonly assetIds?: ReadonlyArray<AssetId>;
  readonly marketIds?: ReadonlyArray<MarketId>;
  readonly topicIds?: ReadonlyArray<NewsTopicId>;
}

/** Provider-neutral retrieval filters for normalized news articles. */
export interface NewsQuery {
  readonly assetIds?: ReadonlyArray<AssetId>;
  readonly marketIds?: ReadonlyArray<MarketId>;
  readonly topicIds?: ReadonlyArray<NewsTopicId>;
  readonly sourceIds?: ReadonlyArray<NewsSourceId>;
  readonly from?: IsoTimestamp;
  readonly to?: IsoTimestamp;
  readonly limit?: number;
}
