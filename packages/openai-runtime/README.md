# `@cryptodesk-ai/openai-runtime`

Sprint 9B.1 introduces a minimal concrete OpenAI Responses runtime behind the
existing `PortfolioAiModelProviderAdapter` interface. The package depends
inward on `@cryptodesk-ai/ai`; neither AI nor Portfolio depends on this package.

The factory requires an explicit HTTPS endpoint and API key. Both remain in a
runtime closure. The adapter exposes only its opaque `openai` provider identity
and `execute` function, makes one request, and maps terminal vendor responses to
the existing provider-neutral `Completed` or `Failed` result with
`untrusted_model_execution` authority. It performs no retry, fallback, routing,
provider/model defaulting, candidate parsing, grounding, recommendation, or
application integration.

Current limitation: the frozen adapter seam receives the established model
execution request (canonical context and explicit identity), not the newer
prompt document or descriptor. The runtime therefore serializes that validated
context as the Responses API input. Exposing the complete repository-owned
prompt document to a concrete runtime remains outside Sprint 9B.1.
