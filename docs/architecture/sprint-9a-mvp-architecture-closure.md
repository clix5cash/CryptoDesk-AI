# Sprint 9A MVP Architecture Closure and Acceptance Gates

Status: Sprint 9A.4 closed baseline  
Architecture authority: [ADR-001](./ADR-001-modular-ai-first-architecture.md)  
Sources:
[inventory](./sprint-9-mvp-architecture-inventory.md),
[component map](./sprint-9-mvp-component-map.md), and
[integration contract](./sprint-9-mvp-integration-contract.md)

## Frozen MVP architecture baseline

The implemented baseline is:

```text
@cryptodesk-ai/portfolio — canonical authority
snapshot → deterministic analytics/evidence → presentation/payload
        ↓
@cryptodesk-ai/ai — deterministic preparation
context → model input → message plan → prompt document
        ↓
@cryptodesk-ai/ai — provider-neutral execution
provider request → descriptor → bridge → explicit adapter invocation
        ↓
@cryptodesk-ai/ai — untrusted result
raw execution → ProviderResponse → normalized response → ProviderExchange
        ↓ future Gap B only
structured untrusted candidate → deterministic grounding
→ non_authoritative_interpretation
        ↓ future Gap C only
application-owned mapping → Morning Meeting/application consumer
```

Portfolio owns identities, financial values, allocation, risk, coverage,
timestamps, and provenance. AI depends on Portfolio public contracts; Portfolio
does not depend on AI. Morning Meeting currently depends on Market and News
Intelligence and remains independent of Portfolio AI.

Current APIs for presentation, preparation, neutral request/execution,
responses/exchange, candidate validation, grounding, and existing orchestration
are reusable unchanged. Provider output stays `untrusted_model_execution` through
the exchange. Structured candidates are `untrusted_candidate_interpretation`;
grounding produces only `non_authoritative_interpretation`.

## Formal integration gates

### Gap A — Sprint 9B owner

Current: the neutral request, descriptor, bridge, registry, and adapter seam
exist, but the adapter receives `PortfolioAiModelExecutionRequest`, not the
newer prompt/request/descriptor chain. No runtime or vendor mapping exists.

Required closure:

- backward-compatible validated request-chain-to-runtime mapping;
- concrete runtime adapter outside Portfolio/domain code;
- runtime/infrastructure-owned configuration and credentials;
- contained vendor request/response schemas and body construction;
- exact provider-neutral raw-result mapping and identity preservation.

### Gap B — Sprint 9C owner

Current: response output is opaque and untrusted. Candidate assembly accepts
only caller-supplied structured fields; no output-to-candidate mapper exists.

Required closure:

- explicit isolated structured-output parsing/mapping contract;
- safe failure for malformed or unsupported output;
- existing candidate and canonical-reference validation;
- candidate validation before existing deterministic grounding;
- trust progression only to `non_authoritative_interpretation`.

Parsing in response normalization, inferred canonical facts/references, or raw
output bypassing candidate validation is forbidden.

### Gap C — Sprint 9D owner

Current: grounded Portfolio interpretation and Morning Meeting exist
independently. No composition contract exists.

Required closure:

- explicit application-owned interpretation mapping;
- deliberate Morning Meeting consumption contract;
- user-visible lifecycle and failure semantics;
- preservation of partial/missing evidence and traceability;
- no raw output as evidence and no AI mutation of canonical/analytical state.

## Sprint 9 acceptance gates

### Sprint 9B — concrete provider integration

Complete only when:

- a concrete runtime exists outside Portfolio/domain code and depends on AI
  provider-neutral contracts;
- vendor SDK/types do not leak into Portfolio or neutral public APIs;
- Gap A is resolved minimally and backward-compatibly;
- configuration/credentials and request-body construction stay inside the
  runtime/infrastructure boundary and never enter neutral artifacts;
- exactly one explicitly selected runtime path remains;
- runtime errors map to existing neutral error/result semantics;
- results re-enter the existing `untrusted_model_execution` boundary;
- Portfolio still has no AI dependency and all existing/new runtime tests pass.

### Sprint 9C — candidate and interpretation integration

Complete only when:

- raw output cannot bypass validated response/exchange boundaries;
- output-to-candidate parsing/mapping is explicit and isolated;
- response normalization remains structural only;
- parsing cannot fabricate Portfolio facts or canonical references;
- references resolve to existing context and candidate validation precedes
  grounding;
- grounding produces only `non_authoritative_interpretation`;
- malformed/untrusted output fails safely and Portfolio authority is unchanged.

