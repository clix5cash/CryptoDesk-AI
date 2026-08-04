import type { AssetId } from '@cryptodesk-ai/market-intelligence';
import {
  NewsClassificationField,
  NewsClassificationStrength,
  type NewsAssetRelevance,
  type NewsAssetVocabularyEntry,
  type NewsCategoryClassification,
  type NewsClassification,
  type NewsClassificationEvidence,
  type NewsClassificationRule,
  type NewsClassifierConfiguration,
  type NewsEventClassification,
  type NewsMarketRelevance,
} from './classification.js';
import { NewsClassificationError } from './errors.js';
import type { NewsArticle } from './models.js';
import { normalizeNewsArticle } from './normalization.js';

/** Provider-neutral boundary for deterministic classification of one article. */
export interface NewsArticleClassifier {
  classify(article: NewsArticle): NewsClassification;
}

/**
 * Stateless deterministic classifier. Its asset vocabulary and rules are
 * supplied explicitly by the composition layer; it has no provider knowledge.
 */
export class NewsClassifier implements NewsArticleClassifier {
  private readonly assets: ReadonlyArray<NewsAssetVocabularyEntry>;
  private readonly rules: ReadonlyArray<NewsClassificationRule>;

  constructor(configuration: NewsClassifierConfiguration = {}) {
    this.assets = normalizeAssets(configuration.assets ?? []);
    this.rules = normalizeRules(configuration.rules ?? []);
  }

  classify(article: NewsArticle): NewsClassification {
    const normalizedArticle = normalizeNewsArticle(article);

    return {
      articleId: normalizedArticle.id,
      assets: classifyAssets(normalizedArticle, this.assets),
      markets: classifyMarkets(normalizedArticle),
      categories: classifyCategories(normalizedArticle, this.rules),
      events: classifyEvents(normalizedArticle, this.rules),
    };
  }
}

function classifyAssets(
  article: NewsArticle,
  vocabulary: ReadonlyArray<NewsAssetVocabularyEntry>,
): ReadonlyArray<NewsAssetRelevance> {
  const evidenceByAsset = new Map<AssetId, ReadonlyArray<NewsClassificationEvidence>>();

  for (const assetId of article.assetIds ?? []) {
    addEvidence(evidenceByAsset, assetId, {
      field: NewsClassificationField.AssetIds,
      matchedValue: assetId,
    });
  }

  for (const entry of vocabulary) {
    for (const alias of [...(entry.symbols ?? []), ...(entry.aliases ?? [])]) {
      for (const match of matchArticleText(article, alias)) {
        addEvidence(evidenceByAsset, entry.assetId, match);
      }
    }
  }

  return Array.from(evidenceByAsset.entries())
    .map(([assetId, evidence]) => ({
      assetId,
      strength: evidence.some((item) => item.field === NewsClassificationField.AssetIds)
        ? NewsClassificationStrength.Explicit
        : NewsClassificationStrength.Strong,
      evidence: normalizeEvidence(evidence),
    }))
    .sort((left, right) => compareText(left.assetId, right.assetId));
}

function classifyMarkets(article: NewsArticle): ReadonlyArray<NewsMarketRelevance> {
  return (article.marketIds ?? [])
    .map((marketId) => ({
      marketId,
      strength: NewsClassificationStrength.Explicit as NewsClassificationStrength.Explicit,
      evidence: [
        {
          field: NewsClassificationField.MarketIds,
          matchedValue: marketId,
        },
      ],
    }))
    .sort((left, right) => compareText(left.marketId, right.marketId));
}

function classifyCategories(
  article: NewsArticle,
  rules: ReadonlyArray<NewsClassificationRule>,
): ReadonlyArray<NewsCategoryClassification> {
  const evidenceByCategory = new Map<
    NewsClassificationRule['category'],
    ReadonlyArray<NewsClassificationEvidence>
  >();

  for (const rule of rules) {
    for (const evidence of matchRule(article, rule)) {
      addEvidence(evidenceByCategory, rule.category, evidence);
    }
  }

  return Array.from(evidenceByCategory.entries())
    .map(([category, evidence]) => ({
      category,
      strength: NewsClassificationStrength.Strong as NewsClassificationStrength.Strong,
      evidence: normalizeEvidence(evidence),
    }))
    .sort((left, right) => compareText(left.category, right.category));
}

function classifyEvents(
  article: NewsArticle,
  rules: ReadonlyArray<NewsClassificationRule>,
): ReadonlyArray<NewsEventClassification> {
  const evidenceByEvent = new Map<
    NonNullable<NewsClassificationRule['event']>,
    ReadonlyArray<NewsClassificationEvidence>
  >();

  for (const rule of rules) {
    if (!rule.event) {
      continue;
    }

    for (const evidence of matchRule(article, rule)) {
      addEvidence(evidenceByEvent, rule.event, evidence);
    }
  }

  return Array.from(evidenceByEvent.entries())
    .map(([type, evidence]) => ({
      type,
      strength: NewsClassificationStrength.Strong as NewsClassificationStrength.Strong,
      evidence: normalizeEvidence(evidence),
    }))
    .sort((left, right) => compareText(left.type, right.type));
}

