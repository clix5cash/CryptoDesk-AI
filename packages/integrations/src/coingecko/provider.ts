import type {
  HistoricalMarketQuoteProvider,
  HistoricalMarketQuoteQuery,
  MarketQuote,
  MarketSnapshot,
  MarketSnapshotProvider,
  MarketSnapshotQuery,
} from '@cryptodesk-ai/market-intelligence';
import { mapCoinGeckoMarketChartToQuotes, mapCoinGeckoMarketToSnapshot } from './mappers.js';
import type {
  CoinGeckoMarketChartResponse,
  CoinGeckoMarketDefinition,
  CoinGeckoMarketResponse,
  CoinGeckoProviderConfig,
} from './types.js';

export class CoinGeckoProviderError extends Error {}

/**
 * CoinGecko adapter for the provider-neutral MarketSnapshotProvider contract.
 * It is instantiated explicitly and never self-registers.
 */
export class CoinGeckoMarketSnapshotProvider
  implements MarketSnapshotProvider, HistoricalMarketQuoteProvider
{
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

  /**
   * Retrieves timestamped historical prices through the provider-neutral historical quote boundary.
   */
  async getHistoricalQuotes(
    query: HistoricalMarketQuoteQuery,
  ): Promise<ReadonlyArray<MarketQuote>> {
    const market = this.getConfiguredMarket(query.marketId);
    const from = toUnixSeconds(query.from, 'from');
    const to = toUnixSeconds(query.to, 'to');

    if (from >= to) {
      throw new CoinGeckoProviderError('Historical quote query "from" must be before "to".');
    }

    const chart = await this.requestMarketChartRange(market, from, to);

    return mapCoinGeckoMarketChartToQuotes(chart, market);
  }

  private selectMarkets(query: MarketSnapshotQuery): ReadonlyArray<CoinGeckoMarketDefinition> {
    this.assertConfiguredQueryValues(query);

    const selected = this.config.markets.filter((market) => {
      const matchesAsset = !query.assetIds || query.assetIds.includes(market.baseAssetId);
      const matchesMarket = !query.marketIds || query.marketIds.includes(market.marketId);

      return matchesAsset && matchesMarket;
    });

    if (selected.length === 0) {
      throw new CoinGeckoProviderError('No configured CoinGecko markets match the query.');
    }

    return selected;
  }

  private assertConfiguredQueryValues(query: MarketSnapshotQuery): void {
    const configuredAssetIds = new Set(this.config.markets.map((market) => market.baseAssetId));
    const configuredMarketIds = new Set(this.config.markets.map((market) => market.marketId));

    for (const assetId of query.assetIds ?? []) {
      if (!configuredAssetIds.has(assetId)) {
        throw new CoinGeckoProviderError(
          `No CoinGecko market is configured for asset "${assetId}".`,
        );
      }
    }

    for (const marketId of query.marketIds ?? []) {
      if (!configuredMarketIds.has(marketId)) {
        throw new CoinGeckoProviderError(`CoinGecko market "${marketId}" is not configured.`);
      }
    }
  }

  private getConfiguredMarket(marketId: string): CoinGeckoMarketDefinition {
    const market = this.config.markets.find((definition) => definition.marketId === marketId);

    if (!market) {
      throw new CoinGeckoProviderError(`CoinGecko market "${marketId}" is not configured.`);
    }

    return market;
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
    const payload = await this.requestJson(
      this.createMarketsUrl(quoteCurrency, coinIds),
      'market request',
    );

    if (
      !Array.isArray(payload) ||
      payload.length === 0 ||
      !payload.every(isCoinGeckoMarketResponse)
    ) {
      throw new CoinGeckoProviderError('CoinGecko market response contains an invalid entry.');
    }

    return payload;
  }

  private async requestMarketChartRange(
    market: CoinGeckoMarketDefinition,
    from: number,
    to: number,
  ): Promise<CoinGeckoMarketChartResponse> {
    const payload = await this.requestJson(
      this.createMarketChartRangeUrl(market, from, to),
      'historical market-chart request',
    );

    if (!isCoinGeckoMarketChartResponse(payload) || payload.prices.length === 0) {
      throw new CoinGeckoProviderError(
        'CoinGecko historical market-chart response is invalid or empty.',
      );
    }

    return payload;
  }

  private async requestJson(url: string, requestName: string): Promise<unknown> {
    let response;

    try {
      response = await this.config.fetch(url, { headers: this.createHeaders() });
    } catch (error) {
      throw new CoinGeckoProviderError(
        `CoinGecko ${requestName} failed before receiving a response: ${toErrorMessage(error)}.`,
      );
    }

    const payload = await parseJson(response, requestName);

    if (!response.ok) {
      throw new CoinGeckoProviderError(
        `CoinGecko ${requestName} failed with status ${response.status}: ${getCoinGeckoErrorMessage(payload)}.`,
      );
    }

    return payload;
  }

  private createMarketsUrl(quoteCurrency: string, coinIds: ReadonlyArray<string>): string {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const query = [
      `vs_currency=${encodeURIComponent(quoteCurrency)}`,
      `ids=${encodeURIComponent(coinIds.join(','))}`,
      `per_page=${coinIds.length}`,
    ].join('&');

    return `${baseUrl}/coins/markets?${query}`;
  }

  private createMarketChartRangeUrl(
    market: CoinGeckoMarketDefinition,
    from: number,
    to: number,
  ): string {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const query = [
      `vs_currency=${encodeURIComponent(market.quoteCurrency)}`,
      `from=${from}`,
      `to=${to}`,
    ].join('&');

    return `${baseUrl}/coins/${encodeURIComponent(market.coinId)}/market_chart/range?${query}`;
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

function isCoinGeckoMarketChartResponse(value: unknown): value is CoinGeckoMarketChartResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'prices' in value &&
    Array.isArray(value.prices) &&
    value.prices.every(isCoinGeckoTimestampedValue)
  );
}

function isCoinGeckoTimestampedValue(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

async function parseJson(
  response: { json(): Promise<unknown> },
  requestName: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new CoinGeckoProviderError(
      `CoinGecko ${requestName} returned malformed JSON: ${toErrorMessage(error)}.`,
    );
  }
}

function getCoinGeckoErrorMessage(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }

  return 'No provider error message was supplied.';
}

function toUnixSeconds(value: string, field: string): number {
  const milliseconds = Date.parse(value);

  if (Number.isNaN(milliseconds)) {
    throw new CoinGeckoProviderError(`Historical quote query "${field}" must be an ISO timestamp.`);
  }

  return Math.floor(milliseconds / 1000);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
