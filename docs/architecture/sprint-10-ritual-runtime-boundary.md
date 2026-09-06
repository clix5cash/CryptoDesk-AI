# Sprint 10 Ritual Runtime Boundary

Status: Sprint 10A — Ritual Runtime Foundation COMPLETE

Architecture authority: [ADR-001](./ADR-001-modular-ai-first-architecture.md)

Compatibility baseline: [Sprint 9 MVP Closure Evidence](./sprint-9-mvp-closure-evidence.md)

## Scope

Sprint 10A.1 defines where future Ritual runtime capability may attach to the
closed Sprint 9 architecture. It adds no runtime package, network execution,
credential, chain client, contract, wallet, scheduler, persistence, transport,
autonomy, deployment, or publishing capability.

## Audited existing boundaries

| Boundary                                   | Current owner                            | Contract preserved for Ritual                                                                                           |
| ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Canonical Portfolio facts and presentation | `@cryptodesk-ai/portfolio`               | Sole deterministic analytical authority; no runtime dependency                                                          |
| Provider-neutral preparation and execution | `@cryptodesk-ai/ai`                      | Closed requests/descriptors, explicit provider/model identity, `PortfolioAiModelProviderAdapter`, and untrusted results |
| Concrete provider runtime                  | `@cryptodesk-ai/openai-runtime`          | Reference pattern: inward dependency on AI, runtime-local configuration and transport, sanitized result mapping         |
| Candidate parsing and grounding            | `@cryptodesk-ai/ai`                      | Exact identity/reference validation and the existing trust progression                                                  |
| Application composition and lifecycle      | `@cryptodesk-ai/morning-meeting`         | Caller-supplied composition, canonical authority, optional AI, and stable lifecycle outcomes                            |
| External MVP entry point                   | `DefaultMorningMeetingMvpApplicationApi` | Exactly-one canonical generation; no provider execution                                                                 |

At the 10A.1 audit, the eight-package workspace graph was acyclic. The 10A.2
gateway addition brought the workspace to nine packages without changing that
property. Its relevant legal edges remain Morning Meeting -> AI -> Portfolio,
OpenAI runtime -> AI, and Ritual gateway -> AI. Package exports are root-only,
concrete runtime details do not leak into provider-neutral declarations, and
the canonical No-AI application path is runtime-independent.

## Ritual architectural role

ADR-001 explicitly assigns Ritual-specific code to a dedicated
`ritual-gateway` service and provider adapter. Repository inspection confirms
that this remains the safest role.

Future Ritual integration should be a **concrete runtime/provider adapter** in
the service boundary reserved by the workspace, conceptually
`services/ritual-gateway`. It should implement the existing AI-owned
`PortfolioAiModelProviderAdapter` contract (including the descriptor-aware seam
when needed) and translate one explicit caller-selected Ritual execution into a
validated `PortfolioAiModelExecutionResult`.

Ritual is not:

- a new provider-neutral capability in `@cryptodesk-ai/ai`;
- a Portfolio or Morning Meeting dependency;
- an MVP facade or application lifecycle replacement;
- an autonomous orchestration, scheduling, routing, fallback, or canonical
  computation layer.

No new production package is created in 10A.1. The exact package/service name,
configuration contract, chain operation, and result mapper belong to later
approved implementation work.

## Future dependency and invocation direction

Compile-time dependency direction:

```text
services/ritual-gateway
  -> @cryptodesk-ai/ai
  -> @cryptodesk-ai/portfolio

@cryptodesk-ai/morning-meeting
  -> @cryptodesk-ai/ai
  -> @cryptodesk-ai/portfolio
```

The first chain is transitive: the Ritual gateway should declare AI as its
CryptoDesk dependency and must not import Portfolio directly unless a future
contract demonstrates a strictly necessary runtime-only reason. Ritual SDK,
chain, precompile, receipt, attestation, endpoint, credential, signing, and
vendor types stay inside the gateway.

Runtime invocation remains explicit:

```text
caller/composition root
  -> AI registry resolves an explicitly supplied Ritual provider/model identity
  -> one injected Ritual adapter invocation
  -> runtime-local Ritual operation and validation
  -> provider-neutral untrusted execution result
  -> existing parse/candidate/grounding/composition path
```

Forbidden edges are:

```text
Portfolio -> AI or Ritual
AI -> Ritual gateway
Morning Meeting -> Ritual gateway
Ritual gateway -> Morning Meeting
OpenAI runtime <-> Ritual gateway
```

The MVP facade must continue to receive only an optional caller-supplied,
already-validated composition. It must not discover, select, configure, or
invoke Ritual.

## Ritual lifecycle and trust rules

