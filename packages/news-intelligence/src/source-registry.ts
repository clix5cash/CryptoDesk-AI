import { NewsSourceRegistryError } from './errors.js';
import type { NewsSource, NewsSourceId } from './models.js';

/**
 * Explicit, instance-scoped registry of provider-neutral news sources. It has
 * no global state and does not know how any source is retrieved.
 */
export class NewsSourceRegistry {
  private readonly sourcesById = new Map<NewsSourceId, NewsSource>();

  constructor(sources: ReadonlyArray<NewsSource> = []) {
    for (const source of sources) {
      this.register(source);
    }
  }

  register(source: NewsSource): void {
    const id = source.id.trim();

    if (!id) {
      throw new NewsSourceRegistryError('News source ID is required.');
    }

    if (this.sourcesById.has(id)) {
      throw new NewsSourceRegistryError(`News source "${id}" is already registered.`);
    }

    this.sourcesById.set(id, { ...source, id });
  }

  resolve(sourceId: NewsSourceId): NewsSource {
    const source = this.sourcesById.get(sourceId);

    if (!source) {
      throw new NewsSourceRegistryError(`News source "${sourceId}" is not registered.`);
    }

    return source;
  }

  list(): ReadonlyArray<NewsSource> {
    return Array.from(this.sourcesById.values()).sort((left, right) =>
      compareText(left.id, right.id),
    );
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
