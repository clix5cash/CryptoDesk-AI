# Sprint 9 MVP Component and Dependency Map

Status: Sprint 9A.2 current-state contract  
Architecture authority: [ADR-001](./ADR-001-modular-ai-first-architecture.md)  
Inventory baseline:
[Sprint 9 MVP Architecture Inventory](./sprint-9-mvp-architecture-inventory.md)

Runtime and integration contract:
[Sprint 9 MVP Integration Contract](./sprint-9-mvp-integration-contract.md)

Sprint 9A closure:
[Sprint 9A MVP Architecture Closure](./sprint-9a-mvp-architecture-closure.md)

## Scope

This map converts the implemented Sprint 8 inventory into the component,
dependency, and trust contract that later Sprint 9 composition must preserve.
It describes existing code and known integration gaps. It adds no provider,
transport, parser, grounding, or application capability.

## Legal forward flow

```text
A. CANONICAL AUTHORITY (@cryptodesk-ai/portfolio)
Portfolio snapshot → valuation/allocation/risk/insights → presentation/payload
        │
        ▼
B. DETERMINISTIC PREPARATION (@cryptodesk-ai/ai)
AI context → model input → message plan → prompt document
        │
        ▼
C. PROVIDER-NEUTRAL EXECUTION BOUNDARY (@cryptodesk-ai/ai)
provider request → descriptor → bridge → explicit adapter registry/execution
        │
        ▼
D. UNTRUSTED PROVIDER RESULT (@cryptodesk-ai/ai)
raw result → ProviderResponse → normalized response → ProviderExchange
        │
        ╞══ Gap B: no raw-output-to-candidate implementation
        ▼
E. INTERPRETATION / GROUNDING (@cryptodesk-ai/ai)
caller-supplied structured candidate → validated grounding
→ non_authoritative_interpretation
        │
        ╞══ Gap C: no Portfolio interpretation application mapping
        ▼
F/G. APPLICATION / MORNING MEETING COMPOSITION
existing independent orchestration contracts; no cross-package integration
```

Gap A sits inside C: no concrete runtime currently implements the
provider-neutral adapter seam.

## MVP component map

“Extend around” means later work may add an external composition or adapter; it
does not authorize changing the existing component.

