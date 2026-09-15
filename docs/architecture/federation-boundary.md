# Intelligence Federation Boundary

## Purpose

`@cryptodesk-ai/federation` defines a provider-neutral envelope for retaining
multiple normalized observations without selecting a provider or turning a
provider result into canonical truth. Domain adapters planned for Sprint
14B–14E may compose their existing payloads into this envelope while preserving
the owning domain contract.

The package has no workspace or third-party dependency. It contains no provider
adapter, transport, registry, background process, persistence, or domain
calculation.

## Authority

Federation organizes and qualifies observations. It is not a universal
canonical authority:

- Market Intelligence retains deterministic Market contract and calculation
  ownership.
- News Intelligence retains normalized and deterministic News ownership.
- Portfolio retains canonical Portfolio state authority.
- Morning Meeting retains canonical report and application authority.
- AI remains non-authoritative and has no role in eligibility, comparison, or
  selection.
- Ritual Gateway retains Ritual-specific integration ownership.
- The web application remains presentation-only.

## Provider-neutral model

A `FederationObservation` carries an observation ID, domain, descriptive
provider identity, receipt time, availability, provenance, an optional
domain-owned comparison key, and a payload only when available. Provider
identity conveys no trust, health, preference, correctness, or authority.

`createFederationEnvelope` validates, detaches, freezes, and deterministically
orders every supplied record. Unavailable, invalid, and unknown providers remain
visible in the envelope rather than disappearing behind fallback.

## Provenance

Every record retains the provider ID and normalization boundary. It may also
retain an observation timestamp, provider-neutral source ID, and safe source
reference. The provider ID in provenance must match the provider identity.
Normalization and federation do not discard or replace that relationship.

## Freshness and eligibility

Freshness evaluation uses an explicit reference timestamp and maximum age. It
never reads the wall clock. Available observations become `current`, `stale`,
or `unknown`; provider unavailability remains `unavailable`.

Eligibility is separate from selection. Explicit policy controls whether stale
or unknown-freshness observations remain eligible. Ineligible and unavailable
records carry a deterministic exclusion reason. No eligible observation is
automatically preferred or selected.

## Disagreement

Federation does not inspect or compare domain payload semantics. A domain may
supply an opaque deterministic comparison key. Among eligible observations:

- matching keys produce `agree`;
- distinct keys produce `differ` and preserve their groups;
- missing comparison evidence produces `unknown`;
- fewer than two eligible observations produce `not_applicable`.

This is descriptive comparison metadata. It performs no averaging, consensus,
ranking, confidence scoring, canonicalization, or winner selection.

## Event-ready, not event infrastructure

The envelope is immutable and can be replaced by a later envelope assembled
from newer normalized observations. It introduces no event bus, WebSocket, SSE,
polling, queue, worker, daemon, scheduler, cache, persistence, retry, or hidden
fallback.

## Sprint ownership

- Sprint 14B owns Market-specific federation and any explicit domain selection
  policy.
- Sprint 14C owns News-specific federation.
- Sprint 14D owns Portfolio and context federation.
- Sprint 14E owns cross-domain intelligence federation.
- Sprint 14F owns integrated federation release validation.

Provider discovery, autonomous research, planning, and decisions remain outside
Sprint 14. Observability, scaling, deployment redesign, global caching, and
system-wide production hardening remain outside this package.
