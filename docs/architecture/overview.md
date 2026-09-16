# CryptoDesk AI Architecture

## 1. Purpose

CryptoDesk AI is a TypeScript monorepo for deterministic crypto market, news,
portfolio, and Morning Meeting intelligence. It adds AI and chain-specific
runtime capabilities through explicit contracts rather than treating model
output as financial truth or executable authority.

The central engineering choice is deliberate: CryptoDesk AI is not designed as
“give an AI model a wallet and let it act.” Observation, model execution,
interpretation, canonical state, Ritual-specific execution, authorization, and
bounded action are separate concerns. This creates more contracts and explicit
handoffs in exchange for less hidden authority.

## 2. Design philosophy

The implemented architecture follows these principles:

- **Canonical ownership:** deterministic domain packages own canonical facts.
- **Non-authoritative AI:** model output must pass explicit interpretation and
  grounding boundaries and never becomes canonical by implication.
- **Provider neutrality:** core AI and domain contracts do not select or depend
  on a concrete inference provider.
- **Ritual isolation:** Ritual-specific lifecycle behavior belongs to Ritual
  Gateway, not to Portfolio, Morning Meeting, AI, or Runtime Safety.
- **Explicit authorization:** a candidate grants no permission; authorization
  is a separate injected capability.
- **Bounded execution:** an authorization can derive only an operation-local,
  single-attempt permission.
- **Deterministic contracts:** identities, authority markers, result shapes, and
  failure kinds are validated at boundaries.
- **Fail-closed behavior:** malformed, conflicting, inherited, or
  identity-mismatched input is rejected or mapped to a closed failure.

## 3. Conceptual flow

The long-term product model is:

```text
Observe → Think → Remember → Decide → Act
```

This is a way to organize responsibilities, not a claim of current end-to-end
autonomy:

- **Observe:** injected integrations obtain market or news data.
- **Think:** deterministic intelligence and provider-neutral AI boundaries
  produce analysis or explicitly labeled interpretations.
- **Remember:** canonical records retain identity and provenance; the current
  `data` package is reserved and does not implement persistence.
- **Decide:** canonical application logic and an explicit authorizer remain
  distinct from model output.
- **Act:** the current Runtime Safety action is only
  `prepare_operator_review`, using an injected executor and no wallet or trade.

There is no self-starting agent, work discovery, autonomous loop, scheduler, or
trading authority.

The private `@cryptodesk-ai/observability` package provides provider-neutral,
safe telemetry contracts only; see [the observability boundary](observability-boundary.md).

The private `@cryptodesk-ai/community-feedback` package validates advisory
community input into four explicit categories and stops at maintainer review;
see [the community feedback boundary](community-feedback-boundary.md).

## 4. System layers

```text
External data
  │
  ▼
@cryptodesk-ai/integrations
  │  normalized market/news contracts
  ├──────────────► @cryptodesk-ai/market-intelligence
  └──────────────► @cryptodesk-ai/news-intelligence
                         │
                         ▼
Canonical domains: @cryptodesk-ai/portfolio + @cryptodesk-ai/morning-meeting
                         │
                         ▼
Provider-neutral AI: @cryptodesk-ai/ai
                 ┌───────┴────────┐
                 ▼                ▼
 @cryptodesk-ai/openai-runtime   @cryptodesk-ai/ritual-gateway
                                  Ritual-specific lifecycle boundary

Separate provider-neutral action boundary:
@cryptodesk-ai/runtime-safety
  explicit request → authorization → at-most-one injected execution → stop
```