| Group and owner                     | Existing component/module                                                | Role and legal input → output                                                                              | Trust and canonical status                                                                   | Dependency direction                                                | Exists / reuse  | Later Sprint 9 boundary                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- |
| A. `@cryptodesk-ai/portfolio`       | Snapshot, identity, normalization, wallet mapping                        | Provider/domain observations → validated canonical snapshot                                                | Canonical authority                                                                          | No AI dependency                                                    | Yes / unchanged | Compose around; do not move identity ownership                            |
| A. `@cryptodesk-ai/portfolio`       | Valuation, allocation, risk, insight, prioritization                     | Canonical snapshot and explicit price/risk inputs → deterministic analysis/evidence                        | Canonical Portfolio facts                                                                    | Internal Portfolio flow only                                        | Yes / unchanged | Reuse; no AI replacement of calculations                                  |
| A. `@cryptodesk-ai/portfolio`       | `PortfolioPresentation`, sections, `PortfolioPresentationPayload`        | Canonical analysis/evidence → detached JSON-safe presentation                                              | Canonical projection                                                                         | Portfolio internal; consumed by AI                                  | Yes / unchanged | Reuse as the only Portfolio-to-AI source                                  |
| B. `@cryptodesk-ai/ai`              | `buildPortfolioAiContext`                                                | Validated presentation payload → selected context facts/sections                                           | Deterministic canonical projection; not new authority                                        | AI imports Portfolio contracts                                      | Yes / unchanged | Compose around explicit selection options                                 |
| B. `@cryptodesk-ai/ai`              | `PortfolioAiModelInput`                                                  | Built context plus explicit fact/section IDs → structured model input                                      | Deterministic preparation                                                                    | Downstream of context                                               | Yes / unchanged | Reuse                                                                     |
| B. `@cryptodesk-ai/ai`              | `PortfolioAiMessagePlan`                                                 | Validated model input → repository-owned ordered plan                                                      | Deterministic preparation                                                                    | Downstream of model input                                           | Yes / unchanged | Reuse; no arbitrary prompt path                                           |
| B. `@cryptodesk-ai/ai`              | `PortfolioAiPromptDocument`                                              | Message plan → versioned provider-neutral document                                                         | Deterministic preparation                                                                    | Downstream of plan                                                  | Yes / unchanged | Reuse; later mapping must remain outside Portfolio                        |
| C. `@cryptodesk-ai/ai`              | `PortfolioAiProviderRequest`                                             | Prompt document plus explicit execution/model identity → request envelope                                  | Provider-neutral; no canonical ownership                                                     | Downstream of preparation                                           | Yes / unchanged | Reuse                                                                     |
| C. `@cryptodesk-ai/ai`              | `PortfolioAiProviderRequestDescriptor`                                   | Validated request → ordered logical descriptor blocks                                                      | Provider-neutral; no canonical ownership                                                     | Downstream of request                                               | Yes / unchanged | Reuse                                                                     |
| C. `@cryptodesk-ai/ai`              | `PortfolioAiModelProviderRegistry`, adapter interface, execution service | Explicit execution request/model → exactly one registered adapter invocation                               | Provider-neutral execution boundary                                                          | May consume Portfolio-derived context; never imported by Portfolio  | Yes / unchanged | Gap A attaches behind or explicitly alongside this seam                   |
| C. `@cryptodesk-ai/ai`              | `invokePortfolioAiProviderAdapterBridge`                                 | Validated descriptor → execution request → one adapter invocation                                          | Boundary-owned validation; no trust promotion                                                | Descriptor to registry/adapter                                      | Yes / unchanged | Current seam does not pass prompt document/descriptor to adapter          |
| D. `@cryptodesk-ai/ai`              | `PortfolioAiModelExecutionResult`                                        | Adapter result → validated Completed output or Failed metadata                                             | `untrusted_model_execution`; non-canonical                                                   | Returned from C only                                                | Yes / unchanged | Input to response boundary; never canonical evidence                      |
| D. `@cryptodesk-ai/ai`              | `PortfolioAiProviderResponse`                                            | Descriptor plus raw result → identity-bound response                                                       | `untrusted_model_execution`; opaque                                                          | Downstream of raw result                                            | Yes / unchanged | Reuse                                                                     |
| D. `@cryptodesk-ai/ai`              | `PortfolioAiNormalizedProviderResponse`                                  | ProviderResponse → stable terminal structural representation                                               | `untrusted_model_execution`; opaque                                                          | Downstream of response                                              | Yes / unchanged | Reuse; structural normalization only                                      |
| D. `@cryptodesk-ai/ai`              | `PortfolioAiProviderExchange`                                            | Descriptor plus normalized response → detached round-trip envelope                                         | `untrusted_model_execution`; reference-only                                                  | Terminal provider exchange boundary                                 | Yes / unchanged | Gap B begins only after this boundary                                     |
| E. `@cryptodesk-ai/ai`              | Candidate contract and `assemblePortfolioAiCandidateInterpretation`      | Caller-supplied structured fields plus validated context/execution → candidate result                      | `untrusted_candidate_interpretation`; non-canonical                                          | Downstream of validated execution, not automatically connected to D | Yes / unchanged | Gap B must supply an explicit future mapping without bypassing validation |
| E. `@cryptodesk-ai/ai`              | `groundPortfolioAiCandidateInterpretation`, grounded-result validators   | Valid candidate and exact fact/section references → grounded interpretation                                | `non_authoritative_interpretation`; never canonical                                          | Downstream of candidates and canonical references                   | Yes / unchanged | Reuse; no new grounding mechanism in 9A.2                                 |
| F. `@cryptodesk-ai/ai`              | `PortfolioAiInterpretationPipeline`, execution service                   | Context input, explicit execution, and caller candidates → existing execution/candidate/grounded artifacts | Mixed explicit stages; final result non-authoritative                                        | Application composition over 8A–8C                                  | Yes / unchanged | Does not compose the newer 8E–8H exchange path                            |
| G. `@cryptodesk-ai/morning-meeting` | Report service, News Brief selection, narration service/registry/adapter | Market/news inputs → deterministic report; selected brief → validated narration                            | Analytical report remains owned by Morning Meeting; narration is untrusted presentation text | Depends on Market/News Intelligence, not AI/Portfolio               | Yes / unchanged | Gap C requires a future application-owned mapping                         |

## Dependency contract

### Allowed

```text
application/composition
        ↓
Morning Meeting and/or AI public contracts
        ↓
AI deterministic preparation and provider-neutral boundaries
        ↓
Portfolio public presentation/domain contracts
```

- `@cryptodesk-ai/ai` may import public `@cryptodesk-ai/portfolio` contracts.
- A future application composition layer may depend on AI, Portfolio, and
  Morning Meeting public APIs.
- A future concrete runtime may implement an AI-owned provider-neutral adapter
  interface and depend on provider SDK/transport code in its integration
  boundary.
- Candidate/grounding code may depend on validated untrusted execution identity
  and canonical context references.
