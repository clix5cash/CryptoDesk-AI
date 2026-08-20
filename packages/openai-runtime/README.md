# `@cryptodesk-ai/openai-runtime`

Sprint 9B.1 introduced a minimal concrete OpenAI Responses runtime behind the
existing `PortfolioAiModelProviderAdapter` interface. Sprint 9B.2 adds the
optional provider-request invocation seam so the same adapter can consume the
complete validated `PortfolioAiProviderRequestDescriptor`. The package depends
inward on `@cryptodesk-ai/ai`; neither AI nor Portfolio depends on this package.

The adapter factory is the runtime composition boundary. It requires an
explicit HTTPS endpoint and API key and accepts an optional positive integer
`timeoutMs`. Configuration is validated once and retained in a runtime closure;
there is no environment lookup, global registry, singleton, credential getter,
provider discovery, or model default. Callers explicitly register each returned
adapter instance in the AI-owned registry.

Each execution makes one request and maps the terminal vendor response to the
existing provider-neutral `Completed` or `Failed` result with
`untrusted_model_execution` authority. Transport, HTTP, response-body, and
timeout failures are sanitized without returning endpoint, authorization,
credential, response-body, or vendor exception details.

Descriptor-aware invocation serializes the exact validated repository-owned
prompt document into the vendor `input` field. Vendor body construction remains
inside this package. The original `execute(PortfolioAiModelExecutionRequest)`
path remains supported and continues to serialize its validated context for
legacy callers.

The runtime still performs no candidate parsing or grounding. Gap B, Gap C,
Morning Meeting composition, retry/fallback/routing, and application lifecycle
remain outside Sprint 9B.3.

When `timeoutMs` is supplied, the runtime bounds the complete transport and
response-body operation, aborts the default fetch through a runtime-local
`AbortSignal`, and returns `provider_timeout`. Omission preserves the 9B.1/9B.2
unbounded behavior. External caller cancellation was not added because the
provider-neutral execution contracts carry no cancellation signal; adding one
would exceed this sprint's additive runtime boundary.

## Sprint 9B closure

Sprint 9B.4 closes Gap A. Deterministic closure coverage proves the validated
prompt/request/descriptor path reaches this concrete runtime once, vendor
mapping remains runtime-owned, Completed and Failed results pass the existing
response/normalization/exchange boundaries, and adversarial JSON-, Markdown-,
recommendation-, trade-, symbol-, value-, and identifier-looking output remains
opaque `untrusted_model_execution` text.

No live credential or network call is part of repository tests. A live-provider
smoke test remains explicit later release/hardening work. Gap B output mapping
belongs to Sprint 9C, and Morning Meeting integration remains Sprint 9D.