This diagram shows responsibilities and information flow, not every TypeScript
import edge. The exact dependency graph appears in
[Dependency direction](#9-dependency-direction).

The thirteen workspace packages have these roles:

| Package                                   | Implemented responsibility                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@cryptodesk-ai/market-intelligence`      | Market snapshot contracts plus deterministic indicators and signals.                            |
| `@cryptodesk-ai/news-intelligence`        | News normalization, classification, grouping, impact, and market-intelligence composition.      |
| `@cryptodesk-ai/integrations`             | Injected CoinGecko and RSS/Atom provider adapters.                                              |
| `@cryptodesk-ai/portfolio`                | Canonical portfolio identity, valuation, allocation, risk, insights, and presentation.          |
| `@cryptodesk-ai/ai`                       | Provider-neutral execution, candidate parsing, grounding, and interpretation contracts.         |
| `@cryptodesk-ai/openai-runtime`           | Explicitly configured concrete OpenAI Responses adapter.                                        |
| `@cryptodesk-ai/morning-meeting`          | Canonical report generation and optional AI presentation composition.                           |
| `@cryptodesk-ai/data`                     | Reserved package with no public data or persistence API yet.                                    |
| `@cryptodesk-ai/federation`               | Provider-neutral observation federation without selection or canonical authority.               |
| `@cryptodesk-ai/intelligence-composition` | Deterministic cross-domain federation-result composition without canonicalization or decisions. |
| `@cryptodesk-ai/runtime-safety`           | Provider-neutral candidate, authorization, bounded execution, and controlled-runtime contracts. |
| `@cryptodesk-ai/ritual-gateway`           | Ritual-specific connectivity, transaction, inference, and result-verification boundaries.       |
| `@cryptodesk-ai/web`                      | Static-first public website and read-only intelligence presentation application.                |

## 5. Trust model

The trust progression is exact:

```text
Model execution
  │
  ▼
untrusted_model_execution
  │  parse and validate candidate structure
  ▼
untrusted_candidate_interpretation
  │  explicit grounding against selected canonical references
  ▼
non_authoritative_interpretation
  │  optional, separately labeled application composition
  ▼
Portfolio / Morning Meeting canonical application boundary
  │
  └── interpretation cannot mutate canonical state
```

`untrusted_model_execution` is opaque provider output with a validated execution
envelope. `untrusted_candidate_interpretation` has passed structural parsing but
is not grounded authority. `non_authoritative_interpretation` has validated
references to canonical context, but remains descriptive material.

The progression is explicitly **not** raw model output becoming a trusted
action. Grounding verifies allowed references and traceability; it does not make
model prose canonical truth or grant execution permission.

## 6. Canonical authority

- Portfolio owns canonical Portfolio identity, balances, valuation, allocation,
  risk, evidence, and presentation state.
- Morning Meeting owns its canonical report and application composition state.
- AI owns provider-neutral model and interpretation contracts, not canonical
  financial facts.
- Ritual settlement, retrieval, or provenance correlation does not grant
  analytical authority. Its model result re-enters the AI boundary as
  `untrusted_model_execution`.
- Runtime Safety can validate a candidate and bound an execution attempt; it
  creates no Portfolio, Morning Meeting, or analytical authority.

An optional non-authoritative interpretation may be displayed alongside
canonical output. It cannot overwrite, repair, rank, or reconcile canonical
state.

## 7. Ritual boundary

Ritual Gateway owns Ritual-specific concerns:

- Read-only RPC connectivity and chain identity validation.
- Deterministic transaction construction from explicit identities and opaque
  payloads.
- An injected signing boundary without private-key ownership.
- Separate injected authorization, submission, and settlement capabilities.
- Provider-neutral request mapping into a Ritual-owned inference operation.
- Inference invocation, result retrieval, and provenance/identity correlation.
- Mapping a verified correlated result back to an untrusted AI execution result.

The implemented conceptual lifecycle is:

```text
provider-neutral request
  → Ritual mapping
  → transaction construction
  → injected signing boundary
  → explicit submission authorization
  → injected submission
  → settlement
  → injected inference / result retrieval
  → provenance and identity correlation
  → untrusted_model_execution
```

Individual contracts keep construction, signing, submission authorization,
submission, settlement, inference, and retrieval distinct. Capabilities are
injected; the gateway does not discover credentials, wallets, providers, or
models.

Ritual Gateway does not own general AI truth, Portfolio state, Morning Meeting
state, or global autonomous policy. External Ritual verification remains
**INCONCLUSIVE**. Local and injected lifecycle tests do not establish mainnet or
production live-inference verification.

## 8. Runtime Safety

Runtime Safety implements one explicitly started, single-candidate path:

```text
explicit request
  → action candidate (candidate_only, not_authorized, executable: false)
  → explicit injected authorization
      ├─ denied or invalid → zero execution → terminal failure
      └─ authorized
           → operation-local permission (maximumAttempts: 1)
           → injected executor (at most once)
           → completed or failed
  → stop

timeout or capability failure → terminal failure → stop
```

The runtime cannot self-start, discover work or candidates, choose policy,
schedule itself, poll, recurse, plan an action graph, retry, or fall back. It has
no persistent permission, queue, session, cache, or history. The only supported
action kind is the non-mutating `prepare_operator_review`.

Runtime Safety owns provider-neutral candidate, authorization, permission, and
bounded orchestration contracts. It has zero package dependencies and no Ritual
reference. It owns no wallet or private key and grants no live trading,
analytical, canonical, or autonomous authority.

## 9. Dependency direction

Architecture is reinforced by package manifests and package-root exports. An
arrow below means “imports from”:

```text
@cryptodesk-ai/ai                  → @cryptodesk-ai/portfolio
@cryptodesk-ai/news-intelligence   → @cryptodesk-ai/market-intelligence
@cryptodesk-ai/integrations        → @cryptodesk-ai/market-intelligence
@cryptodesk-ai/integrations        → @cryptodesk-ai/news-intelligence
@cryptodesk-ai/intelligence-composition → @cryptodesk-ai/federation
@cryptodesk-ai/intelligence-composition → @cryptodesk-ai/market-intelligence
@cryptodesk-ai/intelligence-composition → @cryptodesk-ai/news-intelligence
@cryptodesk-ai/intelligence-composition → @cryptodesk-ai/portfolio
@cryptodesk-ai/morning-meeting     → @cryptodesk-ai/ai
@cryptodesk-ai/morning-meeting     → @cryptodesk-ai/market-intelligence
@cryptodesk-ai/morning-meeting     → @cryptodesk-ai/news-intelligence
@cryptodesk-ai/openai-runtime      → @cryptodesk-ai/ai
@cryptodesk-ai/ritual-gateway      → @cryptodesk-ai/ai

@cryptodesk-ai/portfolio           → @cryptodesk-ai/federation
@cryptodesk-ai/market-intelligence → @cryptodesk-ai/federation
@cryptodesk-ai/data                → no workspace dependency
@cryptodesk-ai/federation          → no workspace dependency
@cryptodesk-ai/runtime-safety      → no dependency
@cryptodesk-ai/web                 → no workspace dependency
```

The graph is acyclic. Packages expose only their root entry point. In
particular, AI, Portfolio, Morning Meeting, OpenAI Runtime, and Runtime Safety do
not import Ritual Gateway, and Runtime Safety remains dependency-free and
Ritual-free.

The provider-neutral federation contract and its non-authority guarantees are
described in the [Intelligence federation boundary](federation-boundary.md).

## 10. Failure philosophy

Boundary failures are closed and deterministic where the implementation owns
the classification:

- Malformed or inherited configuration and requests fail validation.
- Authorization denial or invalid authorization reaches zero executions.
- Identity mismatch cannot be repaired by a later stage.
- Execution and inference timeouts are operation-local and terminal.
- Invalid provider, Ritual, capability, or retrieval results fail closed.
- OpenAI, CoinGecko, Ritual, application, and Runtime Safety boundaries use
  fixed or bounded public failures instead of returning credential or raw
  provider details where their current contracts enforce sanitization.

There is no hidden retry or provider/model substitution. The RSS provider and
parser use fixed public failures rather than reflecting configured feed URLs,
upstream exception text, or malformed feed content.

## 11. Security posture

Credentials are accepted only at explicit concrete runtime or integration
boundaries that require them. Core domain packages and Runtime Safety do not
discover environment configuration or secrets. Runtime Safety owns no wallet,
private key, transaction implementation, or network executor.

The repository uses bounded execution, identity correlation, exact result
shapes, sanitized failure contracts, and no hidden autonomous loop. Repository
security review uses local inspection and does not require uploading source to
an external secret scanner.

See the [Security Policy](../../SECURITY.md) for private reporting and safe
testing expectations.

## 12. Current implementation status

### Implemented and locally verified

- Deterministic market, news, Portfolio, and Morning Meeting foundations.
- CoinGecko and RSS/Atom adapters with injected fetch boundaries.
- Provider-neutral AI execution, candidate, grounding, and composition paths.
- An explicitly configured OpenAI runtime adapter.
- Ritual connectivity, transaction, inference, retrieval, and provenance
  contracts composed through injected capabilities.
- A dependency-free, Ritual-free controlled Runtime Safety path with explicit
  authorization and at-most-one execution.
- Local build, type, artifact, boundary, failure, and security regression tests.

### Implemented, external verification incomplete

- Ritual lifecycle boundaries and locally tested injected compositions exist,
  but external Ritual verification remains **INCONCLUSIVE**.

### Not implemented or future work

- Public website or interactive public MVP.
- Production deployment and public package publication.
- Production autonomous operation or self-directed agents.
- Wallet/private-key custody, asset transfer, or live trading execution.
- Autonomous scheduling, polling, work discovery, planning, retry, or fallback.

The repository remains private. A visibility change requires a separately
authorized public-release step.

## 13. Project evolution

CryptoDesk AI grew from deterministic data and integration foundations into
market, news, Portfolio, and Morning Meeting intelligence. Provider-neutral AI
contracts then separated raw execution from candidate parsing and grounded,
non-authoritative interpretation. Concrete OpenAI and Ritual boundaries were
added outside the canonical domains. Runtime Safety later introduced an
explicitly authorized, single-attempt action boundary without connecting model
output directly to financial action. The current phase prepares these
engineering foundations for public review.

Detailed historical evidence remains available in:

- [MVP application boundary](mvp-application-boundary.md)
- [ADR-001: Modular, AI-First Architecture](ADR-001-modular-ai-first-architecture.md)
- [MVP architecture inventory](sprint-9-mvp-architecture-inventory.md)
- [MVP component and dependency map](sprint-9-mvp-component-map.md)
- [MVP integration contract](sprint-9-mvp-integration-contract.md)
- [Sprint 10 Ritual runtime boundary](sprint-10-ritual-runtime-boundary.md)

Those documents record decisions at particular checkpoints. This overview
describes the current public architecture and controls if historical future-tense
wording differs.

## 14. Development principles

Contributors should keep changes small, preserve package-root boundaries, add
focused failure tests, and keep provider-specific behavior outside canonical
domains. New execution capability must remain explicit, injected, identity
bound, bounded, terminal, and unable to promote AI trust or mutate canonical
state by implication.

See [Contributing](../../CONTRIBUTING.md) for the development and review
workflow.
