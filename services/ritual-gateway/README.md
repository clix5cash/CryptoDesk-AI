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
clean call in regression coverage. That was the Sprint 10B.3 checkpoint.

Sprint 10B.4 revalidated the complete path with the full 367-test workspace
suite, a forced nine-package build, dependency/export/declaration/artifact
audits, and runtime security scans. No additional production or test change was
required. The gateway remains private and instance-scoped; its transport stays
internal and injected, and its public Sprint 10A contracts remain unchanged.

**Sprint 10B — Ritual Execution Integration: COMPLETE.** At that checkpoint,
Sprint 10C and live connectivity had not started.

Sprint 10C.1 defines the existing `RitualInferenceInvoker` as the sole future
live-connectivity seam. A later authorized gateway-owned invoker may own explicit
instance-scoped endpoint/protocol configuration, one network attempt, private
protocol serialization/decoding, timeout cleanup, and failure sanitization.
`targetId` remains exact adapter configuration, while provider/model selection
remains explicit and provider-neutral. Low-level transport, SDK, credential,
header, response, and error types must stay internal.

Sprint 10C.2 adds the root-exported
`createRitualLiveRpcConnectivityChecker(configuration)` as the first live,
read-only gateway operation. Its closed `RitualLiveRpcConfiguration` requires an
explicit HTTPS endpoint and the expected chain ID `1979`; an optional positive
integer timeout is instance-scoped. Every `check()` performs exactly one POST
request for `eth_chainId`, validates one closed JSON-RPC 2.0 terminal response,
and returns either `{ status: "connected", chainId: 1979 }` or a fixed sanitized
failure kind. It performs no retry, fallback, redirect, discovery, or polling.

HTTP request/response types, JSON-RPC records, decoding, timers, and the injected
test transport remain internal and are not package-root exports. Endpoint URLs,
response bodies, RPC error messages, and thrown exception details never enter
the public connectivity result.

This is **live RPC connectivity only**. Official Ritual documentation describes
LLM precompile inference as an asynchronous transaction lifecycle requiring
transaction submission and executor fulfillment. Sprint 10C.2 does not have
wallet, signing, or transaction authority, so no live Ritual inference is
implemented or simulated. Existing injected `RitualInferenceInvoker` behavior
remains unchanged. Credentials/environment discovery, WebSocket, SDK networking,
wallets/signing, chain mutation or settlement, retry/routing,
persistence/scheduling, autonomy, deployment, and publishing remain absent.

Sprint 10C.3 hardens the operation-local lifecycle without changing the public
surface. Timeout now covers the complete attempt, including streaming response
consumption. The private body reader stops and cancels once more than 16 KiB is
observed, copies only bounded chunks, and decodes UTF-8 strictly before JSON
validation. Response-read exceptions and malformed text remain sanitized.

Overlapping `check()` calls have independent `AbortController` instances,
timers, body readers, and results. The deterministic request ID may remain
constant because every check is a separate single-request HTTP JSON-RPC
exchange; no multiplexed connection or shared response dispatcher associates
responses globally. Timeout is terminal even if an injected transport ignores
abort and settles late. Configuration remains detached, and failure history is
not retained across calls or instances.

Abort remains gateway-internal and timeout-owned. No caller cancellation signal
is exposed through the public API or provider-neutral packages. The optional
10C.3 read-only smoke request again timed out after 15 seconds without a
protocol response, so external connectivity remains INCONCLUSIVE. Live
inference, signing, and transactions remain unimplemented.

**Sprint 10C — Ritual Live Connectivity Foundation: COMPLETE.** The final 10C.4
audit passed with 379 workspace tests. It reused the authoritative configuration,
endpoint, timeout, bounded-body, hostile JSON-RPC, failure-recovery, isolation,
and export coverage, and added one focused overlapping-call test for the only
missing behavioral closure invariant. The artifact audit also fixed an internal
declaration leak by stripping the package-private injected HTTP test seam and
its `AbortSignal` types from generated declarations. The public surface remains
unchanged, the gateway remains private, and Sprint 10D has not started.

Sprint 10D.1 adds the root-exported
`createRitualTransactionSigningBoundary` as the gateway-owned capability seam
for an already prepared opaque payload. Configuration contains only an explicit
signer identity; the signer is a required injected function, and the boundary
performs one detached call with closed identity/result validation and sanitized
failure mapping. No key, mnemonic, wallet file, credential, endpoint, default
signer, wallet discovery, registry, or shared state enters the contract.

Signing remains separate from transaction construction, authorization to
submit, broadcast, receipt handling, settlement, inference trust, and canonical
authority. No real wallet signing or network operation is implemented.
**Sprint 10D.1 — Transaction & Signing Boundary: COMPLETE.** Sprint 10D.2 has
not started.

Sprint 10D.2 adds the root-exported
`createRitualInferenceTransactionConstructor`. It validates explicit chain ID
`1979`, target, signer, execution, and opaque payload input and returns a
detached deterministic gateway envelope plus a 10D.1-compatible signing
request. Construction is pure and performs no signer invocation or network
operation. It assumes no ABI, selector, precompile address, nonce, gas, fee, or
wallet implementation.

Construction is not signing authorization, and signing is not submission
authorization. Broadcast, receipt handling, settlement, and live inference
remain unimplemented. **Sprint 10D.2 — Ritual Inference Transaction
Construction: COMPLETE.** Sprint 10D.3 has not started.

Sprint 10D.3 adds the root-exported
`createRitualTransactionSubmissionLifecycle`. It accepts separately injected
authorization, submission, and settlement capabilities. Valid accepted inputs
are snapshotted before asynchronous work; authorization precedes exactly one
submission, and a successful opaque submission identity is observed through
exactly one closed settlement operation. The only public terminal results are a
minimal `settled` identity or a fixed sanitized `failed` kind. Optional timeout
is operation-local and terminal, with cleanup in `finally`; late capability
settlement cannot replace the timeout result.

The lifecycle provides no default authorization, concrete broadcaster, RPC
method, wallet, private key, receipt schema, polling, retry, fallback, routing,
or live inference. Signed material and raw settlement/provider details never
enter public results. Construction, signing, submission authorization,
submission, and settlement remain distinct. **Sprint 10D.3 — Submission &
Settlement Lifecycle: COMPLETE.** Sprint 10D.4 has not started.
