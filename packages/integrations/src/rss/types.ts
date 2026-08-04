import type { AssetId, IsoTimestamp, MarketId } from '@cryptodesk-ai/market-intelligence';
import type { NewsSource, NewsTopicId } from '@cryptodesk-ai/news-intelligence';

/** Explicit HTTP boundary for RSS/Atom feed retrieval. */
export interface RssNewsFetch {
  (url: string, init: RssNewsRequestInit): Promise<RssNewsResponse>;
}

export interface RssNewsRequestInit {
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RssNewsResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/** Parsed RSS/Atom document shape required by this adapter; XML details remain behind NewsFeedParser. */
export interface NewsFeedDocument {
  readonly title?: string;
  readonly language?: string;
  readonly items: ReadonlyArray<NewsFeedItem>;
}

/** RSS/Atom-local intermediate item. It must not enter News Intelligence contracts. */
export interface NewsFeedItem {
  readonly id?: string;
  readonly guid?: string;
  readonly title?: string;
  readonly link?: string;
  readonly publishedAt?: string;
  readonly updatedAt?: string;
  readonly authors?: ReadonlyArray<NewsFeedAuthor>;
  readonly excerpt?: string;
  readonly content?: string;
  readonly categories?: ReadonlyArray<string>;
  readonly language?: string;
}

export interface NewsFeedAuthor {
  readonly name?: string;
}

/** Parser boundary: implementations handle XML/RSS/Atom details outside the provider adapter. */
export interface NewsFeedParser {
  parse(input: string): NewsFeedDocument;
}

/** Explicit mapping from one external feed to a normalized News Intelligence source. */
export interface RssFeedDefinition {
  readonly url: string;
  readonly source: NewsSource;
  readonly defaultLanguage?: string;
  readonly defaultAssetIds?: ReadonlyArray<AssetId>;
  readonly defaultMarketIds?: ReadonlyArray<MarketId>;
  readonly defaultTopicIds?: ReadonlyArray<NewsTopicId>;
}

/** Explicit adapter configuration; no environment variables or global registry are consulted. */
export interface RssNewsProviderConfig {
  readonly feeds: ReadonlyArray<RssFeedDefinition>;
  readonly fetch: RssNewsFetch;
  readonly parser: NewsFeedParser;
  readonly clock: RssNewsClock;
}

/** Explicit time boundary for observed/ingested timestamps. */
export interface RssNewsClock {
  now(): IsoTimestamp;
}
