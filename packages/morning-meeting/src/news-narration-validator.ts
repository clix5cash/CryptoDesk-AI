import { MorningMeetingReportError } from './errors.js';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  NewsImpactType,
} from '@cryptodesk-ai/news-intelligence';
import { MorningMeetingEvidenceKind, type MorningMeetingEvidenceReference } from './contracts.js';
import { MorningMeetingNewsPriority } from './news-brief.js';
import type {
  MorningMeetingNewsNarration,
  MorningMeetingNewsNarrationInput,
  MorningMeetingNewsNarrationInputItem,
  MorningMeetingNewsNarrationItem,
} from './news-narration.js';

/** Validates that untrusted presentation output remains attached to immutable narration input. */
export class MorningMeetingNewsNarrationValidator {
  validateInput(input: MorningMeetingNewsNarrationInput): void {
    if (!input || !Array.isArray(input.items)) {
      throw new MorningMeetingReportError('News narration input must contain an items array.');
    }
    const identities = new Set<string>();
    const items = input.items as ReadonlyArray<MorningMeetingNewsNarrationInputItem>;
    for (const item of items) {
      assertNonEmpty(item.briefItemId, 'News narration briefing item ID');
      assertNonEmpty(item.targetKind, 'News narration target kind');
      assertNonEmpty(item.targetId, 'News narration target ID');
      if (!Object.values(NewsImpactTargetKind).includes(item.targetKind)) {
        throw new MorningMeetingReportError('News narration input has an invalid target kind.');
      }
      if (
        item.priority !== undefined &&
        !Object.values(MorningMeetingNewsPriority).includes(item.priority)
      ) {
        throw new MorningMeetingReportError('News narration input has an invalid priority.');
      }
      if (
        item.direction !== undefined &&
        !Object.values(NewsImpactDirection).includes(item.direction)
      ) {
        throw new MorningMeetingReportError('News narration input has an invalid direction.');
      }
      if (
        item.impactTypes.some((impactType) => !Object.values(NewsImpactType).includes(impactType))
      ) {
        throw new MorningMeetingReportError('News narration input has an invalid impact type.');
      }
      if (identities.has(item.briefItemId)) {
        throw new MorningMeetingReportError(
          `News narration input contains duplicate briefing item "${item.briefItemId}".`,
        );
      }
      identities.add(item.briefItemId);
      assertUniqueReferences(item.evidence, `narration input item "${item.briefItemId}"`);
    }
  }

  validateOutput(
    input: MorningMeetingNewsNarrationInput,
    narration: MorningMeetingNewsNarration,
  ): void {
    this.validateInput(input);
    if (!narration || !Array.isArray(narration.items)) {
      throw new MorningMeetingReportError('News narration output must contain an items array.');
    }
    const knownItems = new Map(input.items.map((item) => [item.briefItemId, item]));
    const narrationIds = new Set<string>();
    const items = narration.items as ReadonlyArray<MorningMeetingNewsNarrationItem>;

    for (const item of items) {
      this.assertOutputItem(item, knownItems, narrationIds);
    }
  }

  /**
   * Returns validated untrusted presentation output in the canonical order of
   * the immutable narration input. Narrative text itself is never interpreted.
   */
  normalizeOutput(
    input: MorningMeetingNewsNarrationInput,
    narration: MorningMeetingNewsNarration,
  ): MorningMeetingNewsNarration {
    this.validateOutput(input, narration);
    const byBriefItemId = new Map(narration.items.map((item) => [item.briefItemId, item]));

    return {
      items: input.items.flatMap((inputItem) => {
        const item = byBriefItemId.get(inputItem.briefItemId);
        return item === undefined ? [] : [item];
      }),
    };
  }

  private assertOutputItem(
    item: MorningMeetingNewsNarrationItem,
    knownItems: ReadonlyMap<string, MorningMeetingNewsNarrationInput['items'][number]>,
    narrationIds: Set<string>,
  ): void {
    if (!item || typeof item !== 'object') {
      throw new MorningMeetingReportError('News narration output contains an invalid item.');
    }
    assertNonEmpty(item.briefItemId, 'News narration item briefing ID');
    assertNonEmpty(item.text, 'News narration text');
    if (narrationIds.has(item.briefItemId)) {
      throw new MorningMeetingReportError(
        `News narration output contains duplicate item "${item.briefItemId}".`,
      );
    }
    narrationIds.add(item.briefItemId);

    const inputItem = knownItems.get(item.briefItemId);
    if (inputItem === undefined) {
      throw new MorningMeetingReportError(
        `News narration output refers to unknown briefing item "${item.briefItemId}".`,
      );
    }
    if (item.targetKind !== inputItem.targetKind || item.targetId !== inputItem.targetId) {
      throw new MorningMeetingReportError(
        `News narration output changes target provenance for "${item.briefItemId}".`,
      );
    }
    assertSameReferences(item.evidence, inputItem.evidence, item.briefItemId);
  }
}

function assertSameReferences(
  output: ReadonlyArray<MorningMeetingEvidenceReference>,
  input: ReadonlyArray<MorningMeetingEvidenceReference>,
  itemId: string,
): void {
  const outputIdentities = output.map((reference) => JSON.stringify(reference)).sort();
  const inputIdentities = input.map((reference) => JSON.stringify(reference)).sort();
  if (JSON.stringify(outputIdentities) !== JSON.stringify(inputIdentities)) {
    throw new MorningMeetingReportError(
      `News narration output changes evidence provenance for "${itemId}".`,
    );
  }
}

function assertUniqueReferences(
  references: ReadonlyArray<MorningMeetingEvidenceReference>,
  owner: string,
): void {
  const identities = new Set<string>();
  for (const reference of references) {
    if (!reference || typeof reference !== 'object') {
      throw new MorningMeetingReportError(`Evidence in ${owner} is invalid.`);
    }
    assertNonEmpty(reference.assetId, `Evidence asset ID in ${owner}`);
    assertNonEmpty(reference.marketId, `Evidence market ID in ${owner}`);
    assertNonEmpty(reference.observedAt, `Evidence observedAt in ${owner}`);
    if (Number.isNaN(Date.parse(reference.observedAt))) {
      throw new MorningMeetingReportError(
        `Evidence observedAt in ${owner} must be a valid ISO timestamp.`,
      );
    }
    if (!Object.values(MorningMeetingEvidenceKind).includes(reference.kind)) {
      throw new MorningMeetingReportError(`Evidence in ${owner} has an invalid kind.`);
    }
    const identity = JSON.stringify(reference);
    if (identities.has(identity)) {
      throw new MorningMeetingReportError(`Duplicate evidence in ${owner}.`);
    }
    identities.add(identity);
  }
}

function assertNonEmpty(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new MorningMeetingReportError(`${label} is required.`);
  }
}
