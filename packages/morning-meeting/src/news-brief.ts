import type {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import type { IsoTimestamp } from '@cryptodesk-ai/market-intelligence';
import type { MorningMeetingEvidenceReference } from './contracts.js';

export type MorningMeetingNewsBriefItemId = string;

/** Qualitative presentation priority; it is never a confidence or relevance score. */
export enum MorningMeetingNewsPriority {
  Critical = 'critical',
  High = 'high',
  Normal = 'normal',
  Low = 'low',
}

/** Explicit rule over already-derived briefing facts. All supplied selectors must match. */
export interface MorningMeetingNewsPriorityRule {
  readonly id: string;
  readonly impactTypes?: ReadonlyArray<NewsImpactType>;
  readonly directions?: ReadonlyArray<NewsImpactDirection>;
  readonly priority: MorningMeetingNewsPriority;
}

/** Optional, request-scoped deterministic briefing budget and explicit priority rules. */
export interface MorningMeetingNewsSelectionPolicy {
  readonly rules?: ReadonlyArray<MorningMeetingNewsPriorityRule>;
  readonly maxItems?: number;
  readonly maxItemsPerTarget?: number;
  readonly minimumPriority?: MorningMeetingNewsPriority;
}

/** Structured provenance retained for one Morning Meeting news brief item. */
export interface MorningMeetingNewsBriefEvidence {
  readonly references: ReadonlyArray<MorningMeetingEvidenceReference>;
}

/** One deterministic, presentation-ready item derived from existing news evidence. */
export interface MorningMeetingNewsBriefItem {
  readonly id: MorningMeetingNewsBriefItemId;
  readonly targetKind: NewsImpactTargetKind;
  readonly targetId: string;
  /** Present only after an explicit selection policy has been applied. */
  readonly priority?: MorningMeetingNewsPriority;
  readonly direction?: NewsImpactDirection;
  readonly impactTypes: ReadonlyArray<NewsImpactType>;
  readonly articleIds: ReadonlyArray<string>;
  readonly eventGroupIds: ReadonlyArray<string>;
  readonly sourceIds: ReadonlyArray<string>;
  readonly sourceRecordIds: ReadonlyArray<string>;
  readonly firstPublishedAt?: IsoTimestamp;
  readonly lastPublishedAt?: IsoTimestamp;
  readonly evidence: MorningMeetingNewsBriefEvidence;
}

/** A provider-neutral structured briefing with no generated prose or recommendation. */
export interface MorningMeetingNewsBrief {
  readonly items: ReadonlyArray<MorningMeetingNewsBriefItem>;
}
