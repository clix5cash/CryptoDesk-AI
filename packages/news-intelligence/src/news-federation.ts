import {
  FederationDomain,
  FederationEligibility,
  FederationValidationError,
  createFederationEnvelope,
  type FederatedObservation,
  type FederationEligibilityPolicy,
  type FederationEnvelope,
  type FederationObservation,
} from '@cryptodesk-ai/federation';
import type { NewsEventGroup } from './event-group.js';
import type { NewsArticle } from './models.js';
import {
  newsArticleIdentity,
  normalizeNewsArticle,
  normalizeNewsArticles,
} from './normalization.js';

/** One normalized News article with distinct provider and source provenance. */
export type NewsProviderObservation = Omit<
  FederationObservation<NewsArticle>,
  'domain' | 'comparisonKey'
>;

export interface NewsFederationInput {
  readonly id: string;
  readonly generatedAt: string;
  readonly observations: ReadonlyArray<NewsProviderObservation>;
  /** Optional existing News-owned deterministic event-group evidence. */
  readonly eventGroups?: ReadonlyArray<NewsEventGroup>;
  readonly policy: FederationEligibilityPolicy;
}

export enum NewsObservationRelationshipKind {
  Duplicate = 'duplicate',
  SameEvent = 'same_event',
  Unknown = 'unknown',
}

export interface NewsObservationRelationship {
  readonly leftObservationId: string;
  readonly rightObservationId: string;
  readonly kind: NewsObservationRelationshipKind;
  /** Existing normalized article identity or NewsEventGroup ID; never inferred text similarity. */
  readonly evidenceReference?: string;
}

export interface NewsFederationResult {
  readonly federation: FederationEnvelope<NewsArticle>;
  readonly relationships: ReadonlyArray<NewsObservationRelationship>;
  /** Deliberately absent: eligibility never selects an article or provider. */
  readonly selectedObservationId?: never;
}

type AvailableNewsObservation = FederatedObservation<NewsArticle> & {
  readonly payload: NewsArticle;
};

/**
 * Qualifies normalized News observations and describes only relationships
 * supported by deterministic News-owned identity or event-group evidence.
 */
export function createNewsFederation(input: NewsFederationInput): NewsFederationResult {
  validateInput(input);
  const availableArticles: NewsArticle[] = [];
  const observations = input.observations.map((observation) => {
    validateObservation(observation);
    if (observation.payload !== undefined) availableArticles.push(observation.payload);
    return { ...observation, domain: FederationDomain.News };
  });

  // Reuse existing identity conflict rules without exposing article-controlled error detail.
  validateArticleCollection(availableArticles);
  const eventMembership = validateEventGroups(input.eventGroups ?? [], availableArticles);
  const federation = createFederationEnvelope<NewsArticle>({
    id: input.id,
    domain: FederationDomain.News,
    generatedAt: input.generatedAt,
    observations,
    policy: input.policy,
  });
  const eligible = federation.observations.filter(
    (observation): observation is AvailableNewsObservation =>
      observation.eligibility === FederationEligibility.Eligible &&
      observation.payload !== undefined,
  );
  const relationships: NewsObservationRelationship[] = [];

  for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
      const left = eligible[leftIndex];
      const right = eligible[rightIndex];
      if (!left?.payload || !right?.payload) throw new NewsFederationValidationError();
      relationships.push(relationshipFor(left, right, eventMembership));
    }
  }

  return deepFreeze({ federation, relationships });
}

function relationshipFor(
  left: { readonly id: string; readonly payload: NewsArticle },
  right: { readonly id: string; readonly payload: NewsArticle },
  eventMembership: ReadonlyMap<string, ReadonlySet<string>>,
): NewsObservationRelationship {
  const leftIdentity = newsArticleIdentity(left.payload);
  const rightIdentity = newsArticleIdentity(right.payload);
  if (leftIdentity === rightIdentity) {
    return {
      leftObservationId: left.id,
      rightObservationId: right.id,
      kind: NewsObservationRelationshipKind.Duplicate,
      evidenceReference: leftIdentity,
    };
  }
  const sharedEventId = firstSharedValue(
    eventMembership.get(left.payload.id),
    eventMembership.get(right.payload.id),
  );
  return sharedEventId === undefined
    ? {
        leftObservationId: left.id,
        rightObservationId: right.id,
        kind: NewsObservationRelationshipKind.Unknown,
      }
    : {
        leftObservationId: left.id,
        rightObservationId: right.id,
        kind: NewsObservationRelationshipKind.SameEvent,
        evidenceReference: sharedEventId,
      };
}

