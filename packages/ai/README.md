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

Sprint 8A.2 adds `buildPortfolioAiContext`, an opt-in deterministic projection:

```text
Canonical Portfolio Payload
        ↓
Deterministic AI Context
        ↓
future non-authoritative AI interpretation
```

The builder copies only validated payload summary, selected section references,
and canonical item evidence. Fact IDs derive from the portfolio identity,
captured-at, as-of, and presentation-item identity; decimal strings and partial
or unavailable coverage remain unchanged. Explicit section selection and
`maxItems` preserve upstream order and never rerank facts. There is no LLM
invocation, prompt or system/user-message template, model configuration,
provider adapter, tokenization, narrative generation, recommendation,
prediction, or Morning Meeting integration.
