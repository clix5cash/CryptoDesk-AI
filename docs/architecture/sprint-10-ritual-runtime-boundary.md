# Sprint 10 Ritual Runtime Boundary

Status: Sprint 10A COMPLETE; Sprint 10B COMPLETE; Sprint 10C COMPLETE; Sprint 10D COMPLETE; Sprint 10E COMPLETE; Sprint 10F.1–10F.2 COMPLETE

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

Sprint 10A established Ritual as a **concrete runtime/provider adapter** and
implemented it in `services/ritual-gateway`. It implements the existing
AI-owned `PortfolioAiModelProviderAdapter` contract, including the
descriptor-aware seam, and translates one explicit caller-selected Ritual
execution into a validated `PortfolioAiModelExecutionResult`.

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
baseline is 362 passing tests across nine acyclic workspace packages. At that
closure checkpoint Sprint 10B had not started, live Ritual execution had not
started, and no autonomous or on-chain capability had started.

## Sprint 10B.1 execution integration boundary

Sprint 10B extends only the concrete gateway side of the frozen boundary. The
integration point is the existing root-exported `RitualInferenceInvoker` passed
to `createRitualPortfolioModelProviderAdapter`; it is not a new provider-neutral
interface, application facade, or orchestration service.

Ownership is fixed as follows:

| Concern                                                                                                                    | Owner                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Canonical Portfolio and Morning Meeting facts                                                                              | Existing Portfolio and Morning Meeting packages                 |
| Provider-neutral request/result validation and explicit provider/model selection                                           | `@cryptodesk-ai/ai` and its caller                              |
| Optional interpretation preparation and composition                                                                        | Existing caller-owned AI pipeline and Morning Meeting lifecycle |
| Ritual configuration, target, request encoding, invocation mechanism, runtime terminal validation, and detail sanitization | `@cryptodesk-ai/ritual-gateway`                                 |
| Credential, endpoint, authorization, chain, receipt, attestation, or vendor material if later authorized                   | Concrete gateway runtime only; never provider-neutral output    |

The legal execution contract is:

```text
explicit caller-selected provider/model request
  -> provider-neutral validation and detached dispatch
  -> Ritual adapter with detached instance-owned configuration
  -> exactly one RitualInferenceInvoker call
  -> gateway-owned invocation/transport operation
  -> exactly one validated completed or failed terminal envelope
  -> sanitized provider-neutral Completed or Failed result
  -> untrusted_model_execution
```

Execution, provider, optional model, and target identities must remain exact.
The gateway may not generate, infer, default, repair, or substitute them.
`completed` requires opaque non-empty output and no failure field. `failed`
requires one closed runtime-owned failure kind and no output. Timeout remains a
terminal failed result. Unknown, incomplete, mixed, prototype-shaped, or
identity-conflicting results fail closed. Runtime phases such as submission or
settlement, if later authorized, remain internal and must not create a second
AI or Morning Meeting lifecycle.

One accepted adapter execution owns one explicit provider attempt. Internal
transport mechanics may not trigger another adapter execution, provider/model
selection, retry, fallback, routing, parser, grounding operation, composition,
or report generation. Invalid input invokes nothing. Failure returns no partial
successful result and cannot affect a later call or another gateway instance.

### Permitted during Sprint 10B

Subject to an explicit later 10B task, the gateway may add the smallest
runtime-owned implementation behind `RitualInferenceInvoker`: closed explicit
configuration, request encoding, one-shot invocation, terminal-response
decoding and validation, runtime-local timeout cleanup, sanitized mapping, and
deterministic injected tests. Any live connection, chain-specific structure, or
credential mechanism requires separate authorization and must remain private to
the gateway. It may not change provider-neutral AI contracts merely to expose a
Ritual implementation detail.

Sprint 10B.1 itself adds no executable capability. It does not select a Ritual
precompile, endpoint, executor discovery mechanism, SDK, RPC client, credential,
wallet, signing mechanism, chain submission, receipt parser, or settlement
tracker.

### Deferred beyond Sprint 10B.1

Wallet/private-key/signing, chain transaction authority, receipt or attestation
settlement, credential acquisition, environment discovery, persistence,
scheduling, autonomous loops, provider routing/fallback, automatic selection,
Portfolio mutation, trading or recommendation authority, public
transport/server/UI/CLI, deployment, and publishing remain deferred to later
explicit Sprint 10 work. External cancellation also remains deferred because it
would require a reviewed additive contract.

Canonical output remains authoritative and usable without AI or Ritual. Ritual
output remains opaque `untrusted_model_execution`; later parsing and grounding
may only produce the established non-authoritative interpretation. Runtime
provenance, settlement, or attestation must never promote analytical trust,
repair missing facts, or alter identity, values, risk, coverage, timestamps,
provenance, precision, ordering, or lifecycle state.

The compile-time dependency remains strictly:

```text
@cryptodesk-ai/ritual-gateway -> @cryptodesk-ai/ai -> @cryptodesk-ai/portfolio
```

AI, Portfolio, Morning Meeting, OpenAI runtime, and the MVP facade must not
depend on the Ritual gateway. The gateway root export remains the only consumer
surface; internal modules, future transport structures, configuration secrets,
raw runtime bodies, exception text, stacks, endpoints, and vendor details must
not cross it.

## Sprint 10B.2 internal transport adapter

The concrete implementation now delegates each accepted adapter execution to
`src/ritual-inference-transport.ts`, an internal gateway module behind the
unchanged root-exported `RitualInferenceInvoker` seam. No transport type or
helper was added to the package-root surface.

The gateway owns this sequence:

```text
validated and detached Ritual invocation
  -> closed gateway-local transport-request preparation
  -> exactly one explicitly injected transport call
  -> closed gateway-local terminal-response decoding
  -> existing sanitized Ritual adapter mapping
  -> provider-neutral Completed or Failed result
```

Preparation preserves execution, provider, optional model, and target identity
exactly and copies the opaque payload without interpreting it. The internal
request is a plain own-property record; it is independently detached before the
supplied transport receives it. No discovery, environment lookup, canonical
processing, candidate parsing, or grounding occurs.

The decoder accepts only mutually exclusive `completed` and `failed` terminal
records with exact own fields and exact identity. Missing or unknown status,
mixed terminal fields, malformed nested values, inherited/prototype-shaped
records, unknown fields, and identity or target substitution fail closed. A
transport throw becomes the existing fixed `ritual_invocation_failed` result;
invalid and mismatched responses use the existing fixed sanitized result codes.
Exception text, request and response bodies, target internals, headers,
credentials, endpoint details, stacks, and vendor details are not propagated.

One accepted adapter call produces exactly one injected transport call. Invalid
adapter or prepared transport input produces zero calls. There is no retry,
fallback, routing, provider selection, recursion, re-entry, or retained mutable
transport state. Separate adapters and supplied transports remain independent.
Timeout remains an injected `failed` terminal response mapped to
`ritual_timeout`; 10B.2 adds no timer or external-cancellation contract.

