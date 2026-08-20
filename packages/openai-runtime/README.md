# `@cryptodesk-ai/openai-runtime`

Sprint 9B.1 introduced a minimal concrete OpenAI Responses runtime behind the
existing `PortfolioAiModelProviderAdapter` interface. Sprint 9B.2 adds the
optional provider-request invocation seam so the same adapter can consume the
complete validated `PortfolioAiProviderRequestDescriptor`. The package depends
inward on `@cryptodesk-ai/ai`; neither AI nor Portfolio depends on this package.

The factory requires an explicit HTTPS endpoint and API key. Both remain in a
runtime closure. The adapter exposes only its opaque `openai` provider identity
and `execute` function, makes one request, and maps terminal vendor responses to
the existing provider-neutral `Completed` or `Failed` result with
`untrusted_model_execution` authority. It performs no retry, fallback, routing,
provider/model defaulting, candidate parsing, grounding, recommendation, or
application integration.

Descriptor-aware invocation serializes the exact validated repository-owned
prompt document into the vendor `input` field. Vendor body construction remains
inside this package. The original `execute(PortfolioAiModelExecutionRequest)`
path remains supported and continues to serialize its validated context for
legacy callers.

The runtime still performs no candidate parsing or grounding. Gap B, Gap C,
Morning Meeting composition, retry/fallback/routing, and application lifecycle
remain outside Sprint 9B.2.
