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

Articles are ordered by publication time descending, then source ID and article
ID ascending. Deduplication prefers source-record ID, then canonical URL, then
the stable combination of source ID, article ID, title, and publication time.
The package preserves source, source-record, publication, observation, and
canonical-reference provenance without fetching, ranking, scoring, summarizing,
or analyzing news.