This is still network-independent infrastructure. No default/live Ritual
RPC/network transport, SDK integration, wallet/private key/signing, chain
submission, receipt or attestation settlement, process environment discovery,
persistence, scheduler, autonomous loop, deployment, publishing, server, CLI,
or UI exists. Ritual output remains opaque `untrusted_model_execution`, and
canonical Portfolio and Morning Meeting authority is unchanged. That was the
Sprint 10B.2 checkpoint.

## Sprint 10B.3 execution lifecycle hardening

Lifecycle ownership remains entirely inside the concrete gateway. One accepted
adapter request is snapshotted before asynchronous dispatch, produces one
internal transport call, observes the first and only settlement of the supplied
Promise, performs one terminal decode, and returns one provider-neutral result.
The transport Promise exposes no callback registry or pending public object, so
duplicate or incompatible late resolution/rejection attempts are structurally
ignored by JavaScript Promise settlement and cannot cause a second mapping.

`completed` and `failed` remain the only terminal response shapes. Timeout is a
final failed response, not a pending state; it cannot later become completed.
Likewise, a thrown transport, malformed result, prototype-shaped result, or
identity/target mismatch is final for that call and cannot be repaired by a
second result. There is no retry, fallback, route switch, replay, recursive
entry, background work, or additional provider-neutral failure taxonomy.

After mapping, the gateway retains no timer, invocation, request or response
body, exception, target detail, pending lifecycle object, or terminal cache.
The decoded outcome contains only newly created primitive terminal data. The
adapter's validated request snapshot prevents caller mutation during an
in-flight transport from changing settled execution or model identity. Mutating
transport input, runtime response, or returned provider-neutral output cannot
affect caller-owned input or a later execution.

Regression coverage verifies first-settlement finality, exactly-one invocation,
exactly-one result mapping, in-flight caller mutation isolation, independent
instances, and clean recovery after timeout, thrown transport, malformed result,
execution mismatch, target mismatch, invalid request, and prototype-shaped
result. Trust remains `untrusted_model_execution`, and canonical authority is
unchanged.

No public export was added. No timer or external cancellation, live Ritual
network/RPC, SDK networking, wallet/private key/signing, process environment
discovery, scheduler, persistence, routing/fallback, provider auto-selection,
autonomous/on-chain execution, deployment, publishing, server, CLI, or UI was
introduced. That was the Sprint 10B.3 checkpoint.

## Sprint 10B closure evidence

| Stage | Objective and implementation boundary                                                                                          | Acceptance evidence                                                                                                                                                                                                        | Unresolved defects |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 10B.1 | Fix execution ownership at the existing gateway adapter/invoker seam and define permitted and deferred integration capability. | Architecture, dependency, authority, security, identity, lifecycle, export, and compatibility audit; no executable transport added.                                                                                        | None               |
| 10B.2 | Add one private, deterministic transport preparation/invocation/decoding layer behind the unchanged invoker contract.          | Closed request and terminal decoding, exactly-one injected call, timeout/failure mapping, sanitization, detachment, recovery, root-export, and deep-import tests.                                                          | None               |
| 10B.3 | Harden settlement, mutation resistance, failure finality, and state isolation.                                                 | Pre-dispatch request snapshot; first-Promise-settlement, caller-mutation, failure-recovery, instance-isolation, and no-retained-state evidence. The discovered caller-mutation race was fixed and has regression coverage. | None               |
| 10B.4 | Audit and close the complete execution integration without extending runtime capability.                                       | Nine-package forced build, full 367-test suite, acyclic traversal, root/deep-export checks, declaration/artifact audit, source security scan, and compatibility validation.                                                | None               |

Every Sprint 10B acceptance gate passes. The final implemented path is:

```text
validated provider-neutral AI request
  -> detached request snapshot
  -> @cryptodesk-ai/ritual-gateway adapter
  -> gateway-local closed request preparation
  -> exactly one injected transport invocation
  -> one closed completed or failed terminal decode
  -> deterministic sanitized provider-neutral result
  -> untrusted_model_execution
```

The gateway remains the sole concrete Ritual boundary. Request identity and the
opaque payload are captured before asynchronous dispatch. Execution, provider,
optional model, and target identity remain exact. One Promise supplies one
observable settlement and one mapping; invalid input invokes nothing. Timeout,
runtime failure, thrown transport, malformed or mixed results, unknown status,
prototype-shaped data, and identity conflicts are terminal, sanitized,
non-retrying, and isolated from later calls and other instances.

The gateway retains no pending lifecycle object, request/response/exception
history, target state beyond immutable instance configuration, terminal cache,
global registry, provider-selection state, persistence, or background replay.
The public gateway contracts established in Sprint 10A remain unchanged. The
transport module and implementation helpers remain package-private, deep imports
are blocked, and root declarations contain no transport/lifecycle internals.

The verified closure baseline is 367 passing tests across nine private,
acyclic workspace packages. Generated output contains 100 JavaScript files, 100
declarations, and 100 valid declaration maps. Root exports resolve; no test or
secret fixture entered gateway runtime artifacts; provider-neutral declarations
contain no Ritual implementation type; and no deploy/publish script exists.

Sprint 10B intentionally provides no live Ritual RPC/network or SDK transport,
chain transaction, wallet/private key/signing, receipt or attestation settlement,
external cancellation, scheduler, persistence, cache, routing/fallback,
provider auto-selection, autonomous loop, autonomous trading, Portfolio or
Morning Meeting mutation, canonical or recommendation authority, deployment,
server, UI, CLI, or publishing. Canonical Portfolio and Morning Meeting state
remain authoritative; Ritual output remains `untrusted_model_execution`.

**Sprint 10B — Ritual Execution Integration: COMPLETE.** At that closure
checkpoint Sprint 10C, live Ritual connectivity, and autonomous/on-chain
capability had not started.

## Sprint 10C.1 live-connectivity boundary

Sprint 10C.1 authorizes architecture definition only. Repository evidence
identifies the existing root-exported `RitualInferenceInvoker` as the narrowest
future live-connectivity seam. A later explicitly authorized task may implement
a gateway-owned invoker behind that unchanged function contract. It must not
replace the adapter, expose a second provider-neutral execution interface, or
move connectivity into AI, Portfolio, Morning Meeting, or OpenAI runtime.

The proposed future path is:

```text
explicit caller composition
  -> validated provider-neutral AI request
  -> existing Ritual adapter and detached identity snapshot
  -> existing gateway-local transport request preparation
  -> exactly one configured RitualInferenceInvoker call
  -> future gateway-owned live invoker implementation
  -> exactly one runtime/network attempt
  -> gateway-local protocol response decoding and sanitization
  -> existing closed completed or failed terminal validation
  -> existing provider-neutral Completed or Failed mapping
  -> untrusted_model_execution
```

This path does not make the MVP facade or AI registry responsible for choosing
or invoking Ritual autonomously. The caller must still explicitly construct and
select the concrete adapter through the existing provider-neutral composition
mechanism.

