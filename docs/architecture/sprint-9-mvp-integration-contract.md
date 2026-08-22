# Sprint 9 MVP Integration Contract and Runtime Boundary

Status: Sprint 9A.3 architecture contract  
Architecture authority: [ADR-001](./ADR-001-modular-ai-first-architecture.md)  
Inventory: [Sprint 9 MVP Architecture Inventory](./sprint-9-mvp-architecture-inventory.md)  
Component map: [Sprint 9 MVP Component and Dependency Map](./sprint-9-mvp-component-map.md)

Sprint 9A closure:
[Sprint 9A MVP Architecture Closure](./sprint-9a-mvp-architecture-closure.md)

## Scope

This contract defines where later Sprint 9 integration may occur without
changing the authority, trust, or dependency boundaries completed in Sprint 8.
It defines ownership and legal transitions only. No provider, transport,
credential, parser, application API, or Morning Meeting integration is
implemented here.

## Runtime attachment contract

The legal future runtime path is:

```text
provider-neutral AI boundary
        ↓
runtime-owned adapter → external provider → runtime-owned response mapping
        ↓
PortfolioAiModelExecutionResult
        ↓
provider-neutral response validation and exchange
```

The concrete runtime is downstream of AI-owned neutral contracts and implements
or adapts to them. Portfolio and neutral contracts never adapt themselves to
vendor types. Runtime code may later own an SDK, transport, configuration,
credentials, wire-body construction, and vendor response mapping. It cannot own
Portfolio facts, deterministic analytics, presentation, trust markers, or
provider-neutral validation.

The current seam is an explicitly registered `PortfolioAiModelProviderAdapter`.
Its legacy `execute(...)` method accepts `PortfolioAiModelExecutionRequest`; an
optional descriptor-aware method accepts the validated provider request chain.
Registry and bridge code validate its `PortfolioAiModelExecutionResult`.
Registration and model selection are explicit and instance-scoped, and one
bridge call makes one adapter attempt.

## Request-side contract

| Contract                                       | Existing role and legal contents                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PortfolioAiPromptDocument`                    | Versioned deterministic document containing repository-owned logical blocks and retained canonical context references |
| `PortfolioAiProviderRequest`                   | Prompt document plus explicit execution ID and provider/model identity                                                |
| `PortfolioAiProviderRequestDescriptor`         | Detached validated request, identity, version, and provider-neutral logical blocks                                    |
| `PortfolioAiModelExecutionRequest`             | Existing adapter input containing execution ID, built context, and optional explicit provider/model reference         |
| `PortfolioAiModelProviderAdapter.execute(...)` | Current one-invocation seam producing one raw provider-neutral result                                                 |

These contracts must carry the same execution, provider, and optional model
identity. A runtime cannot generate, default, repair, or silently select them.

### Request-chain status after Sprint 9B.2

`invokePortfolioAiProviderAdapterBridge(...)` validates the complete descriptor
and invokes the selected adapter's optional descriptor-aware seam when present.
Adapters without that additive method retain the older execution-request path.
The concrete OpenAI runtime therefore receives the prompt document, provider
request, descriptor blocks, and exact descriptor identity without breaking
legacy execution callers.

Prompt documents, neutral requests/descriptors, execution identity, and raw
result contracts stay provider-neutral. Vendor roles, endpoints, headers,
generation parameters, wire bodies, serializers, and SDK request types may
exist only after a validated request enters the runtime. Request-body
construction is forbidden in Portfolio, deterministic preparation, neutral
contracts, and response/interpretation modules.

## Response-side contract

```text
external provider response
        ↓
runtime-owned vendor mapping
        ↓
PortfolioAiModelExecutionResult (untrusted_model_execution)
        ↓
PortfolioAiProviderResponse
        ↓
PortfolioAiNormalizedProviderResponse
        ↓
