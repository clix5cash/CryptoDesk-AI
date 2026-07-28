import type { IsoTimestamp } from './contracts.js';
import type {
  AIProvider,
  ProviderFactory,
  ProviderFactoryRequest,
  ProviderFactoryResponse,
} from './providers.js';
import type { ProviderRegistry } from './registry.js';

export type TimestampFactory = () => IsoTimestamp;

/**
 * Provider factory backed by registered implementation adapters.
 * It deliberately contains no provider SDK dependency or provider-specific behavior.
 */
export class RegistryProviderFactory implements ProviderFactory {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly now: TimestampFactory = () => new Date().toISOString(),
  ) {}

  async create(request: ProviderFactoryRequest): Promise<ProviderFactoryResponse> {
    const implementation = this.registry.get(request.providerId);

    if (!implementation) {
      throw new Error(`No provider implementation is registered for "${request.providerId}".`);
    }

    return {
      provider: await implementation.create(request),
      createdAt: this.now(),
    };
  }

  async list(): Promise<ReadonlyArray<AIProvider>> {
    return this.registry.list().map((implementation) => implementation.provider);
  }
}
