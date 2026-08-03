import type {
  AssetId,
  IndicatorSnapshot,
  IsoTimestamp,
  MarketId,
  MarketSignal,
  MarketSnapshot,
  Timeframe,
} from '@cryptodesk-ai/market-intelligence';

/** Stable identifier for one generated Morning Meeting report. */
export type MorningMeetingId = string;

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
  Risk = 'risk',
}

export enum MorningMeetingEvidenceKind {
  MarketSnapshot = 'market_snapshot',
  IndicatorSnapshot = 'indicator_snapshot',
  MarketSignal = 'market_signal',
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
  readonly indicator?: string;
  readonly signalId?: string;
}

/** Input selecting the deterministic market intelligence for a meeting. */
export interface MorningMeetingRequest {
  readonly assetIds?: ReadonlyArray<AssetId>;
  readonly marketIds?: ReadonlyArray<MarketId>;
  readonly timeframe: Timeframe;
  readonly asOf?: IsoTimestamp;
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
}

/** Application-facing boundary for future Morning Meeting orchestration. */
export interface MorningMeetingService {
  generate(request: MorningMeetingRequest): Promise<MorningMeetingReport>;
}
