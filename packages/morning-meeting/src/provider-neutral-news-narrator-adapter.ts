import { MorningMeetingNarratorProviderError } from './errors.js';
import type {
  MorningMeetingNewsNarrationCompletionClient,
  MorningMeetingNewsNarrationCompletionRequest,
  MorningMeetingNewsNarrationCompletionResponse,
  MorningMeetingNewsNarrationCompletionResponseItem,
} from './news-narrator-completion.js';
import {
  NarratorCapability,
  type MorningMeetingNewsNarration,
  type MorningMeetingNewsNarrationInput,
  type MorningMeetingNewsNarrationInputItem,
  type MorningMeetingNewsNarratorAdapter,
  type NarratorModelId,
  type NarratorProviderId,
} from './news-narration.js';

/** Explicit composition for a future SDK-backed adapter, without importing an SDK here. */
export interface ProviderNeutralMorningMeetingNewsNarratorAdapterConfiguration {
  readonly providerId: NarratorProviderId;
  readonly completionClient: MorningMeetingNewsNarrationCompletionClient;
  readonly modelIds?: ReadonlyArray<NarratorModelId>;
}

/**
 * Provider-neutral adapter from canonical narration facts to an injected
 * completion client. Provider output is untrusted and can only supply text.
 */
export class ProviderNeutralMorningMeetingNewsNarratorAdapter implements MorningMeetingNewsNarratorAdapter {
  readonly capabilities = [NarratorCapability.NewsNarration] as const;
  readonly providerId: NarratorProviderId;
  readonly modelIds?: ReadonlyArray<NarratorModelId>;

  constructor(
    private readonly configuration: ProviderNeutralMorningMeetingNewsNarratorAdapterConfiguration,
  ) {
    if (!configuration.providerId.trim()) {
      throw new MorningMeetingNarratorProviderError('Narrator provider ID is required.');
    }
    this.providerId = configuration.providerId;
    this.modelIds = configuration.modelIds;
  }

  async narrate(input: MorningMeetingNewsNarrationInput): Promise<MorningMeetingNewsNarration> {
    if (input.items.length === 0) {
      return { items: [] };
    }

    const request = assembleRequest(input);
    let response: MorningMeetingNewsNarrationCompletionResponse;
    try {
      response = await this.configuration.completionClient.complete(request);
    } catch {
      throw new MorningMeetingNarratorProviderError(
        `Narrator provider "${this.providerId}" completion failed.`,
      );
    }

    return mapResponse(input, response, this.providerId);
  }
}

/** Builds a detached canonical request without prompts, model configuration, or hidden state. */
export function assembleRequest(
  input: MorningMeetingNewsNarrationInput,
): MorningMeetingNewsNarrationCompletionRequest {
  return {
    items: input.items.map(cloneInputItem),
  };
}

function mapResponse(
  input: MorningMeetingNewsNarrationInput,
  response: MorningMeetingNewsNarrationCompletionResponse,
  providerId: NarratorProviderId,
): MorningMeetingNewsNarration {
  if (!response || !Array.isArray(response.items)) {
    throw new MorningMeetingNarratorProviderError(
      `Narrator provider "${providerId}" returned a malformed completion response.`,
    );
  }

  const canonicalItems = new Map(input.items.map((item) => [item.briefItemId, item]));
  const outputIds = new Set<string>();
  const byBriefItemId = new Map<string, MorningMeetingNewsNarration['items'][number]>();
  for (const responseItem of response.items) {
    assertResponseItem(responseItem, providerId);
    if (outputIds.has(responseItem.briefItemId)) {
      throw new MorningMeetingNarratorProviderError(
        `Narrator provider "${providerId}" returned duplicate item "${responseItem.briefItemId}".`,
      );
    }
    outputIds.add(responseItem.briefItemId);

    const canonicalItem = canonicalItems.get(responseItem.briefItemId);
    if (canonicalItem === undefined) {
      throw new MorningMeetingNarratorProviderError(
        `Narrator provider "${providerId}" returned unknown item "${responseItem.briefItemId}".`,
      );
    }
    assertCanonicalClaims(responseItem, canonicalItem, providerId);

    byBriefItemId.set(responseItem.briefItemId, {
      briefItemId: canonicalItem.briefItemId,
      targetKind: canonicalItem.targetKind,
      targetId: canonicalItem.targetId,
      text: responseItem.text,
      evidence: canonicalItem.evidence,
    });
  }

  return {
    items: input.items.flatMap((item) => {
      const narration = byBriefItemId.get(item.briefItemId);
      return narration === undefined ? [] : [narration];
    }),
  };
}

function assertResponseItem(
  item: MorningMeetingNewsNarrationCompletionResponseItem,
  providerId: NarratorProviderId,
): void {
  if (
    !item ||
    typeof item !== 'object' ||
    !isNonEmptyString(item.briefItemId) ||
    !isNonEmptyString(item.text)
  ) {
    throw new MorningMeetingNarratorProviderError(
      `Narrator provider "${providerId}" returned an invalid completion item.`,
    );
  }
}

function assertCanonicalClaims(
  responseItem: MorningMeetingNewsNarrationCompletionResponseItem,
  canonicalItem: MorningMeetingNewsNarrationInputItem,
  providerId: NarratorProviderId,
): void {
  if (
    (responseItem.targetKind !== undefined &&
      responseItem.targetKind !== canonicalItem.targetKind) ||
    (responseItem.targetId !== undefined && responseItem.targetId !== canonicalItem.targetId)
  ) {
    throw new MorningMeetingNarratorProviderError(
      `Narrator provider "${providerId}" attempted to change target identity.`,
    );
  }
  if (
    responseItem.evidence !== undefined &&
    JSON.stringify(responseItem.evidence) !== JSON.stringify(canonicalItem.evidence)
  ) {
    throw new MorningMeetingNarratorProviderError(
      `Narrator provider "${providerId}" attempted to change evidence provenance.`,
    );
  }
}

function cloneInputItem(
  item: MorningMeetingNewsNarrationInputItem,
): MorningMeetingNewsNarrationInputItem {
  return {
    briefItemId: item.briefItemId,
    targetKind: item.targetKind,
    targetId: item.targetId,
    ...(item.priority === undefined ? {} : { priority: item.priority }),
    ...(item.direction === undefined ? {} : { direction: item.direction }),
    impactTypes: [...item.impactTypes],
    articleIds: [...item.articleIds],
    eventGroupIds: [...item.eventGroupIds],
    sourceIds: [...item.sourceIds],
    sourceRecordIds: [...item.sourceRecordIds],
    ...(item.firstPublishedAt === undefined ? {} : { firstPublishedAt: item.firstPublishedAt }),
    ...(item.lastPublishedAt === undefined ? {} : { lastPublishedAt: item.lastPublishedAt }),
    evidence: item.evidence.map((reference) => ({
      ...reference,
      ...(reference.newsImpactTypes === undefined
        ? {}
        : { newsImpactTypes: [...reference.newsImpactTypes] }),
      ...(reference.newsArticleIds === undefined
        ? {}
        : { newsArticleIds: [...reference.newsArticleIds] }),
      ...(reference.newsEventGroupIds === undefined
        ? {}
        : { newsEventGroupIds: [...reference.newsEventGroupIds] }),
      ...(reference.newsSourceIds === undefined
        ? {}
        : { newsSourceIds: [...reference.newsSourceIds] }),
      ...(reference.newsSourceRecordIds === undefined
        ? {}
        : { newsSourceRecordIds: [...reference.newsSourceRecordIds] }),
    })),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
