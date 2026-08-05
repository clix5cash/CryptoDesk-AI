import type { AssetId, MarketId } from '@cryptodesk-ai/market-intelligence';
import type { NewsCategory, NewsClassificationEvidence, NewsEventType } from './classification.js';
import type { NewsArticleId, NewsSourceRecordId, NewsTopicId } from './models.js';

export enum NewsImpactType {
  Liquidity = 'liquidity',
  Listing = 'listing',
  Delisting = 'delisting',
  Security = 'security',
  Governance = 'governance',
  Regulatory = 'regulatory',
  ProtocolUpgrade = 'protocol_upgrade',
  Funding = 'funding',
  Partnership = 'partnership',
  Tokenomics = 'tokenomics',
  Infrastructure = 'infrastructure',
  Macro = 'macro',
}

/**
 * A conservative deterministic interpretation of an explicitly classified
 * event mechanism. This is not sentiment or a price/trading prediction.
 */
export enum NewsImpactDirection {
  Positive = 'positive',
  Neutral = 'neutral',
  Negative = 'negative',
  Mixed = 'mixed',
  Unknown = 'unknown',
}

/** Qualitative, rule-based evidence quality; never a probability. */
export enum NewsImpactStrength {
  Explicit = 'explicit',
  Strong = 'strong',
  Moderate = 'moderate',
  Weak = 'weak',
}

export enum NewsImpactTargetKind {
  Asset = 'asset',
  Market = 'market',
  Topic = 'topic',
}

export interface NewsAssetImpactTarget {
  readonly kind: NewsImpactTargetKind.Asset;
  readonly assetId: AssetId;
}

export interface NewsMarketImpactTarget {
  readonly kind: NewsImpactTargetKind.Market;
  readonly marketId: MarketId;
}

export interface NewsTopicImpactTarget {
  readonly kind: NewsImpactTargetKind.Topic;
  readonly topicId: NewsTopicId;
}

/** A deterministic impact target derived from existing article/classification associations. */
export type NewsImpactTarget =
  NewsAssetImpactTarget | NewsMarketImpactTarget | NewsTopicImpactTarget;

/** Machine-readable trigger and target provenance for one derived impact. */
export interface NewsImpactEvidence {
  readonly articleId: NewsArticleId;
  readonly sourceRecordId?: NewsSourceRecordId;
  readonly ruleId: string;
  readonly triggerEvidence: ReadonlyArray<NewsClassificationEvidence>;
  readonly targetEvidence: ReadonlyArray<NewsClassificationEvidence>;
}

/**
 * A provider-neutral deterministic impact enrichment. It describes an explicit
 * mechanism and target, not a forecast, recommendation, or sentiment score.
 */
export interface NewsImpact {
  readonly articleId: NewsArticleId;
  readonly type: NewsImpactType;
  readonly direction: NewsImpactDirection;
  readonly strength: NewsImpactStrength;
  readonly target: NewsImpactTarget;
  readonly evidence: ReadonlyArray<NewsImpactEvidence>;
}

/**
 * A configured rule matching existing deterministic event/category results.
 * When both selectors are supplied, both must match. The target must already
 * be available through the article or its existing classification.
 */
export interface NewsImpactRule {
  readonly id: string;
  readonly event?: NewsEventType;
  readonly category?: NewsCategory;
  readonly type: NewsImpactType;
  readonly direction?: NewsImpactDirection;
  readonly strength: NewsImpactStrength;
  readonly targetKind: NewsImpactTargetKind;
}

/** Immutable, explicitly injected configuration for NewsImpactAnalyzer. */
export interface NewsImpactAnalyzerConfiguration {
  readonly rules?: ReadonlyArray<NewsImpactRule>;
}
