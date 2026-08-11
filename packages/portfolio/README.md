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

`analyzePortfolioAllocation` is a separate descriptive analysis over an
already-produced `PortfolioSnapshot` and `PortfolioValuation`. It reports asset
allocation plus network, source, and account exposure using total valued value
as the only percentage denominator. Unvalued positions are never estimated or
treated as zero; coverage and unvalued-reason counts remain explicit. Ratios use
exact fixed-point arithmetic, rounded half-up to four decimal places without a
forced residual adjustment. The output is not risk scoring and makes no trading
or diversification recommendation. It fetches no prices and implements no
Sprint 7D risk behavior.

Sprint 7C completes the in-memory Portfolio analytics path: canonical Wallet
observations map deterministically to canonical Portfolio snapshots, which may
then be valued from explicit provider-neutral price observations and analyzed
for descriptive allocation/exposure. The path is precision-safe, immutable,
provenance-preserving, and explicit about partial coverage. There is no concrete
Wallet or price provider, RPC/network fetching, PnL/performance engine, risk
classification, recommendation, Morning Meeting integration, or AI/LLM
integration.

Sprint 7D.1 introduces provider-neutral Portfolio risk contracts.
`PortfolioRiskAnalysisInput` preserves canonical Portfolio, valuation, and
allocation identities; `PortfolioRiskAnalysis` can carry descriptive
concentration, exposure, coverage, and explicit unavailable-data observations.
`PortfolioRiskDataState` describes evidence availability only, never a risk
level. `PortfolioRiskValidationError` validates cross-module identity and
coverage coherence.

Sprint 7D.2 adds `analyzePortfolioRisk`, a deterministic, opt-in analysis over
existing Portfolio valuation and allocation facts. Asset, network, source, and
account observations retain the measured percentage and explicit caller-supplied
moderate/high threshold evidence. Thresholds are inclusive and must satisfy
`moderate < high`; there are no hidden defaults. Partial valuation remains
explicit, while missing prices/decimals, absent provenance, and unavailable
zero-value denominators are structured unavailable-data facts. These are
descriptive rule observations only: there is no composite score, VaR,
volatility, drawdown, correlation, liquidation analysis, performance risk, AI
interpretation, or trading recommendation.

Sprint 7D.3 hardens network, source, and account exposure observations using
the same explicit threshold configuration. Unclassified exposure remains a
measured canonical allocation item and carries a matching data-quality reason;
no network, source, or account identity is invented. Every exposure observation
also retains the Portfolio risk coverage state, keeping measured valued-portfolio
exposure distinct from unavailable information. The Portfolio asset contract has
no explicit stable-value classification, so stable-value exposure is deferred;
symbols and names are never used as heuristics. There is no composite score,
VaR, volatility, drawdown, correlation, liquidation model, recommendation, AI,
or Morning Meeting integration.

Sprint 7D.4 validates the completed deterministic risk path:
`PortfolioSnapshot` → valuation → allocation/exposure → risk observations.
Risk consumes canonical allocation facts without recomputing them, validates
their structure and provenance references, and never hides partial coverage or
unavailable data behind an aggregate score. Empty, all-unvalued, and zero-total
portfolios retain explicit insufficient-data facts; they are not interpreted as
low risk. The risk foundation remains descriptive only, with no performance,
trading, provider-runtime, or AI capability.

Sprint 7E.1 introduces opt-in Portfolio Insight contracts after the canonical
valuation, allocation/exposure, and risk path. Insights are externally
identified, deterministic, machine-evidence-backed descriptions of valuation,
allocation, exposure, concentration, coverage, and data-quality facts. They do
not generate narrative text, rankings, recommendations, predictions, trading
logic, AI/LLM behavior, or Morning Meeting integration.

Sprint 7E.3 adds an opt-in deterministic prioritization view over already
generated insights. It preserves canonical evidence and uses only ordinal
priority buckets, insight severity, explicit category precedence, compatible
measured magnitudes, canonical target identity, and insight ID as stable
ordering facts. Machine-readable priority reasons explain severity, coverage or
data-quality limitations, category precedence, magnitude, and identity
tie-breaks. Optional `minimumSeverity` and `maxItems` selection is explicit;
without options every valid insight is retained. This is not AI ranking, a
hidden relevance score, narrative generation, prediction, recommendation, or
Morning Meeting integration.

Sprint 7E closes the Portfolio Intelligence foundation: canonical Portfolio
facts flow through valuation, allocation/exposure, descriptive risk
observations, deterministic insights, and explainable prioritization. Each
stage is provider-neutral, immutable, precision-safe, and explicit about
partial coverage and unavailable facts. Priority preserves canonical evidence
and does not reinterpret it as advice. There is no narrative generation,
AI/LLM dependency, recommendation, prediction, trading logic, or Morning
Meeting integration.
