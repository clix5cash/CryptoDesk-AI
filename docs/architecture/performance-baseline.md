# Sprint 16B Performance Baseline

This document records a small, repeatable local baseline for deterministic
execution. It is not a production SLA or a scalability claim.

## Method

Run `pnpm perf:baseline` on Node.js >=22 with the repository lockfile. The
command performs the normal forced build, then runs a Node `perf_hooks`
benchmark with fixed synthetic observations. Each operation receives 100
warm-up calls followed by 5,000 measured iterations. Inputs, timestamps,
provider identities, and ordering are fixed; no network, credentials, wallet,
Ritual, persistence, cache, retry, or external telemetry service is used.

The harness measures generic Federation qualification and the existing
Market-owned federation path. Timing is high-resolution elapsed wall-clock
time and will vary by machine; per-operation values are descriptive only.

## Sample result

One local run on 2026-09-16 produced:

```text
CryptoDesk AI performance baseline (synthetic, local, no network)
Federation qualification: 51.168 ms total; 0.010234 ms/op; 5000 iterations
Market federation qualification: 71.197 ms total; 0.014239 ms/op; 5000 iterations
No provider latency, persistence, cache, retry, or production SLA measured.
```

These values are environment-dependent observations from one run. The
benchmark does not assert absolute timing thresholds.

## Boundaries and findings

- Production web build remains statically prerendered for `/`, `/app`,
  `/app/market`, `/app/news`, `/app/portfolio`, and `/app/morning-meeting`.
- AI/OpenAI Runtime provider and model latency is **NOT MEASURED**: no live
  provider call or credential was authorized for this sprint. Local lifecycle
  validation remains covered by existing tests.
- News, Portfolio, Intelligence Composition, and Morning Meeting timings are
  not promoted to microbenchmarks here; their existing contracts are validated
  by focused suites, while this sprint avoids fixture duplication and brittle
  timing claims.
- No material bottleneck was demonstrated, so no runtime optimization was
  performed. Domain authority, AI trust, Runtime Safety, Federation, and
  application boundaries are unchanged.

Sprint 16B does not add caching, persistence, workers, queues, concurrency
orchestration, deployment changes, monitoring infrastructure, autonomous
behavior, or provider selection. External Ritual verification remains
INCONCLUSIVE.
