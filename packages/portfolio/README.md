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
analyzing holdings. Legacy numeric position quantities must be finite and
non-negative; exact source base-unit quantities may instead be unsigned decimal
text, which is preserved without conversion.
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

`normalizeWalletSnapshot` is an opt-in, provider-neutral raw-observation
boundary. It validates wallet identity, sorts network-scoped assets and balances
by stable asset identity, collapses only exact duplicate balance observations,
and rejects conflicting records. Raw balance text, decimals, contract locators,
metadata, block height, and observation time remain unchanged. There is still no
Wallet-to-Portfolio mapping, RPC/provider implementation, pricing, valuation,
PnL, or risk analysis.

Sprint 7B completes the deterministic Wallet foundation: externally supplied
wallet IDs, network-plus-address logical identity, optional local address
validation, raw snapshot canonicalization, and explicit conflict failures. No
blockchain runtime provider, SDK, pricing, valuation, PnL, or risk capability
exists here.

`mapWalletSnapshotToPortfolioSnapshot` is an opt-in, deterministic,
provider-neutral mapping boundary. It maps one normalized `WalletSnapshot` to
a Portfolio source, account, network-scoped asset records, and asset-balance
positions. Wallet observations retain their wallet ID, network, and address as
source provenance; balance quantities remain their exact raw base-unit text.
The mapper performs no wallet retrieval, price lookup, valuation, allocation,
PnL, or risk analysis.

`valuePortfolioSnapshot` is a separate, opt-in valuation foundation. It accepts
an explicit provider-neutral `PortfolioPriceObservation` collection and a
valuation currency; `PortfolioPriceProvider` is only a read-contract, with no
implementation in this package. Unit prices and computed values use exact
non-negative decimal text with `BigInt` arithmetic. Raw string quantities are
base units and therefore require explicit asset decimals; missing prices or
decimals yield explicit unvalued positions while the total includes only valued
positions. Prices in another currency or after the caller-supplied as-of cutoff
are not eligible for the valuation. Price provenance, timestamps, and the cutoff
are retained deterministically. No concrete market provider, allocation, PnL,
or risk capability exists here.