### Connectivity ownership

| Concern                                                          | Required future owner and rule                                                                                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider and model selection                                     | Existing caller and provider-neutral AI validation; never inferred by the gateway                                                                                                                           |
| Target identity                                                  | Existing detached `RitualRuntimeConfiguration.targetId`; copied exactly into each invocation and never discovered or repaired                                                                               |
| Endpoint and protocol configuration                              | A future gateway-local, instance-scoped live-invoker configuration supplied explicitly by construction; never an AI contract or environment lookup                                                          |
| Authentication or credentials, if a later protocol requires them | Explicit instance construction inside the concrete gateway only; held in the live-invoker closure and excluded from requests, results, errors, logs, and declarations outside its supported runtime surface |
| Provider-neutral payload serialization                           | Existing Ritual adapter, which serializes only already validated repository-owned context or prompt data into opaque text                                                                                   |
| Protocol/RPC request serialization                               | Future live invoker inside `@cryptodesk-ai/ritual-gateway`; chain-, SDK-, endpoint-, header-, and vendor-specific shapes remain private                                                                     |
| Network/RPC invocation                                           | Future live invoker only, through one runtime-local operation per accepted invocation; no default is authorized in 10C.1                                                                                    |
| Timeout                                                          | Future live-invoker configuration and operation scope; opt-in, instance-local, one terminal failure, cleaned in `finally`, and never a retry trigger                                                        |
| External cancellation                                            | Deferred because the frozen provider-neutral and Ritual invoker contracts expose no caller cancellation signal                                                                                              |
| Protocol response decoding                                       | Future live invoker first converts the private response to the existing closed Ritual terminal result; the existing internal transport decoder then validates terminal shape and exact identity             |
| Failure sanitization                                             | Future live invoker removes protocol/network details; existing gateway mapping emits only the established fixed provider-neutral failure codes/messages                                                     |
| Lifecycle and cleanup                                            | Future live invoker owns operation-local client response, abort/timer, authorization, and exception state and releases it at terminal settlement; existing adapter retains no call history                  |
| Canonical facts and AI trust                                     | Existing Portfolio, Morning Meeting, and AI layers; connectivity can produce only opaque `untrusted_model_execution`                                                                                        |

The future live invoker must validate its explicit configuration as a closed
plain own-property record. Endpoint syntax and protocol constraints belong to
that concrete implementation once the actual connectivity mechanism is
authorized; 10C.1 deliberately does not choose an RPC URL, precompile, SDK,
chain client, authentication scheme, receipt shape, or settlement model.
Configuration must remain detached, immutable by convention, and local to one
invoker instance. It may not use `process.env`, global discovery, a singleton,
or a provider registry.

One accepted adapter request must still create one invocation and one observable
terminal mapping. The future invoker may perform only one selected network/RPC
attempt. A transport exception, timeout, non-success response, malformed body,
protocol error, or identity conflict must settle as one sanitized failure. It
must not retry, fall back, route, switch endpoint/provider/model, enqueue work,
or allow a late result to replace a terminal failure. Operation-local timers,
abort mechanisms, response bodies, and exceptions must be released after
settlement and must not contaminate later calls or another instance.

No new public API is added by 10C.1. A later implementation should prefer one
minimal additive gateway-root factory plus only the configuration type necessary
to construct the live invoker. Low-level RPC/HTTP/SDK request and response types,
clients, headers, credentials, decoders, error classes, and cleanup helpers must
remain internal and blocked from deep import. The existing injected invoker path
must remain available for deterministic tests and backward compatibility.

Ritual execution provenance or future settlement evidence cannot promote model
output beyond `untrusted_model_execution`. Existing parsing and grounding may
still produce only `untrusted_candidate_interpretation` and
`non_authoritative_interpretation`. Connectivity cannot mutate, repair, infer,
or replace Portfolio or Morning Meeting identity, values, risk, coverage,
timestamps, provenance, missing-data state, precision, ordering, or lifecycle.

Sprint 10C.1 adds no live Ritual RPC/network call, SDK networking, credential or
environment discovery, wallet/private key/signing, chain submission, receipt or
attestation settlement, retry/fallback/routing, provider auto-selection,
scheduler, persistence/cache, autonomous loop, canonical/trading/recommendation
authority, deployment, server, UI, CLI, or publishing.

## Sprint 10C.2 live HTTP RPC connectivity

Sprint 10C.2 implements only the read-only connectivity portion of the 10C.1
boundary. Authoritative protocol evidence used is:

- Ritual's official developer skills identify Ritual Chain ID as decimal `1979`
  and the public HTTP RPC as `https://rpc.ritualfoundation.org`;
- Ethereum JSON-RPC defines `eth_chainId` as a read-only method returning the
  current chain ID as a hexadecimal quantity;
- Ritual's official overview and LLM guidance describe LLM precompile work as an
  asynchronous transaction lifecycle involving commitment, executor
  fulfillment, replay, and settlement.

The first two facts permit a safe read-only connectivity check. The third means
that live inference requires transaction/signing capability outside 10C.2.
Consequently no precompile address, ABI, selector, inference request, receipt,
or transaction behavior is implemented or guessed.

The supported current operation is:

```text
explicit RitualLiveRpcConfiguration
  -> createRitualLiveRpcConnectivityChecker
  -> one operation-local POST eth_chainId JSON-RPC request
  -> closed hostile-response validation
  -> connected(chainId: 1979) or one sanitized fixed failure
```

`RitualLiveRpcConfiguration` is a closed, plain, detached, instance-owned
record. It requires an explicit HTTPS endpoint with no embedded URL credentials
or fragment, requires `expectedChainId: 1979`, and optionally accepts a positive
integer `timeoutMs`. There is no default endpoint, environment discovery,
authorization handling, mutable singleton, or cache. The configured endpoint is
operator-owned runtime configuration, not caller-controlled analytical input.

Each accepted `check()` creates one deterministic JSON-RPC request ID, performs
exactly one POST, rejects redirects, and observes exactly one terminal result.
Timeout uses an operation-local `AbortController` and timer that is cleared in
`finally`; it cannot cause retry or late replacement. HTTP failure, transport
exception, timeout, oversized response, malformed JSON, mismatched request ID,
invalid JSON-RPC version, mixed/neither result and error, malformed RPC error,
wrong chain, unknown fields, and prototype-shaped structures all fail closed.
Public results contain only fixed status/failure enums and never the endpoint,
headers, request body, response body, RPC message, exception, or stack.

The only additive root surface is the live connectivity factory plus its small
configuration/checker/result/failure contracts. HTTP shapes, fetch adapter,
JSON-RPC records, decoder, timeout sentinel, response-size limit, and injected
test transport remain gateway-private; package deep imports remain blocked.
The existing injected inference adapter contract is unchanged.

