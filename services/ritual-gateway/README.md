# `@cryptodesk-ai/ritual-gateway`

Sprint 10A.2 introduces the first concrete, network-independent Ritual runtime
boundary behind the existing `PortfolioAiModelProviderAdapter` contract. This
private service package depends inward only on `@cryptodesk-ai/ai`.

`createRitualPortfolioModelProviderAdapter(configuration, invoke)` requires an
explicit instance-owned opaque `targetId` and an injected invocation function.
There is no default transport. Both the legacy execution request and the
descriptor-aware request path preserve exact execution/provider/optional-model
identity and serialize only the already-validated provider-neutral context or
prompt document into a runtime-owned opaque payload.

The injected primitive returns one closed terminal `completed` or `failed`
record. Completed output maps unchanged to an existing
`untrusted_model_execution` result. Runtime failure, timeout, thrown invocation,
malformed result, and identity conflict map to fixed sanitized provider-neutral
failures. The adapter does not parse, create candidates, ground, compose a
Morning Meeting, or promote trust.

10A.2 adds no RPC/HTTP call, Ritual SDK, ABI/precompile/receipt/attestation
shape, credential, environment lookup, wallet/signing behavior, scheduler,
persistence, retry, fallback, routing, autonomous execution, deployment, or
publishing. This was the Sprint 10A.2 baseline.

Sprint 10A.3 closes both factory configuration and direct adapter requests as
plain own-property records before invocation. Terminal results use exactly one
of two exclusive shapes: `completed` requires non-empty opaque output and has
no failure field; `failed` requires one closed failure kind and has no output
field. Timeout is an injected terminal failure, not an adapter timer or a third
lifecycle state. External cancellation is not supported by the frozen
provider-neutral contract and remains later work. Each factory instance retains
only its detached target and invoker, with no shared request, result, timeout,
credential, or provider-selection state.

Sprint 10B.2 places a gateway-internal transport adapter behind the unchanged
`RitualInferenceInvoker` construction seam. It prepares one closed, detached
transport request from the already validated invocation, calls only the injected
transport once, and decodes one closed `completed` or `failed` response. Unknown,
mixed, prototype-shaped, extra-field, malformed, or identity-conflicting
responses fail closed. Exceptions and rejected responses map through the
existing fixed sanitized gateway failures; request bodies and transport details
do not cross the provider-neutral result boundary.

The transport module is not exported from the package root. There is still no
default or live transport, network/RPC access, Ritual SDK, endpoint discovery,
credential handling, timer, retry, fallback, routing, cancellation, wallet,
signing, settlement, persistence, scheduling, or autonomous behavior. Timeout
continues to mean an explicitly injected terminal failure. That was the Sprint
10B.2 checkpoint.

Sprint 10B.3 hardens lifecycle settlement without adding another lifecycle
state or public API. The single injected Promise is the settlement boundary:
JavaScript observes its first resolution or rejection only, so late competing
settlements cannot trigger another decode or provider-neutral mapping. Timeout,
runtime failure, thrown transport, malformed result, and identity conflict are
terminal for that call and cannot be repaired by a later response.

The adapter snapshots the validated provider-neutral request before dispatch.
Caller mutation while transport is pending therefore cannot alter the settled
execution or model identity. Transport responses are reduced immediately to a
new gateway-owned outcome containing only primitive terminal data; no request,
response, exception, timer, pending lifecycle object, or mutable terminal cache
is retained. Every failure class is followed successfully by an equivalent
clean call in regression coverage. Sprint 10B.4 has not started.
