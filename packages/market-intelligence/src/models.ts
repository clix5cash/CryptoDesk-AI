export type AssetId = string;
export type MarketId = string;
export type IsoTimestamp = string;

export enum AssetKind {
  Cryptocurrency = 'cryptocurrency',
  Stablecoin = 'stablecoin',
  Derivative = 'derivative',
  Index = 'index',
}

export enum Timeframe {
  OneMinute = '1m',
  FiveMinutes = '5m',
  FifteenMinutes = '15m',
  OneHour = '1h',
  FourHours = '4h',
  OneDay = '1d',
}

/** Backwards-compatible name for the time interval of a market candle. */
export { Timeframe as CandleInterval };

export interface Asset {
  readonly id: AssetId;
  readonly symbol: string;
  readonly name: string;
  readonly kind: AssetKind;
  readonly chainIds?: ReadonlyArray<string>;
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
  readonly interval: Timeframe;
  readonly openedAt: IsoTimestamp;
  readonly closedAt: IsoTimestamp;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface MarketQuery {
  readonly assetIds?: ReadonlyArray<AssetId>;
  readonly marketIds?: ReadonlyArray<MarketId>;
  readonly asOf?: IsoTimestamp;
}