function matchRule(
  article: NewsArticle,
  rule: NewsClassificationRule,
): ReadonlyArray<NewsClassificationEvidence> {
  if (rule.field === NewsClassificationField.TopicIds) {
    return (article.topicIds ?? [])
      .filter((topicId) => rule.matches.includes(topicId))
      .map((topicId) => ({ ruleId: rule.id, field: rule.field, matchedValue: topicId }));
  }

  const value = rule.field === NewsClassificationField.Title ? article.title : article.excerpt;

  if (!value) {
    return [];
  }

  return rule.matches
    .filter((match) => containsExactTokenOrPhrase(value, match))
    .map((match) => ({ ruleId: rule.id, field: rule.field, matchedValue: match }));
}

function matchArticleText(
  article: NewsArticle,
  alias: string,
): ReadonlyArray<NewsClassificationEvidence> {
  const matches: NewsClassificationEvidence[] = [];

  for (const [field, value] of [
    [NewsClassificationField.Title, article.title],
    [NewsClassificationField.Excerpt, article.excerpt],
  ] as const) {
    if (value && containsExactTokenOrPhrase(value, alias)) {
      matches.push({ field, matchedValue: alias });
    }
  }

  return matches;
}

function normalizeAssets(
  assets: ReadonlyArray<NewsAssetVocabularyEntry>,
): ReadonlyArray<NewsAssetVocabularyEntry> {
  const knownAssetIds = new Set<AssetId>();

  return [...assets]
    .map((asset) => {
      const assetId = normalizeRequiredText(asset.assetId, 'News classifier asset ID');

      if (knownAssetIds.has(assetId)) {
        throw new NewsClassificationError(`Duplicate News classifier asset ID "${assetId}".`);
      }

      knownAssetIds.add(assetId);
      return {
        assetId,
        symbols: normalizeMatches(asset.symbols ?? [], `Asset "${assetId}" symbols`),
        aliases: normalizeMatches(asset.aliases ?? [], `Asset "${assetId}" aliases`),
      };
    })
    .sort((left, right) => compareText(left.assetId, right.assetId));
}

function normalizeRules(
  rules: ReadonlyArray<NewsClassificationRule>,
): ReadonlyArray<NewsClassificationRule> {
  const knownRuleIds = new Set<string>();

  return [...rules]
    .map((rule) => {
      const id = normalizeRequiredText(rule.id, 'News classification rule ID');

      if (knownRuleIds.has(id)) {
        throw new NewsClassificationError(`Duplicate News classification rule ID "${id}".`);
      }

      knownRuleIds.add(id);
      const matches = normalizeMatches(rule.matches, `News classification rule "${id}" matches`);

      if (matches.length === 0) {
        throw new NewsClassificationError(`News classification rule "${id}" requires a match.`);
      }

      return { ...rule, id, matches };
    })
    .sort((left, right) => compareText(left.id, right.id));
}

function normalizeMatches(values: ReadonlyArray<string>, label: string): ReadonlyArray<string> {
  return Array.from(new Set(values.map((value) => normalizeRequiredText(value, label)))).sort(
    compareText,
  );
}

function addEvidence<TKey>(
  evidenceByKey: Map<TKey, ReadonlyArray<NewsClassificationEvidence>>,
  key: TKey,
  evidence: NewsClassificationEvidence,
): void {
  evidenceByKey.set(key, [...(evidenceByKey.get(key) ?? []), evidence]);
}

function normalizeEvidence(
  evidence: ReadonlyArray<NewsClassificationEvidence>,
): ReadonlyArray<NewsClassificationEvidence> {
  const identities = new Set<string>();

  return [...evidence]
    .sort((left, right) =>
      compareTuple(
        [left.field, left.ruleId ?? '', left.matchedValue],
        [right.field, right.ruleId ?? '', right.matchedValue],
      ),
    )
    .filter((item) => {
      const identity = JSON.stringify([item.field, item.ruleId ?? '', item.matchedValue]);

      if (identities.has(identity)) {
        return false;
      }

      identities.add(identity);
      return true;
    });
}

function containsExactTokenOrPhrase(value: string, match: string): boolean {
  const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const expression = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapedMatch}(?=$|[^\\p{L}\\p{N}_])`, 'iu');

  return expression.test(value);
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');

  if (!normalized) {
    throw new NewsClassificationError(`${label} is required.`);
  }

  return normalized;
}

function compareTuple(left: ReadonlyArray<string>, right: ReadonlyArray<string>): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = compareText(left[index] ?? '', right[index] ?? '');

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
