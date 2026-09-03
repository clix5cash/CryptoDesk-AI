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

## Sprint 9C.2 candidate-validation integration

Parsed output now reaches the existing candidate-validation boundary through
one explicit opt-in API. The API accepts only `PortfolioAiParsedStructuredOutput`,
derives canonical context and raw execution from its retained validated exchange,
and delegates candidate construction plus fact/section reference checks to the
existing validators. Unknown, contradictory, malformed, duplicate, injected,
or identity-mutated material fails with `AiBoundaryValidationError`.

The result retains exact exchange traceability and remains
`untrusted_candidate_interpretation`. It performs no semantic inference,
ranking, arithmetic, grounding, or promotion to
`non_authoritative_interpretation`. Sprint 9C.3 owns grounding; Morning Meeting
remains Sprint 9D.

## Sprint 9C.3 explicit grounding integration

Validated parsed candidates now enter the existing deterministic grounding
boundary through one explicit opt-in API. The API requires both the validated
parsed artifact and its exact 9C.2 candidate-validation envelope, rejects
substituted identity/trust/references, and returns detached grounded output with
complete parsed, candidate, and ProviderExchange traceability.

Grounding alone performs the permitted trust transition from
`untrusted_candidate_interpretation` to
`non_authoritative_interpretation`. It copies validated references and ordering;
it performs no raw parsing, semantic matching, ranking, arithmetic, missing-data
repair, or canonical fact creation. Sprint 9C.4 owns Gap B E2E closure, and
Morning Meeting composition remains Sprint 9D.

## Sprint 9C.4 Gap B closure decision

Gap B is CLOSED. The acceptance matrix is:

| Gap B criterion                                                                            | Result |
| ------------------------------------------------------------------------------------------ | ------ |
| Parsing begins only after validated ProviderExchange                                       | PASS   |
| Raw output remains `untrusted_model_execution`                                             | PASS   |
| Parser accepts only its explicit structured schema                                         | PASS   |
| Malformed, unknown, and canonical-field injection fails closed                             | PASS   |
| No raw-string-to-candidate or raw-output-to-grounding shortcut exists                      | PASS   |
| Candidate validation and exact fact/section reference checks precede grounding             | PASS   |
| No fuzzy, symbol, prose, or semantic reference matching exists                             | PASS   |
| Trust remains `untrusted_candidate_interpretation` before grounding                        | PASS   |
| Grounding is explicit, deterministic, and produces only `non_authoritative_interpretation` | PASS   |
| Portfolio remains the sole canonical authority                                             | PASS   |
| Exchange/execution/provider/model/candidate/reference identity remains traceable           | PASS   |
| Same-symbol cross-network identity remains distinct                                        | PASS   |
| Partial, unavailable, insufficient, and missing-data states remain explicit                | PASS   |
| Canonical decimal strings remain exact                                                     | PASS   |
| Candidate order is preserved                                                               | PASS   |
| Failed calls remain isolated                                                               | PASS   |
| Sprint 8 and Sprint 9B public APIs remain compatible                                       | PASS   |
| Full repository validation passes                                                          | PASS   |

Focused closure tests compose the public APIs and audit dependency/source
boundaries. No production acceptance defect or new production capability was
needed in 9C.4. Gap B ends at `non_authoritative_interpretation`. Gap C begins
only at later application-owned composition into Morning Meeting; Sprint 9D
owns that boundary and has not started.

## Sprint 9D.1 composition contract

The legal Gap C entry is now:

`non_authoritative_interpretation` → application-owned validated composition
envelope → Morning Meeting.

The composition input contains canonical Morning Meeting report/request and
Portfolio AI context plus an ordered list of already-grounded Sprint 9C results.
Validation replays the existing canonical and grounding validators, requires
the exact retained source context, and rejects duplicate identity, unknown or
contradictory references, injected fields, and every pre-grounding trust state.

The output keeps canonical state and non-authoritative AI material separate.
Canonical context wins by construction: the boundary performs no reconciliation,
semantic matching, missing-data repair, numeric conversion, ranking, trust
promotion, or prose generation. Sprint 9D.1 is contract-only; Gap C and full
Morning Meeting integration are not complete.

## Sprint 9D.2 application integration

The current Gap C path is:

`non_authoritative_interpretation` →
`MorningMeetingPortfolioAiComposition` → application-owned presentation
orchestration → canonical report plus separate non-authoritative AI narrative.

The application validates that the composition's request and report are exact
matches for its canonical inputs. It preserves interpretation and candidate
order and emits only descriptive prose with provider-neutral trace locators.
Canonical conflicts cannot overwrite the report because AI content is never
merged into its analytical fields.