### Sprint 9D — Morning Meeting AI integration

Complete only when:

- grounded non-authoritative interpretation maps explicitly into an
  application/Morning Meeting contract;
- Morning Meeting never treats raw output as canonical evidence;
- AI narrative cannot mutate Portfolio or deterministic analytical state;
- missing/partial evidence remains visible;
- application composition owns lifecycle/failure presentation;
- existing Morning Meeting behavior remains backward compatible.

### Sprint 9E — MVP application/API surface

Complete only when:

- a clear validated application/API entry point drives the intended
  Portfolio/AI/Morning Meeting flow;
- external input and output contracts are validated;
- runtime/configuration ownership remains outside canonical domain code;
- deterministic failure semantics are exposed where appropriate;
- no reverse or circular dependency is introduced.

### Sprint 9F — MVP hardening and release candidate

Complete only when:

- production-like E2E coverage exercises the complete MVP path;
- provider failures/outages and partial/missing data are exercised;
- credential/configuration security and dependency/runtime boundaries are
  audited;
- a meaningful performance/latency baseline exists;
- release documentation is coherent;
- no critical architecture violation remains unresolved.

### Sprint 9G — MVP v1.0 release closure

Complete only when:

- all Sprint 9B–9F gates pass and the user-relevant path works end-to-end;
- Portfolio remains canonical and provider/model output remains non-canonical;
- runtime isolation and grounded evidence traceability are verified;
- application/Morning Meeting consumes only deliberately mapped
  non-authoritative interpretation;
- failure and missing-data states remain explicit;
- release build, test, and smoke validation pass;
- the repository is clean and architecture docs plus Project Bible/Roadmap are
  synchronized.

Release/tagging is not part of Sprint 9A.

## Sprint 10 non-goals

Sprint 9 is MVP Integration and Release. The following remain Sprint 10 work:

- Ritual-specific autonomous runtime expansion;
- on-chain or verifiable execution;
- scheduled/autonomous recurring operation;
- agent runtime and policy-controlled autonomous actions;
- autonomous trading or execution;
- advanced persistence/state lifecycle beyond MVP needs.

## Backward-compatibility baseline

Sprint 9 must preserve existing Portfolio contracts, AI context/preparation,
neutral execution/request, response/normalization/exchange,
candidate/grounding, and Morning Meeting behavior. Any later extension must be
explicitly documented, additive or backward-compatible, and regression-tested.
Silent breaking changes or repurposed trust markers are not permitted.

## Enforcement baseline

Already structurally or directly test enforced:

- AI → Portfolio direction and absence of Portfolio → AI;
- execution/provider/model identity and terminal status rules;
- trust markers, supported fields, and reference integrity;
- raw-output opacity through ProviderExchange;
- same-symbol cross-network identity;
- partial/unavailable/missing-data and exact-decimal preservation;
- immutability, determinism, failure isolation, and exactly-one neutral adapter
  invocation.

Must become enforced later:

- runtime placement, vendor-schema containment, credentials, and Gap A in 9B;
- isolated parsing/mapping and Gap B in 9C;
- deliberate Morning Meeting consumption and Gap C in 9D;
- application lifecycle and API dependencies in 9E;
- production runtime/security/performance hardening in 9F;
- repository/release closure and synchronized documentation in 9G.

## Sprint 9A closure decision

The inventory, component/dependency/trust maps, and integration contract are
consistent. Gap A/B/C ownership is fixed at Sprint 9B/9C/9D. Sprint 9B–9G gates
and Sprint 10 non-goals are explicit. Sprint 9A introduces no production or
runtime capability and is complete when repository validation passes.

## Sprint 9B.1 implementation note

Sprint 9B.1 adds `@cryptodesk-ai/openai-runtime` as the first concrete runtime
outside Portfolio and AI. It depends inward on the existing AI-owned
`PortfolioAiModelProviderAdapter`, owns OpenAI configuration, credentials,
Responses request construction, HTTP transport, and terminal vendor-response
mapping, and returns only the existing provider-neutral
`untrusted_model_execution` result.

This is a foundation, not full Gap A closure. The frozen bridge still supplies
the established execution request rather than the newer prompt document or
descriptor, so the runtime currently serializes validated canonical context as
vendor input. Sprint 9B.1 adds no candidate parsing, grounding, Morning Meeting
composition, retry, fallback, routing, application lifecycle, or Sprint 10
capability.

## Sprint 9B.2 implementation note

