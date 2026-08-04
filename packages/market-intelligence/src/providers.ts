import type { MarketContext } from './signals.js';
import type {
  IsoTimestamp,
  MarketCandle,
  MarketId,
  MarketQuery,
  MarketQuote,
  Timeframe,
} from './models.js';
import type { MarketSnapshot } from './snapshot.js';

export interface MarketSnapshotQuery extends MarketQuery {
  readonly timeframe?: Timeframe;
}

/** Provider-neutral range query for timestamped historical market quotes. */
export interface HistoricalMarketQuoteQuery {
  readonly marketId: MarketId;
  readonly from: IsoTimestamp;
  readonly to: IsoTimestamp;
}

/** Provider-neutral boundary for historical price observations, distinct from OHLCV candles. */
export interface HistoricalMarketQuoteProvider {
  getHistoricalQuotes(query: HistoricalMarketQuoteQuery): Promise<ReadonlyArray<MarketQuote>>;
}

/** Provider-neutral boundary for normalized market prices and candles. */
export interface MarketDataProvider {
  getQuotes(query: MarketQuery): Promise<ReadonlyArray<MarketQuote>>;
  getCandles(marketId: MarketId, timeframe: Timeframe): Promise<ReadonlyArray<MarketCandle>>;
}

/** Provider-neutral boundary for precomputed market and indicator snapshots. */
export interface MarketSnapshotProvider {
  getSnapshots(query: MarketSnapshotQuery): Promise<ReadonlyArray<MarketSnapshot>>;
}

/** Provider-neutral boundary for a fully assembled market context. */
export interface MarketContextProvider {
  getContext(query: MarketSnapshotQuery): Promise<MarketContext>;
}