Ritual may have chain-specific asynchronous commitment, settlement, receipt, or
callback behavior. That lifecycle is runtime infrastructure and must not become
a second Morning Meeting application lifecycle. A future adapter must expose
only the existing provider-neutral execution status/result contract and must
not return a completed result before the runtime has obtained and validated the
corresponding final output.

One explicit adapter invocation remains one application-level provider attempt.
Chain-managed commitment, replay, settlement, or callback transactions are not
application retries and must not cause duplicate parsing, grounding, report
generation, or lifecycle application. Long-running or autonomous Ritual jobs
require a separately approved future boundary; they are not implied by the
existing request/response adapter.

Ritual TEE attestation or on-chain settlement can establish execution
provenance, but it does not establish analytical truth. The only legal
CryptoDesk trust progression remains:

```text
untrusted_model_execution
  -> untrusted_candidate_interpretation
  -> non_authoritative_interpretation
```

No Ritual result may claim trusted model execution, authoritative
interpretation, canonical promotion, canonical repair, recommendation, trading,
prediction, signing, wallet, or transaction authority.

## Security and failure boundary

A future Ritual gateway must own and contain all Ritual-specific configuration
and operational material, including RPC endpoints, executor identities,
precompile/contract addresses, receipts, attestations, transport bodies,
authorization material, encrypted secrets, credentials, wallet/signing data,
and raw execution output. None may enter Portfolio, provider-neutral AI,
Morning Meeting requests/results, compositions, narratives, or public errors.

The adapter must validate plain own-property inputs and exact execution,
provider, and optional model identity; detach inputs and outputs; map failures
to fixed sanitized provider-neutral categories; make no retry or fallback; and
retain no mutable global credential, request, result, job, or provider-selection
state. A failed Ritual call must not contaminate another call or instance.

No credential, environment discovery, endpoint, wallet, private key, or network
configuration is introduced by 10A.1.

## Authority, No-AI, and application implications

Canonical Morning Meeting generation remains authoritative and independent of
Ritual. Ritual output cannot replace or repair identity, network, prices,
values, allocation, risk, coverage, timestamps, provenance, missing-data state,
sections, references, precision, or ordering.

AI and Ritual remain optional. The No-AI path continues to require only the
injected Morning Meeting service and performs no runtime discovery or call.
Existing lifecycle outcomes and exactly-once service/at-most-once lifecycle
semantics remain unchanged.

## Public API and export implications

Sprint 10A.1 changes no public API or export. A future gateway should expose
only its package/service-root factory and the smallest runtime-owned
configuration or injectable transport types required for construction and
testing. It must not re-export Ritual SDK types through `@cryptodesk-ai/ai` or
`@cryptodesk-ai/morning-meeting`, expose credentials through getters/results,
or require consumer deep imports.

The Sprint 9 facade, lifecycle, composition, traceability, provider-neutral AI,
OpenAI runtime, and Portfolio contracts remain backward compatible.

## Conflict audit and deferred decisions

No architectural conflict blocks a future concrete Ritual adapter. The existing
async adapter interface returns a `Promise`, preserves explicit model identity,
supports provider-neutral execution statuses, and already separates raw output
from parsing and grounding.

ADR-001 describes configurable provider selection and possible fallback as
longer-term gateway benefits. The frozen Sprint 9 contract permits only explicit
caller selection and forbids retry/fallback/routing. Therefore 10A work must
retain explicit single-provider, single-attempt behavior unless a later roadmap
decision introduces a distinct, reviewed orchestration policy. This is a scope
guard, not a current defect.

Future implementation must decide, with focused contracts and tests, which
Ritual execution primitive is supported and how its terminal result is obtained
and sanitized. Sprint 10A.1 does not select a precompile, encode a chain call,
define callbacks, manage fees/secrets, or implement autonomous execution.

## Sprint 10A.2 implementation

The implementation now resides in the private root-exported
`@cryptodesk-ai/ritual-gateway` service package under
`services/ritual-gateway`. Its public runtime surface is:

- `createRitualPortfolioModelProviderAdapter`;
- `RitualRuntimeConfiguration` with one required opaque `targetId`;
- `RitualInferenceInvoker` and its closed invocation/result contracts;
- `RitualInferenceStatus` and `RitualInferenceFailureKind`.

The factory implements both existing adapter execution seams. It serializes the
validated context or prompt document into a runtime-owned payload, invokes the
required injected function exactly once, validates exact execution/provider/
optional-model/target identity, and maps only terminal completed or failed
results. Completed text remains opaque `untrusted_model_execution`; runtime
failure, timeout, thrown invocation, malformed result, and identity mismatch
become fixed sanitized provider-neutral failures.

