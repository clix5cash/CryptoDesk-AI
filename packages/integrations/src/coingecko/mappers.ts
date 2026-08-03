import type { MarketSnapshot, Timeframe } from '@cryptodesk-ai/market-intelligence';
import type { CoinGeckoMarketDefinition, CoinGeckoMarketResponse } from './types.js';

export class CoinGeckoMappingError extends Error {}

/** Pure conversion from a CoinGecko market payload into the CryptoDesk market snapshot model. */
export function mapCoinGeckoMarketToSnapshot(
  source: CoinGeckoMarketResponse,
  definition: CoinGeckoMarketDefinition,
  timeframe: Timeframe,
): MarketSnapshot {
  if (source.id !== definition.coinId) {
    throw new CoinGeckoMappingError(
      `CoinGecko response "${source.id}" does not match configured coin "${definition.coinId}".`,
    );
  }

  return {
    marketId: definition.marketId,
    baseAssetId: definition.baseAssetId,
    quoteAssetId: definition.quoteAssetId,
    timeframe,
    capturedAt: requireTimestamp(source.last_updated, source.id),
    lastPrice: requireNumber(source.current_price, 'current_price', source.id),
    high: requireNumber(source.high_24h, 'high_24h', source.id),
    low: requireNumber(source.low_24h, 'low_24h', source.id),
    volume: requireNumber(source.total_volume, 'total_volume', source.id),
    ...(source.price_change_percentage_24h === null
      ? {}
      : {
          priceChangePercent: requireNumber(
            source.price_change_percentage_24h,
            'price_change_percentage_24h',
            source.id,
          ),
        }),
  };
}

function requireNumber(value: number | null, field: string, coinId: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new CoinGeckoMappingError(
      `CoinGecko field "${field}" is missing or invalid for coin "${coinId}".`,
    );
  }

  return value;
}

function requireTimestamp(value: string | null, coinId: string): string {
  if (value === null || Number.isNaN(Date.parse(value))) {
    throw new CoinGeckoMappingError(
      `CoinGecko field "last_updated" is invalid for coin "${coinId}".`,
    );
  }

  return value;
}
