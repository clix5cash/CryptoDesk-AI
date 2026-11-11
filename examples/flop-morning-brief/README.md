# FLOP Morning Brief

This standalone experiment checks whether the FLOP gateway can classify funding in
a CryptoDesk AI market snapshot. The output copies price, open interest and
funding directly from the snapshot and rejects model classifications that
disagree with the funding input. A null value is reported as missing. Use a
consistent funding interval across assets and decimal rates (0.0001 is 0.01%).

Run from this directory with Node.js 22 or later.

```bash
curl -fsS https://api.flop.network/v1/models
export FLOP_MODEL='<model ID from the model list>'
node brief.mjs sample.json
node --test brief.test.mjs
```

Set `FLOP_API_KEY` in your local environment before running the brief. Use a FLOP
gateway credential with a spend cap. The sample contains synthetic figures.
Each CLI invocation makes one completion request with a 30-second timeout and
no automatic retries. A timeout can leave the outcome of the request uncertain.

The completion ID and latency describe the gateway call. Settlement remains
`unverified` until a separate chain check can match the inference session to the
Agent account and confirm finalized settlement. This example has no wallet or
settlement integration. See the [official SDK documentation](https://docs.flop.network/docs/sdk-references)
for the gateway and chain APIs.
