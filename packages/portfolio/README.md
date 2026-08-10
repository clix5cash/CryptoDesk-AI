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
analyzing holdings. Position quantities must be finite and non-negative.
`PortfolioValidationError` is its explicit domain error.

`normalizePortfolioSnapshot` is an opt-in canonicalization boundary. It validates
the resulting snapshot, sorts sources/accounts/positions by stable domain
identity, and collapses only exact equivalent observations of one logical
position. Conflicting observations fail explicitly; independent positions—even
in the same asset—remain separate. It preserves quantities, timestamps, and
all available provenance without wallet access, valuation, or risk analysis.

Sprint 7A is a provider-neutral domain foundation only: there is no wallet or
provider integration, valuation, risk, persistence, cache, or scheduler.

The Wallet subdomain defines raw read-only observations before any future
Portfolio mapping: wallet metadata, network-scoped assets, exact base-unit
balances, block height, and observation time. `WalletProvider` and
`WalletSnapshotProvider` are provider-neutral interfaces only. There is no RPC,
blockchain client, wallet implementation, pricing, valuation, allocation, PnL,
risk, persistence, or Portfolio integration.

Wallet IDs remain externally supplied opaque identifiers. `walletIdentity`
derives a separate deterministic logical identity from the explicit network ID
and unchanged address text; labels do not participate. Core validation rejects
empty, whitespace, and control-character address text but does not lowercase,
decode, or apply any network-specific rule. Optional `WalletAddressValidator`
implementations may be injected by composition for local chain-specific checks.
Snapshot queries require both wallet and network IDs, so they cannot be
network-ambiguous. Duplicate or conflicting wallet records fail explicitly.