This checkpoint is **live RPC connectivity only**. It does not claim live
Ritual inference. Inference is explicitly deferred because the authoritative
documented path requires transaction submission/signing, which 10C.2 forbids.
Also absent are WebSocket support, SDK networking, credentials, wallet/private
key/signing, chain mutation, receipt/attestation settlement, external
cancellation, retry/fallback/routing, provider auto-selection, polling,
scheduler, persistence/cache, autonomous/on-chain execution, canonical or
trading authority, deployment, server, UI, CLI, and publishing. Sprint 10C.3
had not started at that checkpoint.

## Sprint 10C.3 connectivity lifecycle hardening

Sprint 10C.3 preserves the 10C.2 public contract and hardens its private
operation lifecycle:

```text
detached instance configuration
  -> operation-local request + AbortController + optional timer
  -> exactly one HTTP transport call
  -> one bounded streaming body-read path
  -> one closed JSON-RPC decode
  -> one sanitized terminal connectivity result
  -> timer/reader/request state released
```

The timeout races the complete RPC attempt, including response-body
consumption—not merely receipt of HTTP headers. It aborts only that operation,
is cleared in `finally`, cannot trigger retry or fallback, and cannot be
replaced by a late transport resolution. An injected transport that ignores
abort may settle its own Promise later, but the already-returned public result
is immutable by ownership and no second decode or mapping is observed.

Response size is now enforced while streaming. The reader counts bytes before
copying each chunk, cancels once the 16 KiB bound is exceeded, buffers at most
the accepted limit, and uses fatal UTF-8 decoding. This closes the 10C.2 defect
where `response.text()` could allocate an unbounded body before the length check.
Null bodies, invalid chunks, malformed UTF-8, read exceptions, malformed JSON,
and hostile JSON-RPC remain deterministic sanitized failures. HTTP failure
bodies are cancelled without being parsed or exposed.

Concurrent checks share only immutable detached configuration and the supplied
transport function. Each creates its own request object, controller, timeout,
reader, response body, and terminal result. The constant operation-local
JSON-RPC ID is safe because each check owns a distinct one-request HTTP exchange
and there is no multiplexed/global response dispatcher. No mutable request
counter, registry, cache, failure history, or provider-selection state is
introduced.

Internal abort is solely a gateway-owned timeout mechanism. The public checker
does not expose `AbortSignal` or `AbortController`, and no cancellation contract
enters AI, Portfolio, Morning Meeting, or OpenAI runtime. External caller
cancellation remains deferred.

Endpoint validation remains a deliberately narrow operator-configuration
boundary: explicit HTTPS only, non-empty hostname, no whitespace/control
characters, URL username/password, fragment, redirect following, environment
lookup, or default endpoint. This is not a generic DNS/IP SSRF firewall and no
allowlist was added.

Focused tests prove concurrent timeout/success isolation, independent abort
state, late-settlement finality, timeout across body consumption, bounded-body
cancellation, strict UTF-8 rejection, response-reader failure sanitization,
configuration detachment, endpoint rejection, per-category recovery, instance
isolation, exact one-call accounting, and root-export containment.

The single optional external 10C.3 smoke request used only `eth_chainId` against
the documented Ritual RPC and timed out after 15 seconds without a protocol
response. Its status is **INCONCLUSIVE** and independent of deterministic
repository validation; no successful live-chain result is claimed.

Sprint 10C.3 adds no live inference, wallet/private key/signing, transaction or
chain mutation, settlement/receipt handling, credentials/environment discovery,
retry/fallback/routing, provider auto-selection, scheduler, persistence/cache,
autonomous/on-chain execution, canonical/trading/recommendation authority,
deployment, server, UI, CLI, or publishing. Sprint 10C.4 had not started at that
checkpoint.

## Sprint 10C.4 final closure

Sprint 10C traceability is closed as follows:

| Stage | Objective and implementation boundary                                                                                                                                                                    | Acceptance evidence                                                                                                                                                                                                   | Defects and unresolved items                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10C.1 | Define live-connectivity ownership at the existing gateway seam without executable network capability. Endpoint, protocol, authentication, timeout, cleanup, and private/public ownership were recorded. | Architecture, dependency, authority, security, and export audit against the frozen Sprint 10B baseline.                                                                                                               | No defect. Live connectivity intentionally remained unimplemented.                                                                                                               |
| 10C.2 | Add the gateway-owned read-only HTTP JSON-RPC checker with explicit configuration, one `eth_chainId` attempt, closed response validation, timeout, and sanitized results.                                | Deterministic endpoint, request, chain-ID, exactly-once, timeout, hostile-response, recovery, isolation, and export tests.                                                                                            | External smoke check timed out and remained INCONCLUSIVE. Live inference was correctly deferred.                                                                                 |
| 10C.3 | Harden operation lifecycle, concurrency, endpoint validation, bounded response handling, finality, and failure isolation.                                                                                | Streaming-limit, strict UTF-8, response-read failure, concurrent timeout/success, late settlement, per-category recovery, configuration detachment, and security tests.                                               | Fixed the response-body defect where the old post-`text()` size check occurred after unbounded buffering. External smoke remained INCONCLUSIVE. No unresolved repository defect. |
| 10C.4 | Audit and close the complete live-connectivity foundation without expanding protocol capability.                                                                                                         | 379-test workspace suite; overlapping success/success and success/failure coverage; forced nine-package build; dependency, export, declaration, artifact, private-package, source-security, and compatibility audits. | Fixed generated declaration leakage of the package-private injected HTTP test seam through TypeScript internal stripping. External verification remains INCONCLUSIVE.            |

Every applicable Sprint 10C acceptance gate passes. The final verified path is:

```text
explicit detached RitualLiveRpcConfiguration
  -> createRitualLiveRpcConnectivityChecker
  -> operation-local JSON-RPC request, AbortController, and optional timer
  -> exactly one native fetch POST
  -> bounded streaming response read
  -> closed JSON-RPC 2.0 decode
  -> exact eth_chainId == 1979 validation
  -> one sanitized connectivity result
  -> operation-local cleanup
```

The response-body defect remains closed: no `response.text()` call exists in the
live path; the 16 KiB bound is applied to stream chunks before they are copied,
oversized streams are cancelled, raw content is not returned or retained, and a
later valid check is unaffected. Timeout covers fetch and body consumption,
aborts only its own signal, clears its timer in `finally`, and cannot be replaced
by late resolution or rejection. Overlapping success/success, success/failure,
and success/timeout calls use independent requests, controllers, readers, and
terminal results. Separate instances preserve detached endpoints, timeouts,
transports, and failure histories.

The public root continues to expose only the supported adapter/invoker contracts
and the minimal connectivity factory, configuration, checker, result, and fixed
failure kinds. JSON-RPC records, fetch contracts, body reader, decoder, endpoint
validator, timeout/controller machinery, and test transport remain internal;
TypeScript internal stripping prevents the test-only injected transport and its
HTTP/`AbortSignal` types from entering generated declarations, and deep imports
remain blocked. The workspace remains acyclic with
`ritual-gateway -> AI -> Portfolio`, and provider-neutral declarations remain
free of Ritual implementation types.

