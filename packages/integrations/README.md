# @cryptodesk-ai/integrations

Provider-neutral integration contracts and adapters.

## CoinGecko adapter

The CoinGecko adapter uses an injected HTTP boundary and explicitly configured market mappings. It produces normalized `MarketSnapshot` values from current market data and `MarketQuote` values from historical price observations. It does not self-register.

CoinGecko candle support is intentionally unavailable: the available OHLC endpoint lacks volume, while the historical chart endpoint lacks OHLC. The adapter does not fabricate `MarketCandle` data.
