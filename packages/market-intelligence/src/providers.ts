import type { MarketContext } from './signals.js';
import type { MarketCandle, MarketId, MarketQuery, MarketQuote, Timeframe } from './models.js';
import type { MarketSnapshot } from './snapshot.js';

export interface MarketSnapshotQuery extends MarketQuery {
  readonly timeframe?: Timeframe;
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
