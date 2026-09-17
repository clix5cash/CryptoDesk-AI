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
