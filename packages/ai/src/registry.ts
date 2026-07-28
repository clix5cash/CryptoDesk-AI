import type { AIProvider, AIProviderId, ProviderFactoryRequest } from './providers.js';

/**
 * A provider-neutral adapter that knows how to create one registered provider type.
 * Implementations belong in integration packages, not in the AI core package.
 */
export interface RegisteredProviderImplementation {
  readonly provider: AIProvider;
  create(request: ProviderFactoryRequest): Promise<AIProvider>;
}

/** In-memory registry of provider-neutral implementation adapters. */
export class ProviderRegistry {
  private readonly implementations = new Map<AIProviderId, RegisteredProviderImplementation>();

  register(implementation: RegisteredProviderImplementation): void {
    this.implementations.set(implementation.provider.id, implementation);
  }

  unregister(providerId: AIProviderId): boolean {
    return this.implementations.delete(providerId);
  }

  get(providerId: AIProviderId): RegisteredProviderImplementation | undefined {
    return this.implementations.get(providerId);
  }

  list(): ReadonlyArray<RegisteredProviderImplementation> {
    return Array.from(this.implementations.values());
  }
}
