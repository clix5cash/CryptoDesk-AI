import type { AssetId, IsoTimestamp, MarketId, Timeframe } from './models.js';

export interface MarketSnapshot {
  readonly marketId: MarketId;
  readonly baseAssetId: AssetId;
  readonly quoteAssetId: AssetId;
  readonly timeframe: Timeframe;
  readonly capturedAt: IsoTimestamp;
  readonly lastPrice: number;
  readonly high: number;
  readonly low: number;
  readonly volume: number;
  readonly priceChangePercent?: number;
  readonly liquidity?: number;
}

/** A normalized, provider-neutral indicator result. */
export interface IndicatorSnapshot {
  readonly indicator: string;
  readonly marketId: MarketId;
  readonly timeframe: Timeframe;
  readonly observedAt: IsoTimestamp;
  readonly values: Readonly<Record<string, number>>;
}