Sprint 10C intentionally provides no live inference, wallet/private key/signing,
transaction submission, chain mutation, receipt/attestation settlement,
external caller cancellation, credentials/environment discovery,
retry/fallback/routing, provider auto-selection, scheduler, persistence/cache,
autonomous/on-chain execution, canonical/trading/recommendation authority,
deployment, server, UI, CLI, or publishing. The 10C.2 and 10C.3 external
read-only smoke tests timed out without a protocol response, so externally
verified live-chain success is not claimed.

**Sprint 10C — Ritual Live Connectivity Foundation: COMPLETE.** Sprint 10D has
not started.

## Frozen remaining Sprint 10 roadmap

The Owner and Tech Lead approved and froze the remaining Sprint 10 roadmap at
the Sprint 10C closure baseline. This section governs Sprint 10D through 10F;
it records authorized future scope and does not start Sprint 10D.

### Sprint 10D — Ritual Inference Transaction Foundation

- **10D.1 — Transaction & Signing Boundary:** define transaction lifecycle
  ownership and the minimum signer/wallet abstraction. Signing and private-key
  capability must remain isolated from AI, Portfolio, Morning Meeting, and the
  OpenAI runtime. No live transaction submission is authorized. Freeze the
  security, trust, dependency, credential, and canonical-authority boundaries.
- **10D.2 — Ritual Inference Transaction Construction:** implement
  deterministic transaction/request construction; validate chain, target, and
  payload; and fail closed on malformed configuration. Signing remains isolated
  and explicitly supplied. No live broadcast is authorized.
- **10D.3 — Submission & Settlement Lifecycle:** implement exactly-once
  submission semantics and the receipt/settlement lifecycle, including timeout,
  failure, finality, sanitization, recovery, and isolation. Hidden retry,
  fallback, routing, and provider selection remain forbidden.
- **10D.4 — Closure & Release Audit:** perform the complete behavioral,
  regression, security, dependency, export, generated-artifact,
  credential-containment, and release audit. Live transaction success may be
  claimed only when it has actually been verified.

### Sprint 10E — Ritual Live Inference Integration

- **10E.1 — Live Inference Contract:** freeze provider-neutral request/result
  ownership and its mapping into Ritual inference without changing canonical AI
  or Portfolio contracts.
- **10E.2 — Inference Invocation:** connect the authorized Sprint 10D
  transaction lifecycle to Ritual inference with exactly-once invocation and no
  hidden provider/model selection.
- **10E.3 — Result Settlement & Verification:** implement receipt/result
  retrieval, identity, provenance, and lifecycle validation, plus sanitization,
  failure handling, recovery, and concurrency isolation. Ritual model output
  remains `untrusted_model_execution`.
- **10E.4 — Live Inference Closure:** perform the full regression, security,
  and release audit and an external live smoke test when infrastructure permits.
  If official Ritual infrastructure is unavailable, external verification is
  reported as **INCONCLUSIVE**, never simulated or claimed successful.

### Sprint 10F — Autonomous Runtime Safety Foundation

- **10F.1 — Autonomous Authority Boundary:** define what the autonomous runtime
  may propose versus execute while preserving explicit operator authorization
  and canonical Portfolio and Morning Meeting authority.
- **10F.2 — Policy & Execution Guardrails:** implement explicit action
  authorization, allowlists, bounded budget/risk policy, and fail-closed
  execution gates. No implicit signing or trading authority is permitted.
- **10F.3 — Controlled Autonomous Runtime:** implement bounded orchestration
  with explicit authorization, cancellation/finality, recovery, isolation, and
  auditability. Uncontrolled recursion, hidden retry, and unrestricted execution
  remain forbidden.
- **10F.4 — Sprint 10 / Phase Closure:** perform complete security, adversarial,
  autonomous-authority, dependency, export, release, and Sprint 8–10 regression
  audits. Update the authoritative architecture, roadmap, Sprint History, and
  Project Bible documentation where those records exist and apply. Sprint 10
  may be declared complete only when every authorized gate passes.

### Global frozen constraints

- `@cryptodesk-ai/ritual-gateway` remains the sole Ritual connectivity and
  runtime owner.
- Required dependency direction remains Ritual Gateway -> AI -> Portfolio. AI,
  Portfolio, Morning Meeting, and the OpenAI runtime must not acquire a reverse
  Ritual dependency.
- Canonical Portfolio and Morning Meeting state remain authoritative. Ritual
  model output remains `untrusted_model_execution` unless a future explicitly
  authorized governance decision changes that rule.
- Hidden `process.env` discovery, credentials, provider auto-selection, routing,
  fallback, retry, scheduler, persistence, and global mutable state remain
  forbidden unless a future frozen scope explicitly authorizes them.
- Credentials and private keys must never enter public results, logs, generated
  artifacts, fixtures, or provider-neutral contracts.
- Mocks and injected transports are never evidence of external Ritual success.
- Valid Sprint 8, Sprint 9, Sprint 10A, Sprint 10B, and Sprint 10C behavior
  remains backward compatible.

At this governance checkpoint, Sprint 10D, including Sprint 10D.1, remains
**NOT STARTED**. No production or test capability is introduced by freezing the
roadmap.

## Sprint 10D.1 transaction and signing boundary

Sprint 10D.1 assigns transaction lifecycle and signing-boundary ownership
exclusively to `@cryptodesk-ai/ritual-gateway`. It introduces the smallest
capability-based signing surface for an already prepared opaque payload:

- `createRitualTransactionSigningBoundary`;
- closed `RitualTransactionSigningConfiguration` containing only a `signerId`;
- closed `RitualTransactionSigningRequest` containing the signing-request and
  signer identities plus an opaque payload;
- an explicitly injected `RitualTransactionSignerCapability` function;
- a closed sanitized `RitualTransactionSigningResult`.

The boundary snapshots configuration and each accepted request, invokes exactly
the supplied capability once, validates exact signing-request and signer
identity, rejects malformed or extra result material, and maps thrown capability
failures to a fixed result without propagating exception details. It has no
default signer, wallet discovery, registry, shared state, hidden selection,
retry, fallback, or routing. Concurrent calls and separate instances retain
independent requests, capabilities, and results.

This capability contract contains no private key, seed phrase, mnemonic, wallet
file, credential, endpoint, or environment configuration. The implementation of
the supplied capability owns any future credential material outside public,
provider-neutral, and canonical contracts. The gateway never logs or returns
that material.

The authorization boundaries are intentionally distinct:

```text
prepared opaque payload
  != authorization to sign
explicit signing capability invocation
  != authorization to submit
signed opaque payload
  != broadcast, settlement, inference trust, or canonical authority
```

Sprint 10D.1 constructs no Ritual transaction, uses no real wallet, signs with no
real credential, performs no RPC broadcast, polls no receipt, and implements no
settlement or live inference. Those capabilities remain governed by 10D.2,
10D.3, and 10E respectively. Ritual model output remains
`untrusted_model_execution`; Portfolio and Morning Meeting remain authoritative.
The workspace dependency direction remains `ritual-gateway -> AI -> Portfolio`,
with no reverse Ritual dependency.

