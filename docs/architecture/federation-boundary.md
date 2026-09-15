# Intelligence Federation Boundary

## Purpose

`@cryptodesk-ai/federation` defines a provider-neutral envelope for retaining
multiple normalized observations without selecting a provider or turning a
provider result into canonical truth. Domain adapters planned for Sprint
14B–14E may compose their existing payloads into this envelope while preserving
the owning domain contract.

The package has no workspace or third-party dependency. It contains no provider
adapter, transport, registry, background process, persistence, or domain
calculation.

## Authority

Federation organizes and qualifies observations. It is not a universal
canonical authority:

- Market Intelligence retains deterministic Market contract and calculation
  ownership.
- News Intelligence retains normalized and deterministic News ownership.
- Portfolio retains canonical Portfolio state authority.
- Morning Meeting retains canonical report and application authority.
- AI remains non-authoritative and has no role in eligibility, comparison, or
  selection.
- Ritual Gateway retains Ritual-specific integration ownership.
- The web application remains presentation-only.

## Provider-neutral model

A `FederationObservation` carries an observation ID, domain, descriptive
provider identity, receipt time, availability, provenance, an optional
domain-owned comparison key, and a payload only when available. Provider
identity conveys no trust, health, preference, correctness, or authority.

`createFederationEnvelope` validates, detaches, freezes, and deterministically
orders every supplied record. Unavailable, invalid, and unknown providers remain
visible in the envelope rather than disappearing behind fallback.

## Provenance

Every record retains the provider ID and normalization boundary. It may also
retain an observation timestamp, provider-neutral source ID, and safe source
reference. The provider ID in provenance must match the provider identity.
Normalization and federation do not discard or replace that relationship.

## Freshness and eligibility

Freshness evaluation uses an explicit reference timestamp and maximum age. It
never reads the wall clock. Available observations become `current`, `stale`,
or `unknown`; provider unavailability remains `unavailable`.

Eligibility is separate from selection. Explicit policy controls whether stale
or unknown-freshness observations remain eligible. Ineligible and unavailable
records carry a deterministic exclusion reason. No eligible observation is
automatically preferred or selected.

## Disagreement

Federation does not inspect or compare domain payload semantics. A domain may
supply an opaque deterministic comparison key. Among eligible observations:

- matching keys produce `agree`;
- distinct keys produce `differ` and preserve their groups;
- missing comparison evidence produces `unknown`;
- fewer than two eligible observations produce `not_applicable`.

This is descriptive comparison metadata. It performs no averaging, consensus,
ranking, confidence scoring, canonicalization, or winner selection.

## Event-ready, not event infrastructure

The envelope is immutable and can be replaced by a later envelope assembled
from newer normalized observations. It introduces no event bus, WebSocket, SSE,
polling, queue, worker, daemon, scheduler, cache, persistence, retry, or hidden
fallback.

## Market federation

Market federation follows the existing ownership direction:

```text
concrete provider response
  -> Integrations normalization boundary
  -> normalized MarketSnapshot
  -> provider-neutral federation qualification
  -> Market-owned compatibility and value comparison
```

`@cryptodesk-ai/market-intelligence` composes the generic envelope and retains
Market authority over instrument identity and exact snapshot comparison. Two
snapshots are comparable only when market, base asset, quote asset, timeframe,
and capture timestamp match. Compatible normalized values may agree or differ;
incompatible instruments remain separate and are `not_applicable` for direct
comparison. No tolerance is hidden in this policy.

Every observation retains its provider identity and normalization provenance,
including unavailable and stale observations. Stable output ordering is for
determinism only and conveys no provider preference. Eligibility creates no
selection: Market federation returns no winner, average, canonical price,
fallback, provider ranking, or consensus.

CoinGecko remains one concrete adapter in Integrations. Raw CoinGecko payloads
are normalized before federation and never enter the generic federation
contract. Multi-provider behavior is verified with deterministic normalized
test observations; Sprint 14B adds no live provider or credential requirement.

## News federation

News federation preserves the existing flow and identity boundaries:

```text
RSS / Atom response
  -> Integrations transport, parsing, and normalization
  -> normalized NewsArticle
  -> News-owned identity and relationship validation
  -> provider-neutral federation qualification
  -> qualified News observations
```

Provider, source, and article identities remain distinct. Each observation
retains its provider and normalization boundary while its normalized article
retains source and article identity. Publication time remains source chronology;
observation time drives freshness; envelope generation time records federation
assembly. None is inferred from another.

