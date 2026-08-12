# @cryptodesk-ai/ai

Provider-neutral AI platform contracts. Sprint 8A.1 adds an opt-in Portfolio AI
boundary above the deterministic Portfolio package. `PortfolioAiContext` accepts
only a validated, schema-versioned `PortfolioPresentationPayload`; its source
reference must exactly match the payload identity. Future AI results use the
explicit `non_authoritative_interpretation` authority marker and must ground
each interpretation in existing presentation item and section references.

The boundary preserves source coverage states, including partial, unavailable,
and insufficient-data facts. It does not create or mutate Portfolio truth, and
it contains no provider adapter, model configuration, prompt, inference call,
narrative generator, recommendation, or runtime transport.
