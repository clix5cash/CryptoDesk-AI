# @cryptodesk-ai/runtime-safety

Provider-neutral contracts for bounded autonomous-runtime safety.

Sprint 10F.1 introduces `createAutonomousRuntimeSafetyContract`. It validates
and detaches an explicitly identified action candidate against an explicitly
supplied policy and authority identity. The only initial action kind is the
non-mutating `prepare_operator_review` candidate.

Every result is `candidate_only`, `not_authorized`, and `executable: false`.
Candidate construction performs no authorization decision and grants no
execution permission. Sprint 10F.2 remains responsible for future bounded
authorization and execution guardrails.

The package contains no Ritual dependency, provider discovery, model selection,
wallet, credential, callback, transaction, scheduler, persistence, cache,
autonomous loop, canonical mutation, or trust promotion. No autonomous action
is executed by this package.