AI is optional. Invalid AI fails closed by default or may be deliberately
omitted under an explicit application policy; either outcome leaves canonical
state unchanged. Gap C and Sprint 9D are not complete. Sprint 9D.3 or later owns
remaining lifecycle and hardening work.

## Sprint 9D.3 lifecycle contract

The optional lifecycle wrapper distinguishes:

- AI not requested → `not_requested`
- AI requested but no composition supplied → `unavailable`
- validated composition presented → `included`
- invalid composition under explicit omit policy → `omitted_invalid`
- invalid composition under default reject policy → sanitized
  `rejected_invalid` application error

These outcomes never alter canonical analytical truth or create another AI
trust level. Included narrative still carries only
`non_authoritative_interpretation`; all other non-error outcomes return a usable
canonical report without AI prose. Exact trace validation, deterministic order,
detachment, and failed-call isolation remain enforced. Gap C remains open for
the Sprint 9D.4 closure gate.

## Sprint 9D.4 Gap C closure decision

Gap C is CLOSED. The acceptance matrix is:

| Gap C criterion                                                                          | Result |
| ---------------------------------------------------------------------------------------- | ------ |
| Morning Meeting owns composition, lifecycle, inclusion policy, and presentation          | PASS   |
| Dependency direction remains Morning Meeting → AI → Portfolio with no reverse edge       | PASS   |
| Only `non_authoritative_interpretation` enters application composition                   | PASS   |
| Raw execution and untrusted candidates cannot enter Morning Meeting                      | PASS   |
| Canonical report and AI narrative remain structurally and authoritatively separate       | PASS   |
| No-AI behavior remains valid and AI inclusion remains optional                           | PASS   |
| Invalid AI fails closed; explicit omission remains application-owned                     | PASS   |
| AI failure or prose conflict cannot mutate canonical state                               | PASS   |
| Exact execution/provider/model/candidate/fact/presentation/section traceability survives | PASS   |
| Same-symbol cross-network identity remains distinct                                      | PASS   |
| Partial, unavailable, insufficient, and missing-data states remain explicit              | PASS   |
| Canonical decimal strings remain exact                                                   | PASS   |
| Canonical and AI ordering remain deterministic without ranking or merging                | PASS   |
| Lifecycle outcomes remain application-only, outside canonical state and AI trust         | PASS   |
| Outputs are detached, calls repeatable, and failures isolated                            | PASS   |
| Sprint 8/9B/9C and Morning Meeting public APIs remain compatible                         | PASS   |
| No provider/runtime/vendor/secret leakage or forbidden capability exists                 | PASS   |
| Full repository validation passes                                                        | PASS   |

Focused closure coverage reuses the lower-level 9D.1–9D.3 and Sprint 9C tests
and adds one complete public-API success path. No production acceptance defect
was found. Sprint 9E owns MVP application/API lifecycle beyond Gap C and has not
started.

## Sprint 9E.1 MVP application/API contract

The legal external entry path is now:

```text
external application caller
        ↓
DefaultMorningMeetingMvpApplicationApi.execute(input)
        ↓
injected MorningMeetingService.generate(request)
        ↓
existing composeMorningMeetingPortfolioAiLifecycle(...)
        ↓
MorningMeetingPortfolioAiLifecycleResult
```

The API validates its closed outer input, detaches the request before invoking
the service, validates the generated report through the existing 9D lifecycle,
and returns the existing detached lifecycle result. AI intent is explicit.
When requested, only an optional caller-supplied
`MorningMeetingPortfolioAiComposition` may enter; the API performs no provider
call, parsing, grounding, inference, or autonomous AI execution.

Canonical Morning Meeting and Portfolio records remain authoritative. Included
narrative remains separate `non_authoritative_interpretation`, retains exact
execution/provider/optional-model/candidate/fact/presentation-item/section
references through the validated source chain, and exposes no raw output.
Malformed or authority-conflicting AI follows the unchanged reject-or-explicit-
omit policy and cannot affect canonical output. This is Sprint 9E.1 only;
transport and later application lifecycle work are not implemented.

## Sprint 9E.2 external trigger and execution contract

`MorningMeetingMvpApplicationApiInput` remains the single external request:
canonical `MorningMeetingRequest`, explicit `aiRequested`, optional supplied
`MorningMeetingPortfolioAiComposition`, and optional existing failure policy.
`MorningMeetingMvpApplicationApiOutput` remains the existing 9D lifecycle
result. No runtime configuration or provider artifact enters either contract.

The execution rules are:

1. validate the closed external envelope and request;
2. reject contradictory AI options before any generation;
3. invoke `MorningMeetingService.generate` exactly once;
4. invoke `composeMorningMeetingPortfolioAiLifecycle` at most once;
5. return its detached result or a sanitized application error.

