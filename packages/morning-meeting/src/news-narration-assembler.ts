import type { MorningMeetingEvidenceReference } from './contracts.js';
import { MorningMeetingReportError } from './errors.js';
import type { MorningMeetingNewsBrief, MorningMeetingNewsBriefItem } from './news-brief.js';
import type {
  MorningMeetingNewsNarrationInput,
  MorningMeetingNewsNarrationInputItem,
} from './news-narration.js';

/** Stateless normalization from selected briefing facts to a future narrator input. */
export class MorningMeetingNewsNarrationInputAssembler {
  assemble(brief: MorningMeetingNewsBrief): MorningMeetingNewsNarrationInput {
    const items = brief.items.map((item) => this.assembleItem(item));
    const identities = new Set<string>();

    for (const item of items) {
      if (identities.has(item.briefItemId)) {
        throw new MorningMeetingReportError(
          `News narration input contains duplicate briefing item "${item.briefItemId}".`,
        );
      }
      identities.add(item.briefItemId);
    }

    return {
      items: items.sort(compareItems),
    };
  }

  private assembleItem(item: MorningMeetingNewsBriefItem): MorningMeetingNewsNarrationInputItem {
    assertNonEmpty(item.id, 'News narration briefing item ID');
    assertNonEmpty(item.targetKind, 'News narration target kind');
    assertNonEmpty(item.targetId, 'News narration target ID');

    return {
      briefItemId: item.id,
      targetKind: item.targetKind,
      targetId: item.targetId,
      ...(item.priority === undefined ? {} : { priority: item.priority }),
      ...(item.direction === undefined ? {} : { direction: item.direction }),
      impactTypes: uniqueSorted(item.impactTypes),
      articleIds: uniqueSorted(item.articleIds),
      eventGroupIds: uniqueSorted(item.eventGroupIds),
      sourceIds: uniqueSorted(item.sourceIds),
      sourceRecordIds: uniqueSorted(item.sourceRecordIds),
      ...(item.firstPublishedAt === undefined ? {} : { firstPublishedAt: item.firstPublishedAt }),
      ...(item.lastPublishedAt === undefined ? {} : { lastPublishedAt: item.lastPublishedAt }),
      evidence: uniqueReferences(item.evidence.references),
    };
  }
}

function uniqueReferences(
  references: ReadonlyArray<MorningMeetingEvidenceReference>,
): ReadonlyArray<MorningMeetingEvidenceReference> {
  const values = new Map<string, MorningMeetingEvidenceReference>();
  for (const reference of references) {
    values.set(JSON.stringify(reference), reference);
  }
  return Array.from(values.entries())
    .sort(([left], [right]) => compareText(left, right))
    .map(([, reference]) => reference);
}

function compareItems(
  left: MorningMeetingNewsNarrationInputItem,
  right: MorningMeetingNewsNarrationInputItem,
): number {
  return (
    compareText(priorityRank(right.priority), priorityRank(left.priority)) ||
    compareText(right.lastPublishedAt ?? '', left.lastPublishedAt ?? '') ||
    compareTuple(
      [left.targetKind, left.targetId, left.eventGroupIds.join(','), left.briefItemId],
      [right.targetKind, right.targetId, right.eventGroupIds.join(','), right.briefItemId],
    )
  );
}

function priorityRank(priority: MorningMeetingNewsNarrationInputItem['priority']): string {
  switch (priority) {
    case 'critical':
      return '3';
    case 'high':
      return '2';
    case 'normal':
      return '1';
    default:
      return '0';
  }
}

function uniqueSorted<T extends string>(values: ReadonlyArray<T>): ReadonlyArray<T> {
  return Array.from(new Set(values)).sort(compareText);
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) {
    throw new MorningMeetingReportError(`${label} is required.`);
  }
}

function compareTuple(left: ReadonlyArray<string>, right: ReadonlyArray<string>): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareText(left[index] ?? '', right[index] ?? '');
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
