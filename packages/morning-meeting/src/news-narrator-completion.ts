import type { MorningMeetingNewsNarrationInputItem } from './news-narration.js';

/** Deterministic, provider-neutral completion request for canonical narration facts. */
export interface MorningMeetingNewsNarrationCompletionRequest {
  readonly items: ReadonlyArray<MorningMeetingNewsNarrationInputItem>;
}

/** Untrusted provider response for one canonical narration item. */
export interface MorningMeetingNewsNarrationCompletionResponseItem {
  /** Must reference an existing canonical briefing item; it is never provider-authoritative. */
  readonly briefItemId: string;
  readonly text: string;
  /** Optional claims are checked against canonical input and never used as source of truth. */
  readonly targetKind?: MorningMeetingNewsNarrationInputItem['targetKind'];
  readonly targetId?: string;
  readonly evidence?: MorningMeetingNewsNarrationInputItem['evidence'];
  /** Provider-local metadata is intentionally ignored by Morning Meeting. */
  readonly providerGeneratedId?: string;
}

/** Untrusted structured completion output. */
export interface MorningMeetingNewsNarrationCompletionResponse {
  readonly items: ReadonlyArray<MorningMeetingNewsNarrationCompletionResponseItem>;
}

/** Injected transport/model boundary. Concrete SDKs and network concerns remain outside this package. */
export interface MorningMeetingNewsNarrationCompletionClient {
  complete(
    request: MorningMeetingNewsNarrationCompletionRequest,
  ): Promise<MorningMeetingNewsNarrationCompletionResponse>;
}
