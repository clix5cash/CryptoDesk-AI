import { MorningMeetingNarratorProviderError } from './errors.js';
import {
  NarratorCapability,
  type MorningMeetingNewsNarration,
  type MorningMeetingNewsNarrationInput,
  type MorningMeetingNewsNarrator,
  type MorningMeetingNewsNarratorAdapter,
  type MorningMeetingNewsNarratorSelection,
  type NarratorProviderId,
} from './news-narration.js';

/** Instance-scoped registry for explicitly composed, provider-neutral narration adapters. */
export class MorningMeetingNewsNarratorRegistry {
  private readonly adapters = new Map<NarratorProviderId, MorningMeetingNewsNarratorAdapter>();

  register(adapter: MorningMeetingNewsNarratorAdapter): void {
    if (!adapter.providerId.trim()) {
      throw new MorningMeetingNarratorProviderError('Narrator provider ID is required.');
    }
    if (!adapter.capabilities.includes(NarratorCapability.NewsNarration)) {
      throw new MorningMeetingNarratorProviderError(
        `Narrator provider "${adapter.providerId}" does not declare news narration capability.`,
      );
    }
    if (this.adapters.has(adapter.providerId)) {
      throw new MorningMeetingNarratorProviderError(
        `Narrator provider "${adapter.providerId}" is already registered.`,
      );
    }
    this.adapters.set(adapter.providerId, adapter);
  }

  unregister(providerId: NarratorProviderId): boolean {
    return this.adapters.delete(providerId);
  }

  get(providerId: NarratorProviderId): MorningMeetingNewsNarratorAdapter | undefined {
    return this.adapters.get(providerId);
  }

  list(): ReadonlyArray<MorningMeetingNewsNarratorAdapter> {
    return Array.from(this.adapters.values()).sort((left, right) =>
      compareText(left.providerId, right.providerId),
    );
  }

  resolve(selection: MorningMeetingNewsNarratorSelection): MorningMeetingNewsNarratorAdapter {
    const adapter = this.get(selection.providerId);
    if (adapter === undefined) {
      throw new MorningMeetingNarratorProviderError(
        `Narrator provider "${selection.providerId}" is not registered.`,
      );
    }
    if (
      selection.modelId !== undefined &&
      (adapter.modelIds === undefined || !adapter.modelIds.includes(selection.modelId))
    ) {
      throw new MorningMeetingNarratorProviderError(
        `Narrator provider "${selection.providerId}" does not support model "${selection.modelId}".`,
      );
    }
    return adapter;
  }
}

/** Resolves one explicitly selected adapter while remaining usable as the existing narrator contract. */
export class RegistryMorningMeetingNewsNarrator implements MorningMeetingNewsNarrator {
  constructor(
    private readonly registry: MorningMeetingNewsNarratorRegistry,
    private readonly selection: MorningMeetingNewsNarratorSelection,
  ) {}

  async narrate(input: MorningMeetingNewsNarrationInput): Promise<MorningMeetingNewsNarration> {
    const adapter = this.registry.resolve(this.selection);
    try {
      return await adapter.narrate(input);
    } catch (error) {
      throw new MorningMeetingNarratorProviderError(
        `Narrator provider "${adapter.providerId}" failed.`,
        error,
      );
    }
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