- Morning Meeting integration, if later added, must consume a deliberately
  mapped validated interpretation rather than opaque provider output.

### Forbidden

- Portfolio importing AI, provider, interpretation, application, or Morning
  Meeting modules.
- A concrete provider runtime owning or constructing canonical Portfolio facts.
- Provider-specific SDK, schema, role, credential, or transport types leaking
  into Portfolio or provider-neutral contracts.
- Interpretation/grounding executing upstream of raw-result validation.
- Raw output being treated as canonical evidence or directly changing Morning
  Meeting analytical state.
- Morning Meeting or application composition promoting provider text into
  Portfolio authority.

## Trust-transition map

| Boundary                                               | Existing trust terminology                     | Permitted transition                                                                              |
| ------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Portfolio snapshot, analytics, evidence, presentation  | Canonical Portfolio authority                  | Domain validation and deterministic projection only                                               |
| AI context, model input, message plan, prompt document | Deterministic Portfolio-derived preparation    | Retains references; creates no new canonical fact                                                 |
| Provider request and descriptor                        | Provider-neutral preparation/execution input   | Explicit identity binding only                                                                    |
| Raw execution                                          | `untrusted_model_execution`                    | Completed/Failed structural validation only                                                       |
| ProviderResponse                                       | `untrusted_model_execution`                    | Identity/reference validation; no promotion                                                       |
| Normalized provider response                           | `untrusted_model_execution`                    | Structural normalization only                                                                     |
| ProviderExchange                                       | `untrusted_model_execution`                    | Terminal traceability envelope; raw output remains opaque                                         |
| Structured candidate                                   | `untrusted_candidate_interpretation`           | Only from explicit caller-supplied structured fields under current API                            |
| Grounded interpretation                                | `non_authoritative_interpretation`             | Exact-reference structural grounding; never canonical                                             |
| Morning Meeting/application consumption                | Component-specific validated application state | No implemented Portfolio AI transition; future composition must retain non-authoritative labeling |

No existing transition promotes model output to canonical Portfolio authority.

## Known Sprint 9 integration gaps

| Gap                              | Upstream → downstream                                                             | Existing seam                                                                                                         | Missing contract/capability                                                                                                                                                                              | Prohibited shortcut                                                                                                                                  | Intended later ownership                                                             |
| -------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A. Concrete provider/runtime     | Request descriptor/bridge → raw execution result                                  | Explicit `PortfolioAiModelProviderAdapter.execute(PortfolioAiModelExecutionRequest)` registration and one-call bridge | Concrete adapter, secure configuration, prompt/request-to-vendor mapping, transport, and vendor-result mapping. The current adapter input does not receive the newer prompt document/request/descriptor. | SDK/credentials in Portfolio or provider-neutral contracts; discovery, implicit selection, retry, fallback, or fabricated identities                 | Later Sprint 9 provider/integration boundary, explicitly composed into AI interfaces |
| B. Opaque output to candidate    | `PortfolioAiProviderExchange` → structured candidate assembly                     | Existing candidate assembly accepts already-structured caller fields and validates execution/context identity         | Explicit output-to-structured-candidate policy and contract                                                                                                                                              | Parsing inside response normalization/exchange; inferred canonical facts/references; treating raw text as evidence; bypassing candidate validation   | Later Sprint 9 interpretation adapter/boundary                                       |
| C. Interpretation to application | Grounded non-authoritative Portfolio interpretation → Morning Meeting/application | Separate public AI and Morning Meeting contracts; no connecting module                                                | Application-owned mapping, lifecycle, presentation, and acceptance policy                                                                                                                                | Feeding raw output directly into Morning Meeting; changing analytical state/provenance; adding Morning Meeting → AI/Portfolio authority dependencies | Later Sprint 9 application composition boundary                                      |

## MVP dependency invariants

1. Portfolio is the sole canonical Portfolio authority and has no AI dependency.
2. Provider output and every response/exchange representation remain
   `untrusted_model_execution`.
3. Provider artifacts cannot create or overwrite canonical facts or provenance.
4. Same-symbol assets on different networks remain distinct by canonical
   identity, never by rendered symbol/name/text.
5. Partial, unavailable, missing, unclassified, and insufficient-data states
   remain explicit.
6. Exact canonical decimal strings remain unchanged where referenced; provider
   boundaries perform no numeric conversion or arithmetic.
7. Sprint 8 public APIs remain backward compatible, additive, and opt-in.
8. Provider-neutral preparation and validation remain deterministic.
9. Raw model output is never canonical evidence.
10. Interpretation and grounding remain downstream of validated untrusted
    execution and use existing trust markers.