All original observations remain present, including stale and unavailable
providers. Existing deterministic article identity may mark duplicate
representations, but does not destructively collapse federation provenance.
Existing `NewsEventGroup` evidence may establish `same_event`; that relationship
does not mean factual agreement. Every other relationship remains `unknown`.
Headline similarity, text difference, classification, and impact never produce
generic agreement or disagreement.

News federation performs no truth arbitration, source ranking, credibility
scoring, consensus, selected article, selected provider, fallback, or AI-based
relationship inference. RSS and Atom remain concrete Integrations adapters, and
multi-provider behavior uses deterministic normalized test observations rather
than a new live provider or credential.

## Portfolio and context federation

Portfolio federation preserves the authority direction:

```text
source-specific observation boundary
  -> normalized PortfolioSnapshot
  -> provider-neutral federation qualification
  -> qualified Portfolio observations
  -> explicit Portfolio-owned consumption
```

A federated observation is not canonical Portfolio state. Portfolio retains
canonical ownership of portfolio, account, asset, position, quantity, snapshot,
valuation, allocation, risk, insight, evidence, and presentation contracts.
Federation does not construct, mutate, merge, reconcile, or promote that state.

Comparability is Portfolio-owned and requires an exact portfolio, capture,
source, and account scope. Source, account, snapshot, asset, and position
identities remain distinct. In particular, the same asset held by different
accounts is neither a duplicate nor a conflict. Comparable normalized snapshots
may report exact agreement or disagreement, but differing quantities remain as
their original observations: they are never averaged, summed, selected, or
promoted to a canonical balance.

Capture time, position observation time, provider observation time, and envelope
generation time remain distinct. Explicit caller-supplied policy determines
freshness and eligibility; stale and unavailable sources remain observable.
Eligibility conveys no trust, selection, or canonical authority. Stable output
ordering exists only for deterministic results.

Only normalized Portfolio records enter federation. Raw wallet, exchange, RPC,
transport, signing, credential, and provider payloads remain outside the generic
boundary. Portfolio federation adds no wallet connection, custody, signing,
transaction, valuation, cross-account aggregation, retry, fallback, or live
provider requirement. Portfolio-adjacent context is not expanded into a global
context store, and cross-domain Market, News, and Morning Meeting federation
remains deferred to Sprint 14E.

## Cross-domain intelligence composition

`@cryptodesk-ai/intelligence-composition` is a narrow read-only consumer of the
three domain-owned federation results:

```text
MarketFederationResult ─┐
NewsFederationResult ───┼─> detached cross-domain composition snapshot
PortfolioFederationResult ┘
```

The composition retains each result under an explicit `market`, `news`, or
`portfolio` domain tag. It does not flatten observations or replace provider,
source, normalization, timestamp, freshness, availability, eligibility,
comparison, or relationship evidence. Expected but absent domains are listed as
missing; available domains remain usable, and no absent evidence is fabricated.

Authority remains local. Market records retain deterministic Market ownership,
News records retain normalized and deterministic News ownership, and Portfolio
federation records remain non-canonical observations under canonical Portfolio
authority. The composition itself is not canonical state and cannot become a
Morning Meeting report. Morning Meeting remains the canonical owner of its own
report and application composition contracts.

Freshness and disagreement also remain domain-local. Market disagreement, News
uncertainty, and Portfolio disagreement pass through unchanged. The composition
defines no global freshness, domain or provider winner, selection, consensus,
confidence score, majority rule, causal relationship, recommendation, or
decision. Its fixed Market-then-News-then-Portfolio ordering is only a stable
serialization rule and conveys no authority.

The package accepts already-produced public domain results, validates their
domain and provenance boundary, then returns a detached immutable snapshot. It
adds no live provider, AI inference, Morning Meeting generation, application
wiring, persistence, event transport, autonomous research, or action loop.
Autonomous research and decision support remain deferred to Sprint 15.

## Sprint ownership

- Sprint 14B owns Market-specific federation and any explicit domain selection
  policy.
- Sprint 14C owns News-specific federation.
- Sprint 14D owns Portfolio and context federation.
- Sprint 14E owns cross-domain intelligence federation.
- Sprint 14F owns integrated federation release validation.

Provider discovery, autonomous research, planning, and decisions remain outside
Sprint 14. Observability, scaling, deployment redesign, global caching, and
system-wide production hardening remain outside this package.
