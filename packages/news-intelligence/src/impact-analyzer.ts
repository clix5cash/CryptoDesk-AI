import {
  NewsClassificationField,
  NewsClassificationStrength,
  type NewsClassification,
  type NewsClassificationEvidence,
} from './classification.js';
import { NewsImpactError } from './errors.js';
import {
  NewsImpactDirection,
  NewsImpactStrength,
  NewsImpactTargetKind,
  type NewsImpact,
  type NewsImpactAnalyzerConfiguration,
  type NewsImpactEvidence,
  type NewsImpactRule,
  type NewsImpactTarget,
} from './impact.js';
import type { NewsArticle } from './models.js';

/** Provider-neutral boundary for deterministic impact enrichment. */
export interface NewsArticleImpactAnalyzer {
  analyze(article: NewsArticle, classification: NewsClassification): ReadonlyArray<NewsImpact>;
}

/**
 * Stateless, configuration-driven impact enrichment over existing normalized
 * articles and deterministic classifications.
 */
export class NewsImpactAnalyzer implements NewsArticleImpactAnalyzer {
  private readonly rules: ReadonlyArray<NewsImpactRule>;

  constructor(configuration: NewsImpactAnalyzerConfiguration = {}) {
    this.rules = normalizeRules(configuration.rules ?? []);
  }

  analyze(article: NewsArticle, classification: NewsClassification): ReadonlyArray<NewsImpact> {
    if (article.id !== classification.articleId) {
      throw new NewsImpactError(
        'News impact analysis requires a classification for the same article.',
      );
    }

    const impacts = this.rules.flatMap((rule) => {
      const triggerEvidence = matchingTriggerEvidence(classification, rule);

      if (triggerEvidence.length === 0) {
        return [];
      }

      return targetsFor(article, classification, rule.targetKind).map(
        ({ target, evidence, explicit }) => ({
          articleId: article.id,
          type: rule.type,
          direction: rule.direction ?? NewsImpactDirection.Unknown,
          strength: explicit ? NewsImpactStrength.Explicit : rule.strength,
          target,
          evidence: [
            {
              articleId: article.id,
              ...(article.sourceRecordId === undefined
                ? {}
                : { sourceRecordId: article.sourceRecordId }),
              ruleId: rule.id,
              triggerEvidence,
              targetEvidence: evidence,
            },
          ],
        }),
      );
    });

    return deduplicateAndOrderImpacts(impacts);
  }
}

function normalizeRules(rules: ReadonlyArray<NewsImpactRule>): ReadonlyArray<NewsImpactRule> {
  const ruleIds = new Set<string>();

  return [...rules]
    .map((rule) => {
      const id = rule.id.trim();

      if (!id) {
        throw new NewsImpactError('News impact rule ID must not be empty.');
      }

      if (ruleIds.has(id)) {
        throw new NewsImpactError(`Duplicate News impact rule ID "${id}".`);
      }

      if (!rule.event && !rule.category) {
        throw new NewsImpactError(
          `News impact rule "${id}" requires an event or category selector.`,
        );
      }

      ruleIds.add(id);
      return { ...rule, id };
    })
    .sort((left, right) => compareText(left.id, right.id));
}

function matchingTriggerEvidence(
  classification: NewsClassification,
  rule: NewsImpactRule,
): ReadonlyArray<NewsClassificationEvidence> {
  const eventEvidence = rule.event
    ? classification.events
        .filter((event) => event.type === rule.event)
        .flatMap((event) => event.evidence)
    : undefined;
  const categoryEvidence = rule.category
    ? classification.categories
        .filter((category) => category.category === rule.category)
        .flatMap((category) => category.evidence)
    : undefined;

  if (
    (eventEvidence !== undefined && eventEvidence.length === 0) ||
    (categoryEvidence !== undefined && categoryEvidence.length === 0)
  ) {
    return [];
  }

  return normalizeEvidence([...(eventEvidence ?? []), ...(categoryEvidence ?? [])]);
}

