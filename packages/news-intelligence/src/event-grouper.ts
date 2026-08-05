import { NewsClassificationStrength, type NewsClassification } from './classification.js';
import { NewsEventGroupError } from './errors.js';
import type { NewsEventGroup, NewsEventGrouperConfiguration } from './event-group.js';
import { NewsImpactTargetKind, type NewsImpact, type NewsImpactTarget } from './impact.js';
import type { NewsArticle } from './models.js';

const DEFAULT_TIME_WINDOW_HOURS = 24;

/** Provider-neutral boundary for deterministic grouping of existing news intelligence. */
export interface NewsArticleEventGrouper {
  group(input: NewsEventGroupingInput): ReadonlyArray<NewsEventGroup>;
}

export interface NewsEventGroupingInput {
  readonly articles: ReadonlyArray<NewsArticle>;
  readonly classifications: ReadonlyArray<NewsClassification>;
  readonly impacts?: ReadonlyArray<NewsImpact>;
}

/**
 * Stateless event grouper. It groups only matching explicit event-rule and
 * target identities inside the configured publication-time window.
 */
export class NewsEventGrouper implements NewsArticleEventGrouper {
  private readonly timeWindowMilliseconds: number;

  constructor(configuration: NewsEventGrouperConfiguration = {}) {
    const timeWindowHours = configuration.timeWindowHours ?? DEFAULT_TIME_WINDOW_HOURS;

    if (!Number.isFinite(timeWindowHours) || timeWindowHours <= 0) {
      throw new NewsEventGroupError(
        'News event grouping timeWindowHours must be a positive number.',
      );
    }

    this.timeWindowMilliseconds = timeWindowHours * 60 * 60 * 1000;
  }

  group(input: NewsEventGroupingInput): ReadonlyArray<NewsEventGroup> {
    const articlesById = indexArticles(input.articles);
    const classificationsByArticleId = indexClassifications(input.classifications, articlesById);
    const impacts = validateImpacts(input.impacts ?? [], articlesById);
    const candidates = candidatesFor(articlesById, classificationsByArticleId);
    const groups = splitCandidates(candidates, this.timeWindowMilliseconds);

    return groups
      .map((group) => assembleGroup(group, articlesById, impacts))
      .sort((left, right) => {
        const publicationComparison = compareText(right.firstPublishedAt, left.firstPublishedAt);

        return (
          publicationComparison ||
          compareTuple([left.eventType, left.id], [right.eventType, right.id])
        );
      });
  }
}

interface EventCandidate {
  readonly article: NewsArticle;
  readonly eventType: NewsEventGroup['eventType'];
  readonly ruleIds: ReadonlyArray<string>;
  readonly target?: NewsImpactTarget;
  readonly eventEvidence: NewsEventGroup['evidence'][number]['eventEvidence'];
  readonly baseIdentity: string;
  readonly publishedAtMilliseconds: number;
}

function indexArticles(articles: ReadonlyArray<NewsArticle>): ReadonlyMap<string, NewsArticle> {
  const byId = new Map<string, NewsArticle>();

  for (const article of articles) {
    const existing = byId.get(article.id);

    if (existing && !sameArticle(existing, article)) {
      throw new NewsEventGroupError(`Conflicting NewsArticle records for "${article.id}".`);
    }

    byId.set(article.id, article);
  }

  return byId;
}

function indexClassifications(
  classifications: ReadonlyArray<NewsClassification>,
  articlesById: ReadonlyMap<string, NewsArticle>,
): ReadonlyMap<string, NewsClassification> {
  const byArticleId = new Map<string, NewsClassification>();

  for (const classification of classifications) {
    if (!articlesById.has(classification.articleId)) {
      throw new NewsEventGroupError(
        `News classification references unknown article "${classification.articleId}".`,
      );
    }

    if (byArticleId.has(classification.articleId)) {
      throw new NewsEventGroupError(
        `Duplicate News classification for article "${classification.articleId}".`,
      );
    }

    byArticleId.set(classification.articleId, classification);
  }

  return byArticleId;
}

function validateImpacts(
  impacts: ReadonlyArray<NewsImpact>,
  articlesById: ReadonlyMap<string, NewsArticle>,
): ReadonlyArray<NewsImpact> {
  for (const impact of impacts) {
    if (!articlesById.has(impact.articleId)) {
      throw new NewsEventGroupError(
        `News impact references unknown article "${impact.articleId}".`,
      );
    }
  }

  return impacts;
}

