# Sprint 9 MVP Architecture Inventory

Status: Sprint 9A.1 current-state inventory  
Architecture authority: [ADR-001](./ADR-001-modular-ai-first-architecture.md)

Detailed dependency contract:
[Sprint 9 MVP Component and Dependency Map](./sprint-9-mvp-component-map.md)

## Purpose and scope

This document records the architecture implemented after Sprint 8 and defines
the boundary that Sprint 9 may integrate. It is an inventory, not a redesign.
It does not specify a concrete provider, transport, deployment, parser, or
application workflow.

## Implemented architecture

The complete provider-neutral Portfolio path is:

```text
canonical Portfolio snapshot and evidence
        ↓
PortfolioPresentation / PortfolioPresentationPayload
        ↓
PortfolioAiBuiltContext
        ↓
PortfolioAiModelInput
        ↓
PortfolioAiMessagePlan
        ↓
PortfolioAiPromptDocument
        ↓
PortfolioAiProviderRequest
        ↓
PortfolioAiProviderRequestDescriptor
        ↓
invokePortfolioAiProviderAdapterBridge(...)
        ↓
PortfolioAiModelExecutionResult (untrusted_model_execution)
        ↓
PortfolioAiProviderResponse
        ↓
PortfolioAiNormalizedProviderResponse
        ↓
PortfolioAiProviderExchange (untrusted_model_execution)
```

All stages are separately validated, additive, and opt-in. The request and
response chain retains references back to the canonical presentation evidence.

## Component inventory

| Classification                      | Implemented component or public contract                                                                                                                                                                                                                      | Current responsibility                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical/domain authority          | `@cryptodesk-ai/portfolio` snapshot, identity, normalization, valuation, allocation, risk, insight, prioritization, presentation, and payload APIs                                                                                                            | Owns Portfolio identities, exact financial values, coverage, timestamps, and provenance.                                                                                                                          |
| Deterministic preparation           | `PortfolioPresentation`, `PortfolioPresentationPayload`, `buildPortfolioAiContext`, `PortfolioAiModelInput`, `PortfolioAiMessagePlan`, `PortfolioAiPromptDocument`                                                                                            | Projects and selects existing canonical evidence into validated provider-neutral structures without changing authority.                                                                                           |
| Provider-neutral execution boundary | `PortfolioAiModelExecutionRequest`, `PortfolioAiModelProviderAdapter`, `PortfolioAiModelProviderRegistry`, `PortfolioAiModelExecutionService`, `PortfolioAiProviderRequest`, `PortfolioAiProviderRequestDescriptor`, `invokePortfolioAiProviderAdapterBridge` | Carries explicit execution/provider/model identity and invokes one explicitly registered adapter once. It provides no concrete runtime, discovery, routing, retry, or transport.                                  |
| Untrusted provider result           | `PortfolioAiModelExecutionResult`, `PortfolioAiProviderResponse`, `PortfolioAiNormalizedProviderResponse`, `PortfolioAiProviderExchange`                                                                                                                      | Validates terminal Completed/Failed structure, identity, trust, and traceability. Completed output remains opaque; all artifacts retain `untrusted_model_execution`.                                              |
| Interpretation/grounding            | `PortfolioAiCandidateInterpretationResult`, `assemblePortfolioAiCandidateInterpretation`, `groundPortfolioAiCandidateInterpretation`, `PortfolioAiGroundedInterpretationResult`                                                                               | Accepts caller-supplied structured candidates and validates explicit fact/section references. It does not derive candidates from raw provider output. Grounded results remain `non_authoritative_interpretation`. |
| Application/orchestration           | `PortfolioAiInterpretationPipeline`, `PortfolioAiModelExecutionService`                                                                                                                                                                                       | Opt-in composition over the older context → execution → caller-supplied candidate → grounding path. It does not compose the Sprint 8E–8H request/response exchange path.                                          |
| Application/orchestration           | `@cryptodesk-ai/morning-meeting` report service, News Brief selection, narration service, narrator registry, provider-neutral narrator adapter and completion-client contract                                                                                 | Provides an independent deterministic Morning Meeting and optional untrusted news narration path. It has no dependency on `@cryptodesk-ai/ai` and is not connected to the Portfolio provider exchange.            |
| Documentation/test-only             | Package READMEs, Sprint E2E/closure tests, deterministic in-memory adapters                                                                                                                                                                                   | Explain and verify contracts, identity, trust, precision, missing data, immutability, and failure isolation; they provide no production runtime.                                                                  |

## Dependency direction

The implemented package dependency is:

