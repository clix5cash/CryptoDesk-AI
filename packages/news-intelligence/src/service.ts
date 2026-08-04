import type { IsoTimestamp } from '@cryptodesk-ai/market-intelligence';
import type { NewsArticleClassifier } from './classifier.js';
import { assembleNewsContextMetadata, normalizeNewsQuery } from './context-assembly.js';
import type { NewsContext } from './context.js';
import { NewsContextError } from './errors.js';
import type { NewsArticle, NewsQuery } from './models.js';
import { normalizeNewsArticles } from './normalization.js';
import type { NewsProvider } from './providers.js';
import type { NewsContextValidator } from './validator.js';

/** Application-facing boundary for future News Intelligence orchestration. */
export interface NewsIntelligenceService {
  getArticles(query: NewsQuery): Promise<ReadonlyArray<NewsArticle>>;
  getContext(query: NewsQuery): Promise<NewsContext>;
}

/** Explicit clock boundary for deterministic NewsContext assembly timestamps. */
export interface NewsContextClock {
  now(): IsoTimestamp;
}

/** Explicit dependencies required only for full NewsContext assembly. */
export interface NewsContextServiceDependencies {
  readonly classifier: NewsArticleClassifier;
  readonly validator: NewsContextValidator;
  readonly clock: NewsContextClock;
}

/**
 * Thin provider-neutral orchestration that normalizes, validates, deduplicates,
 * and orders provider output without adding analysis or provider coupling.
 */
export class DefaultNewsIntelligenceService implements NewsIntelligenceService {
  constructor(
    private readonly provider: NewsProvider,
    private readonly contextDependencies?: NewsContextServiceDependencies,
  ) {}

  async getArticles(query: NewsQuery): Promise<ReadonlyArray<NewsArticle>> {
    return normalizeNewsArticles(await this.provider.getArticles(query));
  }

  async getContext(query: NewsQuery): Promise<NewsContext> {
    const dependencies = this.contextDependencies;

    if (!dependencies) {
      throw new NewsContextError(
        'News context assembly requires explicitly injected classifier, validator, and clock dependencies.',
      );
    }

    const articles = await this.getArticles(query);
    const classifications = articles
      .map((article) => dependencies.classifier.classify(article))
      .sort((left, right) => compareText(left.articleId, right.articleId));
    const context: NewsContext = {
      query: normalizeNewsQuery(query),
      assembledAt: dependencies.clock.now(),
      articles,
      classifications,
      metadata: assembleNewsContextMetadata(articles, classifications),
    };

    dependencies.validator.validate(context);

    return context;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
