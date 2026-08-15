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

Sprint 8B.3 adds `PortfolioAiModelExecutionService`, an opt-in thin
composition layer:

```text
Deterministic AI Context
        ↓
Explicit Model Execution Request
        ↓
Execution Service
        ↓
Explicit Provider Adapter
        ↓
Raw untrusted_model_execution
        ↓
future grounding step
```

The service delegates to the existing registry and adapter-invocation boundary:
one request resolves one explicitly selected provider/model and makes one
invocation attempt. It does not register providers, build prompts, retry,
fallback, route, ground interpretations, or reinterpret raw output. Returned
results remain validated and detached `untrusted_model_execution` records; no
concrete provider, SDK, HTTP transport, credentials, or model runtime is added.

Sprint 8B.4 closes the provider-neutral execution boundary with end-to-end
coverage:

```text
Canonical Portfolio
        ↓
Deterministic AI Context
        ↓
Explicit Execution Request
        ↓
Provider-Neutral Execution Service
        ↓
Explicit Adapter
        ↓
Raw untrusted_model_execution
        ↓
separate future grounding operation
```

The completed boundary preserves canonical identity, provenance, exact decimal
strings, and complete, partial, unavailable, and missing-data semantics. One
request resolves one explicitly selected provider/model and makes one attempt;
there is no default, retry, fallback, or routing. Raw results are structurally
validated but remain untrusted and cannot satisfy the grounded interpretation
boundary. Sprint 8B includes no concrete provider, network runtime, prompt
rendering, credentials, or automatic grounding.

Sprint 8C.1 adds a contract-only pre-grounding boundary for descriptive model
output:

```text
Raw untrusted_model_execution
        ↓
Untrusted candidate interpretation
        ↓
future explicit grounding/validation
        ↓
non_authoritative_interpretation
```

`PortfolioAiCandidateInterpretationResult` is distinct from both the raw
execution result and the grounded interpretation result. Candidate records use
externally supplied opaque IDs and can assert only exact selected context-fact
and section references. Validation rejects unknown, duplicate, contradictory,
or added canonical financial fields; Portfolio/context facts, provenance,
coverage, and decimal precision remain authoritative. Sprint 8C.1 adds no
provider or parser runtime, automatic grounding, prompt/model configuration,
narrative generator, recommendation, prediction, or Morning Meeting
integration.

Sprint 8C.2 adds the opt-in deterministic promotion boundary:

```text
raw untrusted_model_execution
        ↓
untrusted_candidate_interpretation
        ↓
deterministic grounding validation
        ↓
non_authoritative_interpretation
```

`groundPortfolioAiCandidateInterpretation(...)` validates completed execution,
candidate identity, and exact context-fact/section references before producing
a detached grounded interpretation result. Grounding validates structural
references only: it does not create canonical Portfolio truth, fact-check
natural-language content, invoke AI, parse model output, or recompute
Portfolio analytics. Grounded interpretations remain explicitly
non-authoritative; partial, unavailable, and missing-data coverage stays
canonical in the referenced context.

Sprint 8C.3 adds the structured candidate-assembly boundary:

```text
raw untrusted_model_execution
        ↓
structured candidate assembly
        ↓
untrusted_candidate_interpretation
        ↓
deterministic grounding
        ↓
non_authoritative_interpretation
```

`assemblePortfolioAiCandidateInterpretation(...)` accepts only already-
structured candidate fields, inherits execution/provider/model identity from a
validated execution result, and validates exact context-fact and section
references through the existing candidate contract. It does not parse raw text
or JSON, infer references or meaning, create canonical facts, or promote a
candidate to grounded output. Assembled candidates remain explicitly untrusted.

Sprint 8C.4 closes the candidate-interpretation boundary with end-to-end
coverage of:

```text
untrusted_model_execution
        ↓
structured candidate assembly
        ↓
untrusted_candidate_interpretation
        ↓
deterministic grounding
        ↓
non_authoritative_interpretation
```

The completed path uses structured input only, preserves exact canonical
fact/section references and partial or unavailable coverage, and never creates
Portfolio truth. Grounding remains structural rather than semantic: there is
no parser, provider, prompt, model runtime, natural-language inference, or
automatic authority promotion in Sprint 8C.

Sprint 8D.1 adds an opt-in orchestration boundary over the completed public
contracts:

```text
Canonical Portfolio payload
        ↓
Deterministic AI context
        ↓
Explicit provider-neutral execution
        ↓
Structured untrusted candidate assembly
        ↓
Deterministic grounding
        ↓
Non-authoritative interpretation
```

