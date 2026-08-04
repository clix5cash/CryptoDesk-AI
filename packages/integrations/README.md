# @cryptodesk-ai/integrations

Provider-neutral integration contracts and adapters.

## CoinGecko adapter

The CoinGecko adapter uses an injected HTTP boundary and explicitly configured market mappings. It produces normalized `MarketSnapshot` values from current market data and implements provider-neutral `MarketQuote` range retrieval. It does not self-register.

CoinGecko candle support is intentionally unavailable: the available OHLC endpoint lacks volume, while the historical chart endpoint lacks OHLC. The adapter does not fabricate `MarketCandle` data.

## RSS/Atom adapter foundation

The RSS/Atom adapter keeps feed definitions, HTTP access, parsing, and local
feed models inside `src/rss`. `RssNewsProvider` fetches all configured feeds,
then parses and maps source content through provider-neutral News Intelligence
contracts. A failure in any configured feed fails the whole request; there is
no partial-success mode or automatic retry.

RSS has no remote query protocol. The adapter applies source, configured asset
and market mapping, topic, publication time-range, and limit constraints only
after mapping source-provided records. It performs no normalization,
deduplication, classification, or sentiment analysis.
