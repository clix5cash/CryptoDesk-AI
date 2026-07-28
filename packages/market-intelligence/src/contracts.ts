export type AssetId = string;
export type MarketId = string;
export type IsoTimestamp = string;

export enum AssetKind {
  Cryptocurrency = 'cryptocurrency',
  Stablecoin = 'stablecoin',
  Derivative = 'derivative',
  Index = 'index',
}

export enum CandleInterval {
  OneMinute = '1m',
  FiveMinutes = '5m',
  FifteenMinutes = '15m',
  OneHour = '1h',
  FourHours = '4h',
  OneDay = '1d',
}

export enum MarketSignalType {
  PriceMovement = 'price_movement',
  VolumeAnomaly = 'volume_anomaly',
  VolatilityChange = 'volatility_change',
  LiquidityChange = 'liquidity_change',
}

export interface Asset {
  readonly id: AssetId;
  readonly symbol: string;
  readonly name: string;
  readonly kind: AssetKind;
}

export interface MarketQuote {
  readonly marketId: MarketId;
  readonly baseAssetId: AssetId;
  readonly quoteAssetId: AssetId;
  readonly price: number;
  readonly observedAt: IsoTimestamp;
}

export interface MarketCandle {
  readonly marketId: MarketId;
  readonly interval: CandleInterval;
  readonly openedAt: IsoTimestamp;
  readonly closedAt: IsoTimestamp;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface MarketSignal {
  readonly id: string;
  readonly type: MarketSignalType;
  readonly assetId: AssetId;
  readonly detectedAt: IsoTimestamp;
  readonly summary: string;
  readonly confidence?: number;
  readonly evidence: ReadonlyArray<string>;
}

export interface MarketQuery {
  readonly assetIds?: ReadonlyArray<AssetId>;
  readonly marketIds?: ReadonlyArray<MarketId>;
  readonly asOf?: IsoTimestamp;
}

/** Provider-neutral boundary for normalized market data. */
export interface MarketDataProvider {
  getQuotes(query: MarketQuery): Promise<ReadonlyArray<MarketQuote>>;
  getCandles(marketId: MarketId, interval: CandleInterval): Promise<ReadonlyArray<MarketCandle>>;
}
