import type {
  MarketSnapshot,
  MarketSnapshotProvider,
  MarketSnapshotQuery,
} from '@cryptodesk-ai/market-intelligence';
import { mapCoinGeckoMarketToSnapshot } from './mappers.js';
import type {
  CoinGeckoMarketDefinition,
  CoinGeckoMarketResponse,
  CoinGeckoProviderConfig,
} from './types.js';

export class CoinGeckoProviderError extends Error {}

/**
 * CoinGecko adapter for the provider-neutral MarketSnapshotProvider contract.
 * It is instantiated explicitly and never self-registers.
 */
export class CoinGeckoMarketSnapshotProvider implements MarketSnapshotProvider {
  constructor(private readonly config: CoinGeckoProviderConfig) {
    if (!config.baseUrl) {
      throw new CoinGeckoProviderError('CoinGecko base URL is required.');
    }
  }

  async getSnapshots(query: MarketSnapshotQuery): Promise<ReadonlyArray<MarketSnapshot>> {
    if (query.asOf) {
      throw new CoinGeckoProviderError(
        'CoinGecko current-market snapshots do not support an asOf query.',
      );
    }

    const definitions = this.selectMarkets(query);
    const timeframe = query.timeframe ?? this.config.defaultTimeframe;
    const snapshots = await Promise.all(
      this.groupByQuoteCurrency(definitions).map(async ([quoteCurrency, markets]) => {
        const responses = await this.requestMarkets(
          quoteCurrency,
          markets.map((market) => market.coinId),
        );
        const responsesByCoinId = new Map(responses.map((response) => [response.id, response]));

        return markets.map((market) => {
          const response = responsesByCoinId.get(market.coinId);

          if (!response) {
            throw new CoinGeckoProviderError(
              `CoinGecko returned no market data for configured coin "${market.coinId}".`,
            );
          }

          return mapCoinGeckoMarketToSnapshot(response, market, timeframe);
        });
      }),
    );

    return snapshots.flat();
  }

  private selectMarkets(query: MarketSnapshotQuery): ReadonlyArray<CoinGeckoMarketDefinition> {
    return this.config.markets.filter((market) => {
      const matchesAsset = !query.assetIds || query.assetIds.includes(market.baseAssetId);
      const matchesMarket = !query.marketIds || query.marketIds.includes(market.marketId);

      return matchesAsset && matchesMarket;
    });
  }

  private groupByQuoteCurrency(
    markets: ReadonlyArray<CoinGeckoMarketDefinition>,
  ): ReadonlyArray<readonly [string, ReadonlyArray<CoinGeckoMarketDefinition>]> {
    const groups = new Map<string, CoinGeckoMarketDefinition[]>();

    for (const market of markets) {
      const group = groups.get(market.quoteCurrency) ?? [];
      group.push(market);
      groups.set(market.quoteCurrency, group);
    }

    return Array.from(groups.entries());
  }

  private async requestMarkets(
    quoteCurrency: string,
    coinIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<CoinGeckoMarketResponse>> {
    const response = await this.config.fetch(this.createMarketsUrl(quoteCurrency, coinIds), {
      headers: this.createHeaders(),
    });

    if (!response.ok) {
      throw new CoinGeckoProviderError(
        `CoinGecko market request failed with status ${response.status}.`,
      );
    }

    const payload = await response.json();

    if (!Array.isArray(payload) || !payload.every(isCoinGeckoMarketResponse)) {
      throw new CoinGeckoProviderError('CoinGecko market response contains an invalid entry.');
    }

    return payload;
  }

  private createMarketsUrl(quoteCurrency: string, coinIds: ReadonlyArray<string>): string {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const query = [
      `vs_currency=${encodeURIComponent(quoteCurrency)}`,
      `ids=${encodeURIComponent(coinIds.join(','))}`,
    ].join('&');

    return `${baseUrl}/coins/markets?${query}`;
  }

  private createHeaders(): Readonly<Record<string, string>> {
    if (!this.config.apiKey) {
      return {};
    }

    return {
      [this.config.apiKeyHeader ?? 'x-cg-demo-api-key']: this.config.apiKey,
    };
  }
}

function isCoinGeckoMarketResponse(value: unknown): value is CoinGeckoMarketResponse {
  return (
    typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
  );
}