function candidatesFor(
  articlesById: ReadonlyMap<string, NewsArticle>,
  classificationsByArticleId: ReadonlyMap<string, NewsClassification>,
): ReadonlyArray<EventCandidate> {
  const candidates = new Map<string, EventCandidate>();

  for (const article of articlesById.values()) {
    const classification = classificationsByArticleId.get(article.id);

    if (!classification) {
      continue;
    }

    for (const event of classification.events) {
      const ruleIds = uniqueSorted(
        event.evidence.flatMap((evidence) => (evidence.ruleId ? [evidence.ruleId] : [])),
      );
      const targets = groupingTargets(article, classification);

      for (const target of targets) {
        const ruleIdentity = ruleIds.length > 0 ? ruleIds.join(',') : `article:${article.id}`;
        const targetIdentity = target ? targetIdentityFor(target) : `article:${article.id}`;
        const baseIdentity = [event.type, ruleIdentity, targetIdentity].join('\u0000');
        const candidate: EventCandidate = {
          article,
          eventType: event.type,
          ruleIds,
          target,
          eventEvidence: normalizeEvidence(event.evidence),
          baseIdentity,
          publishedAtMilliseconds: timestampMilliseconds(article.publishedAt, article.id),
        };

        candidates.set([article.id, baseIdentity].join('\u0000'), candidate);
      }
    }
  }

  return Array.from(candidates.values()).sort((left, right) =>
    compareTuple(
      [left.baseIdentity, left.article.publishedAt, left.article.id],
      [right.baseIdentity, right.article.publishedAt, right.article.id],
    ),
  );
}

function groupingTargets(
  article: NewsArticle,
  classification: NewsClassification,
): ReadonlyArray<NewsImpactTarget | undefined> {
  const assets = classification.assets
    .filter((asset) => asset.strength === NewsClassificationStrength.Explicit)
    .map((asset) => ({ kind: NewsImpactTargetKind.Asset, assetId: asset.assetId }) as const);

  if (assets.length > 0) {
    return assets;
  }

  const markets = classification.markets.map(
    (market) => ({ kind: NewsImpactTargetKind.Market, marketId: market.marketId }) as const,
  );

  if (markets.length > 0) {
    return markets;
  }

  const topics = uniqueSorted(article.topicIds ?? []).map(
    (topicId) => ({ kind: NewsImpactTargetKind.Topic, topicId }) as const,
  );

  return topics.length > 0 ? topics : [undefined];
}

function splitCandidates(
  candidates: ReadonlyArray<EventCandidate>,
  timeWindowMilliseconds: number,
): ReadonlyArray<ReadonlyArray<EventCandidate>> {
  const groupsByIdentity = new Map<string, EventCandidate[][]>();

  for (const candidate of candidates) {
    const groups = groupsByIdentity.get(candidate.baseIdentity) ?? [];
    const lastGroup = groups.at(-1);
    const first = lastGroup?.[0];

    if (
      !lastGroup ||
      !first ||
      candidate.publishedAtMilliseconds - first.publishedAtMilliseconds > timeWindowMilliseconds
    ) {
      groups.push([candidate]);
    } else {
      lastGroup.push(candidate);
    }

    groupsByIdentity.set(candidate.baseIdentity, groups);
  }

  return Array.from(groupsByIdentity.values()).flat();
}

