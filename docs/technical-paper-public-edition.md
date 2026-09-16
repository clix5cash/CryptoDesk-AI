# CryptoDesk AI Technical Paper — Public Edition

**Edition:** Public Edition (derived from Founding Edition v1.0)  
**Status:** Current implementation record  
**Repository:** <https://github.com/clix5cash/CryptoDesk-AI>  
**Release:** `v0.1.0-mvp`  
**Website:** <https://cryptodesk-ai.vercel.app>

This document is a public, implementation-grounded edition of the technical
paper. The complete historical Founding Edition v1.0 source is not tracked in
this repository; historical claims are therefore not recreated here. This
edition records the current public repository and identifies what is implemented,
absent, or externally unverified.

## Purpose and design philosophy

CryptoDesk AI is an open-source TypeScript monorepo for deterministic market,
news, portfolio, and Morning Meeting intelligence with explicitly bounded AI
and runtime integration. Its long-term conceptual model is:

```text
Observe → Think → Remember → Decide → Act
```

This organizes responsibilities; it is not a claim of end-to-end autonomy.
The public MVP is read-only and does not autonomously trade, transfer assets,
manage wallets, or run self-starting loops.

## Current implementation architecture

The repository currently contains 15 private workspace packages. Their public
responsibilities are:

| Package                                   | Responsibility                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@cryptodesk-ai/market-intelligence`      | Deterministic market snapshots, indicators, signals, and comparisons.                                       |
| `@cryptodesk-ai/news-intelligence`        | Normalized News records, classification, grouping, impact, and relationships.                               |
| `@cryptodesk-ai/portfolio`                | Canonical Portfolio identity, valuation, allocation, risk, insights, and presentation.                      |
| `@cryptodesk-ai/morning-meeting`          | Canonical Morning Meeting reports and application composition.                                              |
| `@cryptodesk-ai/integrations`             | Injected CoinGecko and RSS/Atom adapters and normalization boundaries.                                      |
| `@cryptodesk-ai/ai`                       | Provider-neutral model execution, parsing, grounding, and interpretation contracts.                         |
| `@cryptodesk-ai/openai-runtime`           | Explicitly configured OpenAI Responses adapter.                                                             |
| `@cryptodesk-ai/ritual-gateway`           | Ritual-specific connectivity, construction, signing, inference, and verification boundaries.                |
| `@cryptodesk-ai/runtime-safety`           | Bounded candidate, authorization, permission, and single-attempt execution contracts.                       |
| `@cryptodesk-ai/federation`               | Provider-neutral observation, provenance, freshness, availability, eligibility, and disagreement mechanics. |
| `@cryptodesk-ai/intelligence-composition` | Deterministic cross-domain composition without canonicalization or decisions.                               |
| `@cryptodesk-ai/data`                     | Reserved data-access package; no persistence API.                                                           |
| `@cryptodesk-ai/web`                      | Static-first public website and read-only application presentation.                                         |
| `@cryptodesk-ai/observability`            | Dependency-free, bounded telemetry contracts; no backend or transport.                                      |
| `@cryptodesk-ai/community-feedback`       | Bounded advisory feedback records and explicit classification; no triage authority.                         |

Only package-root exports are supported; internal deep imports are not public
contracts. The dependency graph is acyclic.

## Authority model

- Market Intelligence owns deterministic Market semantics and calculations.
- News Intelligence owns normalized and deterministic News records and relationships.
- Portfolio owns canonical Portfolio state and Portfolio-owned analyses.
- Morning Meeting owns canonical report and application state.
- Federation qualifies provider observations but is not universal canonical authority.
- Intelligence Composition combines qualified domain results without creating truth.
- AI remains non-authoritative interpretation.
- Ritual Gateway owns Ritual-specific integration concerns.
- Runtime Safety owns bounded authorization and execution safety.
- `apps/web` is presentation-only and owns no domain state.

## AI trust model

The exact trust progression is:

```text
untrusted_model_execution
→ untrusted_candidate_interpretation
→ non_authoritative_interpretation
```

Model output is not canonical fact, recommendation authority, or autonomous
decision authority. Grounding preserves references to canonical material but
does not promote prose into truth.

## Runtime Safety model

The bounded lifecycle is:

```text
explicit request
→ candidate
→ explicit authorization
→ single-attempt permission
→ at-most-one execution
→ terminal result
→ stop
```

Runtime Safety has no self-starting loop, scheduler, hidden retry/fallback,
wallet or private-key ownership, trading, transfer, persistence, or autonomous
action authority. Its dependency count is zero and it has zero Ritual
references.

## Provider federation

Federation retains multiple normalized provider observations with explicit
identity, provenance, timestamps, availability, freshness, eligibility, stable
ordering, and disagreement metadata. It does not imply consensus. No provider
winner, ranking, fallback, averaging, universal health truth, or canonical
promotion is produced.

Domain-owned federation preserves its boundaries:

```text
provider/source
→ integration normalization
→ domain-owned normalized observation
→ generic Federation qualification
→ domain-owned consumption
```

Market federation retains exact Market comparison semantics. News federation
preserves provider/source/article identity, chronology, duplicate/event
uncertainty, and source diversity. Portfolio federation preserves canonical
Portfolio authority, account/snapshot identity, and multi-account safety.
Intelligence Composition combines Market, News, and Portfolio results while
retaining domain-local freshness, provenance, availability, and uncertainty.

## MVP application

The read-only application routes are:

- `/app` — overview and application contract.
- `/app/market` — Market presentation.
- `/app/news` — normalized source and News presentation.
- `/app/portfolio` — canonical Portfolio presentation.
- `/app/morning-meeting` — canonical report and separated interpretation presentation.

The web layer presents validated inputs only. It uses explicit unavailable,
unknown, partial, freshness, provenance, and authority states and does not
fabricate operational prices, headlines, holdings, reports, or AI narration.
The routes are not verified as consuming live federation data.

## Developer and community release

The verified developer path is documented in README:

```text
clone → install → build → test → demo
```

The repository also includes four public executable examples for AI
interpretation, Morning Meeting, Ritual boundary preparation, and Runtime
Safety. They use public APIs and deterministic synthetic/local inputs.

GitHub community readiness includes structured Bug Report and Feature Request
forms, a pull-request template, security-reporting guidance, a Code of Conduct,
and enabled GitHub Discussions. Issue requests are discussion proposals, not
roadmap commitments.

## Ritual boundary

Ritual-specific construction, signing, inference, retrieval, and verification
remain behind injected Gateway capabilities. No wallet, private key, live RPC,
or production inference claim is made here.

**External Ritual verification remains INCONCLUSIVE.**

## Security and non-capabilities

The public implementation contains no autonomous trading, asset transfer,
wallet custody, private-key handling, self-starting autonomous loop, hidden
provider selection, fabricated live domain state, or AI promotion to canonical
authority. Public examples and tests use synthetic data and do not require
credentials or environment secrets.

## Implementation evidence

Current verification evidence includes:

- 15 workspace packages; dependency graph acyclic.
- Repository tests: 519/519.
- Federation: 11/11; Market: 15/15; News: 60/60; Portfolio: 92/92.
- Intelligence Composition: 17/17; Morning Meeting: 94/94.
- Integrations: 24/24; Runtime Safety: 20/20; Ritual Gateway: 64/64.
- Observability: 3/3; Community Feedback: 6/6.
- Runtime Safety dependencies: 0; Ritual references: 0.
- Production website: HTTPS HTTP 200.
- `v0.1.0-mvp` resolves to `3187746aea5afa5f51acfe3d0f0f763cbf6b46a5`.
- Quick Start and all public examples execute successfully locally.

These figures describe the current repository; they are not historical
Founding Edition measurements.

## Roadmap boundaries

Sprint 16A–16D are represented by the observability, performance, security,
and Community Feedback contracts and audits recorded in the repository. Sprint
16E release v0.2.0 is prepared as an untagged release candidate; Sprint 16F
Phase II Closure remains pending review. No publication or deployment is
claimed here.
