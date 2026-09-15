# CryptoDesk AI

CryptoDesk AI is a TypeScript monorepo for deterministic crypto market, news,
portfolio, and Morning Meeting intelligence with explicitly bounded AI and
runtime integration. Its long-term conceptual flow is **Observe → Think →
Remember → Decide → Act**, but the repository currently implements only the
foundations and controlled boundaries described below.

## Overview

The project keeps canonical financial state and deterministic analysis separate
from model output. Provider-neutral contracts sit between domain packages and
concrete OpenAI or Ritual runtime boundaries. All workspace packages remain
non-publishable. A static-first public website and read-only MVP intelligence
application live in `apps/web`; they do not invoke domain runtimes or own state.

## Current status

- Phase I engineering is complete through Sprint 14.
- The public source release `v0.1.0-mvp` and production website are available.
- The Sprint 13 read-only MVP intelligence application and Sprint 14 provider
  federation boundaries are complete.
- The current repository baseline is 510 passing tests.
- External Ritual verification remains **INCONCLUSIVE**. Injected and local
  tests are not evidence of externally verified live Ritual inference or action.

## Core capabilities

- Deterministic market indicators and signals.
- CoinGecko market data and RSS/Atom news adapters behind injected boundaries.
- Normalized news classification, grouping, impact, and market-intelligence
  composition.
- Canonical portfolio identity, valuation, allocation, risk, insight, and
  presentation models.
- Deterministic Morning Meeting reports and optional, separately labeled AI
  narration and Portfolio interpretation composition.
- Provider-neutral AI execution, parsing, grounding, and traceability contracts.
- A concrete OpenAI Responses adapter with explicit runtime configuration.
- Ritual-owned connectivity, transaction lifecycle, inference invocation, and
  result-verification boundaries with injected capabilities.
- Provider-neutral Runtime Safety contracts for one explicitly requested,
  explicitly authorized, single-attempt operation.

CryptoDesk AI does **not** autonomously trade or transfer assets, manage wallets
or private keys, discover actions, run autonomous loops, schedule itself, or
provide guaranteed investment recommendations. It has no autonomous trading
authority and makes no externally verified live Ritual execution claim.

## Safety and authority model

AI trust progresses only through explicit validation:

```text
untrusted_model_execution
→ untrusted_candidate_interpretation
→ non_authoritative_interpretation
```

Portfolio owns canonical Portfolio state. Morning Meeting owns canonical report
and application state. AI output remains non-authoritative. Ritual Gateway owns
Ritual-specific connectivity and execution logic. Runtime Safety remains
provider-neutral, dependency-free, and Ritual-free.

The controlled runtime path is deliberately finite:

```text
explicit request
→ candidate
→ explicit authorization
→ single-attempt permission
→ at-most-one execution
→ terminal result
→ stop
```

## Repository structure

