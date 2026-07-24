# ADR-001: Modular, AI-First Architecture for CryptoDesk AI

- Status: Accepted
- Date: 2026-07-18
- Decision owners: CryptoDesk AI team

## Context

CryptoDesk AI will provide market intelligence, news intelligence, portfolio analysis, daily meeting briefings, and DeFi research. It must combine real-time and historical data with AI-generated analysis while keeping outputs traceable, secure, and easy to evolve.

Ritual integration is planned but should not dictate the initial product architecture or create provider lock-in.

The system needs to support:

- Rapid early development in TypeScript.
- Reliable background processing for ingestion and scheduled reports.
- Clear ownership of market, news, portfolio, and DeFi domains.
- AI agents with controlled access to data and tools.
- Auditability, citations, deterministic financial calculations, and data freshness.
- Future independent scaling of expensive or high-volume workloads.
- An isolated, optional Ritual execution path.

## Decision

CryptoDesk AI will use a TypeScript monorepo organized into:

- `apps/` for deployable user-facing applications and entry points.
- `packages/` for reusable domain and platform capabilities.
- `agents/` for bounded AI specialists and their policies.
- `services/` for independently runnable background or integration workloads.
- `shared/` for low-level cross-cutting utilities and contracts.
- `infrastructure/` for deployment, operations, and environment configuration.

The system will initially operate as a modular monolith with background workers. Components will be designed with service boundaries from the beginning, but services will only be separately deployed when scale, reliability, security, or operational needs justify it.

## Why this architecture

This approach balances early speed with long-term maintainability.

A fully distributed system at the beginning would add deployment complexity, network failure modes, versioning burden, and operational overhead before product workflows are proven. A single unstructured application would be fast initially but would make AI, data providers, portfolio logic, and Ritual integration tightly coupled and difficult to change.

The chosen architecture provides:

- One coherent product codebase and development workflow.
- Explicit module boundaries for each product capability.
- Reusable business logic across web, API, workers, and future services.
- A controlled AI layer that can evolve independently of data and UI layers.
- Clear paths for extracting high-volume workloads later.

## Why agents

AI behavior is divided into specialized agents because CryptoDesk AI handles distinct analytical tasks with different data requirements, tools, risk profiles, and output formats.

Examples include Market Analyst, News Analyst, Portfolio Analyst, DeFi Researcher, Morning Meeting Agent, Research Assistant, and Risk Reviewer.

Each agent owns:

- Its scope and responsibilities.
- Approved tools and data access.
- Prompt and instruction policy.
- Expected structured output.
- Citation and uncertainty requirements.
- Evaluation scenarios and quality criteria.

This prevents a single general-purpose agent from gaining unrestricted access to all systems or producing inconsistent outputs across product areas.

Agents do not directly query databases, call arbitrary providers, or handle secrets. They invoke typed, approved tools supplied by the AI platform. This preserves security, makes tool use observable, and allows the same data capabilities to serve both AI and conventional application features.

AI is used to synthesize, explain, prioritize, and investigate data. Deterministic calculations—such as portfolio balances, P&L, exposure, liquidation metrics, and market indicators—remain in domain packages and are never delegated to an agent as a source of truth.

## Why services

Services represent workloads that have independent runtime needs, scaling characteristics, credentials, or failure boundaries.

Initial services include:

- Market-data ingestion.
- News processing.
- Portfolio synchronization.
- Retrieval and indexing.
- Scheduled reports and notifications.
- Ritual Gateway.
- Job scheduling.

They may initially run as worker processes in the same deployment environment. Their separate source boundaries make it possible to extract them later without changing domain contracts.

Services are especially useful for rate-limited and retry-heavy provider integrations, long-running ingestion and indexing work, resource-intensive AI workflows, scheduled morning reports, and workloads requiring independent deployment or scaling.

## Why packages

Packages contain the reusable, testable capabilities of the product. They are the primary home for business logic.

Core packages include:

- `market-intelligence`
- `news-intelligence`
- `portfolio`
- `defi-research`
- `morning-meeting`
- `ai`
- `data`
- `integrations`
- `auth`
- `notifications`
- `observability`
- `config`

This creates stable internal interfaces. For example, the portfolio package exposes canonical holdings, positions, risk, and P&L capabilities regardless of whether underlying data comes from a wallet indexer, exchange API, or future provider.

Packages allow the web application, API, workers, and agents to share the same rules rather than reimplementing logic in multiple locations.

## Why a Ritual Gateway

Ritual integration will be isolated behind a dedicated `ritual-gateway` service and provider adapter.

The gateway is the only component permitted to depend directly on Ritual-specific SDKs, credentials, request formats, runtime assumptions, or response types.

