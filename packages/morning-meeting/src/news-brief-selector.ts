import { MorningMeetingReportError } from './errors.js';
import {
  MorningMeetingNewsPriority,
  type MorningMeetingNewsBrief,
  type MorningMeetingNewsBriefItem,
  type MorningMeetingNewsPriorityRule,
  type MorningMeetingNewsSelectionPolicy,
} from './news-brief.js';
import type { IsoTimestamp } from '@cryptodesk-ai/market-intelligence';
import { NewsImpactDirection, NewsImpactType } from '@cryptodesk-ai/news-intelligence';

/** Explicit temporal input for deterministic publication-recency ordering. */
export interface MorningMeetingNewsBriefSelectionInput {
  readonly asOf: IsoTimestamp;
  readonly policy?: MorningMeetingNewsSelectionPolicy;
}

/** Stateless selector for already-assembled provider-neutral briefing items. */
export class MorningMeetingNewsBriefSelector {
  select(
    brief: MorningMeetingNewsBrief,
    input: MorningMeetingNewsBriefSelectionInput,
  ): MorningMeetingNewsBrief {
    if (input.policy === undefined) {
      return brief;
    }

    const policy = input.policy;
    validatePolicy(policy);
    const prioritized = brief.items.map((item) => ({
      ...item,
      priority: priorityFor(item, policy.rules ?? []),
    }));
    const minimumPriority = policy.minimumPriority ?? MorningMeetingNewsPriority.Low;
    const targetCounts = new Map<string, number>();
    const items: MorningMeetingNewsBriefItem[] = [];

    for (const item of deduplicateEvents(prioritized)
      .filter(
        (candidate) =>
          priorityRank(candidate.priority ?? MorningMeetingNewsPriority.Normal) >=
          priorityRank(minimumPriority),
      )
      .sort((left, right) => compareItems(left, right, input.asOf))) {
      if (policy.maxItems !== undefined && items.length >= policy.maxItems) {
        break;
      }

      const targetIdentity = `${item.targetKind}\u0000${item.targetId}`;
      const targetCount = targetCounts.get(targetIdentity) ?? 0;
      if (policy.maxItemsPerTarget !== undefined && targetCount >= policy.maxItemsPerTarget) {
        continue;
      }

      items.push(item);
      targetCounts.set(targetIdentity, targetCount + 1);
    }

    return { items };
  }
}

function priorityFor(
  item: MorningMeetingNewsBriefItem,
  rules: ReadonlyArray<MorningMeetingNewsPriorityRule>,
): MorningMeetingNewsPriority {
  return (
    rules
      .filter((rule) => matchesRule(item, rule))
      .map((rule) => rule.priority)
      .sort((left, right) => priorityRank(right) - priorityRank(left))[0] ??
    MorningMeetingNewsPriority.Normal
  );
}

function matchesRule(
  item: MorningMeetingNewsBriefItem,
  rule: MorningMeetingNewsPriorityRule,
): boolean {
  const impactMatches =
    rule.impactTypes === undefined ||
    rule.impactTypes.some((impactType) => item.impactTypes.includes(impactType));
  const directionMatches =
    rule.directions === undefined ||
    (item.direction !== undefined && rule.directions.includes(item.direction));

  return impactMatches && directionMatches;
}

function deduplicateEvents(
  items: ReadonlyArray<MorningMeetingNewsBriefItem>,
): ReadonlyArray<MorningMeetingNewsBriefItem> {
  const selectedByIdentity = new Map<string, MorningMeetingNewsBriefItem>();

  for (const item of items) {
    const identity =
      item.eventGroupIds.length > 0
        ? `event:${item.targetKind}\u0000${item.targetId}\u0000${item.eventGroupIds.join(',')}`
        : item.id;
    const existing = selectedByIdentity.get(identity);
    if (existing === undefined || compareEventRepresentatives(item, existing) < 0) {
      selectedByIdentity.set(identity, item);
    }
  }

  return Array.from(selectedByIdentity.values());
}