function assembleGroup(
  candidates: ReadonlyArray<EventCandidate>,
  articlesById: ReadonlyMap<string, NewsArticle>,
  impacts: ReadonlyArray<NewsImpact>,
): NewsEventGroup {
  const orderedCandidates = [...candidates].sort((left, right) =>
    compareTuple(
      [left.article.publishedAt, left.article.id],
      [right.article.publishedAt, right.article.id],
    ),
  );
  const first = orderedCandidates[0];

  if (!first) {
    throw new NewsEventGroupError('News event grouping cannot assemble an empty candidate set.');
  }

  const articleIds = uniqueSorted(orderedCandidates.map((candidate) => candidate.article.id));
  const memberArticles = articleIds.map((articleId) => {
    const article = articlesById.get(articleId);

    if (!article) {
      throw new NewsEventGroupError(`News event group references unknown article "${articleId}".`);
    }

    return article;
  });
  const firstPublishedAt = orderedCandidates[0]?.article.publishedAt;
  const lastPublishedAt = orderedCandidates.at(-1)?.article.publishedAt;

  if (!firstPublishedAt || !lastPublishedAt) {
    throw new NewsEventGroupError('News event group is missing publication provenance.');
  }

  const target = first.target;
  const groupId = groupIdFor(first, firstPublishedAt);

  return {
    id: groupId,
    eventType: first.eventType,
    ...(target === undefined ? {} : { target }),
    articleIds,
    sourceIds: uniqueSorted(memberArticles.map((article) => article.sourceId)),
    assetIds: uniqueSorted(memberArticles.flatMap((article) => article.assetIds ?? [])),
    marketIds: uniqueSorted(memberArticles.flatMap((article) => article.marketIds ?? [])),
    topicIds: uniqueSorted(memberArticles.flatMap((article) => article.topicIds ?? [])),
    impacts: associatedImpacts(articleIds, target, impacts),
    firstPublishedAt,
    lastPublishedAt,
    evidence: orderedCandidates.map((candidate) => ({
      articleId: candidate.article.id,
      sourceId: candidate.article.sourceId,
      ...(candidate.article.sourceRecordId === undefined
        ? {}
        : { sourceRecordId: candidate.article.sourceRecordId }),
      eventEvidence: candidate.eventEvidence,
    })),
  };
}

function associatedImpacts(
  articleIds: ReadonlyArray<string>,
  target: NewsImpactTarget | undefined,
  impacts: ReadonlyArray<NewsImpact>,
): ReadonlyArray<NewsImpact> {
  const articleIdSet = new Set(articleIds);
  const byIdentity = new Map<string, NewsImpact>();

  for (const impact of impacts) {
    if (!articleIdSet.has(impact.articleId) || !target || !sameTarget(impact.target, target)) {
      continue;
    }

    byIdentity.set(impactIdentity(impact), impact);
  }

  return Array.from(byIdentity.values()).sort((left, right) =>
    compareTuple(
      [left.articleId, left.type, left.direction, left.strength],
      [right.articleId, right.type, right.direction, right.strength],
    ),
  );
}

function groupIdFor(candidate: EventCandidate, firstPublishedAt: string): string {
  return [
    'news-event',
    encodeURIComponent(candidate.eventType),
    encodeURIComponent(candidate.ruleIds.join(',')),
    encodeURIComponent(
      candidate.target ? targetIdentityFor(candidate.target) : candidate.article.id,
    ),
    encodeURIComponent(firstPublishedAt),
  ].join(':');
}

function targetIdentityFor(target: NewsImpactTarget): string {
  switch (target.kind) {
    case NewsImpactTargetKind.Asset:
      return `asset:${target.assetId}`;
    case NewsImpactTargetKind.Market:
      return `market:${target.marketId}`;
    case NewsImpactTargetKind.Topic:
      return `topic:${target.topicId}`;
  }
}

function sameTarget(left: NewsImpactTarget, right: NewsImpactTarget): boolean {
  return targetIdentityFor(left) === targetIdentityFor(right);
}

function impactIdentity(impact: NewsImpact): string {
  return [
    impact.articleId,
    impact.type,
    impact.direction,
    impact.strength,
    targetIdentityFor(impact.target),
  ].join('\u0000');
}

function normalizeEvidence<
  T extends { readonly field: string; readonly ruleId?: string; readonly matchedValue: string },
>(evidence: ReadonlyArray<T>): ReadonlyArray<T> {
  const byIdentity = new Map<string, T>();

  for (const item of evidence) {
    byIdentity.set([item.field, item.ruleId ?? '', item.matchedValue].join('\u0000'), item);
  }

  return Array.from(byIdentity.values()).sort((left, right) =>
    compareTuple(
      [left.field, left.ruleId ?? '', left.matchedValue],
      [right.field, right.ruleId ?? '', right.matchedValue],
    ),
  );
}

function timestampMilliseconds(timestamp: string, articleId: string): number {
  const value = Date.parse(timestamp);

  if (Number.isNaN(value)) {
    throw new NewsEventGroupError(
      `News article "${articleId}" has an invalid publication timestamp.`,
    );
  }

  return value;
}

function sameArticle(left: NewsArticle, right: NewsArticle): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueSorted(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Array.from(new Set(values)).sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTuple(left: ReadonlyArray<string>, right: ReadonlyArray<string>): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareText(left[index] ?? '', right[index] ?? '');

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}
