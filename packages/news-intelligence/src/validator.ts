import type { NewsClassification, NewsClassificationEvidence } from './classification.js';
import { NewsContextError } from './errors.js';
import {
  assembleNewsContextMetadata,
  newsClassificationIdentity,
  normalizeNewsQuery,
} from './context-assembly.js';
import type { NewsContext } from './context.js';
import { normalizeNewsArticles } from './normalization.js';

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Validates NewsContext invariants without fetching, classifying, or mutating records. */
export class NewsContextValidator {
  validate(context: NewsContext): void {
    this.assertIsoTimestamp(context.assembledAt, 'News context assembledAt');
    this.assertEqual(context.query, normalizeNewsQuery(context.query), 'News context query');
    this.assertEqual(
      context.articles,
      normalizeNewsArticles(context.articles),
      'News context articles must be normalized and deterministically ordered',
    );

    const articleIds = new Set<string>();

    for (const article of context.articles) {
      if (articleIds.has(article.id)) {
        throw new NewsContextError(`Duplicate News context article "${article.id}".`);
      }

      articleIds.add(article.id);
    }

    this.assertClassifications(context, articleIds);
    this.assertEqual(
      context.metadata,
      assembleNewsContextMetadata(context.articles, context.classifications),
      'News context aggregate metadata does not match its records',
    );
  }

  private assertClassifications(context: NewsContext, articleIds: ReadonlySet<string>): void {
    const classificationIds = new Set<string>();
    let previousIdentity = '';

    for (const classification of context.classifications) {
      const identity = newsClassificationIdentity(classification);

      if (!articleIds.has(identity)) {
        throw new NewsContextError(
          `News context classification references unknown article "${identity}".`,
        );
      }

      if (classificationIds.has(identity)) {
        throw new NewsContextError(`Duplicate News context classification for "${identity}".`);
      }

      if (previousIdentity && previousIdentity > identity) {
        throw new NewsContextError(
          'News context classifications are not deterministically ordered.',
        );
      }

      classificationIds.add(identity);
      previousIdentity = identity;
      this.assertClassificationEvidence(classification);
    }

    if (context.classifications.length !== context.articles.length) {
      throw new NewsContextError('News context requires exactly one classification per article.');
    }
  }

  private assertClassificationEvidence(classification: NewsClassification): void {
    this.assertSortedUnique(
      classification.assets,
      (relevance) => relevance.assetId,
      'News context asset relevance',
    );
    this.assertSortedUnique(
      classification.markets,
      (relevance) => relevance.marketId,
      'News context market relevance',
    );
    this.assertSortedUnique(
      classification.categories,
      (category) => category.category,
      'News context category classification',
    );
    this.assertSortedUnique(
      classification.events,
      (event) => event.type,
      'News context event classification',
    );

    for (const evidence of [
      ...classification.assets.map((relevance) => relevance.evidence),
      ...classification.markets.map((relevance) => relevance.evidence),
      ...classification.categories.map((category) => category.evidence),
      ...classification.events.map((event) => event.evidence),
    ]) {
      this.assertDeterministicEvidence(evidence);
    }
  }

  private assertDeterministicEvidence(evidence: ReadonlyArray<NewsClassificationEvidence>): void {
    const identities = new Set<string>();
    let previousIdentity = '';

    for (const item of evidence) {
      this.assertEvidence(item);
      const identity = JSON.stringify([item.field, item.ruleId ?? '', item.matchedValue]);

      if (identities.has(identity)) {
        throw new NewsContextError('News context classification evidence is duplicated.');
      }

      if (previousIdentity && previousIdentity > identity) {
        throw new NewsContextError('News context classification evidence is not ordered.');
      }

      identities.add(identity);
      previousIdentity = identity;
    }
  }

  private assertSortedUnique<TValue>(
    values: ReadonlyArray<TValue>,
    identityOf: (value: TValue) => string,
    label: string,
  ): void {
    const identities = new Set<string>();
    let previousIdentity = '';

    for (const value of values) {
      const identity = identityOf(value);

      if (identities.has(identity)) {
        throw new NewsContextError(`${label} is duplicated.`);
      }

      if (previousIdentity && previousIdentity > identity) {
        throw new NewsContextError(`${label} is not ordered.`);
      }

      identities.add(identity);
      previousIdentity = identity;
    }
  }

  private assertEvidence(evidence: NewsClassificationEvidence): void {
    if (!evidence.matchedValue.trim()) {
      throw new NewsContextError('News context classification evidence requires a matched value.');
    }

    if (evidence.ruleId !== undefined && !evidence.ruleId.trim()) {
      throw new NewsContextError('News context classification evidence rule ID cannot be empty.');
    }
  }

  private assertIsoTimestamp(value: string, label: string): void {
    if (!isoTimestampPattern.test(value) || Number.isNaN(Date.parse(value))) {
      throw new NewsContextError(`${label} must be a valid ISO timestamp.`);
    }
  }

  private assertEqual(actual: unknown, expected: unknown, label: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new NewsContextError(`${label}.`);
    }
  }
}