```text
@cryptodesk-ai/ai
        ↓
@cryptodesk-ai/portfolio
```

`@cryptodesk-ai/portfolio` has no dependency on, or source import from,
`@cryptodesk-ai/ai`. Morning Meeting depends on Market Intelligence and News
Intelligence, not on AI or Portfolio. No circular package dependency was found
in the current MVP path.

Portfolio remains the only canonical authority. AI preparation and provider
artifacts may retain or select canonical references, but cannot create,
replace, or override Portfolio identity, price, value, percentage, allocation,
risk, threshold, coverage, timestamp, or provenance records.

## Sprint 9 MVP integration boundary

### Reusable now

- Canonical Portfolio normalization, analytics, evidence, presentation, and
  JSON-safe presentation payloads.
- Deterministic context, model-input, message-plan, and prompt-document
  preparation.
- Explicit execution/provider/model identity and provider-neutral request and
  descriptor validation.
- Instance-scoped adapter registration and exactly-one invocation behavior.
- Completed/Failed raw-result validation, response normalization, and exchange
  traceability.
- Explicit structured candidate and grounding contracts, separately from raw
  provider output.
- Independent Morning Meeting report and provider-neutral news narration
  contracts.

### Intentionally provider-neutral

Provider and model IDs are opaque. Requests, descriptors, adapters, failures,
responses, and exchanges contain no vendor SDK types, endpoints, credentials,
roles, generation parameters, discovery, retry, or transport behavior. Raw
output is an opaque string and remains untrusted.

### Missing for a real MVP

- A concrete provider adapter/runtime and its secure configuration and
  credential boundary.
- A provider-specific mapping from the repository-owned prompt/request
  representation to a vendor request, plus transport and vendor-response
  mapping back to the existing raw execution result contract.
- An application composition entry point that drives the complete Sprint 8E–8H
  preparation and exchange path for a user-facing workflow.
- An explicit policy and implementation for converting opaque provider output
  into caller-supplied structured candidate records. No such parser or semantic
  mapper currently exists.
- Application handling for surfaced provider failure, latency, observability,
  and user-visible lifecycle state.
- Any intentional connection between Portfolio AI exchange/interpretation and
  Morning Meeting presentation or narration.

These are inventory gaps, not authorization to implement them in Sprint 9A.1.

### Concrete-provider attachment seam

The existing executable seam is an explicitly registered
`PortfolioAiModelProviderAdapter.execute(PortfolioAiModelExecutionRequest)`;
`invokePortfolioAiProviderAdapterBridge(...)` validates a request descriptor
and delegates exactly once through that seam. A future provider implementation
belongs behind this interface or a later explicitly revised adapter contract,
never inside Portfolio or the provider-neutral response contracts.

There is a current integration constraint: the bridge passes the established
model execution request containing canonical context and explicit model
identity, not the newer `PortfolioAiPromptDocument`, provider request, or
descriptor. Therefore concrete prompt-document-to-vendor mapping is not yet an
implemented runtime seam. Resolving that contract is later Sprint work and must
preserve the existing public APIs unless explicitly versioned.

### Raw-output and interpretation boundary

Opaque output ends at `PortfolioAiProviderExchange` with authority
`untrusted_model_execution`. Normalization is structural only. The existing
interpretation path begins only when a caller supplies already-structured
`PortfolioAiCandidateAssemblyItem` records to candidate assembly. Candidate
assembly does not read the raw output; grounding validates explicit canonical
fact and section references and produces only non-authoritative interpretation.

### Morning Meeting/application attachment boundary

Morning Meeting is currently an independent application package with its own
deterministic report, selection, narration, registry, and provider-neutral
completion-client boundaries. A future application composition layer may
choose to consume a validated Portfolio interpretation or exchange, but no such
contract, mapping, or dependency exists today. It must not attach directly to
opaque raw output or allow narration to alter canonical Portfolio or Morning
Meeting analytical state.

## Preserved guarantees

- Same-symbol assets on different networks retain distinct canonical identity.
- Partial, unavailable, missing, unclassified, and insufficient-data states
  remain explicit.
- Canonical decimal strings remain exact; provider boundaries perform no
  numeric conversion, arithmetic, rounding, or locale formatting.
- Provider output remains opaque and untrusted through the exchange boundary.
- Interpretation remains non-authoritative and explicitly grounded only against
  existing references.
- Existing Sprint 8 public APIs remain independently usable and opt-in.
- No current component supplies a live provider, network transport, provider
  discovery, parser, recommendation, prediction, persistence, scheduler, or
  global orchestration runtime.
