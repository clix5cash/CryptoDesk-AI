# CryptoDesk-AI

AI Crypto Copilot built on Ritual.

Architecture documentation:

- [ADR-001: Modular, AI-First Architecture](docs/architecture/ADR-001-modular-ai-first-architecture.md)
- [Sprint 9 MVP Architecture Inventory](docs/architecture/sprint-9-mvp-architecture-inventory.md)
- [Sprint 9 MVP Component and Dependency Map](docs/architecture/sprint-9-mvp-component-map.md)
- [Sprint 9 MVP Integration Contract](docs/architecture/sprint-9-mvp-integration-contract.md)
- [Sprint 9A MVP Architecture Closure](docs/architecture/sprint-9a-mvp-architecture-closure.md)

## MVP release surface

The transport-neutral MVP application entry point is
`DefaultMorningMeetingMvpApplicationApi` from
`@cryptodesk-ai/morning-meeting`. Workspace packages are currently private
build artifacts and expose only their package-root `dist/index` entry points;
no network server, CLI, or publishable deployment artifact is included.

The facade generates one authoritative deterministic Morning Meeting and may
include an explicitly caller-supplied Portfolio AI composition through the
existing non-authoritative lifecycle. It never invokes a provider itself.

Production-like release-candidate tests compose the existing injected
provider-neutral execution seam through parsing, candidate validation,
grounding, caller-supplied composition, and the MVP facade without live
credentials or network access. This repository still provides no deployment,
publishing, server, CLI, or UI artifact; Sprint 9F remains open.

Sprint 9F is CLOSED after its release-candidate integration, security,
production-like E2E, artifact, compatibility, and repository validation gates
passed. Sprint 9G owns the final MVP release audit and closure; it has not
started. No package was published or deployed, and Sprint 10 remains out of
scope.

Sprint 9G.1 records the final MVP architecture and release baseline without
changing the implementation: one transport-neutral facade, private package-root
artifacts, an acyclic one-way dependency graph, authoritative canonical output,
and optional caller-supplied non-authoritative AI. Sprint 9G and Sprint 9 remain
open for the later closure increments; Sprint 10 has not started.
