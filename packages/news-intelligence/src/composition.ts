import { NewsProviderCompositionError } from './errors.js';
import type { NewsArticle, NewsQuery, NewsSourceId } from './models.js';
import { normalizeNewsArticles } from './normalization.js';
import type { NewsProvider } from './providers.js';
import { NewsSourceRegistry } from './source-registry.js';

/** Explicit provider/source ownership used only at the composition boundary. */
export interface NewsProviderRegistration {
  readonly id: string;
  readonly provider: NewsProvider;
  readonly sourceIds: ReadonlyArray<NewsSourceId>;
}

/**
 * Provider-neutral multi-provider orchestration. It aggregates raw provider
 * output, then delegates normalization, provenance-aware deduplication, and
 * deterministic ordering to the News Intelligence domain.
 */
export class CompositeNewsProvider implements NewsProvider {
  private readonly registrations: ReadonlyArray<NewsProviderRegistration>;

  constructor(
    private readonly sourceRegistry: NewsSourceRegistry,
    registrations: ReadonlyArray<NewsProviderRegistration>,
  ) {
    this.registrations = normalizeRegistrations(sourceRegistry, registrations);
  }

  async getArticles(query: NewsQuery): Promise<ReadonlyArray<NewsArticle>> {
    this.assertKnownQuerySources(query);
    const registrations = this.selectRegistrations(query);

    if (registrations.length === 0) {
      throw new NewsProviderCompositionError(
        'No News provider is configured for the requested sources.',
      );
    }

    const providerQuery = { ...query, limit: undefined };
    const articles: NewsArticle[] = [];

    for (const registration of registrations) {
      let providerArticles: ReadonlyArray<NewsArticle>;

      try {
        providerArticles = await registration.provider.getArticles(providerQuery);
      } catch (error) {
        throw new NewsProviderCompositionError(
          `News provider "${registration.id}" failed: ${toErrorMessage(error)}.`,
        );
      }

      this.assertSourceOwnership(registration, providerArticles);
      articles.push(...providerArticles);
    }

    const normalized = normalizeNewsArticles(articles);
    return query.limit === undefined ? normalized : normalized.slice(0, query.limit);
  }

  private assertKnownQuerySources(query: NewsQuery): void {
    for (const sourceId of query.sourceIds ?? []) {
      this.sourceRegistry.resolve(sourceId);
    }
  }

  private selectRegistrations(query: NewsQuery): ReadonlyArray<NewsProviderRegistration> {
    return this.registrations.filter(
      (registration) =>
        !query.sourceIds ||
        registration.sourceIds.some((sourceId) => query.sourceIds?.includes(sourceId)),
    );
  }

  private assertSourceOwnership(
    registration: NewsProviderRegistration,
    articles: ReadonlyArray<NewsArticle>,
  ): void {
    for (const article of articles) {
      if (!registration.sourceIds.includes(article.sourceId)) {
        throw new NewsProviderCompositionError(
          `News provider "${registration.id}" returned unregistered source "${article.sourceId}".`,
        );
      }
    }
  }
}

function normalizeRegistrations(
  sourceRegistry: NewsSourceRegistry,
  registrations: ReadonlyArray<NewsProviderRegistration>,
): ReadonlyArray<NewsProviderRegistration> {
  const registrationIds = new Set<string>();

  return [...registrations]
    .map((registration) => {
      const id = registration.id.trim();

      if (!id) {
        throw new NewsProviderCompositionError('News provider registration ID is required.');
      }

      if (registrationIds.has(id)) {
        throw new NewsProviderCompositionError(`News provider "${id}" is already registered.`);
      }

      if (registration.sourceIds.length === 0) {
        throw new NewsProviderCompositionError(
          `News provider "${id}" requires at least one source ID.`,
        );
      }

      registrationIds.add(id);
      const sourceIds = Array.from(new Set(registration.sourceIds)).sort(compareText);

      for (const sourceId of sourceIds) {
        sourceRegistry.resolve(sourceId);
      }

      return { ...registration, id, sourceIds };
    })
    .sort((left, right) => compareText(left.id, right.id));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
