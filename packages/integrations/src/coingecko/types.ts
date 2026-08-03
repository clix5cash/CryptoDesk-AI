import type { AssetId, MarketId, Timeframe } from '@cryptodesk-ai/market-intelligence';

/** Explicit fetch boundary so callers choose the runtime HTTP implementation. */
export interface CoinGeckoFetch {
  (url: string, init: CoinGeckoRequestInit): Promise<CoinGeckoResponse>;
}

export interface CoinGeckoRequestInit {
  readonly headers?: Readonly<Record<string, string>>;
}

export interface CoinGeckoResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/** Maps a CryptoDesk market identity to its CoinGecko market representation. */
export interface CoinGeckoMarketDefinition {
  readonly coinId: string;
  readonly marketId: MarketId;
  readonly baseAssetId: AssetId;
  readonly quoteAssetId: AssetId;
  readonly quoteCurrency: string;
}

/** Explicit adapter configuration; no environment or global state is read. */
export interface CoinGeckoProviderConfig {
  readonly baseUrl: string;
  readonly fetch: CoinGeckoFetch;
  readonly defaultTimeframe: Timeframe;
  readonly markets: ReadonlyArray<CoinGeckoMarketDefinition>;
  readonly apiKey?: string;
  readonly apiKeyHeader?: string;
}

/** Local representation of the CoinGecko `/coins/markets` response fields used by this adapter. */
export interface CoinGeckoMarketResponse {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly current_price: number | null;
  readonly high_24h: number | null;
  readonly low_24h: number | null;
  readonly total_volume: number | null;
  readonly price_change_percentage_24h: number | null;
  readonly last_updated: string | null;
}
