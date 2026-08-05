# @cryptodesk-ai/news-intelligence

Provider-neutral News Intelligence domain contracts and deterministic article handling.

The package defines normalized news sources, articles, topics, retrieval
queries, provider/service boundaries, and deterministic article normalization.
`DefaultNewsIntelligenceService` receives a `NewsProvider` explicitly, then
validates, deduplicates, and orders its provider-neutral article output.

`NewsClassifier` is a separate, stateless deterministic component. Its asset
vocabulary and category/event rules are supplied explicitly at composition time;
it has no built-in crypto catalog or provider-specific policy. It returns
machine-readable evidence for explicit associations and exact token, phrase, or
topic-ID matches.

`getContext(query)` is an additive API. It requires an explicitly injected
classifier, validator, and clock, and returns a validated `NewsContext` with
normalized articles, article-ID-associated classifications, query provenance,
and deterministic aggregate metadata. Empty provider output produces a valid
empty context.

Articles are ordered by publication time descending, then source ID and article
ID ascending. Deduplication prefers source-record ID, then canonical URL, then
the stable combination of source ID, article ID, title, and publication time.
The package preserves source, source-record, publication, observation, and
canonical-reference provenance without fetching, ranking, scoring, summarizing,
or analyzing news.

`NewsSourceRegistry` holds explicitly configured provider-neutral sources in an
instance-scoped registry. `CompositeNewsProvider` composes explicitly registered
providers and their declared source ownership, then delegates normalization and
deduplication back to this package. Providers are queried in provider-ID order;
any provider failure fails the request explicitly. Empty provider output is
valid, and conflicting cross-source identities remain explicit normalization
errors rather than silently losing provenance.

Concrete integrations compose upward into these provider-neutral boundaries:
`NewsProvider` → `CompositeNewsProvider` → `DefaultNewsIntelligenceService` →
`NewsContext`. This package does not import RSS, XML parsers, HTTP clients, or
concrete provider implementations.
