import type { NewsArticle } from './models.js';
import { NewsArticleError } from './errors.js';

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

interface UrlReference {
  readonly protocol: string;
  toString(): string;
}

interface UrlReferenceConstructor {
  new (input: string): UrlReference;
}

const UrlReference = (globalThis as unknown as { readonly URL: UrlReferenceConstructor }).URL;

/** Validates, normalizes, deduplicates, and orders provider-neutral articles. */
export function normalizeNewsArticles(
  articles: ReadonlyArray<NewsArticle>,
): ReadonlyArray<NewsArticle> {
  const normalizedArticles = articles.map(normalizeNewsArticle);
  const articlesByIdentity = new Map<string, ReadonlyArray<NewsArticle>>();

  for (const article of normalizedArticles) {
    const identity = articleIdentity(article);
    const existing = articlesByIdentity.get(identity) ?? [];
    articlesByIdentity.set(identity, [...existing, article]);
  }

  return Array.from(articlesByIdentity.values()).map(mergeDuplicateArticles).sort(compareArticles);
}

/** Normalizes and validates one article without deriving or inferring new data. */
export function normalizeNewsArticle(article: NewsArticle): NewsArticle {
  const normalizedArticle: NewsArticle = {
    ...article,
    id: normalizeRequiredText(article.id, 'News article ID'),
    sourceId: normalizeRequiredText(article.sourceId, 'News source ID'),
    sourceRecordId: normalizeOptionalText(article.sourceRecordId, 'News source record ID'),
    title: normalizeRequiredText(article.title, 'News article title'),
    canonicalUrl: normalizeCanonicalUrl(article.canonicalUrl),
    authors: normalizeTextArray(article.authors),
    excerpt: normalizeOptionalWhitespace(article.excerpt),
    content: normalizeOptionalWhitespace(article.content),
    language: normalizeLanguage(article.language),
    publishedAt: normalizeTimestamp(article.publishedAt, 'News article publishedAt'),
    observedAt: normalizeTimestamp(article.observedAt, 'News article observedAt'),
    assetIds: normalizeTextArray(article.assetIds),
    marketIds: normalizeTextArray(article.marketIds),
    topicIds: normalizeTextArray(article.topicIds),
  };

  return omitUndefinedFields(normalizedArticle);
}

/** Stable identity priority: source record, canonical URL, then source/article/publication fields. */
export function newsArticleIdentity(article: NewsArticle): string {
  return articleIdentity(normalizeNewsArticle(article));
}

function articleIdentity(article: NewsArticle): string {
  if (article.sourceRecordId) {
    return `source-record:${article.sourceRecordId}`;
  }

  if (article.canonicalUrl) {
    return `canonical-url:${article.canonicalUrl}`;
  }

  return JSON.stringify([
    'fallback',
    article.sourceId,
    article.id,
    article.title,
    article.publishedAt,
  ]);
}

function mergeDuplicateArticles(articles: ReadonlyArray<NewsArticle>): NewsArticle {
  const firstArticle = articles[0];

  if (!firstArticle) {
    throw new NewsArticleError('Cannot merge an empty collection of news articles.');
  }

  for (const article of articles.slice(1)) {
    if (
      article.sourceId !== firstArticle.sourceId ||
      article.title !== firstArticle.title ||
      article.publishedAt !== firstArticle.publishedAt
    ) {
      throw new NewsArticleError(
        `Conflicting required article fields were supplied for "${articleIdentity(firstArticle)}".`,
      );
    }
  }

  const preferred = [...articles].sort(compareArticleRichness)[0];

  if (!preferred) {
    throw new NewsArticleError('Cannot select a preferred news article.');
  }

  return omitUndefinedFields({
    ...preferred,
    authors: normalizeTextArray(articles.flatMap((article) => article.authors ?? [])),
    assetIds: normalizeTextArray(articles.flatMap((article) => article.assetIds ?? [])),
    marketIds: normalizeTextArray(articles.flatMap((article) => article.marketIds ?? [])),
    topicIds: normalizeTextArray(articles.flatMap((article) => article.topicIds ?? [])),
    observedAt: articles.reduce(
      (latest, article) => (article.observedAt > latest ? article.observedAt : latest),
      firstArticle.observedAt,
    ),
  });
}

function compareArticles(left: NewsArticle, right: NewsArticle): number {
  return (
    compareText(right.publishedAt, left.publishedAt) ||
    compareText(left.sourceId, right.sourceId) ||
    compareText(left.id, right.id)
  );
}

function compareArticleRichness(left: NewsArticle, right: NewsArticle): number {
  return (
    articleRichness(right) - articleRichness(left) ||
    compareText(articleStableValue(left), articleStableValue(right))
  );
}

function articleRichness(article: NewsArticle): number {
  return [
    article.sourceRecordId,
    article.canonicalUrl,
    article.authors?.length,
    article.excerpt,
    article.content,
    article.language,
    article.assetIds?.length,
    article.marketIds?.length,
    article.topicIds?.length,
  ].filter(Boolean).length;
}

function articleStableValue(article: NewsArticle): string {
  return JSON.stringify([
    article.id,
    article.sourceRecordId ?? '',
    article.canonicalUrl ?? '',
    article.authors ?? [],
    article.excerpt ?? '',
    article.content ?? '',
    article.language ?? '',
    article.assetIds ?? [],
    article.marketIds ?? [],
    article.topicIds ?? [],
  ]);
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    throw new NewsArticleError(`${label} is required.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeRequiredText(value, label);
}

function normalizeOptionalWhitespace(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeWhitespace(value);
  return normalized || undefined;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function normalizeTextArray(
  values: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> | undefined {
  if (values === undefined) {
    return undefined;
  }

  return Array.from(
    new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean)),
  ).sort(compareText);
}

function normalizeLanguage(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalWhitespace(value);
  return normalized?.toLowerCase();
}

function normalizeTimestamp(value: string, label: string): string {
  if (!isoTimestampPattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw new NewsArticleError(`${label} must be a valid ISO timestamp.`);
  }

  return new Date(value).toISOString();
}

function normalizeCanonicalUrl(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalWhitespace(value);

  if (normalized === undefined) {
    return undefined;
  }

  let url: UrlReference;

  try {
    url = new UrlReference(normalized);
  } catch {
    throw new NewsArticleError('News article canonicalUrl must be an absolute HTTP(S) URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NewsArticleError('News article canonicalUrl must be an absolute HTTP(S) URL.');
  }

  return url.toString();
}

function omitUndefinedFields(article: NewsArticle): NewsArticle {
  return Object.fromEntries(
    Object.entries(article).filter(([, value]) => value !== undefined),
  ) as NewsArticle;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
