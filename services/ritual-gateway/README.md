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
publishing. Sprint 10A.3 has not started.
