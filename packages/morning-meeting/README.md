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