**Sprint 10D.1 — Transaction & Signing Boundary: COMPLETE.** Sprint 10D remains
open and Sprint 10D.2 has not started.

## Sprint 10D.2 deterministic transaction construction

Sprint 10D.2 adds `createRitualInferenceTransactionConstructor` inside the
gateway as a pure, instance-scoped constructor. Its closed configuration fixes
the exact expected Ritual chain ID `1979`, target identity, and signer identity.
Its closed input supplies execution identity, the same chain and target, and an
opaque inference payload. No value is discovered, generated, defaulted,
repaired, or fetched.

One accepted call produces a detached
`RitualInferenceTransactionConstructionResult` containing exact execution,
chain, and target identity plus a `RitualTransactionSigningRequest` compatible
with the existing 10D.1 boundary. The signing request payload is a deterministic
gateway envelope with fixed property order:

```text
{"chainId":1979,"targetId":"<explicit-target>","payload":"<opaque-payload>"}
```

This envelope is deliberately not an ABI, function call, blockchain transaction
encoding, or broadcastable transaction claim. No precompile address, selector,
nonce, gas, fee, wallet address, or settlement rule is assumed. Those details
require separately authorized and authoritative protocol evidence.

Construction performs no signing. A caller may explicitly pass the resulting
signing request to the completed 10D.1 boundary in a later, separate operation;
invalid construction therefore invokes the signer zero times. Construction is
not signing authorization, signing is not submission authorization, and neither
operation changes analytical trust or canonical authority.

Closed own-property validation rejects malformed configuration, wrong chain,
wrong target, absent identities or payloads, unknown fields, and inherited or
prototype-shaped records. Configuration, inputs, and results are detached;
failed, concurrent, repeated, and separate-instance calls retain no shared
state. Errors contain only fixed gateway-owned text.

Sprint 10D.2 adds no live broadcast, RPC submission, receipt polling,
settlement/finality lifecycle, live inference, contract execution, chain
mutation, wallet/private key implementation, nonce/gas/fee discovery,
environment discovery, provider selection, retry/fallback/routing, scheduler,
persistence/cache, or autonomy. The dependency graph remains
`ritual-gateway -> AI -> Portfolio` with no reverse Ritual edge.

**Sprint 10D.2 — Ritual Inference Transaction Construction: COMPLETE.** Sprint
10D remains open and Sprint 10D.3 has not started.

## Sprint 10D.3 submission and settlement lifecycle

Sprint 10D.3 adds `createRitualTransactionSubmissionLifecycle` inside the sole
Ritual-owned `@cryptodesk-ai/ritual-gateway` boundary. It consumes an explicitly
signed 10D.1 result only after a separately injected caller-owned authorization
capability approves the exact execution identity. Possession of signed material
does not authorize submission.

The legal lifecycle is deliberately narrow:

1. validate and detach the lifecycle configuration and signed request;
2. invoke the explicit authorization capability once;
3. on authorization, invoke the injected submission capability exactly once;
4. validate its closed opaque submission identity;
5. invoke the injected settlement capability exactly once;
6. accept one closed `settled` or `failed` terminal observation;
7. map to a minimal sanitized terminal result and clean up operation-local timer
   state.

Invalid input or denied/malformed authorization causes zero submission and zero
settlement attempts. A submission failure never starts settlement. Submission
and settlement exceptions, malformed values, identity substitution, explicit
terminal failure, and timeout map to fixed gateway-owned failure kinds. Provider
text, signed material, raw receipts, endpoints, exception messages, and stacks
are never reflected into public results.

The optional timeout is explicit, bounded, operation-local, and terminal. The
gateway stores only an operation-local finality guard; it exposes no public
cancel signal. A capability that settles after timeout cannot cause another
mapping, submission, settlement, or terminal result. Separate and concurrent
operations have independent snapshots, timers, authorization, submission,
settlement, and result objects. No registry, cache, persistence, retry,
fallback, routing, replay, or global mutable lifecycle state exists.

The public root exposes only the construction factory and minimum configuration,
capability, request, terminal-result, and stable failure-kind contracts. Concrete
broadcast/RPC machinery, raw receipt schemas, polling, controllers, timers,
decoders, and signed-material helpers remain absent or private. This stage adds
no live transaction broadcast, wallet/private-key implementation, nonce/gas/fee
discovery, chain settlement semantics, live inference, autonomous authority, or
canonical promotion. External Ritual verification therefore remains
**INCONCLUSIVE** and is not required for this injected deterministic boundary.

**Sprint 10D.3 — Submission & Settlement Lifecycle: COMPLETE.** Sprint 10D
remains open and Sprint 10D.4 has not started.

## Sprint 10D.4 closure and release audit

Sprint 10D.4 verifies one gateway-owned transaction foundation with no competing
path. Its authority boundaries remain structurally separate:

```text
construction
  != authorization to sign
  != signing
  != authorization to submit
  != submission
  != settlement
  != inference, canonical, or autonomous authority
```

The closure audit found one production defect in the otherwise valid 10D.3
timeout boundary. Configuration accepted safe integers beyond the platform's
2,147,483,647 ms timer limit; Node can reduce such values to an immediate
timeout. The smallest correction keeps the limit private and rejects values
above it. A focused regression extends invalid-configuration coverage, and one
additional focused test proves concurrent success/failure and success/timeout
operations remain isolated.

The completed foundation preserves deterministic detached construction, one
explicitly injected signer capability, separate submission authorization, at
most one injected submission, one closed settlement observation, fixed
sanitized failures, terminal timeout behavior, failed-call recovery, and
instance isolation. No guessed ABI, precompile, nonce, gas, fee, receipt,
confirmation, event, attestation, or finality rule exists.

The nine-package dependency graph remains acyclic with
`ritual-gateway -> AI -> Portfolio` and no reverse Ritual dependency. The
gateway remains private with one package-root export map; internal deep imports
remain blocked. Generated JavaScript, declarations, and declaration maps contain
no credential fixture or concrete wallet/broadcaster implementation. No live
transaction, live signing, or live inference was attempted or claimed.
External Ritual transaction verification remains **INCONCLUSIVE**.

**Sprint 10D — Ritual Inference Transaction Foundation: COMPLETE.** Sprint 10E
has not started.

## Sprint 10E.1 live inference contract

Sprint 10E.1 freezes the ownership and mapping seam without executing live
inference. Provider-neutral AI continues to own
`PortfolioAiProviderRequestDescriptor` and the existing raw execution result and
trust contracts. `@cryptodesk-ai/ritual-gateway` alone owns the Ritual mapping,
explicit target, inference-lifecycle identity, opaque operation payload, and
closed Ritual result validation.

The root-exported `createRitualLiveInferenceContract` provides two pure steps:

