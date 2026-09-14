# MVP Application Boundary

The CryptoDesk AI MVP application is a read-only presentation layer at `/app`.
It does not own Market, News, Portfolio, or Morning Meeting domain state and it
does not execute provider, AI, Ritual, or Runtime Safety capabilities.

## Presentation envelope

`apps/web/app/app/presentation.ts` defines immutable display metadata around a
domain result: view identity, availability, authority classification, freshness,
observation or generation time, and source references. The envelope is not a
competing canonical model. Later views may adapt validated package-root outputs
into it while retaining the original domain record and authority.

The UI distinguishes deterministic or canonical material from interpreted and
non-authoritative material. The exact AI trust progression remains:

```text
untrusted_model_execution
→ untrusted_candidate_interpretation
→ non_authoritative_interpretation
```

Portfolio retains canonical Portfolio authority. Morning Meeting retains
canonical report and application authority. Website presentation grants no
authority and performs no mutation.

## Freshness and provenance

A presentation may carry `observedAt`, `generatedAt`, a freshness
classification, and zero or more source references. Replacing an immutable
snapshot with a newer validated snapshot requires no change to these semantics.
This is event-ready shape design only: there is no event bus, subscription,
polling, scheduling, queue, cache, persistence, retry, provider ranking,
consensus, fallback, or provider auto-selection.

## Action boundary

The application exposes no trading, transaction, transfer, signing, wallet,
credential, live Ritual, autonomous research, or autonomous decision control.
It does not invoke Runtime Safety. External Ritual verification remains
**INCONCLUSIVE**.

## Market view

`/app/market` is the first domain route. It can present fields already exposed
by the Market Intelligence package-root contracts: normalized snapshots,
indicator snapshots, signals, their timestamps, and provenance metadata. The
website currently has no configured market provider, so the public route shows
an explicit unavailable state rather than synthetic or apparently live prices.

The route performs no indicator calculation, provider selection, polling,
fallback, consensus, or trading action. Market Intelligence remains the domain
contract owner; the website only presents supplied validated results.

## News view

`/app/news` separates normalized source records, deterministic system metadata,
and any future non-authoritative interpretation into distinct semantic regions.
It can present only fields exposed by News Intelligence package-root contracts,
including article/source identity, source-supplied text, safe references,
publication and observation time, classifications, impacts, event groups, and
their evidence.

No feed or interpretation is connected in the website runtime, so both regions
show explicit unavailable states. The route fabricates no headline or apparently
live content. RSS/provider/parser failures must remain bounded presentation
states; raw upstream text is not a public error contract.
