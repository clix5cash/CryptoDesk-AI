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
