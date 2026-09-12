# CryptoDesk AI

CryptoDesk AI is a TypeScript monorepo for deterministic crypto market, news,
portfolio, and Morning Meeting intelligence with explicitly bounded AI and
runtime integration. Its long-term conceptual flow is **Observe → Think →
Remember → Decide → Act**, but the repository currently implements only the
foundations and controlled boundaries described below.

## Overview

The project keeps canonical financial state and deterministic analysis separate
from model output. Provider-neutral contracts sit between domain packages and
concrete OpenAI or Ritual runtime boundaries. All workspace packages are
currently private, and the repository contains no application server, CLI, UI,
or deployment artifact.

## Current status

- Phase I engineering is complete through Sprint 10.
- Phase II public-release preparation is in progress through Sprint 11.
- The GitHub repository remains private until the public-release gate passes.
- The current repository baseline is 439 passing tests.
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

| Path                           | Package                              | Responsibility                                                                          |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/portfolio`           | `@cryptodesk-ai/portfolio`           | Canonical portfolio identity, valuation, allocation, risk, insights, and presentation.  |
| `packages/market-intelligence` | `@cryptodesk-ai/market-intelligence` | Deterministic market snapshots, indicators, and signals.                                |
| `packages/news-intelligence`   | `@cryptodesk-ai/news-intelligence`   | Provider-neutral news normalization, classification, grouping, impact, and composition. |
| `packages/integrations`        | `@cryptodesk-ai/integrations`        | Concrete CoinGecko and RSS/Atom adapters.                                               |
| `packages/ai`                  | `@cryptodesk-ai/ai`                  | Provider-neutral model execution and grounded interpretation contracts.                 |
| `packages/openai-runtime`      | `@cryptodesk-ai/openai-runtime`      | Explicitly configured OpenAI Responses runtime adapter.                                 |
| `packages/morning-meeting`     | `@cryptodesk-ai/morning-meeting`     | Canonical Morning Meeting reports and application composition.                          |
| `packages/data`                | `@cryptodesk-ai/data`                | Reserved data-access package; no public API is defined yet.                             |
| `packages/runtime-safety`      | `@cryptodesk-ai/runtime-safety`      | Bounded candidate, authorization, execution, and controlled-runtime contracts.          |
| `services/ritual-gateway`      | `@cryptodesk-ai/ritual-gateway`      | Ritual-specific connectivity and injected transaction/inference lifecycle boundaries.   |

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

## Development

Run the repository checks from the workspace root:

```sh
pnpm lint
pnpm typecheck
pnpm build --force
```

Formatting can be checked with `pnpm format:check`. The repository does not
currently define a development server command.

## Testing

```sh
pnpm test
```

Tests use deterministic fixtures and injected capabilities; they do not perform
live credential discovery, trading, transfers, or externally verified Ritual
inference.

## Architecture documentation

- [Public architecture overview](docs/architecture/overview.md)
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
pull-request expectations. Participation is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

Licensed under the [Apache License 2.0](LICENSE).
