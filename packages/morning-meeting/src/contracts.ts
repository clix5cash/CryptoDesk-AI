export type MorningMeetingId = string;
export type WorkspaceId = string;
export type IsoTimestamp = string;

export enum MorningMeetingStatus {
  Draft = 'draft',
  Generating = 'generating',
  Ready = 'ready',
  Delivered = 'delivered',
  Failed = 'failed',
}

export enum MorningMeetingSectionKind {
  MarketOverview = 'market_overview',
  NewsHighlights = 'news_highlights',
  PortfolioUpdate = 'portfolio_update',
  DefiResearch = 'defi_research',
  Risks = 'risks',
  FollowUps = 'follow_ups',
}

export interface MorningMeetingSource {
  readonly sourceId: string;
  readonly label: string;
  readonly url?: string;
}

export interface MorningMeetingSection {
  readonly kind: MorningMeetingSectionKind;
  readonly title: string;
  readonly content: string;
  readonly sources: ReadonlyArray<MorningMeetingSource>;
}

export interface MorningMeeting {
  readonly id: MorningMeetingId;
  readonly workspaceId: WorkspaceId;
  readonly status: MorningMeetingStatus;
  readonly reportingDate: string;
  readonly generatedAt?: IsoTimestamp;
  readonly sections: ReadonlyArray<MorningMeetingSection>;
}

export interface MorningMeetingRequest {
  readonly workspaceId: WorkspaceId;
  readonly reportingDate: string;
  readonly requestedBy?: string;
}

/** Boundary for generating a persisted morning meeting artifact. */
export interface MorningMeetingGenerator {
  generate(request: MorningMeetingRequest): Promise<MorningMeeting>;
}
