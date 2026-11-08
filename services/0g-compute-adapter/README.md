# 0G Compute offline synthetic adapter — ZG-03

This private service implements the accepted ZG-02 boundary for synthetic tests
only. Neither Router nor Direct is selected for production. There is no live
transport, activation switch, 0G SDK import, environment lookup, credential
loader, wallet, signer, account manager, funding operation, billing integration,
worker, polling, redirect, fallback, resubmission or wall-clock timer.

## Ownership and dependencies

The package declares no runtime or development dependencies and makes no
lockfile change. Type-only relative references and a TypeScript project reference
check compatibility with the existing AI package; these imports disappear from
JavaScript. This is a private repository boundary, not a published portable SDK.
Existing AI build declarations must be present before the focused build/typecheck,
as for other workspace consumers. No protected source package is changed.

The AI descriptor-aware registry/bridge validates the full domain-owned
descriptor. This service checks its closed outer shape, exact identities and
bounded JSON representation; it does not duplicate domain grounding validation.
The legacy execute path rejects: it never invents a prompt or falls back.

`bind()` supplies the existing AI adapter contract for one prepared attempt and
grant. `run()` returns the private terminal result; `evidence()` retains the first
consumed terminal evidence separately. Vendor/evidence fields never enter the
existing AI result. Successful output remains `untrusted_model_execution` and
must use the existing candidate and grounding pipeline to become
`untrusted_candidate_interpretation`, then `non_authoritative_interpretation`.
No output can establish canonical facts or trading authority.

Runtime Safety is untouched: its `prepare_operator_review` action is not used as
inference permission. The synthetic grants below are fixtures, not an Owner
authentication system. Ritual Gateway, Federation, Intelligence Composition,
Market, News, Portfolio, Morning Meeting and apps/web remain independent.

## Explicit configuration

Both variants require explicit provider/model, network/environment/revision,
endpoint, credential reference/generation/audience/expiry, resource limits,
verification policy and source revision. Router requires fallback false; Direct
records SDK 0.9.0 and commit bff29131f953d5b08ad0c40eb805d8e00408df77, without
loading it. Only HTTPS `.invalid` endpoints and `synthetic:` credential references
are accepted. There are no built-in live URLs or secret values.

Credential audience binds to the immutable config ID rather than a digest of the
config containing that same audience field (which would be self-referential).
The manifest separately binds the complete configuration digest, and the grant
binds that manifest and credential generation. All owned shapes reject extra,
missing, accessor, symbol and prototype fields. JSON encoding is versioned,
sorted and bounded. Wire digests cover the actual private serialized bytes;
the synthetic wire shape is not a claim of Router/Direct API interoperability.

Limits are mandatory explicit fixture values, capped by implementation ceilings
(1 MiB bytes/tokens/header values, depth 64, deadline 60,000 synthetic ms). The
test values are engineering fixtures, not recommended pricing/funding settings.
Body parsing rejects invalid UTF-8, excessive depth, duplicate decoded JSON keys,
prototype-related keys and malformed data. Output bytes and reported synthetic
token counts are bounded independently. This does not verify a real tokenizer.

## Synthetic execution and consumption

Only a branded closed script created by `createSyntheticTransport` is accepted.
It can return detached byte responses, wait for the controlled clock, hang or
throw a fixed crash error. It accepts no callback, HTTP implementation or SDK.
The injected transport and store must share the exact branded `SyntheticClock`.
Clock advancement is explicit; no real-time deadline or background worker runs.
An in-process API is not a sandbox against a hostile program that can replace
JavaScript globals/prototypes or execute arbitrary code itself.

`prepare()` binds request/execution/attempt/logical-operation identities,
descriptor, wire bytes, configuration, limits and verification policy into
immutable records and SHA-256 digests. Grants/financial fixtures are detached
synchronously before asynchronous work. Prepared handles are instance-owned:
cloned or forged handles reject.

Consumption atomically checks and writes request, attempt, logical-operation
and authorization identities without an await. This proves conflict handling
in one JavaScript isolate only. It is NOT durable or distributed storage.
Tombstones are never released by timeout, crash, clock advancement or lease.
Capacity exhaustion fails closed. `crash_after_consumption` simulates a crash
after consuming but before dispatch. `simulateStateLoss` permanently disables
the store; a simulated restarted store must use `lost` and cannot dispatch.
Creating a new `fresh_test_scope` is a different isolated test scenario, not
recovery. Cross-process/restart replay prevention is not established.

One local dispatch branch follows consumption. No remote attempt count is
inferred. Deadline covers synthetic response and verification; expired grants
are rejected before dispatch, and dispatched timeouts retain an unknown remote
outcome. Late results cannot revise terminal evidence or release output.
Rate-limit responses may preserve bounded Retry-After seconds but never retry.
Evidence uses fixed failure codes and messages, not remote bodies/exceptions.
Evidence digests still require appropriate access control in any future host.

## Verification and finances

Provider/model identity, signature status, received-output digest, request digest,
freshness, challenge replay and attestation status are separate synthetic checks.
Every required property must pass. Optional missing evidence does not imply a
passed check. Artifact and challenge reuse are rejected within the shared fake
store. Policy, verifier, model, provider and measurement references are bound.
No actual signature or hardware quote is verified. Output correctness is never
inferred. All verification evidence is explicitly `synthetic`.

Financial fixtures bind a manifest, explicit cap/currency/account references,
expiry and a synthetic enforcement reference. They grant no account-management
or replenishment capability. They do NOT enforce a real financial cap or prove
Owner approval. `syntheticLimitations` always reports blocked live execution,
unestablished remote attempts and finances, non-durable authorization and
synthetic-only attestation. It is static metadata, not an activation switch.

ZG-01 source findings remain prior evidence: Direct request-header helpers can
fund accounts; Router can pull shared-vault funds; signature helpers do not alone
bind the received result. This implementation invokes none of those paths.
Remote retries, durable authorization, Router replenishment/deferred billing,
credit limits, Direct credential-only provisioning, maximum exposure/refunds,
complete attestation and deployed model availability remain live blockers.

## Offline checks

Use the already installed binaries directly; no install is required:

```
node_modules/.bin/tsc --project services/0g-compute-adapter/tsconfig.json
node --test services/0g-compute-adapter/test/adapter.test.mjs
node_modules/.bin/eslint services/0g-compute-adapter/src --max-warnings=0
```

Tests cover both variants, identity/configuration, hostile JSON, limits,
duplicates/concurrency, consumed crashes, state loss, expiry, timeout/late results,
HTTP-shaped failures, synthetic financial and verification failures, AI bridge
compatibility, sanitization and architecture invariants. They establish no live
service, financial, cryptographic, Node-22-specific or Vercel deployment behavior.

No live capability, database, new authorization service or production deployment
is part of ZG-03. Further work requires separate authorization and Tech Lead review.