`PortfolioAiInterpretationPipeline` receives an explicitly injected existing
execution service and explicit execution/provider/model input. It delegates to
the existing context, execution, candidate, and grounding boundaries without
parsing raw output, choosing a provider, reranking facts, or creating Portfolio
truth. All trust-state artifacts remain visible in the returned result.

Sprint 8D.2 hardens the authority hierarchy enforced by those boundaries:

```text
Canonical Portfolio facts (authoritative)
        ↓
Deterministic AI context (canonical projection)
        ↓
untrusted_model_execution
        ↓
untrusted_candidate_interpretation
        ↓
non_authoritative_interpretation
```

Trust markers are owned by their respective validation or construction
boundaries. AI-layer records can retain only exact canonical references; they
cannot redefine Portfolio identities, values, coverage, timestamps, or
provenance. Grounding validates references but never creates canonical truth.

Sprint 8D.3 hardens deterministic behavior across the composed pipeline.
Equivalent canonical inputs retain equivalent context, reference, execution,
candidate, and grounded-result identities and ordering. The AI boundary keeps
all provenance, exact decimal strings, and partial or unavailable facts
traceable; registry, service, and pipeline instances remain explicitly scoped
with no hidden mutable pipeline state. These repeatability guarantees apply to
deterministic boundary work only, not future provider-produced model content.

Sprint 8D.4 closes the AI interpretation architecture with an end-to-end
regression of the complete established path:

```text
Canonical Portfolio
        ↓
Deterministic AI context
        ↓
Explicit provider-neutral execution
        ↓
untrusted_model_execution
        ↓
Structured candidate interpretation
        ↓
untrusted_candidate_interpretation
        ↓
Deterministic grounding
        ↓
non_authoritative_interpretation
```

Portfolio remains the owner of canonical truth. Each AI-stage trust marker is
boundary-owned, and AI records retain exact references to canonical evidence
rather than recreating financial facts. The closure guarantees preserve
cross-network identity, canonical decimal strings, ordering, provenance, and
partial or unavailable data through the complete path. Sprint 8D adds no
concrete provider, network runtime, credentials, prompt or parser runtime,
automatic grounding, retry/fallback/routing, or hidden global pipeline state.

Sprint 8E.1 adds an opt-in provider-neutral structured model-input boundary.
`PortfolioAiModelInput` carries a validated deterministic AI context together
with caller-selected exact context-fact and section IDs. It is structured data
only: it does not render natural-language prompts or system/user/chat messages,
and it carries no provider schema, model settings, tokenizer behavior, or
execution capability. The Portfolio context and its evidence remain canonical;
the model-input boundary preserves exact references, coverage limitations, and
decimal strings without creating or changing Portfolio facts.

Sprint 8E.2 adds `PortfolioAiMessagePlan`, a deterministic structured plan
between `PortfolioAiModelInput` and any future renderer or provider runtime.
Its fixed logical items preserve the task, selected context sections, selected
evidence facts, and the existing candidate-interpretation output contract.
The plan contains references and enums only: it renders no natural-language
prompt, has no system/user/chat message schema, and performs no provider or
model invocation. Canonical Portfolio evidence remains reference-based.

Sprint 8E.3 adds `PortfolioAiPromptDocument`, a portable provider-neutral
document between the message plan and any future provider mapping/runtime. It
uses a static document version and fixed repository-owned instruction,
task, constraint, and output-contract text fragments; context and evidence
remain exact structured references. There is no caller-defined system prompt,
provider request schema, model invocation, response parser, or execution
integration. Portfolio evidence remains canonical and authoritative.

Sprint 8E.4 closes deterministic model-input preparation:

```text
PortfolioAiBuiltContext
        ↓
PortfolioAiModelInput
        ↓
PortfolioAiMessagePlan
        ↓
PortfolioAiPromptDocument
        ↓
future provider-specific mapping/runtime
```

The completed preparation path is deterministic, detached, reference-preserving,
and provider-neutral. Prompt documents use only static repository-owned text
fragments; there is no arbitrary caller prompt path, provider mapping, model
invocation, or execution integration. Canonical Portfolio evidence, coverage,
provenance, ordering, and exact decimal strings remain authoritative.

Sprint 8F.1 adds `PortfolioAiProviderRequest`, an opt-in provider-neutral
request envelope between the portable prompt document and future concrete
provider mapping:

```text
PortfolioAiPromptDocument
        ↓
PortfolioAiProviderRequest
        ↓
future provider-specific mapper/runtime
```

