import { MorningMeetingEvidenceKind, type MorningMeetingEvidenceReference } from './contracts.js';
import type { MorningMeetingNewsBrief, MorningMeetingNewsBriefItem } from './news-brief.js';

/** Stateless, deterministic assembly of presentation-ready news briefing data. */
export class MorningMeetingNewsBriefAssembler {
  assemble(evidence: ReadonlyArray<MorningMeetingEvidenceReference>): MorningMeetingNewsBrief {
    const itemsByIdentity = new Map<string, MorningMeetingNewsBriefItem>();

    for (const reference of evidence) {
      if (reference.kind !== MorningMeetingEvidenceKind.NewsMarketIntelligence) {
        continue;
      }

      const item = itemFromReference(reference);
      const identity = itemIdentity(item);
      const existing = itemsByIdentity.get(identity);
      itemsByIdentity.set(identity, existing ? mergeItems(existing, item) : item);
    }

    return {
      items: Array.from(itemsByIdentity.values()).sort(
        (left, right) =>
          compareText(right.lastPublishedAt ?? '', left.lastPublishedAt ?? '') ||
          compareTuple(
            [left.targetKind, left.targetId, left.id],
            [right.targetKind, right.targetId, right.id],
          ),
      ),
    };
  }
}

function itemFromReference(
  reference: MorningMeetingEvidenceReference,
): MorningMeetingNewsBriefItem {
  if (!reference.newsTargetKind || !reference.newsTargetId) {
    throw new Error('News briefing evidence requires an explicit news target identity.');
  }

  const articleIds = uniqueSorted(reference.newsArticleIds ?? []);
  const eventGroupIds = uniqueSorted(reference.newsEventGroupIds ?? []);
  const sourceRecordIds = uniqueSorted(reference.newsSourceRecordIds ?? []);
  return withDeterministicId({
    id: '',
    targetKind: reference.newsTargetKind,
    targetId: reference.newsTargetId,
    ...(reference.newsDirection === undefined ? {} : { direction: reference.newsDirection }),
    impactTypes: uniqueSorted(reference.newsImpactTypes ?? []),
    articleIds,
    eventGroupIds,
    sourceIds: uniqueSorted(reference.newsSourceIds ?? []),
    sourceRecordIds,
    ...(reference.newsFirstPublishedAt === undefined
      ? {}
      : { firstPublishedAt: reference.newsFirstPublishedAt }),
    ...(reference.newsLastPublishedAt === undefined
      ? {}
      : { lastPublishedAt: reference.newsLastPublishedAt }),
    evidence: { references: [reference] },
  });
}

function mergeItems(
  left: MorningMeetingNewsBriefItem,
  right: MorningMeetingNewsBriefItem,
): MorningMeetingNewsBriefItem {
  return withDeterministicId({
    ...left,
    impactTypes: uniqueSorted([...left.impactTypes, ...right.impactTypes]),
    articleIds: uniqueSorted([...left.articleIds, ...right.articleIds]),
    eventGroupIds: uniqueSorted([...left.eventGroupIds, ...right.eventGroupIds]),
    sourceIds: uniqueSorted([...left.sourceIds, ...right.sourceIds]),
    sourceRecordIds: uniqueSorted([...left.sourceRecordIds, ...right.sourceRecordIds]),
    ...(earliest(left.firstPublishedAt, right.firstPublishedAt) === undefined
      ? {}
      : { firstPublishedAt: earliest(left.firstPublishedAt, right.firstPublishedAt) }),
    ...(latest(left.lastPublishedAt, right.lastPublishedAt) === undefined
      ? {}
      : { lastPublishedAt: latest(left.lastPublishedAt, right.lastPublishedAt) }),
    evidence: {
      references: uniqueReferences([...left.evidence.references, ...right.evidence.references]),
    },
  });
}

function withDeterministicId(
  item: Omit<MorningMeetingNewsBriefItem, 'id'> & {
    readonly id?: MorningMeetingNewsBriefItem['id'];
  },
): MorningMeetingNewsBriefItem {
  return {
    ...item,
    id: [
      'news-brief',
      encodeURIComponent(item.targetKind),
      encodeURIComponent(item.targetId),
      encodeURIComponent(item.eventGroupIds.join(',')),
      encodeURIComponent(item.sourceRecordIds.join(',')),
      encodeURIComponent(item.articleIds.join(',')),
      encodeURIComponent(item.direction ?? ''),
      encodeURIComponent(item.firstPublishedAt ?? ''),
      encodeURIComponent(item.lastPublishedAt ?? ''),
    ].join(':'),
  };
}

function itemIdentity(item: MorningMeetingNewsBriefItem): string {
  const preferredIdentity =
    item.eventGroupIds.length > 0
      ? `group:${item.eventGroupIds.join(',')}`
      : item.sourceRecordIds.length > 0
        ? `source:${item.sourceRecordIds.join(',')}`
        : item.articleIds.length > 0
          ? `article:${item.articleIds.join(',')}`
          : `logical:${item.lastPublishedAt ?? ''}`;

  return [item.targetKind, item.targetId, item.direction ?? '', preferredIdentity].join('\u0000');
}

function uniqueReferences(
  references: ReadonlyArray<MorningMeetingEvidenceReference>,
): ReadonlyArray<MorningMeetingEvidenceReference> {
  const byIdentity = new Map<string, MorningMeetingEvidenceReference>();

  for (const reference of references) {
    byIdentity.set(JSON.stringify(reference), reference);
  }

  return Array.from(byIdentity.values()).sort((left, right) =>
    compareText(JSON.stringify(left), JSON.stringify(right)),
  );
}

function earliest(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function latest(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function uniqueSorted<T extends string>(values: ReadonlyArray<T>): ReadonlyArray<T> {
  return Array.from(new Set(values)).sort(compareText);
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
