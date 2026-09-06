# Sprint 9 MVP Architecture Inventory

Status: Sprint 9A.1 current-state inventory  
Architecture authority: [ADR-001](./ADR-001-modular-ai-first-architecture.md)

Detailed dependency contract:
[Sprint 9 MVP Component and Dependency Map](./sprint-9-mvp-component-map.md)

Runtime and integration contract:
[Sprint 9 MVP Integration Contract](./sprint-9-mvp-integration-contract.md)

Sprint 9A closure:
[Sprint 9A MVP Architecture Closure](./sprint-9a-mvp-architecture-closure.md)

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
- No current component supplies provider discovery, fuzzy/heuristic parsing,
  recommendation, prediction, persistence, scheduler, or global orchestration
  runtime. The Sprint 9C.1 parser accepts only its explicit JSON schema.

## Sprint 9C.1 parser boundary status

Gap B now begins explicitly after `PortfolioAiProviderExchange`. The opt-in
parser accepts only a closed provider-neutral JSON schema and rejects malformed,
unknown, canonical, nested, duplicate-ID, and prototype-shaped input with
`AiBoundaryValidationError`. Exact execution/provider/optional-model identity
and a detached source-exchange copy provide traceability. Raw exchange output
remains unchanged `untrusted_model_execution`; parsed descriptive fields and
opaque references remain unvalidated `untrusted_candidate_interpretation`.

No candidate validator or grounding boundary is duplicated or invoked.
Candidate validation/integration remains Sprint 9C.2, and Morning Meeting
integration remains Sprint 9D.

## Sprint 9C.2 candidate-validation integration status

`validatePortfolioAiParsedCandidates(...)` now maps only a validated Sprint
9C.1 parsed artifact into the existing candidate assembly and reference
validation boundary. Context and completed execution are recovered from its
retained exchange chain, so execution/provider/model identity and canonical
reference ownership cannot be supplied or repaired separately. The detached
result retains the source exchange and remains
`untrusted_candidate_interpretation`.

No raw-text shortcut, semantic reference matching, candidate ranking, canonical
field ownership, grounding, or trust promotion is added. Sprint 9C.3 owns
grounding; Morning Meeting remains Sprint 9D.

## Sprint 9C.3 explicit grounding status

`groundPortfolioAiParsedCandidates(...)` explicitly connects the validated
9C.2 candidate envelope to the existing deterministic grounding contract. Its
closed input requires the matching parsed artifact and candidate-validation
result. The output retains both plus the originating ProviderExchange, preserving
execution/provider/model identity, candidate order, and exact fact/section
references through the complete chain.

This is the only Sprint 9C trust transition to
`non_authoritative_interpretation`. It creates no Portfolio authority, performs
no semantic or symbol matching, and does not reinterpret partial, unavailable,
missing, or precision-sensitive canonical evidence. Sprint 9C.4 owns Gap B E2E
closure; Morning Meeting remains Sprint 9D.

## Sprint 9C.4 Gap B closure status

Gap B is CLOSED. Public-API E2E coverage proves the legal path from validated
ProviderExchange through closed-schema parsing, exact candidate/reference
validation, and explicit deterministic grounding to only
`non_authoritative_interpretation`. Complete exchange, raw execution, parsed,
candidate, execution/provider/model, candidate-ID, and fact/section traceability
is retained without canonical authority movement.

Closure tests and source audits cover adversarial descriptive content,
malformed/injected structures, same-symbol cross-network identity, partial and
missing evidence, exact large decimals, ordering, detachment, failure isolation,
public API compatibility, dependency direction, and absence of runtime or
Morning Meeting coupling. Gap C has not started; Sprint 9D owns application and
Morning Meeting composition.

## Sprint 9D.1 Gap C composition inventory

Gap C now starts at the additive Morning Meeting-owned
`MorningMeetingPortfolioAiComposition` boundary. Its canonical component holds
the already-validated application report/request and Portfolio AI context; its
AI component accepts only complete Sprint 9C
`non_authoritative_interpretation` artifacts. The components remain separate,
detached, and authority-distinct.