PortfolioAiProviderExchange (untrusted_model_execution)
```

Vendor response schemas stop at the runtime boundary. Runtime mapping must
produce the existing neutral raw result with exact request identity, the
boundary-owned trust marker, and valid Completed output or Failed metadata.
Vendor-only fields cannot leak into neutral artifacts.

Completed output remains opaque. ProviderResponse validates status, identity,
authority, and ownership. Normalization is structural only; ProviderExchange
binds existing validated artifacts. None may parse, classify, ground,
recommend from, or assign canonical meaning to output.

## Configuration and credential boundary

Future configuration, secrets, API keys, endpoints, and environment lookup are
runtime/infrastructure-owned. An application composition root may later supply
them to the runtime, but they never enter:

- Portfolio domain, evidence, presentation, or payloads;
- context, model input, message plan, or prompt document;
- neutral request, descriptor, result, response, normalized response, exchange,
  candidate, or interpretation artifacts;
- logs, errors, provenance, or returned application records.

Provider discovery cannot become implicit domain behavior. Deterministic core
logic performs no environment lookup. Provider/model selection stays explicit
unless a later application policy is separately designed without moving
canonical ownership.

## Error boundary

Vendor SDK and transport exceptions stop inside the runtime. Expected provider
failures may later be mapped into the existing provider-neutral Failed result;
AI validators remain authoritative for failure shape, identity, status, and
trust. Unexpected adapter exceptions continue to use the existing neutral
`AiBoundaryValidationError` behavior.

Vendor-specific error classes cannot enter Portfolio or neutral responses. A
provider/transport failure is operational state, not canonical analytical
truth. Retry, fallback, backoff, and alternate routing—if later authorized—are
runtime/application policy, never Portfolio logic or response normalization.

## Interpretation boundary

```text
untrusted_model_execution
        ↓ future explicit structured-candidate mapping
untrusted_candidate_interpretation
        ↓ existing deterministic reference validation/grounding
non_authoritative_interpretation
```

Semantic interpretation may begin only in a future explicit component after a
Completed raw result passes response/exchange validation. It must produce the
existing structured candidate shape and pass candidate validation. Raw output
cannot bypass that boundary, and response normalization cannot parse it.

Candidate mapping cannot fabricate canonical identities, facts, values,
coverage, timestamps, or provenance. Grounding validates only explicit existing
context references and cannot infer missing references. Grounded interpretation
remains non-authoritative and cannot overwrite Portfolio.

## Application and Morning Meeting boundary

```text
grounded non_authoritative_interpretation
        ↓
application-owned mapping and lifecycle policy
        ↓