11. Morning Meeting cannot directly promote raw provider output into analytical
    or canonical state.

## Enforcement review

| Invariant                                                                              | Current enforcement                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| AI → Portfolio package direction; no Portfolio → AI package dependency                 | Structurally represented in package manifests and guarded by the Sprint 8 closure test; source-import audit agrees |
| Public component availability                                                          | Package `index.ts` exports plus build/typecheck and closure tests                                                  |
| Identity, status, trust-marker, unsupported-field, and reference integrity             | Runtime validators and focused tests at each AI boundary                                                           |
| Exactly-one explicit adapter invocation; no registry fallback                          | Registry/bridge implementation and tests                                                                           |
| Same-symbol cross-network identity, missing-data, precision, immutability, determinism | Portfolio and full-exchange E2E tests                                                                              |
| No raw-output parsing in response/exchange normalization                               | API shapes, implementation, source audit, and opacity tests                                                        |
| Concrete runtime must live outside canonical/provider-neutral code                     | Convention from ADR-001 and this contract; no concrete runtime exists to enforce yet                               |
| Future Gap B mapping must not infer canonical facts                                    | Convention plus downstream candidate/grounding validators; the mapping component does not exist                    |
| Future Morning Meeting composition must consume validated non-authoritative data       | Convention; no cross-package integration contract exists                                                           |
| Backward compatibility across later Sprint 9 changes                                   | Convention supported by current public API regression tests; future changes still require review                   |

The convention-only items are later Sprint 9 architecture gates. Their absence
does not justify implementing the missing capabilities in Sprint 9A.2.

## Sprint 9C.1 component-map note

`parsePortfolioAiStructuredOutput` is an AI-owned component downstream only of
validated completed `PortfolioAiProviderExchange`. It maps the closed JSON
schema to detached `untrusted_candidate_interpretation` material and retains the
source exchange. Runtime, response normalization, and exchange validation stay
structural and unchanged. Candidate/context-reference validation and grounding
are not invoked; their integration remains Sprint 9C.2.

## Sprint 9C.2 component-map note

`validatePortfolioAiParsedCandidates` is the additive AI-owned connection from
`PortfolioAiParsedStructuredOutput` to the unchanged candidate assembly and
candidate/context-reference validators. It accepts no raw text and retains a
detached source exchange in `PortfolioAiParsedCandidateValidationResult`.
Identity, candidate order, and explicit references remain exact; trust stops at
`untrusted_candidate_interpretation`. Grounding remains Sprint 9C.3.

## Sprint 9C.3 component-map note

`groundPortfolioAiParsedCandidates` is the additive AI-owned integration from
the 9C.2 validation envelope to the unchanged
`groundPortfolioAiCandidateInterpretation` boundary. It requires the matching
parsed artifact, retains parsed/candidate/exchange traceability, and permits only
`untrusted_candidate_interpretation` → `non_authoritative_interpretation`.
References remain exact and canonical data remains upstream. Sprint 9C.4 owns
Gap B E2E closure; Morning Meeting remains Sprint 9D.

## Sprint 9C.4 component-map closure

Gap B is CLOSED with no production component changes in 9C.4. The existing
public components compose only in this order: ProviderExchange → parser →
candidate validation → deterministic grounding. Tests audit that parser logic
does not move into runtime/normalization, grounding cannot bypass parsed and
validated artifacts, dependency direction stays AI → Portfolio, and Morning
Meeting remains outside the path. The terminal Gap B artifact is only
`non_authoritative_interpretation`; Sprint 9D owns Gap C.

## Sprint 9D.1 component-map note

`composeMorningMeetingPortfolioAi` is the application-owned entry into Gap C.
It validates an existing canonical Morning Meeting report/request and Portfolio
AI context alongside zero or more complete grounded results. It preserves the
two sources as distinct envelope components and accepts no raw execution,
parsed, candidate, runtime, or vendor contract.

The dependency direction is Morning Meeting → provider-neutral AI → Portfolio.
There is no reverse AI → Morning Meeting or Portfolio → AI edge. Full Morning
Meeting orchestration remains Sprint 9D.2 or later.

## Sprint 9D.2 component-map note

`composeMorningMeetingPortfolioAiApplicationOutput` is downstream of the 9D.1
validator and alongside, not inside, `DefaultMorningMeetingService`. It maps
already-grounded interpretation prose into an authority-labeled presentation
field while returning a detached copy of the unchanged canonical report.

There is no raw-output, parser, candidate, grounding, provider-runtime, or
vendor dependency in the application API. Missing AI is a normal path; invalid
AI follows the caller-selected reject or omit policy. Sprint 9D.3 or later owns
remaining lifecycle and closure work.
