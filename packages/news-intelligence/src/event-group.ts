import type { AssetId, IsoTimestamp, MarketId } from '@cryptodesk-ai/market-intelligence';
import type { NewsClassificationEvidence, NewsEventType } from './classification.js';
import type { NewsImpact, NewsImpactTarget } from './impact.js';
import type { NewsArticleId, NewsSourceId, NewsSourceRecordId, NewsTopicId } from './models.js';

export type NewsEventGroupId = string;

/** Provenance for one grouped article's explicit event classification. */
export interface NewsEventGroupEvidence {
  readonly articleId: NewsArticleId;
  readonly sourceId: NewsSourceId;
  readonly sourceRecordId?: NewsSourceRecordId;
  readonly eventEvidence: ReadonlyArray<NewsClassificationEvidence>;
}

/**
 * A deterministic, provenance-preserving collection of articles about one
 * explicit event occurrence. It contains no generated narrative or ranking.
 */
export interface NewsEventGroup {
  readonly id: NewsEventGroupId;
  readonly eventType: NewsEventType;
  /** Explicit identity target used for conservative grouping. */
  readonly target?: NewsImpactTarget;
  readonly articleIds: ReadonlyArray<NewsArticleId>;
  readonly sourceIds: ReadonlyArray<NewsSourceId>;
  readonly assetIds: ReadonlyArray<AssetId>;
  readonly marketIds: ReadonlyArray<MarketId>;
  readonly topicIds: ReadonlyArray<NewsTopicId>;
  /** Existing per-article impacts associated by member article and target. */
  readonly impacts: ReadonlyArray<NewsImpact>;
  readonly firstPublishedAt: IsoTimestamp;
  readonly lastPublishedAt: IsoTimestamp;
  readonly evidence: ReadonlyArray<NewsEventGroupEvidence>;
}

/** Explicit, injected maximum publication-time distance for one event occurrence. */
export interface NewsEventGrouperConfiguration {
  readonly timeWindowHours?: number;
}
