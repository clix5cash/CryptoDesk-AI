# Community Feedback Boundary

Sprint 16D provides the private, dependency-free
`@cryptodesk-ai/community-feedback` contract for organizing public input. Its
bounded lifecycle is:

```text
community input → validated feedback record → deterministic classification → maintainer review
```

The four categories are exactly `bug`, `ux`, `architecture`, and
`feature_request`. A category is explicit caller-supplied metadata; it is not a
confirmed defect, severity, priority, acceptance, roadmap commitment, or
implementation authorization. Ambiguous or unsupported categories fail closed.

Records retain safe source kind/reference, explicit observation time, bounded
description and evidence fields, and an explicit review state. GitHub Issues
and Discussions are transport/community surfaces, not canonical product state.
Security reports remain governed by `SECURITY.md` and should not be disclosed
through public feedback channels.

Only an explicit maintainer/Owner/Tech Lead decision can promote feedback into
future approved work; that promotion workflow is outside this sprint. There is
no AI classification, popularity or reaction scoring, contributor weighting,
automatic triage, roadmap mutation, code generation, scheduling, analytics
pipeline, or application display of synthetic community records. Existing
domain authority, AI trust, Runtime Safety, Ritual, observability, and
performance boundaries are unchanged. External Ritual verification remains
INCONCLUSIVE.