No AI, Morning Meeting, or Portfolio contract changed. No default transport,
network, chain, credential, wallet, signing, scheduler, persistence, retry,
fallback, routing, deployment, publishing, or autonomous behavior exists.
This established the Sprint 10A.2 baseline.

## Sprint 10A.3 hardening

The gateway now validates both its closed runtime configuration and the legacy
direct execution request before payload serialization or invocation. It reuses
the authoritative provider-neutral request validator, so empty or substituted
identities, unknown fields, inherited/prototype-shaped records, and malformed
nested canonical context fail before the injected runtime seam is reached.

An invocation has exactly one terminal shape. `completed` requires non-empty
opaque output and forbids a failure field; `failed` requires one closed
runtime-owned failure kind and forbids output. Unknown, missing, mixed, or
identity-substituted terminal records map to the fixed sanitized
`ritual_result_invalid` or `ritual_identity_mismatch` provider-neutral failure.
Timeout remains an explicitly injected terminal failure mapped to
`ritual_timeout`; the adapter creates no timer, cancellation signal, pending
state, retry, fallback, or re-entry. External cancellation would require a
separately approved additive boundary and is deferred.

Configuration, invocation input, and mapped results remain detached. Factory
instances retain only their own detached target and injected function; they
share no credential placeholder, request/result state, failure state, cache,
registry, or provider selection. Runtime failure codes stay owned by this
concrete package and cross the AI seam only as existing sanitized failed-result
fields. No live transport or other 10A.4 capability has started.

## Sprint 10A closure evidence

| Stage | Objective and implementation boundary                                                                                                        | Closure evidence                                                                                                                                                       | Unresolved defects |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 10A.1 | Define Ritual as a concrete runtime/provider adapter outside AI, Portfolio, Morning Meeting, and the MVP facade.                             | Architecture, dependency, authority, trust, export, and security audit against the closed Sprint 9 baseline.                                                           | None               |
| 10A.2 | Add private `@cryptodesk-ai/ritual-gateway`, the existing provider-neutral adapter seam, and one deterministic injected execution primitive. | Exact identity, opaque output, `untrusted_model_execution`, exactly-one invocation, sanitized failure, detachment, failed-call recovery, export, and dependency tests. | None               |
| 10A.3 | Close direct request/configuration validation and make `completed`/`failed` terminal shapes mutually exclusive.                              | Hostile/prototype input, malformed/mixed result, timeout, sanitization, independent-instance, detachment, exactly-once, and recovery tests.                            | None               |
| 10A.4 | Audit the complete runtime foundation without extending capability.                                                                          | Nine-package acyclic traversal, root/deep-export audit, source/declaration/artifact security scan, forced and regular builds, and the full 362-test suite.             | None               |

Every Sprint 10A acceptance gate passes. Ritual remains a concrete,
instance-scoped adapter with explicit configuration and one injected invocation.
Invalid input invokes nothing; accepted input invokes exactly once. Execution,
provider, optional model, and target identities remain exact. `completed` and
`failed` are the only mutually exclusive terminal forms; timeout is a terminal
failure, and external cancellation remains deferred. Runtime-specific failure
codes cross the existing AI boundary only through sanitized provider-neutral
failed results.

The final legal foundation path is:

```text
validated provider-neutral AI request
  -> @cryptodesk-ai/ritual-gateway adapter
  -> detached, explicitly supplied runtime configuration
  -> exactly one injected invocation
  -> validated completed or failed terminal result
  -> sanitized provider-neutral result
  -> untrusted_model_execution
```

The factory, runtime configuration, injected invocation/result contracts, and
closed terminal enums remain the only package-root surface. Validators and
implementation helpers remain internal, deep imports remain blocked, and the
generated declarations contain no concrete network, SDK, credential, wallet,
or signing type. Inputs, results, invokers, targets, and failures remain isolated
per instance with no module-level mutable state, cache, registry, persistence,
or provider-selection state.

Sprint 10A intentionally provides no live Ritual network/RPC call, chain
transaction submission, SDK integration, wallet/private key/signing, receipt or
attestation settlement, external cancellation, autonomous loop, scheduler,
persistence, routing/fallback, provider auto-selection, autonomous trading,
Portfolio mutation, recommendation authority, transport/server/UI/CLI,
deployment, or publishing. Canonical Portfolio and Morning Meeting state remain
authoritative; Ritual output remains optional and `untrusted_model_execution`.

**Sprint 10A — Ritual Runtime Foundation: COMPLETE.** The verified closure
baseline is 362 passing tests across nine acyclic workspace packages. Sprint
10B has not started, live Ritual execution has not started, and no autonomous or
on-chain capability has started.
