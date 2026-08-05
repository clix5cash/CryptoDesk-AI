import type {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import type { IsoTimestamp } from '@cryptodesk-ai/market-intelligence';
import type { MorningMeetingEvidenceReference } from './contracts.js';
import type { MorningMeetingNewsBriefItemId, MorningMeetingNewsPriority } from './news-brief.js';

/** Provider-neutral, immutable factual input for a future news presentation adapter. */
export interface MorningMeetingNewsNarrationInput {
  readonly items: ReadonlyArray<MorningMeetingNewsNarrationInputItem>;
}

/** One selected briefing item with only existing structured facts and provenance. */
export interface MorningMeetingNewsNarrationInputItem {
  readonly briefItemId: MorningMeetingNewsBriefItemId;
  readonly targetKind: NewsImpactTargetKind;
  readonly targetId: string;
  readonly priority?: MorningMeetingNewsPriority;
  readonly direction?: NewsImpactDirection;
  readonly impactTypes: ReadonlyArray<NewsImpactType>;
  readonly articleIds: ReadonlyArray<string>;
  readonly eventGroupIds: ReadonlyArray<string>;
  readonly sourceIds: ReadonlyArray<string>;
  readonly sourceRecordIds: ReadonlyArray<string>;
  readonly firstPublishedAt?: IsoTimestamp;
  readonly lastPublishedAt?: IsoTimestamp;
  readonly evidence: ReadonlyArray<MorningMeetingEvidenceReference>;
}

/** Untrusted presentation text for one known narration-input item. */
export interface MorningMeetingNewsNarrationItem {
  readonly briefItemId: MorningMeetingNewsBriefItemId;
  readonly targetKind: NewsImpactTargetKind;
  readonly targetId: string;
  readonly text: string;
  /** Must preserve, rather than extend or modify, the matching input provenance. */
  readonly evidence: ReadonlyArray<MorningMeetingEvidenceReference>;
}

/** Presentation-only output. It cannot carry analytical state or market recommendations. */
export interface MorningMeetingNewsNarration {
  readonly items: ReadonlyArray<MorningMeetingNewsNarrationItem>;
}

/** Provider-neutral future adapter boundary; no implementation is supplied by Morning Meeting. */
export interface MorningMeetingNewsNarrator {
  narrate(input: MorningMeetingNewsNarrationInput): Promise<MorningMeetingNewsNarration>;
}
