# @cryptodesk-ai/morning-meeting

Provider-neutral Morning Meeting application contracts.

The package defines deterministic meeting requests, reports, market views,
sections, evidence references, analytical bias, and risk classifications. Its
explicitly injected dependencies assemble and validate Market Intelligence
output without introducing a provider-specific dependency.

`MorningMeetingReport` is normalized, validated structured input for a future
narration layer; it is not an AI-generated prose artifact.

An optional request-scoped News Intelligence boundary accepts already-produced
`NewsMarketIntelligenceView` records. Morning Meeting only matches explicit
asset or market targets, preserves available provenance in a structured News
section, and never retrieves, classifies, groups, or analyzes provider data.

The structured `MorningMeetingNewsBrief` can be explicitly prioritized and
selected using deterministic rules and budgets. A future provider-neutral
`MorningMeetingNewsNarrator` receives only the selected facts through a stable
narration-input boundary. Its text is untrusted presentation output: validation
requires it to retain the input item identity, target, and provenance, while it
cannot alter bias, risk, impacts, event groups, or the analytical report. No
concrete AI provider is included in this package.

`DefaultMorningMeetingNewsNarrationService` is an optional, independently
callable orchestration boundary: News Brief → selection → narration input →
injected provider-neutral narrator → validation → structured narration. Normal
Morning Meeting report generation never requires or invokes it.

Future narration adapters may be registered explicitly in an instance-scoped
`MorningMeetingNewsNarratorRegistry` and selected by provider ID (and an
adapter-declared model ID). Registry composition remains optional: direct
narrator injection is still supported. No vendor adapter, SDK, prompt, or model
configuration is included.

`ProviderNeutralMorningMeetingNewsNarratorAdapter` defines the injected
completion-client boundary for a future vendor adapter. It sends a detached,
canonical structured request and maps only validated text back onto canonical
target identity and provenance. No network client, vendor SDK, or concrete
model implementation is included.

The completed narration path is explicit: narration service → registry plus
explicit provider/model selection → provider-neutral adapter → completion-client
contract → untrusted response → validation and normalization. There is no
fallback provider or model substitution. Empty selected briefs return an empty
narration without resolving a provider or invoking a completion client.
Provider-generated IDs and unsupported metadata are not authoritative; narration
cannot modify Morning Meeting analytical state.

## Sprint 9D.1 Portfolio AI composition boundary

Gap C now begins through the opt-in application-owned contract
`composeMorningMeetingPortfolioAi`: `non_authoritative_interpretation` →
validated composition envelope → Morning Meeting. The envelope keeps the
canonical Morning Meeting report and Portfolio AI context separate from an
ordered collection of already-grounded AI interpretations. Canonical identity,
values, coverage, timestamps, and provenance remain authoritative application
state; AI prose remains non-authoritative descriptive material.

The boundary accepts zero or more complete Sprint 9C grounding results only. It
validates their exact source context and retained execution/provider/model,
candidate, fact, section, and ProviderExchange traceability. Raw execution,
parsed output, candidates, unknown references, injected fields, duplicate
identity, and mismatched source contexts fail closed. It performs no matching,
inference, arithmetic, ranking, reconciliation, trust promotion, or prose
generation.

Sprint 9D.1 establishes the composition contract only. Full Morning Meeting
orchestration remains later Sprint 9D work, and no recommendation, trading, or
prediction authority is introduced.

## Sprint 9D.2 application composition flow

`composeMorningMeetingPortfolioAiApplicationOutput` is the opt-in
application-owned presentation flow after the 9D.1 envelope. It returns the
validated canonical report unchanged and, when AI is supplied, a separate
`aiNarrative` whose authority remains `non_authoritative_interpretation`.
Narrative items expose descriptive content plus provider-neutral execution,
provider, optional model, candidate, fact, and section trace locators; they do
not expose raw output or runtime configuration.

AI remains optional. Missing or intentionally omitted AI produces the canonical
report alone. Invalid AI is rejected by default, while the explicit `omit`
failure policy preserves the canonical report without leaking lower-level
provider errors into output. Neither policy changes report facts, identity,
risk, coverage, ordering, timestamps, or provenance. Sprint 9D remains open;
9D.3 or later owns lifecycle hardening and closure work.

