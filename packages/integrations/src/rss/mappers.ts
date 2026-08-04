import type {
  NewsArticle,
  NewsArticleId,
  NewsSourceRecordId,
} from '@cryptodesk-ai/news-intelligence';
import type { NewsFeedItem, RssFeedDefinition } from './types.js';

export class RssNewsMappingError extends Error {}

/**
 * Pure RSS/Atom-to-domain conversion. It preserves only source-provided data
 * and uses an explicit observation timestamp supplied by the composition layer.
 */
export function mapNewsFeedItemToArticle(
  definition: RssFeedDefinition,
  item: NewsFeedItem,
  observedAt: string,
): NewsArticle {
  const title = requireText(item.title, 'title');
  const publishedAt = requireTimestamp(item.publishedAt, 'publishedAt');
  const normalizedObservedAt = requireTimestamp(observedAt, 'observedAt');
  const sourceRecordId = firstNonEmpty(item.id, item.guid);
  const canonicalUrl = firstNonEmpty(item.link);

  return omitUndefinedFields({
    id: createArticleId(definition, sourceRecordId, canonicalUrl, title, publishedAt),
    sourceId: definition.source.id,
    sourceRecordId,
    title,
    canonicalUrl,
    authors: normalizeAuthors(item.authors),
    excerpt: optionalText(item.excerpt),
    content: optionalText(item.content),
    language: optionalText(item.language) ?? optionalText(definition.defaultLanguage),
    publishedAt,
    observedAt: normalizedObservedAt,
    topicIds: normalizeTopics([...(definition.defaultTopicIds ?? []), ...(item.categories ?? [])]),
  });
}

function createArticleId(
  definition: RssFeedDefinition,
  sourceRecordId: NewsSourceRecordId | undefined,
  canonicalUrl: string | undefined,
  title: string,
  publishedAt: string,
): NewsArticleId {
  return JSON.stringify([
    definition.source.id,
    sourceRecordId ?? '',
    canonicalUrl ?? '',
    title,
    publishedAt,
  ]);
}

function requireText(value: string | undefined, field: string): string {
  const normalized = optionalText(value);

  if (!normalized) {
    throw new RssNewsMappingError(`RSS/Atom feed item ${field} is required.`);
  }

  return normalized;
}

function requireTimestamp(value: string | undefined, field: string): string {
  const normalized = requireText(value, field);

  if (Number.isNaN(Date.parse(normalized))) {
    throw new RssNewsMappingError(`RSS/Atom feed item ${field} must be a valid timestamp.`);
  }

  return new Date(normalized).toISOString();
}

function firstNonEmpty(...values: ReadonlyArray<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = optionalText(value);

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized || undefined;
}

function normalizeAuthors(authors: NewsFeedItem['authors']): ReadonlyArray<string> | undefined {
  const names = authors?.flatMap((author) => {
    const name = optionalText(author.name);
    return name ? [name] : [];
  });

  return names && names.length > 0 ? Array.from(new Set(names)).sort(compareText) : undefined;
}

function normalizeTopics(values: ReadonlyArray<string>): ReadonlyArray<string> | undefined {
  const topics = values.map(optionalText).filter((value): value is string => value !== undefined);
  return topics.length > 0 ? Array.from(new Set(topics)).sort(compareText) : undefined;
}

function omitUndefinedFields(article: NewsArticle): NewsArticle {
  return Object.fromEntries(
    Object.entries(article).filter(([, value]) => value !== undefined),
  ) as NewsArticle;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
