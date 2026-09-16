# Observability Boundary

Sprint 16A adds the private, dependency-free `@cryptodesk-ai/observability`
package as a contract layer for future production instrumentation. It is
provider-neutral and has no domain authority.

## Supported contracts

- Structured logs with explicit UTC timestamps, finite severity, bounded safe
  metadata, and optional correlation/operation identifiers.
- Observation-based health states: `healthy`, `degraded`, `unavailable`, and
  `unknown`.
- Immutable counter, gauge, and duration observations with explicit units and
  bounded labels.
- Bounded failure telemetry with explicit category/code and retryability only
  when the caller knows it; arbitrary errors are not serialized.
- Minimal correlation context for request/operation/candidate/authorization/
  execution identifiers. This is metadata, not distributed tracing.

All constructors validate and detach inputs. Timestamps are caller-supplied;
there is no hidden clock, polling, transport, persistence, or exporter.
Sensitive keys and unsafe path-shaped values are rejected. Credentials,
authorization headers, cookies, wallet material, raw provider responses,
stack traces, and environment dumps are outside the contract.

## Authority and future boundary

Observability records telemetry only. Market, News, Portfolio, Morning
Meeting, Federation, Intelligence Composition, AI, Ritual Gateway, Runtime
Safety, and `apps/web` retain their existing ownership and safety boundaries.
Runtime Safety remains dependency-free and Ritual-free; its legal path is
`explicit request → candidate → explicit authorization → single-attempt
permission → at-most-one execution → terminal result → stop`.

Sprint 16A does not provide a monitoring backend, dashboard, alerting,
distributed tracing backend, persistent storage, provider-health selection,
retry/fallback, autonomous remediation, trading, or action behavior. External
Ritual verification remains INCONCLUSIVE.