## Sprint 9D.3 lifecycle hardening

`composeMorningMeetingPortfolioAiLifecycle` additively distinguishes
application intent and outcomes without changing the 9D.2 output contract:
`not_requested`, `unavailable`, `included`, and `omitted_invalid`. Invalid AI
under the default reject policy throws a sanitized
`MorningMeetingPortfolioAiApplicationError` carrying only the
`rejected_invalid` application outcome—never provider or runtime details.

Lifecycle status is not canonical analytical state. Every non-error outcome
retains a detached, usable canonical report; only `included` contains the separately
labeled `non_authoritative_interpretation` narrative. Exact provider-neutral
execution/model/candidate/fact/section trace locators remain validated. No prose
conflict, missing-data claim, numeric claim, recommendation, or trading language
can modify canonical identity, values, risk, coverage, timestamps, provenance,
or ordering. Gap C remains open; Sprint 9D.4 owns final closure.

## Sprint 9D.4 Gap C closure

Gap C is CLOSED. Public-API closure coverage proves the legal path:

`non_authoritative_interpretation` →
`MorningMeetingPortfolioAiComposition` → application-owned lifecycle and
presentation → authoritative `canonicalReport` plus optional, separately
labeled `aiNarrative` → user-visible application output.

Portfolio and deterministic Morning Meeting state remain canonical authority.
Morning Meeting owns composition, inclusion/omission policy, lifecycle, and
presentation. AI prose remains only `non_authoritative_interpretation`; it
cannot create or reconcile canonical truth. No-AI, unavailable, empty,
omitted-invalid, and fail-closed rejected-invalid paths preserve deterministic
canonical behavior. Exact provider-neutral traceability, cross-network identity,
missing-data states, decimal strings, ordering, detachment, isolation, and
legacy APIs are covered. Sprint 9E owns MVP application/API lifecycle beyond
this closed boundary and has not started.

## Sprint 9E.1 MVP application API

`DefaultMorningMeetingMvpApplicationApi` is the additive, provider- and
transport-neutral entry point for an external application caller. Its
`execute(input)` method accepts a canonical `MorningMeetingRequest`, explicit
`aiRequested` intent, and an optional already-validated
`MorningMeetingPortfolioAiComposition`. It invokes the injected
`MorningMeetingService` once and delegates the generated report and optional AI
material to the unchanged Sprint 9D lifecycle.

The result reuses `MorningMeetingPortfolioAiLifecycleResult` and therefore
preserves `not_requested`, `unavailable`, `included`, and `omitted_invalid`;
invalid requested AI under the default reject policy still throws the
sanitized `MorningMeetingPortfolioAiApplicationError` with
`rejected_invalid`. Canonical output remains independently usable and detached.
AI remains separate `non_authoritative_interpretation`, with exact trace
locators and no raw provider output.

The API performs no AI or provider execution, transport, persistence,
scheduling, retry, fallback, configuration, or credential lookup. Callers
explicitly supply any completed composition. Sprint 9E.1 established this
boundary; later increments may only harden it compatibly.

## Sprint 9E.2 external execution lifecycle

The same `DefaultMorningMeetingMvpApplicationApi.execute` entry point is now the
stable transport-neutral execution contract. The exported
`validateMorningMeetingMvpApplicationApiInput` validator fails closed on an
unknown or malformed envelope/request, unsupported timeframe or timestamp,
invalid failure policy, and contradictory AI options before canonical report
generation begins.

Each accepted call invokes the injected `MorningMeetingService.generate`
exactly once and the existing Portfolio AI lifecycle at most once. Arbitrary
service failures are exposed only as a deterministic provider-neutral Morning
Meeting application error. Existing `rejected_invalid` and explicit
`omitted_invalid` behavior remains unchanged for supplied AI material.

There is no automatic provider execution: the optional composition must still
be supplied by the caller and must exactly match the generated request/report.
Canonical state remains authoritative, AI remains optional
`non_authoritative_interpretation`, and no HTTP, network, credential,
persistence, retry, fallback, or scheduler boundary is added. Sprint 9E is not
yet complete; Sprint 9E.2 ends at external execution hardening.

## Sprint 9E.3 lifecycle hardening

