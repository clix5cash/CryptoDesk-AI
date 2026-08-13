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

Sprint 8A.3 adds a grounded interpretation-result contract after deterministic
context construction. A future interpretation is explicitly
`non_authoritative_interpretation` and may contain only opaque content plus
exact references to selected context facts, presentation items, and canonical
sections. Validation rejects unknown, duplicate, contradictory, or fabricated
canonical fields; portfolio identity, provenance, decimal strings, coverage,
and unavailable-data semantics remain solely in the authoritative context.
This is validation only: no model/provider invocation, prompt, tokenizer,
narrative-generation engine, recommendation, prediction, or runtime transport
is implemented.

Sprint 8A.4 closes the deterministic AI boundary with end-to-end regression
coverage of the complete path:

```text
Canonical Portfolio Payload
        ↓
Deterministic AI Context
        ↓
Grounded Non-Authoritative Interpretation Boundary
```

Portfolio remains the canonical authority throughout. Context facts retain
canonical item and section grounding, exact decimal strings, source provenance,
and complete, partial, unavailable, or insufficient-data coverage unchanged.
Interpretation content can only reference those facts and is always explicitly
`non_authoritative_interpretation`; it cannot add or override canonical
financial facts. Sprint 8A includes no model or provider runtime, prompts,
tokenization, narrative generation, recommendations, predictions, Morning
Meeting integration, persistence, cache, or scheduler.

Sprint 8B.1 adds a contract-only execution boundary:

```text
Canonical Portfolio
        ↓
Deterministic AI Context
        ↓
Raw Provider-Neutral Model Execution (untrusted)
        ↓
Grounded Non-Authoritative Interpretation
```

`PortfolioAiModelExecutionRequest` references validated deterministic context.
Its raw result is explicitly `untrusted_model_execution`, contains only opaque
provider/model references and structural output or failure data, and cannot be
used as a grounded interpretation or Portfolio truth. Grounding validation
remains a separate required step. Usage units, when supplied, are opaque
provider-neutral counters rather than tokenizer semantics. No provider SDK,
model invocation, HTTP transport, credentials, registry/routing behavior,
prompt construction, narrative generation, recommendation, prediction, or
Morning Meeting integration is added.

Sprint 8B.2 adds an opt-in, instance-scoped adapter registry for the 8B.1
execution contracts:

```text
Deterministic AI Context
        ↓
explicit provider/model selection
        ↓
provider-neutral adapter
        ↓
raw untrusted model execution
        ↓
separate grounded interpretation validation
```

`PortfolioAiModelProviderRegistry` registers explicitly supplied adapters by
opaque provider ID, rejects duplicates, and resolves only a caller-selected
provider/model. Its deterministic listing exposes detached descriptors; there
is no singleton, discovery, fallback, routing, health policy, or automatic
selection. Invocation copies the request before calling an adapter, validates
the returned `untrusted_model_execution` result against the original request,
and never turns it into a grounded interpretation. No concrete provider, SDK,
HTTP transport, credential handling, prompt rendering, or model execution
runtime is included.
