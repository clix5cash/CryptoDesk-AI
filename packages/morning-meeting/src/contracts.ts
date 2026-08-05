import type {
  AssetId,
  IndicatorSnapshot,
  IsoTimestamp,
  MarketId,
  MarketSignal,
  MarketSnapshot,
  Timeframe,
} from '@cryptodesk-ai/market-intelligence';
import type {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
  NewsMarketIntelligenceView,
} from '@cryptodesk-ai/news-intelligence';
import type { MorningMeetingNewsBrief, MorningMeetingNewsSelectionPolicy } from './news-brief.js';

/** Stable identifier for one generated Morning Meeting report. */
export type MorningMeetingId = string;

/** Opaque provider-neutral identifier for a source record supporting evidence. */
export type SourceRecordId = string;

export enum MorningMeetingBias {
  Bullish = 'bullish',
  Neutral = 'neutral',
  Bearish = 'bearish',
}

export enum MorningMeetingRiskLevel {
  Low = 'low',
  Moderate = 'moderate',
  High = 'high',
}

export enum MorningMeetingSectionKind {
  MarketOverview = 'market_overview',
  Trend = 'trend',
  Momentum = 'momentum',
  Volatility = 'volatility',
  Volume = 'volume',
  Signals = 'signals',
  News = 'news',
  Risk = 'risk',
}

export enum MorningMeetingEvidenceKind {
  MarketSnapshot = 'market_snapshot',
  IndicatorSnapshot = 'indicator_snapshot',
  MarketSignal = 'market_signal',
  NewsMarketIntelligence = 'news_market_intelligence',
}

/**
 * A traceable reference to deterministic Market Intelligence used in a report
 * or section. The referenced records remain provider-neutral domain models.
 */
export interface MorningMeetingEvidenceReference {
  readonly kind: MorningMeetingEvidenceKind;
  readonly assetId: AssetId;
  readonly marketId: MarketId;
  readonly observedAt: IsoTimestamp;
  /** Optional for compatibility with source records that do not expose an opaque stable ID. */
  readonly sourceRecordId?: SourceRecordId;
  readonly indicator?: string;
  readonly signalId?: string;
  /** Provider-neutral News Intelligence provenance when news context is supplied. */
  readonly newsTargetKind?: NewsImpactTargetKind;
  readonly newsTargetId?: string;
  readonly newsDirection?: NewsImpactDirection;
  readonly newsImpactTypes?: ReadonlyArray<NewsImpactType>;
  readonly newsFirstPublishedAt?: IsoTimestamp;
  readonly newsLastPublishedAt?: IsoTimestamp;
  readonly newsArticleIds?: ReadonlyArray<string>;
  readonly newsEventGroupIds?: ReadonlyArray<string>;
  readonly newsSourceIds?: ReadonlyArray<string>;
  readonly newsSourceRecordIds?: ReadonlyArray<SourceRecordId>;
}

/** Input selecting the deterministic market intelligence for a meeting. */
export interface MorningMeetingRequest {
  readonly assetIds?: ReadonlyArray<AssetId>;
  readonly marketIds?: ReadonlyArray<MarketId>;
  readonly timeframe: Timeframe;
  readonly asOf?: IsoTimestamp;
  /** Already-produced provider-neutral News Intelligence; Morning Meeting never retrieves it. */
  readonly newsMarketIntelligenceViews?: ReadonlyArray<NewsMarketIntelligenceView>;
  /** Explicit optional budget and qualitative ordering for an already-assembled news brief. */
  readonly newsBriefSelectionPolicy?: MorningMeetingNewsSelectionPolicy;
}

/** Deterministic analytical state for a single market at the meeting boundary. */
export interface MorningMeetingMarketView {
  readonly assetId: AssetId;
  readonly marketId: MarketId;
  readonly timeframe: Timeframe;
  readonly latestSnapshot: MarketSnapshot;
  readonly indicators: ReadonlyArray<IndicatorSnapshot>;
  readonly signals: ReadonlyArray<MarketSignal>;
  readonly bias: MorningMeetingBias;
  readonly riskLevel: MorningMeetingRiskLevel;
  readonly evidence: ReadonlyArray<MorningMeetingEvidenceReference>;
}

/**
 * A structured grouping of deterministic evidence. Presentation and prose are
 * deliberately left to downstream consumers such as a future narrator.
 */
export interface MorningMeetingSection {
  readonly id: string;
  readonly kind: MorningMeetingSectionKind;
  readonly marketIds: ReadonlyArray<MarketId>;
  readonly evidence: ReadonlyArray<MorningMeetingEvidenceReference>;
}

/**
 * Provider-neutral, deterministic Morning Meeting output. It is intentionally
 * structured so a future AI narration layer can consume it without becoming
 * the source of market facts.
 */
export interface MorningMeetingReport {
  readonly id: MorningMeetingId;
  readonly generatedAt: IsoTimestamp;
  readonly asOf: IsoTimestamp;
  readonly timeframe: Timeframe;
  readonly marketViews: ReadonlyArray<MorningMeetingMarketView>;
  readonly sections: ReadonlyArray<MorningMeetingSection>;
  /** Present only when request-scoped News Intelligence input was explicitly supplied. */
  readonly newsBrief?: MorningMeetingNewsBrief;
}

/** Application-facing boundary for future Morning Meeting orchestration. */
export interface MorningMeetingService {
  generate(request: MorningMeetingRequest): Promise<MorningMeetingReport>;
}