Morning Meeting consumer/presentation boundary
```

Morning Meeting currently owns independent deterministic market/news analysis
and presentation-only narration contracts. It has no Portfolio AI dependency.
A later mapper must deliberately select validated grounded data while retaining
non-authoritative status and traceability. Morning Meeting cannot consume raw
provider output as evidence, and AI text cannot mutate Morning Meeting analysis
or Portfolio state. Application composition owns user-visible lifecycle and
error policy.

## Dependency rules

| Layer                    | May depend on                                                            | Must not depend on or own                                                        |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Portfolio/domain         | Its domain modules and approved lower-level contracts                    | AI, runtime/provider code, vendor SDKs, Morning Meeting, application composition |
| AI/provider-neutral      | Portfolio public contracts and neutral AI modules                        | Vendor SDK, transport, credentials, or runtime schemas                           |
| Concrete runtime         | AI public neutral contracts; later vendor SDK/transport/configuration    | Portfolio internals or canonical authority                                       |
| Interpretation/grounding | Validated execution, structured candidates, canonical context references | Vendor schemas, credentials, transport, canonical mutation                       |
| Application composition  | Public Portfolio, AI, runtime abstractions, and Morning Meeting APIs     | Reassignment of canonical authority or validation bypass                         |
| Morning Meeting          | Existing Market/News dependencies and later explicit application DTOs    | Raw Portfolio provider output or provider/Portfolio authority                    |

No circular dependency is permitted. Runtime depends inward on the neutral
interface; neutral and domain layers never import outward runtime code.

## Later Sprint 9 ownership map

This assigns boundary ownership, not implementation design.

| Stage                                            | Owned outcome                                                                                                    | Required boundaries                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Sprint 9B — concrete provider integration        | Resolve Gap A with an explicit runtime adapter and minimum request/result mapping                                | Runtime outside Portfolio/neutral contracts; vendor and credential containment; exact identity; untrusted result        |
| Sprint 9C — candidate/interpretation integration | Resolve Gap B with an explicit output-to-structured-candidate boundary followed by existing validation/grounding | No parsing in response normalization; candidates untrusted; no fabricated references; grounded output non-authoritative |
| Sprint 9D — Morning Meeting AI integration       | Resolve Gap C with application-owned grounded-interpretation mapping                                             | No raw-output consumption or analytical/canonical mutation; traceability retained                                       |
| Sprint 9E — MVP application/API surface          | Compose validated Portfolio, runtime, interpretation, and Morning Meeting lifecycle                              | Application owns lifecycle/errors; no credential/vendor-schema leakage or authority movement                            |
| Sprint 9F — MVP hardening/release candidate      | Harden security, failures, observability, compatibility, and integration behavior                                | All dependency, trust, identity, precision, missing-data, and isolation invariants                                      |
| Sprint 9G — MVP release closure                  | Audit and close the implemented MVP against ADR-001 and this contract                                            | No unresolved boundary violations; validation and release documentation complete                                        |

## Invariants and enforcement

| Invariant                                                           | Current classification                                                                   | Later structural owner when needed                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Portfolio is sole canonical authority and has no AI dependency      | Structurally represented and closure-tested                                              | Maintain in every stage                             |
| Neutral contracts import no vendor SDK/runtime                      | Structurally true and source-audited today                                               | Sprint 9B preserves with placement/dependency tests |
| Identity, status, trust, supported fields, and references are exact | Runtime validators and contract/E2E tests                                                | Maintain in 9B–9F                                   |
| Raw output stays `untrusted_model_execution` through exchange       | Runtime validators and opacity tests                                                     | Maintain in 9B–9F                                   |
| Cross-network identity, missing data, and decimal precision survive | Portfolio and full-exchange E2E tests                                                    | Maintain in 9B–9F                                   |
| Runtime remains outside canonical/domain code                       | Convention-only until runtime exists                                                     | Sprint 9B                                           |
| Vendor schemas and credentials remain contained                     | Convention-only until runtime/configuration exists                                       | Sprint 9B and 9F                                    |
| Gap A exposes the neutral prompt/request chain compatibly           | Convention-only; current mismatch documented                                             | Sprint 9B                                           |
| Semantic mapping starts after validated exchange                    | Response APIs prevent in-boundary parsing; mapper placement conventional until it exists | Sprint 9C                                           |
| Candidate validation precedes grounding                             | Structurally composed and directly tested                                                | Maintain in Sprint 9C                               |
| Morning Meeting consumes only deliberate non-authoritative mapping  | Convention-only because integration does not exist                                       | Sprint 9D                                           |
| Application owns lifecycle/errors without moving authority          | Convention-only because application surface does not exist                               | Sprint 9E                                           |
| Release boundaries remain closed                                    | Convention until integrations exist                                                      | Sprint 9F and 9G                                    |

Existing Sprint 8 APIs remain additive and opt-in. Later stages must compose
around them or introduce an explicitly reviewed backward-compatible boundary;
they cannot silently repurpose existing contracts.

## Sprint 9B closure status

Sprint 9B.4 closes Gap A against this contract. The concrete OpenAI runtime is
outside Portfolio and AI, depends inward on neutral AI contracts, consumes the
validated request descriptor, owns vendor request/response mapping and
configuration, contains credentials and operational failures, performs one
explicit transport attempt, and returns only exact-identity provider-neutral
Completed or Failed results with `untrusted_model_execution` authority.

Legacy execution requests remain supported. Deterministic fake transports—not
live credentials or network calls—enforce closure. Live-provider smoke remains
later release/hardening work. Gap B remains unimplemented for Sprint 9C and Gap
C remains unimplemented for Sprint 9D.

## Sprint 9C.1 structured-output boundary

Gap B begins after the validated `PortfolioAiProviderExchange`, never inside
runtime, ProviderResponse, normalization, or exchange validation. The additive
parser accepts only a closed JSON document with exact execution/provider/
optional-model identity plus descriptive candidate assembly fields and opaque
fact/section references. Unsupported, canonical, malformed, duplicate-ID, and
prototype-shaped structures fail closed with `AiBoundaryValidationError`.

The source exchange remains the audit artifact and its raw output remains
unchanged `untrusted_model_execution`. Parsed output is detached but still
untrusted candidate material; there is no grounding or promotion to
`non_authoritative_interpretation`. Existing candidate/context-reference
validation and integration are Sprint 9C.2. Morning Meeting remains Sprint 9D.