function compareEventRepresentatives(
  left: MorningMeetingNewsBriefItem,
  right: MorningMeetingNewsBriefItem,
): number {
  return (
    priorityRank(right.priority ?? MorningMeetingNewsPriority.Normal) -
      priorityRank(left.priority ?? MorningMeetingNewsPriority.Normal) ||
    compareText(right.lastPublishedAt ?? '', left.lastPublishedAt ?? '') ||
    compareText(left.id, right.id)
  );
}

function compareItems(
  left: MorningMeetingNewsBriefItem,
  right: MorningMeetingNewsBriefItem,
  asOf: IsoTimestamp,
): number {
  return (
    priorityRank(right.priority ?? MorningMeetingNewsPriority.Normal) -
      priorityRank(left.priority ?? MorningMeetingNewsPriority.Normal) ||
    compareText(recencyTimestamp(right, asOf), recencyTimestamp(left, asOf)) ||
    compareTuple(
      [left.targetKind, left.targetId, left.eventGroupIds.join(','), left.id],
      [right.targetKind, right.targetId, right.eventGroupIds.join(','), right.id],
    )
  );
}

function recencyTimestamp(item: MorningMeetingNewsBriefItem, asOf: IsoTimestamp): string {
  const timestamp = item.lastPublishedAt;
  return timestamp !== undefined && timestamp <= asOf ? `1:${timestamp}` : '0:';
}

function validatePolicy(policy: MorningMeetingNewsSelectionPolicy): void {
  validateNonNegativeInteger(policy.maxItems, 'maxItems');
  validateNonNegativeInteger(policy.maxItemsPerTarget, 'maxItemsPerTarget');
  if (
    policy.minimumPriority !== undefined &&
    !Object.values(MorningMeetingNewsPriority).includes(policy.minimumPriority)
  ) {
    throw new MorningMeetingReportError('News briefing minimumPriority is invalid.');
  }

  const ruleIds = new Set<string>();
  const signatures = new Set<string>();
  for (const rule of policy.rules ?? []) {
    if (rule.id.trim().length === 0 || ruleIds.has(rule.id)) {
      throw new MorningMeetingReportError(
        'News briefing priority rule IDs must be unique and non-empty.',
      );
    }
    ruleIds.add(rule.id);
    if (!Object.values(MorningMeetingNewsPriority).includes(rule.priority)) {
      throw new MorningMeetingReportError(
        `News briefing priority rule "${rule.id}" has an invalid priority.`,
      );
    }
    validateRuleValues(rule);
    const signature = [
      [...(rule.impactTypes ?? [])].sort(compareText).join(','),
      [...(rule.directions ?? [])].sort(compareText).join(','),
    ].join('\u0000');
    if (signatures.has(signature)) {
      throw new MorningMeetingReportError(
        'News briefing priority rules cannot duplicate the same selectors.',
      );
    }
    signatures.add(signature);
  }
}

function validateNonNegativeInteger(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new MorningMeetingReportError(`News briefing ${label} must be a non-negative integer.`);
  }
}

function validateRuleValues(rule: MorningMeetingNewsPriorityRule): void {
  if (rule.impactTypes?.length === 0 || rule.directions?.length === 0) {
    throw new MorningMeetingReportError(
      `News briefing priority rule "${rule.id}" has an empty selector.`,
    );
  }
  if (rule.impactTypes?.some((impactType) => !Object.values(NewsImpactType).includes(impactType))) {
    throw new MorningMeetingReportError(
      `News briefing priority rule "${rule.id}" has an invalid impact type.`,
    );
  }
  if (
    rule.directions?.some((direction) => !Object.values(NewsImpactDirection).includes(direction))
  ) {
    throw new MorningMeetingReportError(
      `News briefing priority rule "${rule.id}" has an invalid direction.`,
    );
  }
}

function priorityRank(priority: MorningMeetingNewsPriority): number {
  switch (priority) {
    case MorningMeetingNewsPriority.Critical:
      return 3;
    case MorningMeetingNewsPriority.High:
      return 2;
    case MorningMeetingNewsPriority.Normal:
      return 1;
    case MorningMeetingNewsPriority.Low:
      return 0;
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
