import type { AssetId, IsoTimestamp, MarketId, Timeframe } from './models.js';
import type { IndicatorSnapshot, MarketSnapshot } from './snapshot.js';

export enum SignalDirection {
  Bullish = 'bullish',
  Neutral = 'neutral',
  Bearish = 'bearish',
}

export enum SignalStrength {
  Weak = 'weak',
  Moderate = 'moderate',
  Strong = 'strong',
}

export enum MarketSignalType {
  PriceMovement = 'price_movement',
  VolumeAnomaly = 'volume_anomaly',
  VolatilityChange = 'volatility_change',
  LiquidityChange = 'liquidity_change',
  BullishCross = 'bullish_cross',
  BearishCross = 'bearish_cross',
}

export interface MarketSignal {
  readonly id: string;
  readonly type: MarketSignalType;
  readonly direction: SignalDirection;
  readonly strength: SignalStrength;
  readonly assetId: AssetId;
  readonly marketId?: MarketId;
  readonly timeframe?: Timeframe;
  readonly detectedAt: IsoTimestamp;
  readonly summary: string;
  readonly confidence?: number;
  readonly evidence: ReadonlyArray<string>;
}

/** A read-only, time-bound view of the market data available to downstream consumers. */
export interface MarketContext {
  readonly asOf: IsoTimestamp;
  readonly assets: ReadonlyArray<AssetId>;
  readonly snapshots: ReadonlyArray<MarketSnapshot>;
  readonly indicators: ReadonlyArray<IndicatorSnapshot>;
  readonly signals: ReadonlyArray<MarketSignal>;
}