function targetsFor(
  article: NewsArticle,
  classification: NewsClassification,
  targetKind: NewsImpactTargetKind,
): ReadonlyArray<{
  readonly target: NewsImpactTarget;
  readonly evidence: ReadonlyArray<NewsClassificationEvidence>;
  readonly explicit: boolean;
}> {
  switch (targetKind) {
    case NewsImpactTargetKind.Asset:
      return classification.assets.map((asset) => ({
        target: { kind: NewsImpactTargetKind.Asset, assetId: asset.assetId },
        evidence: asset.evidence,
        explicit: asset.strength === NewsClassificationStrength.Explicit,
      }));
    case NewsImpactTargetKind.Market:
      return classification.markets.map((market) => ({
        target: { kind: NewsImpactTargetKind.Market, marketId: market.marketId },
        evidence: market.evidence,
        explicit: true,
      }));
    case NewsImpactTargetKind.Topic:
      return (article.topicIds ?? []).map((topicId) => ({
        target: { kind: NewsImpactTargetKind.Topic, topicId },
        evidence: [
          {
            field: NewsClassificationField.TopicIds,
            matchedValue: topicId,
          },
        ],
        explicit: true,
      }));
  }
}

function deduplicateAndOrderImpacts(impacts: ReadonlyArray<NewsImpact>): ReadonlyArray<NewsImpact> {
  const byIdentity = new Map<string, NewsImpact>();

  for (const impact of impacts) {
    const identity = impactIdentity(impact);
    const existing = byIdentity.get(identity);
    byIdentity.set(identity, existing ? mergeImpactEvidence(existing, impact) : impact);
  }

  return Array.from(byIdentity.values()).sort((left, right) =>
    compareTuple(
      [left.articleId, left.type, left.direction, left.target.kind, targetIdentifier(left.target)],
      [
        right.articleId,
        right.type,
        right.direction,
        right.target.kind,
        targetIdentifier(right.target),
      ],
    ),
  );
}

function mergeImpactEvidence(left: NewsImpact, right: NewsImpact): NewsImpact {
  return {
    ...left,
    evidence: normalizeImpactEvidence([...left.evidence, ...right.evidence]),
  };
}

function normalizeImpactEvidence(
  evidence: ReadonlyArray<NewsImpactEvidence>,
): ReadonlyArray<NewsImpactEvidence> {
  const byIdentity = new Map<string, NewsImpactEvidence>();

  for (const item of evidence) {
    const normalized = {
      ...item,
      triggerEvidence: normalizeEvidence(item.triggerEvidence),
      targetEvidence: normalizeEvidence(item.targetEvidence),
    };
    byIdentity.set(
      [
        normalized.articleId,
        normalized.sourceRecordId ?? '',
        normalized.ruleId,
        evidenceIdentity(normalized.triggerEvidence),
        evidenceIdentity(normalized.targetEvidence),
      ].join('\u0000'),
      normalized,
    );
  }

  return Array.from(byIdentity.values()).sort((left, right) =>
    compareTuple(
      [left.articleId, left.sourceRecordId ?? '', left.ruleId],
      [right.articleId, right.sourceRecordId ?? '', right.ruleId],
    ),
  );
}

function normalizeEvidence(
  evidence: ReadonlyArray<NewsClassificationEvidence>,
): ReadonlyArray<NewsClassificationEvidence> {
  const byIdentity = new Map<string, NewsClassificationEvidence>();

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

function impactIdentity(impact: NewsImpact): string {
  return [
    impact.articleId,
    impact.type,
    impact.direction,
    impact.strength,
    impact.target.kind,
    targetIdentifier(impact.target),
  ].join('\u0000');
}

function targetIdentifier(target: NewsImpactTarget): string {
  switch (target.kind) {
    case NewsImpactTargetKind.Asset:
      return target.assetId;
    case NewsImpactTargetKind.Market:
      return target.marketId;
    case NewsImpactTargetKind.Topic:
      return target.topicId;
  }
}

function evidenceIdentity(evidence: ReadonlyArray<NewsClassificationEvidence>): string {
  return evidence
    .map((item) => [item.field, item.ruleId ?? '', item.matchedValue].join('\u0000'))
    .join('\u0001');
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
