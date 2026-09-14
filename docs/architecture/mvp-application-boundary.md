# MVP Application Boundary

The CryptoDesk AI MVP application is a read-only presentation layer at `/app`.
It does not own Market, News, Portfolio, or Morning Meeting domain state and it
does not execute provider, AI, Ritual, or Runtime Safety capabilities.

Its completed Sprint 13 route surface is:

- `/app` — application contract, status, and domain overview.
- `/app/market` — deterministic Market contract presentation.
- `/app/news` — normalized source and deterministic News presentation.
- `/app/portfolio` — canonical Portfolio presentation.
- `/app/morning-meeting` — canonical report and separated interpretation
  presentation.

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

## Portfolio view

`/app/portfolio` presents the public, immutable Portfolio contract without
becoming a second portfolio model. Portfolio Intelligence remains the canonical
owner of portfolio and snapshot identity, positions, valuation, allocation,
descriptive risk, insights, coverage, and their evidence. The web layer only
formats a supplied validated presentation payload; it performs no calculation,
mutation, persistence, or provider access.

No portfolio snapshot or private user data is connected in the website runtime,
so the route reports an unavailable state with unknown freshness and absent
provenance. It fabricates no holdings, balance, valuation, performance, or
financial advice and exposes no wallet, signing, transaction, transfer, trading,
or portfolio-editing control.

## Morning Meeting view

`/app/morning-meeting` presents a validated canonical Morning Meeting report as
structured report fields, contributor evidence, and a separately labeled
optional AI narrative. Market views and sections remain deterministic report
material. A News brief is optional and appears only when request-scoped News
Intelligence was supplied. Portfolio is optional canonical context for the
separate AI composition boundary, not an invented native report section.

No report or AI composition is connected in the website runtime, so the route
keeps the report, contributors, evidence, and interpretation unavailable. The
web layer does not generate, merge, recompute, or mutate report state. Missing
contributors remain explicit; no report content, recommendation, or action is
fabricated.

## Later-sprint boundaries

The presentation envelope is compatible with replacing an immutable snapshot
with a newer validated snapshot, but Sprint 13 implements no update transport.
Multi-provider federation, ranking, consensus, fallback, and provider-health
routing belong to Sprint 14. Autonomous research, planning, recommendations,
and decisions belong to Sprint 15. System-wide observability, scaling, caching,
deployment infrastructure, and production hardening belong to Sprint 16.
