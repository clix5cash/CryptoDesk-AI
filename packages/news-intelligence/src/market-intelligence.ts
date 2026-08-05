import type { IsoTimestamp } from '@cryptodesk-ai/market-intelligence';
import type { NewsEventGroupId } from './event-group.js';
import type {
  NewsImpact,
  NewsImpactDirection,
  NewsImpactStrength,
  NewsImpactTarget,
  NewsImpactType,
} from './impact.js';
import type { NewsArticleId, NewsSourceId } from './models.js';

export enum NewsMarketIntelligenceEvidenceKind {
  Impact = 'impact',
  EventGroup = 'event_group',
}

/** Machine-readable reference to deterministic source intelligence in a target view. */
export interface NewsMarketIntelligenceEvidence {
  readonly kind: NewsMarketIntelligenceEvidenceKind;
  readonly articleIds: ReadonlyArray<NewsArticleId>;
  readonly sourceIds: ReadonlyArray<NewsSourceId>;
  readonly eventGroupId?: NewsEventGroupId;
  readonly impactType?: NewsImpactType;
  readonly direction?: NewsImpactDirection;
  readonly strength?: NewsImpactStrength;
}

/**
 * Provider-neutral deterministic answer to: what existing news intelligence
 * relates to this explicit asset, market, or topic target?
 */
export interface NewsMarketIntelligenceView {
  readonly target: NewsImpactTarget;
  readonly articleIds: ReadonlyArray<NewsArticleId>;
  readonly eventGroupIds: ReadonlyArray<NewsEventGroupId>;
  readonly impacts: ReadonlyArray<NewsImpact>;
  readonly sourceIds: ReadonlyArray<NewsSourceId>;
  readonly sourceCount: number;
  /** Conservative summary of existing impact directions; undefined when no impact exists. */
  readonly direction?: NewsImpactDirection;
  readonly firstPublishedAt?: IsoTimestamp;
  readonly lastPublishedAt?: IsoTimestamp;
  readonly evidence: ReadonlyArray<NewsMarketIntelligenceEvidence>;
}
