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
publishing had not started at that closure checkpoint.

Sprint 10C.1 defines the next connectivity contract without implementing it.
Future live connectivity belongs solely in a gateway-owned implementation of
the existing `RitualInferenceInvoker`, with explicit instance configuration,
one network attempt, private protocol encoding/decoding, operation-local timeout
cleanup, and sanitized failure mapping. Provider-neutral contracts and package
exports are unchanged. No live RPC/network, SDK, credential, wallet/signing,
settlement, routing, scheduling, persistence, or autonomy was added.

Sprint 10C.2 adds one explicit, read-only live connectivity operation at the
gateway root: `createRitualLiveRpcConnectivityChecker`. It validates Ritual
chain ID `1979` through one `eth_chainId` HTTP JSON-RPC request with closed
response validation and sanitized failure results. This is **live RPC
connectivity only**: no live inference, transaction submission, wallet/signing,
credential discovery, retry/fallback, or autonomous behavior was added. The
existing provider adapter and injected `RitualInferenceInvoker` remain the only
inference seam.

Sprint 10C.3 hardens that connectivity lifecycle. The timeout now covers both
the HTTP attempt and bounded streaming response consumption; response bytes are
limited before full buffering. Concurrent calls use independent controllers,
timers, response readers, and terminal results. Late settlement, response-read
failure, malformed UTF-8, hostile JSON-RPC, and every supported failure category
remain sanitized and isolated. The single optional external `eth_chainId`
smoke check timed out after 15 seconds without a response and is recorded as
INCONCLUSIVE, not repository failure. Live inference remains unimplemented.

**Sprint 10C — Ritual Live Connectivity Foundation: COMPLETE.** Sprint 10C.4
revalidated the full gateway-owned path with 379 passing tests, including
overlapping success/success, success/failure, and success/timeout isolation.
The artifact audit also strips the package-private injected HTTP test seam and
its `AbortSignal` types from generated declarations. The build, dependency,
export, artifact, security, and backward-compatibility gates passed. External
live-chain verification remains INCONCLUSIVE because the
10C.2 and 10C.3 read-only smoke requests timed out; no externally verified
live-chain success or live inference is claimed. Sprint 10D has not started.

## Frozen remaining Sprint 10 roadmap

The Owner and Tech Lead have frozen the remaining roadmap as Sprint 10D —
Ritual Inference Transaction Foundation, Sprint 10E — Ritual Live Inference
Integration, and Sprint 10F — Autonomous Runtime Safety Foundation. The exact
10D.1–10F.4 scope and global governance constraints are recorded in the
[Sprint 10 Ritual Runtime Boundary](docs/architecture/sprint-10-ritual-runtime-boundary.md#frozen-remaining-sprint-10-roadmap).

This governance update starts none of that work: Sprint 10D and Sprint 10D.1
remain **NOT STARTED**.

Sprint 10D.1 now establishes the gateway-owned transaction/signing boundary
using only an explicitly injected signer capability over an already prepared
opaque payload. It adds no transaction construction, real wallet/key signing,
broadcast, receipt handling, settlement, or live inference. The boundary is
closed, detached, exactly-once, sanitized, and independent of provider-neutral
and canonical domains. **Sprint 10D.1 — Transaction & Signing Boundary:
COMPLETE.** Sprint 10D remains open and Sprint 10D.2 has not started.

Sprint 10D.2 adds deterministic gateway-owned construction from explicit chain,
target, signer, execution, and opaque payload input into a detached signable
gateway envelope compatible with the 10D.1 boundary. It performs no signing,
broadcast, network lookup, nonce/gas/fee discovery, receipt handling,
settlement, or inference. **Sprint 10D.2 — Ritual Inference Transaction
Construction: COMPLETE.** Sprint 10D remains open and Sprint 10D.3 has not
started.