The composition must exactly own the generated request/report and retain its
validated source identities and references. There is no stale-artifact repair,
fuzzy reconciliation, provider invocation, retry, fallback, network transport,
or raw-output exposure. Canonical authority and the existing five lifecycle
outcomes remain unchanged. Sprint 9E.2 ends at this execution boundary.

## Sprint 9E.3 lifecycle-hardening contract

For every accepted call, the facade validates first, creates independent
detached request copies, invokes canonical generation exactly once, and applies
the existing lifecycle at most once. A service cannot mutate the lifecycle's
accepted request identity. No service failure reaches composition, and invalid
service output returns no partial result.

All non-AI execution failures are normalized to the fixed provider-neutral
Morning Meeting application failure message. The existing
`MorningMeetingPortfolioAiApplicationError` continues to represent only
`rejected_invalid`; successful lifecycle result shapes and semantics are
unchanged. Sprint 9E remains open and Sprint 9E.4 owns closure.

## Sprint 9E.4 final closure decision

Sprint 9E is CLOSED. The acceptance matrix is:

| Sprint 9E criterion                                                             | Result |
| ------------------------------------------------------------------------------- | ------ |
| Exactly one public MVP facade exists and remains transport-neutral              | PASS   |
| Public request validation is closed and fail-closed                             | PASS   |
| Malformed pre-generation input performs zero generation calls                   | PASS   |
| Each accepted call generates one canonical report exactly once                  | PASS   |
| The existing AI lifecycle is applied at most once                               | PASS   |
| No retry, fallback, recursion, re-entry, or duplicate generation exists         | PASS   |
| Canonical Morning Meeting state remains authoritative                           | PASS   |
| AI remains optional and caller-supplied                                         | PASS   |
| The facade constructs or invokes no provider/runtime operation                  | PASS   |
| Raw provider output never crosses the facade                                    | PASS   |
| AI narrative remains `non_authoritative_interpretation`                         | PASS   |
| Existing lifecycle success and `rejected_invalid` semantics are unchanged       | PASS   |
| Request/report/composition correspondence is exact                              | PASS   |
| Stale, substituted, malformed, or trust-conflicting composition fails closed    | PASS   |
| Service exceptions and malformed/invalid service results are sanitized          | PASS   |
| Service failure returns no partial lifecycle result                             | PASS   |
| Failed calls do not contaminate later valid calls                               | PASS   |
| Caller, service, lifecycle, composition, and result artifacts remain detached   | PASS   |
| Same-symbol cross-network identities remain distinct                            | PASS   |
| Partial, unavailable, insufficient, and missing data remain explicit            | PASS   |
| Exact decimal strings remain unchanged                                          | PASS   |
| Canonical, interpretation, candidate, and trace ordering remains deterministic  | PASS   |
| Existing Morning Meeting, AI, runtime, and Portfolio APIs remain compatible     | PASS   |
| Dependency direction remains external → Morning Meeting → AI → Portfolio        | PASS   |
| No forbidden transport, runtime, secret, state, or autonomous capability exists | PASS   |
| Full repository validation passes                                               | PASS   |

The closure test composes only public APIs and retains exact execution,
provider, optional-model, candidate, fact, presentation-item, and section
references. Sprint 9F owns later release/security/integration hardening and has
not started.

## Sprint 9F.1 release and integration boundary audit

The MVP release entry point is the package-root
`DefaultMorningMeetingMvpApplicationApi`. Its required public supporting
surface is `MorningMeetingMvpApplicationApiInput`,
`MorningMeetingMvpApplicationApiOutput`, `MorningMeetingMvpApplicationApi`,
`validateMorningMeetingMvpApplicationApiInput`, the injected
`MorningMeetingService`, and the existing optional composition/lifecycle/error
contracts. These contracts remain provider- and transport-neutral.

| Release/integration gate                                                           | Result |
| ---------------------------------------------------------------------------------- | ------ |
| One intended application facade; no competing execution facade                     | PASS   |
| Package-root export map contains public artifacts and blocks deep imports          | PASS   |
| Workspace dependency graph is acyclic and directionally legal                      | PASS   |
| Input, authority, trust, detachment, and sanitized-error gates remain closed       | PASS   |
| No-AI, unavailable, included, invalid/stale, service-failure paths remain covered  | PASS   |
| Identity, traceability, cross-network, missing-data, precision, and order survive  | PASS   |
| No raw output, secret, environment, transport, provider auto-run, or mutable state | PASS   |
| Existing public APIs and private workspace package metadata remain compatible      | PASS   |

No production defect was found. Sprint 9F.1 adds release audit tests and
documentation only. Sprint 9F remains open; Sprint 9F.2 has not started.
