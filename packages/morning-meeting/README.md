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
