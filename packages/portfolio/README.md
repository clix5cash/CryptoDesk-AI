# @cryptodesk-ai/portfolio

Provider-neutral, immutable portfolio domain contracts and identity invariants.

The public API defines portfolio identity, declared sources, held assets,
quantity observations, and point-in-time snapshots. It preserves source and
observation provenance without defining wallet access, RPC, blockchain clients,
pricing, valuation, PnL, risk, persistence, or cache behavior.

Asset symbols are descriptive only. `PortfolioAsset` can additionally carry an
explicit network, contract locator, underlying asset, and representation kind,
so same-symbol assets on different networks remain distinct.

Position identity is the deterministic tuple of source ID, account ID, and
stable position ID. Repeated observations must retain that tuple; independent
positions require a distinct position ID or distinct source/account scope.
`portfolioSnapshotIdentity` derives identity solely from portfolio ID and the
explicit `capturedAt` as-of timestamp. None of these helpers generate IDs or
read the current time.

`validatePortfolioSnapshotIdentity` checks identity invariants—empty IDs,
unknown source/account references, duplicate logical positions, and conflicting
asset or position identity records—without normalizing, merging, pricing, or
analyzing holdings. `PortfolioValidationError` is its explicit domain error.