Morning Meeting depends on provider-neutral AI contracts. AI does not depend on
Morning Meeting, Portfolio does not depend on AI, and the concrete provider
runtime remains outside this composition. Sprint 9D.1 adds no orchestration or
presentation generation; Gap C is not closed.

## Sprint 9D.2 application-flow inventory

Morning Meeting now owns an additive application presentation orchestrator:
validated canonical report plus optional 9D.1 composition → canonical report
plus a separate non-authoritative AI narrative. The existing deterministic
report service and all provider/runtime components remain unchanged.

The application explicitly selects reject-or-omit behavior for invalid AI.
Omission preserves canonical output, while inclusion retains provider-neutral
identity and reference trace locators without exposing raw execution or runtime
configuration. Gap C remains open for Sprint 9D.3 or later lifecycle hardening.

## Sprint 9D.3 lifecycle inventory

An additive Morning Meeting lifecycle wrapper now records application-only
outcomes for AI not requested, unavailable, included, deliberately omitted as
invalid, or rejected as invalid. The rejected outcome is carried by a sanitized
Morning Meeting error; it includes no provider/runtime operational detail.

The lifecycle wrapper delegates to the unchanged 9D.2 flow. Canonical report
state remains detached and independently usable, while traceability remains
exact and provider-neutral. No persistence, cache, scheduler, retry, fallback,
or global lifecycle state exists. Gap C is not closed; Sprint 9D.4 owns closure.

## Sprint 9D.4 Gap C closure inventory

Gap C is CLOSED with no production component change in 9D.4. Focused public-API
coverage composes the retained grounded source chain through the 9D.1 envelope,
9D.2 presentation flow, and 9D.3 lifecycle contract into detached canonical and
non-authoritative application output.

All authority, optionality, traceability, failure-isolation, compatibility, and
dependency gates pass. Morning Meeting remains the application owner; AI and
Portfolio dependency direction remains one-way. Sprint 9E owns later MVP
application/API lifecycle and has not started.

## Sprint 9E.1 MVP application API inventory

Morning Meeting now exposes the additive
`DefaultMorningMeetingMvpApplicationApi` external-call boundary. It owns one
request-scoped sequence: validate the closed API envelope, invoke an injected
`MorningMeetingService` once, and pass its canonical report with explicit AI
intent and any caller-supplied 9D composition into the existing lifecycle.

The public input, output, interface, and default implementation live in
`@cryptodesk-ai/morning-meeting`. The output is the existing
`MorningMeetingPortfolioAiLifecycleResult`; no competing lifecycle or trust
model was introduced. This boundary adds no runtime, provider invocation,
transport, storage, scheduler, credential, or autonomous composition. Sprint
9E.1 ends at this additive facade.

## Sprint 9E.2 external execution inventory

The 9E.1 facade is hardened in place; no overlapping application component is
added. Its exported input validator closes the application request envelope,
validates deterministic Morning Meeting scope/time fields, and rejects
contradictory AI options before invoking the service. One accepted execution
performs exactly one report generation and at most one delegation to the
existing 9D lifecycle.

Injected-service failures are sanitized at the external application boundary.
Composition mismatch, identity substitution, invalid trust, and canonical
injection continue through the existing sanitized AI rejection/omission
semantics. The component remains stateless, provider-neutral, transport-neutral,
and optional-AI. Sprint 9E.2 ends at this execution hardening boundary.

## Sprint 9E.3 lifecycle-hardening inventory

The existing facade now isolates the service-owned request copy from the
lifecycle-owned request copy. This closes a mutation seam without changing any
public input, output, lifecycle, or error type. Service exceptions and invalid
service results converge on one sanitized application failure; invalid supplied
AI retains the existing sanitized `rejected_invalid` error.

Focused coverage proves no partial result after service failure, later-call
isolation, output detachment, and preservation of all four successful lifecycle
outcomes. No new facade, transport, provider execution, state store, or
dependency edge exists. Sprint 9E remains open for 9E.4 closure.

## Sprint 9E.4 final closure inventory

Sprint 9E is CLOSED with no production component change in 9E.4. One focused
public-API closure flow verifies the complete external request → exactly-once
canonical generation → optional supplied composition → at-most-once existing
lifecycle → detached result path.

