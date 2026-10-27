# Ritual network abstraction boundary

The private `@cryptodesk-ai/ritual-gateway` service is the only owner of
Ritual-specific network semantics. R1 adds offline, immutable contracts for:

- explicit network configuration (network ID, chain ID, HTTPS RPC, optional
  WSS RPC, explorer URL, and native symbol);
- an explicitly supplied, network-scoped precompile/system-contract registry;
- deterministic JSON-RPC request/response models for future read operations;
- evidence-driven network verification (`verified`, `mismatch`, or
  `inconclusive`); and
- detached execution evidence that never implies AI or canonical authority.

Construction performs no network probing and has no hidden network default,
environment discovery, fallback, retry, signing, wallet, or broadcast path.
The registry does not inherit Testnet references into another network. The
Ritual Gateway remains separate from Runtime Safety, which remains
dependency-free and Ritual-free, and from domain packages, Federation, and
Intelligence Composition, which remain Ritual-neutral.

R0 Ritual Testnet verification was **BLOCKED** because the public endpoint was
unreachable from the tested environment. This does not establish that Ritual
Testnet is globally offline. Mainnet configuration is not assumed or verified.

Execution evidence is transport/execution evidence only; it does not promote
model output beyond:

`untrusted_model_execution → untrusted_candidate_interpretation → non_authoritative_interpretation`

External Ritual inference verification remains INCONCLUSIVE.

R2 adds an offline read-only verification adapter. It accepts an explicitly
injected transport and performs at most one ordered network probe
(`eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`). Optional
`eth_getCode` probes run only for caller-selected registry identifiers. There
is no default transport, discovery, retry, fallback, polling, or background
execution. Reports distinguish network verification from reference evidence;
verified network evidence does not verify inference or create canonical state.
A future live HTTP transport is intentionally not implemented in R2.

R3 adds an explicit inference-intent contract and target resolution through
the registry, producing a prepared request that is distinct from a
transaction. An injected offline execution port may be invoked at most once;
the deterministic simulation normalizes one bounded result and returns
`mode: simulated` evidence. Successful output enters AI as
`untrusted_model_execution`. No wallet, signer, broadcaster, executor payment,
live model call, retry, polling, or autonomous behavior is included.

R4 composes these contracts in an offline integration harness. An explicit
activation policy requires verified network evidence and caller-selected
reference checks before the inference seam can run. Any mismatch,
inconclusive probe, missing reference, or failed code check returns a bounded
`blocked` report and invokes inference zero times. A passing fixture produces
`read_only_verified` status and permits one injected simulated attempt only;
this is not write authorization, wallet readiness, or live inference
verification. Future Mainnet onboarding must independently review official
configuration, run read-only verification, and obtain separate Owner
authorization before any write operation.

## M1.4 compatibility remediation

R2 now observes one fixed block: `eth_chainId`, `eth_blockNumber`, then
`eth_getBlockByNumber` with that returned canonical block quantity. Every
explicitly selected `eth_getCode` uses the same block. A mismatch or malformed
block stops reference probing. Full bounded block objects are accepted;
`number`, `hash`, and `timestamp` are required and validated, and `number` must
match the requested block. Unrelated valid JSON fields are tolerated within
the existing per-string, array, and object limits, with additional traversal
depth, node, and aggregate character bounds. Envelope validation remains strict.

Reference results now include `networkId`, `chainId`, and numeric `blockNumber`,
including absent-code and inconclusive results. Missing logical references have
an empty address and `reference_missing`; no address is invented. Outputs and
reference entries are immutable. Caller order is preserved; duplicate or more
than 64 selected identifiers are rejected before probing. The transport remains
explicitly injected and owns its timeout policy; there is no default live
transport, retry, fallback, or polling.

`assessRitualActivation(configuration, registry, evidence, policy)` is a pure R4
entry point. It validates bounded R2 evidence against explicit configuration,
registry, and policy, rejects duplicate or contradictory provenance, and returns
only a `blocked` or `read_only_verified` assessment. It has no transport or
execution capability and never continues into simulation. The existing harness
reuses this assessment before its explicitly injected offline simulation.

Configured does not mean verified. Nonempty bytecode establishes presence at
the observed block, not contract identity, source correctness, ABI compatibility,
ownership, security, or successful inference. Empty code alone does not disprove
a native precompile or service; policy must explicitly choose whether code is
required. `read_only_verified` is not write authorization or wallet readiness.
Simulated output is not live inference and remains `untrusted_model_execution`.
The assessment validates evidence consistency, not independent authenticity or
freshness. Historical R0–R5 closure remains unchanged.
