/** Explicit application error raised when normalized news data is invalid. */
export class NewsArticleError extends Error {}

/** Explicit application error raised when deterministic classification configuration is invalid. */
export class NewsClassificationError extends Error {}

/** Explicit application error raised when deterministic impact configuration or input is invalid. */
export class NewsImpactError extends Error {}

/** Explicit application error raised when deterministic event grouping input is invalid. */
export class NewsEventGroupError extends Error {}

/** Explicit application error raised when deterministic market relevance aggregation is invalid. */
export class NewsMarketIntelligenceError extends Error {}

/** Explicit application error raised when a News Intelligence context is invalid. */
export class NewsContextError extends Error {}

/** Explicit domain error raised when NewsSourceRegistry configuration is invalid. */
export class NewsSourceRegistryError extends Error {}

/** Explicit application error raised while composing multiple NewsProvider instances. */
export class NewsProviderCompositionError extends Error {}