function validateInput(input: NewsFederationInput): void {
  if (
    !isPlainRecord(input) ||
    !['id', 'generatedAt', 'observations', 'policy'].every((key) => hasOwn(input, key)) ||
    Object.keys(input).some(
      (key) => !['id', 'generatedAt', 'observations', 'eventGroups', 'policy'].includes(key),
    ) ||
    !Array.isArray(input.observations) ||
    (input.eventGroups !== undefined && !Array.isArray(input.eventGroups))
  ) {
    throw new NewsFederationValidationError();
  }
}

function validateObservation(observation: NewsProviderObservation): void {
  if (
    !isPlainRecord(observation) ||
    hasOwn(observation, 'domain') ||
    hasOwn(observation, 'comparisonKey')
  ) {
    throw new NewsFederationValidationError();
  }
  if (observation.payload === undefined) return;
  const article = observation.payload;
  if (
    !isPlainRecord(article) ||
    !hasOnlyArticleKeys(article) ||
    observation.provenance.sourceId !== article.sourceId ||
    observation.provenance.observedAt !== article.observedAt
  ) {
    throw new NewsFederationValidationError();
  }
  const normalized = safelyNormalizeArticle(article);
  if (articleValue(article) !== articleValue(normalized)) {
    throw new NewsFederationValidationError();
  }
}

function safelyNormalizeArticle(article: NewsArticle): NewsArticle {
  try {
    return normalizeNewsArticle(article);
  } catch {
    throw new NewsFederationValidationError();
  }
}

function validateArticleCollection(articles: ReadonlyArray<NewsArticle>): void {
  try {
    // The normalized output is intentionally unused so original observations remain intact.
    normalizeNewsArticles(articles);
  } catch {
    throw new NewsFederationValidationError();
  }
}

function validateEventGroups(
  eventGroups: ReadonlyArray<NewsEventGroup>,
  articles: ReadonlyArray<NewsArticle>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  const membership = new Map<string, Set<string>>();
  const groupIds = new Set<string>();
  for (const group of eventGroups) {
    if (
      !isPlainRecord(group) ||
      typeof group.id !== 'string' ||
      group.id.trim().length === 0 ||
      groupIds.has(group.id) ||
      !Array.isArray(group.articleIds) ||
      group.articleIds.length === 0 ||
      !Array.isArray(group.evidence)
    ) {
      throw new NewsFederationValidationError();
    }
    groupIds.add(group.id);
    for (const articleId of group.articleIds) {
      const article = articlesById.get(articleId);
      const evidence = group.evidence.find((item) => item.articleId === articleId);
      if (!article || !evidence || evidence.sourceId !== article.sourceId) {
        throw new NewsFederationValidationError();
      }
      const memberships = membership.get(articleId) ?? new Set<string>();
      memberships.add(group.id);
      membership.set(articleId, memberships);
    }
  }
  return membership;
}

function firstSharedValue(
  left: ReadonlySet<string> | undefined,
  right: ReadonlySet<string> | undefined,
): string | undefined {
  if (!left || !right) return undefined;
  return [...left].filter((value) => right.has(value)).sort(compareText)[0];
}

function hasOnlyArticleKeys(article: Record<string, unknown>): boolean {
  const required = ['id', 'sourceId', 'title', 'publishedAt', 'observedAt'];
  const allowed = [
    ...required,
    'sourceRecordId',
    'canonicalUrl',
    'authors',
    'excerpt',
    'content',
    'language',
    'assetIds',
    'marketIds',
    'topicIds',
  ];
  return (
    required.every((key) => hasOwn(article, key)) &&
    Object.keys(article).every((key) => allowed.includes(key))
  );
}

function articleValue(article: NewsArticle): string {
  return JSON.stringify([
    article.id,
    article.sourceId,
    article.sourceRecordId ?? null,
    article.title,
    article.canonicalUrl ?? null,
    article.authors ?? null,
    article.excerpt ?? null,
    article.content ?? null,
    article.language ?? null,
    article.publishedAt,
    article.observedAt,
    article.assetIds ?? null,
    article.marketIds ?? null,
    article.topicIds ?? null,
  ]);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

export class NewsFederationValidationError extends FederationValidationError {
  constructor() {
    super('News federation input is invalid.');
    this.name = 'NewsFederationValidationError';
  }
}
