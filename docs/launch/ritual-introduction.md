# Ritual ecosystem introduction (draft)

CryptoDesk AI uses Ritual as an explicitly isolated integration boundary for
future provider/model execution workflows. `@cryptodesk-ai/ritual-gateway`
owns Ritual-specific request mapping, deterministic preparation, injected
capabilities, lifecycle validation, and provenance correlation.

The Gateway does not own Market, News, Portfolio, Morning Meeting, or AI truth.
Results re-enter the AI boundary as `untrusted_model_execution`. Runtime Safety
is intentionally provider-neutral and Ritual-free; it owns explicit
authorization and a bounded single-attempt execution path, not chain access or
wallet custody.

This separation lets maintainers inspect identity, provenance, and failure
states without promoting model output into canonical domain state. Current
examples demonstrate network-free preparation only. No wallet, private key,
live RPC, broadcast, or production inference is claimed.

**External Ritual verification remains INCONCLUSIVE.**