This provides several benefits:

- Prevents Ritual-specific concerns from spreading through the product.
- Supports staged adoption of Ritual without blocking early development.
- Allows different agents or workflows to use different inference providers.
- Makes provider selection configurable and observable.
- Enables fallback behavior if Ritual is unavailable or unsuitable for a workload.
- Simplifies testing through a stable AI execution interface.
- Creates one place to manage cost, latency, rate limits, health checks, and security policy.

The rest of the product depends on provider-neutral interfaces such as model execution, embedding generation, or agent workflow execution. Ritual becomes an implementation of those interfaces rather than an architectural dependency.

## Dependency rules

Dependency direction must remain strict:

```text
apps and services
        ↓
agents and packages
        ↓
shared
```

Additional rules:

1. `shared/` must not import from `apps/`, `services/`, `agents/`, or domain packages.
2. `apps/` are composition layers. They may call packages and agents but should not own core domain calculations.
3. `services/` may use packages and shared contracts, but must not import from apps.
4. `agents/` may use only approved interfaces from the AI platform and domain packages. They must not directly access database clients, provider credentials, or unbounded external tools.
5. Domain packages must not depend on UI frameworks, HTTP frameworks, queue implementations, or specific AI providers.
6. Provider-specific code belongs in `packages/integrations` or the relevant service adapter, never in core domain logic.
7. Ritual-specific code belongs only in the Ritual Gateway and its adapter implementation.
8. Cross-module asynchronous communication uses typed events from `shared/events`, not ad hoc payloads.
9. Runtime data crossing a boundary—HTTP, jobs, events, AI responses, or provider responses—must be validated with shared schemas.
10. Financial and portfolio calculations must be deterministic, versioned, and independently testable. AI may interpret results but cannot replace their computation.

## Data and trust model

CryptoDesk AI will preserve provenance throughout the system.

Market events, news articles, portfolio snapshots, protocol data, and generated reports should retain:

- Source or provider identity.
- Ingestion and observation timestamps.
- Data freshness information.
- Transformation/version metadata.
- Relevant source excerpts or identifiers.
- The model/provider and prompt/workflow version used for AI output.

AI-generated outputs should cite the underlying market, news, portfolio, or research records that support factual claims. Where an output is an inference rather than a verified fact, it must be labeled accordingly.

## Scalability approach

The architecture supports progressive scaling rather than premature distribution.

### Initial stage

Deploy a web application, API layer, background worker, PostgreSQL, Redis or a managed queue/cache, and object storage for raw provider payloads and generated artifacts.

### Growth stage

Scale independently based on workload:

- Increase market-data worker concurrency for more assets or faster refreshes.
- Scale news-processing workers for more sources and document indexing.
- Separate portfolio synchronization for wallet/exchange load and provider limits.
- Run retrieval/indexing as a dedicated service when search volume grows.
- Scale agent workflows separately from request-serving APIs.
- Add read replicas, time-series storage, or dedicated search infrastructure only when observed usage requires them.

### Mature stage

Extract services only when a boundary has demonstrated one or more of:

- Independent scaling requirements.
- Distinct uptime or reliability requirements.
- Different security or credential boundaries.
- Separate deployment cadence.
- Significant computational cost.
- Clear ownership by a dedicated team.

The system should remain contract-driven so these changes do not alter user-facing behavior or require domain logic to be rewritten.

## Consequences

### Positive

- Fast early development without sacrificing modularity.
- Clear ownership of product domains and AI responsibilities.
- Better testing of financial logic and AI behavior.
- Stronger data provenance and user trust.
- Lower vendor lock-in and safer Ritual adoption.
- Independent scaling paths for ingestion, retrieval, reporting, and AI workloads.
- Consistent TypeScript types and runtime validation across the system.

### Trade-offs

- The monorepo requires disciplined dependency management.
- Module boundaries require more upfront design than a single-folder application.
- Agent policies, evaluations, and citations create additional implementation work.
- Event schemas and package interfaces must be versioned carefully.
- The Ritual Gateway adds an abstraction layer before Ritual is integrated.

These trade-offs are accepted because CryptoDesk AI’s core value depends on reliable, explainable intelligence rather than only rapid generation of AI text.

## Implementation guidance

Future implementation decisions should follow this ADR:

- Add new product capabilities as domain packages first.
- Add an agent only when a capability needs specialized AI reasoning or workflow behavior.
- Add a service only when runtime separation has a concrete operational benefit.
- Keep data-provider and model-provider integrations behind interfaces.
- Treat citations, source freshness, deterministic calculations, and audit records as product requirements.
- Route all future Ritual functionality through the Ritual Gateway.
