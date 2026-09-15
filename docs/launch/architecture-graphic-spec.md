# Architecture graphic specification

## Purpose

Create one reusable graphic that distinguishes conceptual information flow
from package dependencies and authority. It must not depict an automatic
pipeline or imply canonical promotion.

## Layout

Use a vertical composition with three visually separated bands:

1. **Observation and domain band:** Sources/observations feed Integration
   normalization, then Market, News, and Portfolio domain contracts. Label each
   domain as an authority owner for its own semantics.
2. **Qualification and composition band:** Provider-neutral Federation
   qualifies observations; Intelligence Composition combines already-produced
   domain results. Annotate: “retains provenance, freshness, availability,
   disagreement; no winner or consensus.”
3. **Presentation and bounded-boundary band:** Morning Meeting and the `/app`
   presentation consume validated domain outputs. Optional AI interpretation is
   shown separately as non-authoritative. Ritual Gateway is an isolated,
   capability-injected boundary; Runtime Safety is a separate bounded
   authorization/execution boundary, not a downstream autonomous step.

## Safety legend and annotations

- Solid arrows: conceptual data/reference flow.
- Dashed arrows: optional, explicit caller-provided integration.
- A side annotation lists package dependency direction; arrows must not be read
  as authority transfer.
- Include the exact AI trust progression and Runtime Safety lifecycle.
- Mark “No event transport, scheduler, persistence, provider winner, consensus,
  autonomous action, or wallet custody.”

## Reuse sizes

- GitHub/documentation: 1600×1000 (8:5).
- Website: 1200×900 (4:3).
- Social preview: 1600×900 (16:9).

No graphic asset or rendering dependency is created in Sprint 15E.
