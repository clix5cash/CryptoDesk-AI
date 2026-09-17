# Future Ritual live-activation runbook

This is a future, operator-controlled procedure. It is not a live
verification result and it does not authorize a transaction. R0 was blocked
because the public endpoint was unreachable from the tested environment; this
does not establish that Ritual Testnet is globally offline.

## Gates

0. **Owner authorization (read-only):** record explicit authorization to
   begin a live read-only session. No wallet or write authorization is implied.
1. **Official configuration:** record then-current official network name,
   chain ID, HTTP RPC, optional WSS RPC, explorer, and native currency. Do not
   prefill unknown Mainnet values.
2. **Read-only network verification:** issue one ordered
   `eth_chainId`, `eth_blockNumber`, and `eth_getBlockByNumber` probe. Record
   expected/observed chain ID, block number/hash/timestamp, verification time,
   and documentation sources. Pass only on explicit matching evidence.
3. **Reference review:** record required logical identifiers, category,
   address/reference, and official source. Use `eth_getCode` only where
   semantically appropriate; code absence is not universally meaningful.
4. **R4 activation:** feed the evidence to the existing gate. It must return
   `read_only_verified`. This never authorizes writes or proves inference.
5. **Wallet preparation (future manual step):** use a dedicated operator
   wallet, encrypted keystore, minimum required gas, and independently review
   any Ritual-specific funding. Keep secrets out of the repository, logs, and
   chat.
6. **Write proposal:** document the exact operation, target, request hash,
   maximum scope, fee implications, and stop conditions. Do not execute yet.
7. **Owner write authorization:** obtain separate explicit authorization for
   one bounded write attempt.
8. **Runtime Safety review:** preserve
   `explicit request → candidate → explicit authorization → single-attempt permission → at-most-one execution → terminal result → stop`.
9. **Single live attempt:** execute at most one operation. No retry, fallback,
   second transaction, or polling.
10. **Evidence collection:** record only observed network, target, hashes,
    transaction/job/block/receipt/result data, explorer reference, timestamp,
    and terminal status.
11. **AI handoff:** any model output enters as
    `untrusted_model_execution`, followed by the existing trust progression;
    on-chain evidence does not make it canonical.
12. **Session closure:** confirm no retry or scheduled rerun, approved evidence
    handling, no secrets committed, and a clean repository when no code change
    was authorized.

External Ritual inference verification remains INCONCLUSIVE.