Sprint 9B.2 adds an optional descriptor-aware method to the existing
provider-neutral adapter contract and a validated one-adapter invocation
helper. The established execution-request API, registry, execution service, and
legacy bridge fallback remain compatible. Descriptor-aware runtimes now receive
the exact detached `PortfolioAiProviderRequestDescriptor`, including its source
request and prompt document.

The OpenAI runtime maps the validated repository-owned prompt document into its
vendor request body inside the runtime boundary. Execution/provider/model
identity remains exact, credentials remain runtime-owned, and terminal output
re-enters AI only as `untrusted_model_execution`. Gap B, Gap C, Morning Meeting
composition, retry/fallback/routing, and Sprint 10 capabilities remain
unimplemented. Sprint 9B is not declared complete by this request-side change.

## Sprint 9B.3 implementation note

Sprint 9B.3 hardens the existing OpenAI adapter factory as the explicit
runtime-owned composition boundary. HTTPS endpoint, API key, and optional
positive-integer timeout configuration are validated and captured per adapter
instance. No environment lookup, global runtime state, implicit provider/model
selection, or credential getter is introduced.

An explicitly configured timeout bounds one transport plus response-body
operation, aborts the runtime-local fetch signal, and maps to a sanitized
provider-neutral Failed result. Omitted timeout preserves Sprint 9B.1/9B.2
behavior. External caller cancellation would require changing provider-neutral
contracts and is intentionally not added. Vendor bodies, exceptions, endpoint
details, authorization, and credentials remain contained. Gap B/Sprint 9C, Gap
C, Morning Meeting integration, retry/fallback/routing, and Sprint 10
capabilities have not started. Sprint 9B is not declared complete here.

## Sprint 9B.4 closure decision

Sprint 9B is complete and Gap A is closed. The Sprint 9A acceptance gate is
satisfied:

| Sprint 9B criterion                                                                  | Result |
| ------------------------------------------------------------------------------------ | ------ |
| Concrete runtime outside Portfolio/domain                                            | PASS   |
| Runtime depends inward on provider-neutral AI contracts                              | PASS   |
| Vendor types and schemas remain outside Portfolio and AI                             | PASS   |
| Validated request chain reaches the concrete runtime backward-compatibly             | PASS   |
| Configuration, credentials, request construction, and transport remain runtime-owned | PASS   |
| One explicitly selected invocation performs at most one transport attempt            | PASS   |
| Completed and Failed results preserve exact execution/provider/model identity        | PASS   |
| Operational failures are sanitized and provider-neutral                              | PASS   |
| Output remains opaque `untrusted_model_execution` through ProviderExchange           | PASS   |
| Legacy execution, service, registry, and bridge APIs remain valid                    | PASS   |
| Portfolio has no AI/runtime dependency                                               | PASS   |
| Deterministic repository validation passes without live credentials/network          | PASS   |

Closure tests use deterministic fake transports to bind the concrete runtime to
the existing response, normalization, and exchange validators for both terminal
states. Adversarial output receives no semantic parsing, candidate mapping,
grounding, or trust promotion. Live-provider smoke remains later
release/hardening work. Sprint 9C/Gap B has not started; Morning Meeting
integration remains Sprint 9D.

## Sprint 9C.1 implementation note

An additive AI-owned parser now begins Gap B strictly after a validated
completed `PortfolioAiProviderExchange`. It accepts only a closed
provider-neutral JSON schema, preserves exact execution/provider/optional-model
identity, retains a detached source exchange, and produces only
`untrusted_candidate_interpretation` material. Raw output remains unchanged
`untrusted_model_execution` in the source exchange.

The parser performs structural rejection only. It does not infer references,
validate references against canonical context, invoke candidate assembly or
grounding, or promote trust. Sprint 9C.2 owns candidate validation/integration;
Morning Meeting remains Sprint 9D.

## Sprint 9C.2 implementation note

The parsed-output boundary now integrates additively with the unchanged
candidate assembly and candidate/context-reference validators. Only a validated
Sprint 9C.1 parsed artifact is accepted; canonical context and execution are
obtained from its retained source exchange. The validated result preserves exact
identity, candidate order, explicit references, partial/missing evidence, and
source traceability while remaining `untrusted_candidate_interpretation`.

No raw-string shortcut, semantic matching, canonical authority, candidate
ranking, grounding, or trust promotion is introduced. Sprint 9C.3 owns
grounding and `non_authoritative_interpretation`; Morning Meeting remains Sprint
9D.
