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