```text
validated AI-owned provider descriptor
  + explicit gateway-owned inference request ID and target ID
  -> detached RitualLiveInferenceOperation

closed matching RitualLiveInferenceCompletedResult
  -> PortfolioAiModelExecutionResult(untrusted_model_execution)
```

The operation preserves exact execution ID, provider ID `ritual`, optional model
ID, target ID, and caller-supplied inference-request ID. Its opaque payload is a
deterministic serialization of the already validated provider-neutral prompt
document. No semantic identity is rewritten, and no provider, model, target, or
lifecycle identity is generated or selected.

Configuration, mapping requests, operations, and completed results use closed
own-property validation and detached copies. Unknown fields, inherited or
prototype-shaped records, malformed values, provider/model/target/execution/
inference identity conflicts, and empty output fail with fixed gateway-owned
errors. The mapped result contains only provider-neutral identity, opaque output,
and the existing `untrusted_model_execution` authority. Settlement, chain
inclusion, or Ritual provenance does not establish analytical truth.

This contract does not call the completed 10D construction, signing, submission,
or settlement boundaries and does not collapse them. It adds no invocation,
transaction, broadcast, result retrieval, ABI, precompile, receipt, endpoint,
wallet, credential, retry, fallback, routing, selection, scheduler, persistence,
autonomy, or canonical authority. The dependency graph remains
`ritual-gateway -> AI -> Portfolio`; provider-neutral declarations remain Ritual
implementation-free.

**Sprint 10E.1 — Live Inference Contract: COMPLETE.** Sprint 10E remains open,
Sprint 10E.2 has not started, and external Ritual verification remains
**INCONCLUSIVE**.

## Sprint 10E.2 inference invocation

Sprint 10E.2 adds `createRitualLiveInferenceInvoker` as the single gateway-owned
orchestrator. It composes the frozen contracts rather than introducing a second
transaction or inference pipeline:

```text
validated provider-neutral descriptor
  -> 10E.1 detached Ritual mapping
  -> 10D.2 deterministic construction
  -> explicit signing authorization
  -> 10D.1 injected signing
  -> explicit submission authorization
  -> 10D.3 one submission and settlement
  -> exactly one injected Ritual inference capability
  -> closed opaque result
  -> 10E.1 provider-neutral mapping
  -> untrusted_model_execution
```

The construction, signing, submission, settlement, and inference capabilities
remain separate required injections. No capability is discovered or defaulted.
Provider ID must be exactly `ritual`; model identity remains optional but, when
present, is preserved exactly. Execution, target, inference-request, signing,
and opaque submission identity are checked at their owning boundaries. Failure
before inference causes zero inference attempts.

The inference capability receives only a detached operation identity, opaque
validated prompt payload, and opaque settled submission identity. It returns one
closed terminal completed or failed result. Completed output is mapped through
the 10E.1 contract; malformed or substituted output and thrown provider text map
to fixed sanitized provider-neutral failures. Optional inference timeout is a
positive platform-bounded integer, operation-local, terminal, and cleaned in
`finally`; late completion cannot replace timeout or trigger another invocation.

The implementation adds no live RPC/precompile, ABI, selector, transaction
broadcast, result-retrieval reconciliation, receipt polling, wallet, credential,
retry, fallback, routing, provider/model selection, scheduler, persistence,
autonomy, or canonical authority. Concurrent and separate invoker operations
retain isolated snapshots, timers, capabilities, and terminal results.

**Sprint 10E.2 — Inference Invocation: COMPLETE.** Sprint 10E remains open,
Sprint 10E.3 has not started, and external Ritual verification remains
**INCONCLUSIVE**.

## Sprint 10E.3 result settlement and verification

Sprint 10E.3 adds `createRitualInferenceResultVerifier` as a distinct
gateway-owned stage after 10E.2 invocation. It extends the established path
without replacing or collapsing construction, authorization, signing,
submission, settlement, or invocation:

```text
10E.2 completed invocation correlation
  -> detached original 10E.1 mapping request
  -> exactly one injected result retrieval
  -> closed lifecycle identity correlation
  -> exactly one injected structural provenance verification
  -> closed opaque output
  -> 10E.1 provider-neutral mapping
  -> untrusted_model_execution
```

The retrieval request carries only execution, provider, optional model, target,
inference-request, submission, settlement, and invocation identities. The
closed completed result adds a sanitized provenance identity and opaque output.
All identities must match exactly; no missing, stale, substituted, or conflicting
identity is repaired. The provenance capability confirms only that the result
correlates to this explicit lifecycle. It does not inspect or endorse model
content.

Retrieval and provenance verification are separate required injections. Each is
called at most once. Invalid input invokes neither; invalid retrieval invokes no
provenance check. Optional timeout is a positive platform-bounded integer,
operation-local, terminal, and cleaned in `finally`; late completion cannot
replace timeout or cause a second public result. Calls and instances retain no
registry, cache, history, timer, or mutable global state.

10E.3 deliberately defines no Ritual receipt schema, confirmation count,
finality depth, event ABI, attestation or fulfillment format, polling rule,
replay semantic, or live retrieval transport. Failures are fixed and sanitized,
and successful structural verification creates no analytical or canonical
authority. **Sprint 10E.3 — Result Settlement & Verification: COMPLETE.**
Sprint 10E remains open, Sprint 10E.4 has not started, and external Ritual
verification remains **INCONCLUSIVE**.

## Sprint 10E.4 closure and release audit

Sprint 10E.4 verifies the completed live-inference foundation without changing
production or test behavior. Final traceability is:

| Stage | Owned boundary                                                                      | Closure evidence                                                                                                      |
| ----- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 10E.1 | Detached provider-neutral request mapping and completed-result mapping              | Exact execution/provider/model/target/inference-request identity; output maps only to `untrusted_model_execution`     |
| 10E.2 | Composition of existing 10D lifecycle with one injected inference invocation        | Explicit signing and submission authorization; exactly one invocation; terminal timeout; no hidden selection or retry |
| 10E.3 | One injected result retrieval and one structural provenance verification            | Exact submission/settlement/invocation/provenance correlation; sanitized output; recovery and concurrency isolation   |
| 10E.4 | Regression, architecture, security, dependency, export, artifact, and release audit | 418 passing tests, including 64 gateway tests; all closure gates pass with no production fix required                 |

The authority separation remains:

```text
connectivity
  != transaction construction
  != signing authorization
  != signing
  != submission authorization
  != submission
  != settlement
  != inference invocation
  != result retrieval
  != provenance verification
  != analytical authority
  != canonical authority
  != autonomous authority
```

`@cryptodesk-ai/ritual-gateway` remains the exclusive Ritual-specific owner and
depends inward on provider-neutral AI and Portfolio. AI owns provider-neutral
execution and the existing trust progression; Portfolio and Morning Meeting
remain canonical. No reverse Ritual dependency or competing lifecycle exists.
The nine-package graph is acyclic.

