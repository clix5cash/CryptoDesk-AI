import type {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import type { IsoTimestamp } from '@cryptodesk-ai/market-intelligence';
import type { MorningMeetingEvidenceReference } from './contracts.js';

export type MorningMeetingNewsBriefItemId = string;

/** Structured provenance retained for one Morning Meeting news brief item. */
export interface MorningMeetingNewsBriefEvidence {
  readonly references: ReadonlyArray<MorningMeetingEvidenceReference>;
}

/** One deterministic, presentation-ready item derived from existing news evidence. */
export interface MorningMeetingNewsBriefItem {
  readonly id: MorningMeetingNewsBriefItemId;
  readonly targetKind: NewsImpactTargetKind;
  readonly targetId: string;
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
