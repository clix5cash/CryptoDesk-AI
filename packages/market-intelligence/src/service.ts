import type { AssetId, IsoTimestamp, MarketId, Timeframe } from './models.js';
import type { MarketContext, MarketSignal } from './signals.js';

export interface MarketContextRequest {
  readonly assetIds?: ReadonlyArray<AssetId>;
  readonly marketIds?: ReadonlyArray<MarketId>;
  readonly timeframe?: Timeframe;
  readonly asOf?: IsoTimestamp;
}

export interface MarketSignalQuery {
  readonly assetIds?: ReadonlyArray<AssetId>;
  readonly marketIds?: ReadonlyArray<MarketId>;
  readonly timeframe?: Timeframe;
  readonly detectedAfter?: IsoTimestamp;
}

/** Application-facing boundary for Market Intelligence orchestration. */
export interface MarketIntelligenceService {
  getContext(request: MarketContextRequest): Promise<MarketContext>;
  getSignals(query: MarketSignalQuery): Promise<ReadonlyArray<MarketSignal>>;
}
