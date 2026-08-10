# @cryptodesk-ai/portfolio

Provider-neutral, immutable portfolio domain contracts.

The public API defines portfolio identity, declared sources, held assets,
quantity observations, and point-in-time snapshots. It preserves source and
observation provenance without defining wallet access, RPC, blockchain clients,
pricing, valuation, PnL, risk, persistence, or cache behavior.

`PortfolioValidationError` is the explicit domain error type available to
future validation boundaries. Sprint 7A.1 intentionally provides no runtime
validation, provider adapter, or application workflow.
