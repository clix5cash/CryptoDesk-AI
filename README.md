# CryptoDesk-AI

AI Crypto Copilot built on Ritual.

Architecture documentation:

- [ADR-001: Modular, AI-First Architecture](docs/architecture/ADR-001-modular-ai-first-architecture.md)
- [Sprint 9 MVP Architecture Inventory](docs/architecture/sprint-9-mvp-architecture-inventory.md)
- [Sprint 9 MVP Component and Dependency Map](docs/architecture/sprint-9-mvp-component-map.md)
- [Sprint 9 MVP Integration Contract](docs/architecture/sprint-9-mvp-integration-contract.md)
- [Sprint 9 MVP Closure Evidence](docs/architecture/sprint-9-mvp-closure-evidence.md)
- [Sprint 9A MVP Architecture Closure](docs/architecture/sprint-9a-mvp-architecture-closure.md)
- [Sprint 10 Ritual Runtime Boundary](docs/architecture/sprint-10-ritual-runtime-boundary.md)

## MVP release surface

The transport-neutral MVP application entry point is
`DefaultMorningMeetingMvpApplicationApi` from
`@cryptodesk-ai/morning-meeting`. Workspace packages are currently private
build artifacts and expose only their package-root `dist/index` entry points;
no network server, CLI, or publishable deployment artifact is included.

The facade generates one authoritative deterministic Morning Meeting and may
include an explicitly caller-supplied Portfolio AI composition through the
existing non-authoritative lifecycle. It never invokes a provider itself.

Production-like release-candidate tests compose the existing injected
provider-neutral execution seam through parsing, candidate validation,
grounding, caller-supplied composition, and the MVP facade without live
credentials or network access. This repository still provides no deployment,
publishing, server, CLI, or UI artifact. At that checkpoint Sprint 9F remained
open.

Sprint 9F is CLOSED after its release-candidate integration, security,
production-like E2E, artifact, compatibility, and repository validation gates
passed. Sprint 9G owns the final MVP release audit and closure; it has not
started. No package was published or deployed, and Sprint 10 remains out of
scope.

Sprint 9G.1 records the final MVP architecture and release baseline without
changing the implementation: one transport-neutral facade, private package-root
artifacts, an acyclic one-way dependency graph, authoritative canonical output,
and optional caller-supplied non-authoritative AI. Sprint 9G and Sprint 9 remain
open for the later closure increments; Sprint 10 has not started.

Sprint 9G.2 revalidates final MVP acceptance across the public application path,
canonical/AI authority boundary, failure and security matrix, data integrity,
instance isolation, dependency graph, and generated release artifacts. All
acceptance gates pass without a production or test change. Sprint 9G and Sprint
9 remain open for the next planned closure step; no deployment or publishing
has occurred.

Sprint 9G.3 consolidates the complete 9A-9G.2 objective, gap, contract,
security, dependency, artifact, and compatibility evidence without changing
production or test code. It records the caller-owned composition preparation
seam separately from facade execution. Sprint 9G.4 still owns final Sprint 9
closure; Sprint 9 is not yet complete and Sprint 10 has not started.

## Sprint 9 final status

**Sprint 9 — MVP Integration & Release: COMPLETE.**

**Sprint 9G — Final MVP Release Audit & Closure: COMPLETE.** Every final
architecture, integration, authority, trust, security, failure, isolation,
dependency, compatibility, and release-artifact gate passed against the
354-test baseline. No production or test change was required for final closure.

The repository is ready to enter the next frozen roadmap stage, **Sprint 10 —
Ritual & Autonomous Runtime Expansion**, but Sprint 10 has not started. Sprint
9 performed no deployment or publishing and added no transport/server/CLI/UI,
persistence/cache/scheduler, or autonomous/on-chain runtime.

## Sprint 10A.1 architecture boundary

Sprint 10A.1 defines future Ritual integration as a dedicated concrete
`ritual-gateway` service/provider adapter behind the existing AI-owned
provider-neutral execution contract. The future dependency points inward from
the gateway to `@cryptodesk-ai/ai`; Portfolio, AI, Morning Meeting, and the MVP
facade do not depend on Ritual. Ritual execution provenance does not promote AI
trust or canonical authority.

This audit adds no Ritual runtime implementation, network call, credential,
wallet, chain transaction, scheduler, persistence, autonomous behavior,
deployment, publishing, or public transport. Sprint 10A.2 has not started.

Sprint 10A.2 implements the first private `@cryptodesk-ai/ritual-gateway`
service package. Its adapter factory uses only an explicitly injected,
network-independent invocation primitive and maps closed terminal results to
the existing provider-neutral `untrusted_model_execution` contract. It adds no
live Ritual connection, chain transaction, credential, wallet, autonomous
behavior, or change to canonical authority. This established the Sprint 10A.2
baseline.

Sprint 10A.3 closed direct request and runtime configuration validation,
enforced mutually exclusive `completed`/`failed` terminal shapes, and verified
hostile-input rejection, sanitized failure mapping, exactly-once invocation,
detachment, recovery, and independent gateway instances.

**Sprint 10A — Ritual Runtime Foundation: COMPLETE.** The 10A.4 closure audit
passed with 362 tests across nine acyclic workspace packages. Ritual remains an
explicitly injected, network-independent concrete adapter; canonical state
remains authoritative and Ritual output remains `untrusted_model_execution`.
At the Sprint 10A closure checkpoint, Sprint 10B, live Ritual execution,
wallets/signing, scheduling/persistence, autonomous/on-chain execution,
deployment, and publishing had not started.

Sprint 10B.1 defines the next integration boundary without adding execution
capability. Future explicitly authorized 10B implementation attaches only
behind the existing `RitualInferenceInvoker` inside the private gateway: one
caller-selected request, one gateway-owned invocation, one validated terminal
result, and sanitized `untrusted_model_execution` mapping. No live transport,
credential, wallet/signing, settlement, persistence, scheduling, routing,
autonomy, deployment, or publishing was added. That was the Sprint 10B.1
checkpoint.

Sprint 10B.2 implements the first gateway-internal, injected transport adapter
behind that unchanged boundary. It deterministically prepares one detached
closed request, performs exactly one supplied transport call, and decodes one
closed terminal response into the existing sanitized result model. The module
is not package-root exported, and no live Ritual RPC/network, SDK, credential,
wallet, signing, retry, routing, persistence, scheduler, autonomous capability,
deployment, or publishing was added. That was the Sprint 10B.2 checkpoint.

Sprint 10B.3 hardens the internal execution lifecycle around a single Promise
settlement and one provider-neutral mapping. The gateway now snapshots validated
request identity before asynchronous dispatch, ignores structurally impossible
late competing Promise settlements, retains no pending or terminal cache, and
recovers cleanly after every supported failure class. No public export or new
capability was added. That was the Sprint 10B.3 checkpoint.

**Sprint 10B — Ritual Execution Integration: COMPLETE.** The 10B.4 closure
audit passed with 367 tests across nine acyclic private workspace packages. The
final path snapshots validated identity, prepares one gateway-local request,
performs exactly one injected transport call, decodes one closed terminal
result, and returns one sanitized provider-neutral result. Public gateway
contracts remain unchanged and transport internals remain unexported. Sprint
10C, live Ritual connectivity, autonomous/on-chain capability, deployment, and
publishing have not started.