The inventory remains one MVP facade, one deterministic service dependency,
the existing 9D lifecycle, and provider-neutral AI/Portfolio contracts. No
transport, runtime invocation, stateful service, secret boundary, or reverse
dependency was added. Sprint 9F owns later release/security/integration
hardening and has not started.

## Sprint 9F.1 release-boundary inventory

The audited release surface contains one application facade in
`@cryptodesk-ai/morning-meeting`, exposed only from the package root. Its
supporting public contracts are the existing MVP request/result validator,
Morning Meeting service, Portfolio AI composition, lifecycle result/outcomes,
and sanitized errors. No internal deep-import path is exported.

All workspace package manifests remain private `0.0.0` build artifacts with a
single `.` export mapped to `dist/index.js` and `dist/index.d.ts`. The workspace
dependency graph is acyclic and retains Morning Meeting → AI → Portfolio;
OpenAI runtime depends only on AI. Sprint 9F.1 adds audit coverage and
documentation only. Sprint 9F remains open for 9F.2.

## Sprint 9F.2 security-boundary inventory

No component or dependency edge is added. The concrete OpenAI runtime remains
the sole owner of explicitly supplied credential, authorization, endpoint, and
vendor transport material. A minimal runtime validator fix rejects inherited
configuration and response fields instead of treating them as own vendor data.
Provider-neutral results retain fixed sanitized failures and opaque untrusted
output only.

The Morning Meeting MVP facade remains runtime-free, stateless, closed-schema,
and no-AI capable. Focused security coverage adds hostile/prototype input,
secret/body/endpoint containment, recovery, and instance-boundary evidence;
existing tests retain authority for trust, canonical separation, traceability,
missing data, precision, ordering, and dependency/export closure. Sprint 9F is
not complete; Sprint 9F.3 has not started.

## Sprint 9F.3 release-candidate inventory

No production component or dependency edge is added. Release-candidate tests
compose the existing provider-neutral execution, parsing, validation,
grounding, Morning Meeting composition, and sole MVP facade surfaces. Separate
no-AI facade instances and repeated calls demonstrate request-scoped state,
exact invocation accounting, output detachment, and post-mutation isolation.

The build artifact audit confirms required root declarations, declaration
maps, runtime modules, blocked test/fixture leakage, and the absence of runtime
imports from provider-neutral AI declarations. The informational 100-call
in-memory no-AI batch showed no duplicate/pathological work; wall-clock output
is environment-specific and not a release guarantee. No deployment,
publishing, transport, state store, or autonomous component exists. Sprint 9F
remains open; Sprint 9F.4 has not started.

## Sprint 9F.4 final closure inventory

Sprint 9F is CLOSED without a production component change. The inventory still
contains one public MVP facade, the existing deterministic Morning Meeting
service/lifecycle, provider-neutral AI contracts, canonical Portfolio
contracts, and the separate concrete OpenAI runtime. Closure tests and audits
confirm contained package-root artifacts, private/unpublished metadata,
request-scoped state, and the legal one-way graph.

No transport, deployment, publishing, persistence, cache, scheduler, mutable
global application state, provider auto-execution, autonomous/Ritual behavior,
or Sprint 10 component was introduced. Sprint 9G owns final MVP release audit
and closure and has not started.

## Sprint 9G.1 final MVP baseline inventory

The repository-wide baseline contains eight private workspace packages and one
intended public application facade:
`DefaultMorningMeetingMvpApplicationApi` from the Morning Meeting package root.
Every package exports only `.`, backed by `dist/index.js` and `dist/index.d.ts`;
internal deep imports remain outside the export maps.

The complete workspace graph is acyclic. Its relevant edges remain Morning
Meeting → AI → Portfolio and OpenAI runtime → AI, alongside the existing
Morning Meeting/News/Market integration edges. There is no Portfolio → AI,
AI → Morning Meeting, or runtime → Morning Meeting edge. Existing Sprint 9
coverage remains authoritative for optional/no-AI operation, lifecycle and
exactly-once behavior, trust/security containment, canonical identity and
missing-data semantics, precision, ordering, detachment, and failure isolation.

No new component, test, production source, export, dependency, package version,
or release mechanism is required for this audit. Sprint 9G and Sprint 9 remain
open; Sprint 9G.2 and Sprint 10 have not started.
