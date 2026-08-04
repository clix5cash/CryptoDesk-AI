import type { AssetId, MarketId } from '@cryptodesk-ai/market-intelligence';
import type { NewsArticleId } from './models.js';

export enum NewsCategory {
  Market = 'market',
  Protocol = 'protocol',
  Token = 'token',
  Exchange = 'exchange',
  Regulation = 'regulation',
  Security = 'security',
  Governance = 'governance',
  Defi = 'defi',
  Infrastructure = 'infrastructure',
  Funding = 'funding',
  Listing = 'listing',
  Partnership = 'partnership',
}

export enum NewsEventType {
  TokenListing = 'token_listing',
  TokenDelisting = 'token_delisting',
  GovernanceVote = 'governance_vote',
  SecurityIncident = 'security_incident',
  ProtocolUpgrade = 'protocol_upgrade',
  FundingAnnouncement = 'funding_announcement',
  RegulatoryAction = 'regulatory_action',
}

/** Deterministic quality of an explicit article association or configured rule match. */
export enum NewsClassificationStrength {
  Explicit = 'explicit',
  Strong = 'strong',
}

export enum NewsClassificationField {
  AssetIds = 'asset_ids',
  MarketIds = 'market_ids',
  Title = 'title',
  Excerpt = 'excerpt',
  TopicIds = 'topic_ids',
}

/** Short, machine-readable provenance for a deterministic classification result. */
export interface NewsClassificationEvidence {
  readonly ruleId?: string;
  readonly field: NewsClassificationField;
  readonly matchedValue: string;
}

export interface NewsAssetRelevance {
  readonly assetId: AssetId;
  readonly strength: NewsClassificationStrength;
  readonly evidence: ReadonlyArray<NewsClassificationEvidence>;
}

export interface NewsMarketRelevance {
  readonly marketId: MarketId;
  readonly strength: NewsClassificationStrength.Explicit;
  readonly evidence: ReadonlyArray<NewsClassificationEvidence>;
}

export interface NewsCategoryClassification {
  readonly category: NewsCategory;
  readonly strength: NewsClassificationStrength.Strong;
  readonly evidence: ReadonlyArray<NewsClassificationEvidence>;
}

export interface NewsEventClassification {
  readonly type: NewsEventType;
  readonly strength: NewsClassificationStrength.Strong;
  readonly evidence: ReadonlyArray<NewsClassificationEvidence>;
}

/** Provider-neutral deterministic enrichment associated with one normalized article. */
export interface NewsClassification {
  readonly articleId: NewsArticleId;
  readonly assets: ReadonlyArray<NewsAssetRelevance>;
  readonly markets: ReadonlyArray<NewsMarketRelevance>;
  readonly categories: ReadonlyArray<NewsCategoryClassification>;
  readonly events: ReadonlyArray<NewsEventClassification>;
}

/** Explicit vocabulary for matching known normalized asset aliases. */
export interface NewsAssetVocabularyEntry {
  readonly assetId: AssetId;
  readonly symbols?: ReadonlyArray<string>;
  readonly aliases?: ReadonlyArray<string>;
}

/** Supported normalized article fields for a deterministic category/event rule. */
export type NewsClassificationRuleField =
  | NewsClassificationField.Title
  | NewsClassificationField.Excerpt
  | NewsClassificationField.TopicIds;

/** A configured exact token/phrase or topic-ID rule; no provider-specific semantics are allowed. */
export interface NewsClassificationRule {
  readonly id: string;
  readonly category: NewsCategory;
  readonly event?: NewsEventType;
  readonly field: NewsClassificationRuleField;
  readonly matches: ReadonlyArray<string>;
}

/** Immutable, injected vocabulary and rule set used by NewsClassifier. */
export interface NewsClassifierConfiguration {
  readonly assets?: ReadonlyArray<NewsAssetVocabularyEntry>;
  readonly rules?: ReadonlyArray<NewsClassificationRule>;
}