The MVP facade now keeps two detached request copies: one exclusively for the
injected service and one exclusively for lifecycle validation. A service cannot
mutate the request that defines the accepted execution. Canonical generation is
still attempted exactly once and the existing lifecycle is still applied at
most once.

Service exceptions and malformed service results produce the same sanitized
`MorningMeetingReportError` and never return a partial lifecycle result.
`MorningMeetingPortfolioAiApplicationError` remains the distinct existing
`rejected_invalid` contract for invalid supplied AI. No-AI, unavailable,
included, and explicit omitted-invalid results retain their established shapes.

The facade remains transport-neutral and does not construct requests for,
invoke, parse, or ground any provider output. Canonical state remains
authoritative and caller-supplied narrative remains only
`non_authoritative_interpretation`. Sprint 9E is still open; Sprint 9E.4 owns
final closure.

## Sprint 9E.4 final closure

Sprint 9E is CLOSED. The final public flow is:

```text
external caller → validated MVP application input
→ detached MorningMeetingService request and exactly one generation
→ authoritative canonical report
→ optional caller-supplied validated Portfolio AI composition
→ existing lifecycle at most once
→ detached canonical result + optional non-authoritative narrative
```

Closure coverage proves all lifecycle outcomes, no-AI operation, exact
identity/reference traceability, cross-network separation, partial and missing
evidence, decimal precision, ordering, detachment, repeatability, sanitized
failures, request-copy isolation, and failed-call recovery. The facade remains
additive and transport-neutral, with no provider execution, raw output,
credentials, network, retry/fallback, persistence, cache, scheduler, or
autonomous capability.

Sprint 9F owns later release, security, and integration hardening and has not
started.

## Sprint 9F.1 release and integration boundary audit

The MVP release surface is the package-root export of
`DefaultMorningMeetingMvpApplicationApi`, its input/output interface and
validator, and the existing composition/lifecycle contracts needed to supply
optional AI. Package metadata exposes only `.` through `dist/index.js` and
`dist/index.d.ts`; internal module paths are not public exports.

Release audit coverage verifies facade uniqueness, root-export containment,
the acyclic workspace graph, Morning Meeting → AI → Portfolio direction, and
the absence of runtime → Morning Meeting coupling. Existing integration tests
continue to prove no-AI, unavailable, included, invalid/stale AI, sanitized
service failure, detachment, traceability, cross-network identity, missing
data, precision, and ordering.

All packages remain private workspace artifacts at version `0.0.0`; Sprint
9F.1 does not create a publishing or deployment mechanism. No production
acceptance defect or capability expansion was required. Sprint 9F remains open;
Sprint 9F.2 owns later hardening.

## Sprint 9F.2 application security boundary

The MVP facade continues to reject non-plain/prototype-shaped and unknown-field
application envelopes before generation. Service and lifecycle failures cross
the facade only through the existing fixed Morning Meeting errors; arbitrary
runtime, endpoint, credential, vendor-body, exception, stack, or raw-output
details are not returned. The provider-neutral news narrator likewise maps a
completion-client exception to its fixed error without retaining the original
exception as `cause`. Failed calls retain no state and do not affect later executions.

The no-AI path needs only the injected `MorningMeetingService`; it performs no
environment discovery, credential lookup, network call, or provider execution.
Optional AI composition remains explicitly caller-supplied, exact-match
validated, separate from canonical state, and only
`non_authoritative_interpretation`. Sprint 9F remains open; no deployment or
publishing behavior is introduced.

## Sprint 9F.3 release-candidate E2E

Production-like coverage now composes an injected provider-neutral adapter
through raw execution, closed parsing, candidate validation, grounding,
caller-supplied Morning Meeting composition, and the public MVP facade. It
retains exact execution/provider/model/candidate/fact/presentation/section
identity while keeping canonical state separate and authoritative. Existing
failure-matrix coverage remains authoritative for malformed application,
service, runtime, candidate, grounding, trust, identity, and reference paths.

The no-AI release baseline uses separate facade instances and 100 sequential
in-memory calls. On the validation environment the observed batch was roughly
1 ms; this is informational, environment-specific, and has no timing assertion
or realtime guarantee. Invocation accounting stayed exactly one service call
per accepted input, with detached repeatable output and no retained lifecycle
state. Sprint 9F remains open; this is not deployment or publishing.