The envelope retains the validated prompt document unchanged alongside an
explicit existing execution ID and opaque provider/model reference. It is not a
provider request body: it has no provider roles, credentials, endpoint,
generation parameters, automatic provider/model selection, or execution
capability. Canonical evidence, provenance, partial coverage, and exact decimal
strings remain reachable only through the authoritative preparation artifacts.

Sprint 8F.2 adds `PortfolioAiProviderRequestDescriptor`, a deterministic,
detached mapping of an envelope into ordered repository-owned logical blocks:

```text
PortfolioAiPromptDocument
        ↓
PortfolioAiProviderRequest
        ↓
PortfolioAiProviderRequestDescriptor
        ↓
future adapter/runtime bridge
```

The descriptor preserves the explicit execution and provider/model identities,
prompt-document version, exact block order, rendered repository-owned fragments,
and fact/section references. It is not a vendor request body: it has no vendor
roles, HTTP payload, generation parameters, automatic selection, or execution
behavior. Concrete provider mapping remains future work.

Sprint 8F.3 adds `invokePortfolioAiProviderAdapterBridge(...)`:

```text
PortfolioAiPromptDocument
        ↓
PortfolioAiProviderRequest
        ↓
PortfolioAiProviderRequestDescriptor
        ↓
explicit provider-neutral adapter bridge
        ↓
untrusted_model_execution
```

The bridge validates the descriptor and delegates exactly one call through the
existing explicitly supplied registry and provider-neutral adapter boundary.
Adapter output is still validated, detached `untrusted_model_execution`; the
bridge does not parse, ground, or promote it. No concrete provider, network
runtime, retry, fallback, or routing behavior is included.

Sprint 8F.4 closes the provider-request preparation and bridge boundary:

```text
PortfolioAiPromptDocument
        ↓
PortfolioAiProviderRequest
        ↓
PortfolioAiProviderRequestDescriptor
        ↓
provider-neutral adapter bridge
        ↓
untrusted_model_execution
```

The complete path preserves explicit execution/provider/model identity,
prompt-document block order and references, canonical evidence, partial and
missing-data states, and exact decimal strings. It makes exactly one injected
adapter invocation per bridge call; no concrete provider runtime, network,
credentials, vendor request body, retry, fallback, or routing exists. Raw
execution output remains untrusted and requires the existing separate candidate
and grounding boundaries.

Sprint 8G.1 adds `PortfolioAiProviderResponse`, an opt-in provider-neutral
envelope immediately after completed `untrusted_model_execution`. It preserves
the descriptor's explicit execution/provider/model identity and references a
detached copy of the already validated raw result. The envelope accepts no
canonical Portfolio fields and performs no parsing, interpretation, grounding,
trust promotion, provider-specific mapping, or runtime invocation.

Sprint 8G.2 hardens that provider-neutral response boundary with exact terminal
success/failure status, execution/provider/model identity, raw-result ownership,
trust, and unsupported-field validation. Raw output remains opaque and
untrusted: validation does not parse model content, ground claims, create
interpretations, or create canonical Portfolio facts.

Sprint 8G.3 adds an opt-in structural normalization boundary:

```text
PortfolioAiProviderResponse
        ↓
PortfolioAiNormalizedProviderResponse
        ↓
future candidate/interpretation boundary
```

Normalization preserves terminal status, exact execution/provider/model
identity, provider-neutral failure data, opaque raw output, source-response
traceability, and `untrusted_model_execution`. It performs no JSON or prose
parsing, semantic interpretation, grounding, candidate generation, or creation
of canonical Portfolio facts.

Sprint 8G.4 closes the provider-response path:

```text
provider-neutral adapter bridge
        ↓
raw untrusted_model_execution
        ↓
PortfolioAiProviderResponse
        ↓
structural validation and normalization
        ↓
PortfolioAiNormalizedProviderResponse
```

Raw output remains opaque, normalization remains structural, and trust remains
untrusted. Sprint 8G performs no candidate extraction, grounding,
interpretation, recommendation, concrete provider integration, or provider
runtime behavior.

Sprint 8H.1 adds `PortfolioAiProviderExchange`, an opt-in provider-neutral
envelope binding one validated request descriptor (and its retained provider
request) to one normalized terminal provider response. The exchange preserves
exact execution/provider/model identity, terminal status, artifact traceability,
and `untrusted_model_execution` without rebuilding canonical evidence or
inspecting opaque model output. It adds no provider runtime, parsing, grounding,
interpretation, routing, or canonical Portfolio authority.

Sprint 8H.2 hardens exact exchange-owned identity, terminal status, trust, and
the retained request/response source chain. Every nested artifact is validated
through its existing boundary contract; canonical authority remains upstream,
the exchange contains detached references only, and raw output is never parsed
or semantically interpreted.
