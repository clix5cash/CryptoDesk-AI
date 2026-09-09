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

Sprint 10F.2 adds `createBoundedActionExecutionGuardrail`. It validates an
existing 10F.1 candidate, calls one explicitly injected authorizer, and only
after an exact `authorized` result derives an operation-local permission fixed
to one attempt. One explicitly injected executor receives that detached
identity-only permission. Denial or malformed authorization performs zero
execution calls; execution is never retried.

Candidate construction, authorization, permission, execution, canonical
mutation, and autonomous authority remain distinct. Optional execution timeout
is bounded, operation-local, terminal, and cleaned in `finally`. Capability
exceptions and hostile results map to fixed failure kinds without reflecting
details. No permission registry, persistent authorization, default authorizer,
default executor, network action, wallet, transaction, trade, scheduler,
persistence, cache, routing, or autonomous loop exists. **Sprint 10F.2 — Policy
& Execution Guardrails: COMPLETE.** Sprint 10F.3 has not started.

Sprint 10F.3 adds `createControlledAutonomousRuntime`, a thin single-operation
orchestrator over the existing 10F.1 candidate contract and 10F.2 guardrail.
Every run begins with one explicit caller request containing a caller-owned
runtime operation ID and one complete candidate input. The runtime snapshots
that request, constructs the candidate through 10F.1, delegates authorization
and execution exclusively to 10F.2, maps one closed terminal result, and stops.

The runtime does not authorize itself, execute directly, discover candidates,
select policy, authority, executor, provider, or model, or create a second
timeout layer. Denial reaches no executor; authorized work retains the
guardrail's single-attempt permission and operation-local terminal timeout.
There is no batch, plan, action chain, recursive run, scheduler, queue, daemon,
poller, retry, fallback, persistence, registry, cache, or history.

The only action remains the non-mutating `prepare_operator_review`. Runtime
success grants no analytical, canonical, trading, or autonomous authority and
cannot mutate Portfolio or Morning Meeting state. **Sprint 10F.3 — Controlled
Autonomous Runtime: COMPLETE.** Sprint 10F remains open, Sprint 10F.4 has not
started, and external Ritual verification remains **INCONCLUSIVE**.