The uncached audit passes all 418 tests. The gateway contributes 64 tests that
cover closed validation, exact identities, exactly-once/at-most-once lifecycle
operations, timeout finality, late-settlement resistance, mutation safety,
concurrency and instance isolation, sanitization, and failed-call recovery.
Package-root exports resolve, internal deep imports remain blocked, and the
forced build produces 131 JavaScript files, 131 declarations, and 131
declaration maps with zero invalid maps. Provider-neutral declarations contain
no Ritual implementation types, and generated artifacts contain no credential
fixture or private signer/wallet implementation.

Sprint 10E adds no provider/model auto-selection, wallet/private-key management,
environment credential discovery, concrete live transaction broadcaster,
receipt polling, retry, fallback, routing, scheduler, persistence, cache,
autonomous execution, trust promotion, canonical mutation, or invented Ritual
protocol semantics. External live Ritual inference verification remains
**INCONCLUSIVE**; injected deterministic capabilities are not live evidence and
no external success is claimed.

**Sprint 10E — Ritual Live Inference Integration: COMPLETE.** Sprint 10F has
not started.

## Sprint 10F.1 autonomous runtime safety contract

Sprint 10F.1 adds `@cryptodesk-ai/runtime-safety` as the provider-neutral owner
of autonomous action-candidate safety contracts. General autonomous policy does
not belong to Ritual Gateway, AI interpretation, Portfolio, or Morning Meeting.
The package has no workspace dependency, while the existing Ritual dependency
direction remains unchanged and acyclic.

`createAutonomousRuntimeSafetyContract` receives one explicit closed policy
descriptor containing policy and authority identities. It constructs only a
closed candidate with caller-supplied execution, action, target, policy,
authority, interpretation, and originating-candidate identities. The sole
initial action kind is the non-mutating `prepare_operator_review`. No identity,
timestamp, UUID, policy, provider, or default is generated or discovered.

Every accepted output is fixed as:

```text
candidateAuthority = candidate_only
authorizationState = not_authorized
executable = false
```

The authority separation is therefore explicit:

```text
model output
  != interpretation
  != recommendation
  != authorization
  != action intent
  != executable action
  != execution
  != canonical mutation
  != autonomous authority
```

Construction validates closed own-property records, exact policy binding, the
closed action kind, and non-empty identities. It rejects unknown, inherited,
prototype-shaped, unsupported, empty, and conflicting material with one fixed
sanitized error. Configuration, input, and results are detached; calls and
instances retain no registry, policy store, cache, counter, session, history,
or mutable global state.

10F.1 performs no authorization decision or autonomous action. It adds no
Ritual type, provider/model selection, callback, executable payload, wallet,
credential, transaction, network call, scheduler, persistence, cache, canonical
mutation, or trust promotion. Sprint 10F.2 remains responsible for future
explicit bounded authorization and execution guardrails. **Sprint 10F.1 —
Autonomous Runtime Safety Contract: COMPLETE.** Sprint 10F remains open and
Sprint 10F.2 has not started. External Ritual verification remains
**INCONCLUSIVE**.

## Sprint 10F.2 bounded authorization and execution guardrails

Sprint 10F.2 adds `createBoundedActionExecutionGuardrail` to the provider-neutral
`@cryptodesk-ai/runtime-safety` package. It composes the 10F.1 candidate
contract with two explicit capability injections:

```text
validated non-authorized candidate
  -> exactly one explicit authorization evaluation
  -> exact closed authorized or denied result
  -> operation-local permission bounded to one attempt
  -> exactly one explicit injected execution capability
  -> one closed completed or sanitized failed result
```

Authorization input retains exact execution, action, action-kind, target,
policy, authority, interpretation, and originating-candidate identity. The
authorizer must return the same complete identity with only `authorized` or
`denied`. An authorized response derives an internal permission fixed as
`authorized_for_single_attempt` with `maximumAttempts: 1`; it is neither stored
nor reusable. Denied, malformed, substituted, inherited, or thrown
authorization reaches no executor.

The executor is explicitly supplied and receives only the detached bounded
permission. Its terminal result is closed as completed with minimal opaque
output or failed with a recognized fixed kind. It cannot receive an arbitrary
action payload, callback, credential, provider, wallet, transaction, network,
or canonical-state reference. Exceptions, malformed results, identity
substitution, and timeouts map to fixed sanitized failures without retry.

Optional execution timeout is a positive platform-bounded integer,
operation-local, terminal, and cleaned in `finally`; late completion cannot
replace timeout. Candidate/configuration mutation cannot alter accepted work,
and concurrent calls and separately configured instances retain no shared
permission, policy, executor, result, timer, registry, cache, or history.

The only allowed action kind remains the non-mutating
`prepare_operator_review`. Candidate construction is not authorization;
authorization is not execution; execution is not canonical mutation or
autonomous authority. 10F.2 adds no autonomous loop, live trade, transfer,
transaction, wallet/key handling, environment discovery, retry, fallback,
routing, scheduler, persistence, cache, trust promotion, or new analytical
authority. **Sprint 10F.2 — Policy & Execution Guardrails: COMPLETE.** Sprint
10F remains open, Sprint 10F.3 has not started, and external Ritual verification
remains **INCONCLUSIVE**.

## Sprint 10F.3 controlled autonomous runtime

Sprint 10F.3 adds one provider-neutral controlled orchestration entry point to
`@cryptodesk-ai/runtime-safety`:

```text
explicit caller request
  -> detached runtime-operation and candidate identity
  -> 10F.1 candidate construction
  -> 10F.2 explicit injected authorization
  -> 10F.2 bounded single-attempt permission
  -> 10F.2 exactly-once injected execution when authorized
  -> one closed detached runtime result
  -> stop
```

Each explicit `run` accepts exactly one caller-supplied runtime operation ID and
one complete candidate input. No identity or work is generated or discovered.
The runtime owns only orchestration: 10F.1 continues to own candidate
validation, and 10F.2 continues to own authorization, permission derivation,
execution, timeout, and capability-result validation. The runtime is neither an
authorizer nor an executor and creates no competing timeout or execution path.

Invalid requests reach neither capability; denial and malformed authorization
reach no executor; an authorized operation receives at most one execution
attempt. The runtime maps exactly one terminal result and stops. It has no
pending registry, resumable token, batch, action graph, planner, recursion,
retry, fallback, scheduler, cron, queue, daemon, poller, discovery, persistence,
cache, session, history, or shared mutable state. Concurrent operations and
separate configured instances remain isolated through detached operation-local
inputs and the existing 10F.2 finality semantics.

The only action kind remains `prepare_operator_review`. Runtime success does
not create analytical truth, canonical truth, recommendation/trading authority,
or autonomous sovereignty and cannot mutate Portfolio or Morning Meeting. The
existing trust progression is unchanged. No Ritual dependency, transaction,
wallet/key capability, credential discovery, provider/model selection, or live
external action was added. **Sprint 10F.3 — Controlled Autonomous Runtime:
COMPLETE.** Sprint 10F remains open, Sprint 10F.4 has not started, and external
Ritual verification remains **INCONCLUSIVE**.
