import type { AssetId, MarketId } from '@cryptodesk-ai/market-intelligence';
import type { NewsCategoryCount, NewsContextMetadata, NewsEventCount } from './context.js';
import type { NewsClassification } from './classification.js';
import type { NewsArticle, NewsQuery, NewsSourceId, NewsTopicId } from './models.js';

/** Normalizes query provenance without changing its provider-neutral meaning. */
export function normalizeNewsQuery(query: NewsQuery): NewsQuery {
  return omitUndefinedFields({
    assetIds: normalizeTextValues(query.assetIds),
    marketIds: normalizeTextValues(query.marketIds),
    topicIds: normalizeTextValues(query.topicIds),
    sourceIds: normalizeTextValues(query.sourceIds),
    from: query.from,
    to: query.to,
    limit: query.limit,
  });
}

/** Deterministic context metadata derived directly from normalized records and classifications. */
export function assembleNewsContextMetadata(
  articles: ReadonlyArray<NewsArticle>,
  classifications: ReadonlyArray<NewsClassification>,
): NewsContextMetadata {
  return {
    articleCount: articles.length,
    sourceIds: normalizeTextValues(articles.map((article) => article.sourceId)) ?? [],
    assetIds:
      normalizeTextValues([
        ...articles.flatMap((article) => article.assetIds ?? []),
        ...classifications.flatMap((classification) =>
          classification.assets.map((relevance) => relevance.assetId),
        ),
      ]) ?? [],
    marketIds:
      normalizeTextValues([
        ...articles.flatMap((article) => article.marketIds ?? []),
        ...classifications.flatMap((classification) =>
          classification.markets.map((relevance) => relevance.marketId),
        ),
      ]) ?? [],
    topicIds: normalizeTextValues(articles.flatMap((article) => article.topicIds ?? [])) ?? [],
    categoryCounts: countCategories(classifications),
    eventCounts: countEvents(classifications),
  };
}

/** Stable identity used to associate one classification with one normalized article. */
export function newsClassificationIdentity(classification: NewsClassification): string {
  return classification.articleId;
}

function countCategories(
  classifications: ReadonlyArray<NewsClassification>,
): ReadonlyArray<NewsCategoryCount> {
  const counts = new Map<NewsCategoryCount['category'], number>();

  for (const classification of classifications) {
    for (const category of classification.categories) {
      counts.set(category.category, (counts.get(category.category) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => compareText(left.category, right.category));
}

function countEvents(
  classifications: ReadonlyArray<NewsClassification>,
): ReadonlyArray<NewsEventCount> {
  const counts = new Map<NewsEventCount['type'], number>();

  for (const classification of classifications) {
    for (const event of classification.events) {
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => compareText(left.type, right.type));
}

function normalizeTextValues<TValue extends AssetId | MarketId | NewsSourceId | NewsTopicId>(
  values: ReadonlyArray<TValue> | undefined,
): ReadonlyArray<TValue> | undefined {
  if (values === undefined) {
    return undefined;
  }

  return Array.from(new Set(values)).sort(compareText) as ReadonlyArray<TValue>;
}

function omitUndefinedFields(query: NewsQuery): NewsQuery {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined),
  ) as NewsQuery;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