| Path                                | Package                                   | Responsibility                                                                          |
| ----------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/portfolio`                | `@cryptodesk-ai/portfolio`                | Canonical portfolio identity, valuation, allocation, risk, insights, and presentation.  |
| `packages/market-intelligence`      | `@cryptodesk-ai/market-intelligence`      | Deterministic market snapshots, indicators, and signals.                                |
| `packages/news-intelligence`        | `@cryptodesk-ai/news-intelligence`        | Provider-neutral news normalization, classification, grouping, impact, and composition. |
| `packages/integrations`             | `@cryptodesk-ai/integrations`             | Concrete CoinGecko and RSS/Atom adapters.                                               |
| `packages/ai`                       | `@cryptodesk-ai/ai`                       | Provider-neutral model execution and grounded interpretation contracts.                 |
| `packages/openai-runtime`           | `@cryptodesk-ai/openai-runtime`           | Explicitly configured OpenAI Responses runtime adapter.                                 |
| `packages/morning-meeting`          | `@cryptodesk-ai/morning-meeting`          | Canonical Morning Meeting reports and application composition.                          |
| `packages/data`                     | `@cryptodesk-ai/data`                     | Reserved data-access package; no public API is defined yet.                             |
| `packages/federation`               | `@cryptodesk-ai/federation`               | Provider-neutral observation, provenance, freshness, eligibility, and disagreement.     |
| `packages/intelligence-composition` | `@cryptodesk-ai/intelligence-composition` | Deterministic cross-domain composition without canonicalization or decisions.           |
| `packages/runtime-safety`           | `@cryptodesk-ai/runtime-safety`           | Bounded candidate, authorization, execution, and controlled-runtime contracts.          |
| `services/ritual-gateway`           | `@cryptodesk-ai/ritual-gateway`           | Ritual-specific connectivity and injected transaction/inference lifecycle boundaries.   |
| `apps/web`                          | `@cryptodesk-ai/web`                      | Static-first public website and read-only intelligence presentation application.        |

Only package-root exports are supported. Internal deep imports are not part of
the package contract.

## Requirements

- Node.js 22 or later
- pnpm 11.17.0, as declared by the repository `packageManager` field

## Installation

```sh
pnpm install
```

The standard build and test workflow does not require live credentials or
network access beyond installing dependencies.

## Developer quick start

On a supported machine (Node.js 22+ and pnpm 11.17.0), the shortest local
path is:

```sh
git clone https://github.com/clix5cash/CryptoDesk-AI.git
cd CryptoDesk-AI
pnpm install
pnpm build --force
pnpm test
pnpm demo
```

This is designed to fit approximately ten minutes on a normal development
machine; actual time depends on the machine and dependency-cache state. The
demo prints a deterministic, synthetic provider-neutral Federation envelope,
including retained observations, explicit provider identities, and a stable
comparison result. It does not fetch live market or news data, represent a
user portfolio, invoke AI or Ritual, connect a wallet, require credentials or
environment variables, or demonstrate production connectivity. External
Ritual verification remains **INCONCLUSIVE**.

## Development

Run the repository checks from the workspace root:

```sh
pnpm lint
pnpm typecheck
pnpm build --force
```

Formatting can be checked with `pnpm format:check`. The web application can be
run locally with `pnpm --filter @cryptodesk-ai/web dev`; no environment variable
is required for its current presentation-only routes.

After building, run the [public examples](examples/README.md) individually
with `pnpm example:ai`, `pnpm example:morning-meeting`, `pnpm example:ritual`,
or `pnpm example:runtime-safety`, or run all four with `pnpm examples`. Each
example is explicitly invoked and local/synthetic; none requires credentials,
wallet access, environment variables, or live Ritual access.

## Testing

```sh
pnpm test
```

Tests use deterministic fixtures and injected capabilities; they do not perform
live credential discovery, trading, transfers, or externally verified Ritual
inference.

## Architecture documentation

- [Public architecture overview](docs/architecture/overview.md)
- [Technical Paper — Public Edition](docs/technical-paper-public-edition.md)
- [Public Launch Package (drafts)](docs/launch/README.md)
- [Intelligence federation boundary](docs/architecture/federation-boundary.md)
- [Architecture decision record](docs/architecture/ADR-001-modular-ai-first-architecture.md)
- [MVP component and dependency map](docs/architecture/sprint-9-mvp-component-map.md)
- [MVP integration contract](docs/architecture/sprint-9-mvp-integration-contract.md)
- [Sprint 10 Ritual runtime boundary](docs/architecture/sprint-10-ritual-runtime-boundary.md)

These records include historical roadmap context; the current status above is
authoritative for this release-preparation stage.

## Security

Review [SECURITY.md](SECURITY.md) before reporting a vulnerability. Do not place
credentials or unresolved vulnerability details in a public issue.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, validation, architecture, and
pull-request expectations. Use the [bug report](https://github.com/clix5cash/CryptoDesk-AI/issues/new?template=bug_report.yml)
or [feature request](https://github.com/clix5cash/CryptoDesk-AI/issues/new?template=feature_request.yml)
forms for public discussion, and follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Report unresolved vulnerabilities privately through [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE).
