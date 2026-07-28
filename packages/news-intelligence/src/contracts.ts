export type NewsArticleId = string;
export type NewsSourceId = string;
export type IsoTimestamp = string;

export enum NewsSentiment {
  Positive = 'positive',
  Neutral = 'neutral',
  Negative = 'negative',
  Mixed = 'mixed',
}

export enum NewsEntityKind {
  Asset = 'asset',
  Protocol = 'protocol',
  Organization = 'organization',
  Person = 'person',
  Chain = 'chain',
}

export interface NewsSource {
  readonly id: NewsSourceId;
  readonly name: string;
  readonly homepageUrl?: string;
  readonly reliabilityScore?: number;
}

export interface NewsEntity {
  readonly kind: NewsEntityKind;
  readonly name: string;
  readonly externalId?: string;
}

export interface NewsArticle {
  readonly id: NewsArticleId;
  readonly source: NewsSource;
  readonly title: string;
  readonly url: string;
  readonly summary?: string;
  readonly publishedAt: IsoTimestamp;
  readonly ingestedAt: IsoTimestamp;
  readonly entities: ReadonlyArray<NewsEntity>;
  readonly sentiment?: NewsSentiment;
}

export interface NewsSearchQuery {
  readonly text?: string;
  readonly entityNames?: ReadonlyArray<string>;
  readonly sourceIds?: ReadonlyArray<NewsSourceId>;
  readonly publishedAfter?: IsoTimestamp;
  readonly publishedBefore?: IsoTimestamp;
  readonly limit?: number;
}

export interface NewsSearchResult {
  readonly article: NewsArticle;
  readonly relevanceScore: number;
  readonly matchedExcerpt?: string;
}

/** Provider-neutral boundary for normalized news discovery. */
export interface NewsSearchProvider {
  search(query: NewsSearchQuery): Promise<ReadonlyArray<NewsSearchResult>>;
}
