import { NewsMarketIntelligenceError } from './errors.js';
import type { NewsEventGroup } from './event-group.js';
import {
  NewsImpactDirection,
  NewsImpactTargetKind,
  type NewsImpact,
  type NewsImpactTarget,
} from './impact.js';
import {
  NewsMarketIntelligenceEvidenceKind,
  type NewsMarketIntelligenceEvidence,
  type NewsMarketIntelligenceView,
} from './market-intelligence.js';

/** Provider-neutral boundary for deterministic news relevance aggregation. */
export interface NewsMarketIntelligenceViewAggregator {
  aggregate(
    input: NewsMarketIntelligenceAggregationInput,
  ): ReadonlyArray<NewsMarketIntelligenceView>;
}

export interface NewsMarketIntelligenceAggregationInput {
  readonly impacts?: ReadonlyArray<NewsImpact>;
  readonly eventGroups?: ReadonlyArray<NewsEventGroup>;
}

/**
 * Stateless target-based aggregation of existing impacts and event groups.
 * It never invents targets, rewrites impact semantics, or derives a forecast.
 */
export class NewsMarketIntelligenceAggregator implements NewsMarketIntelligenceViewAggregator {
  aggregate(
    input: NewsMarketIntelligenceAggregationInput,
  ): ReadonlyArray<NewsMarketIntelligenceView> {
    const eventGroups = normalizeGroups(input.eventGroups ?? []);
    const impacts = normalizeImpacts([
      ...(input.impacts ?? []),
      ...eventGroups.flatMap((group) => group.impacts),
    ]);
    const builders = new Map<string, ViewBuilder>();

    for (const impact of impacts) {
      builderFor(builders, impact.target).addImpact(impact);
    }

    for (const eventGroup of eventGroups) {
      if (eventGroup.target) {
        builderFor(builders, eventGroup.target).addEventGroup(eventGroup);
      }
    }

    return Array.from(builders.values())
      .map((builder) => builder.build())
      .sort((left, right) => compareTuple(targetOrder(left.target), targetOrder(right.target)));
  }
}

class ViewBuilder {
  private readonly impactsByIdentity = new Map<string, NewsImpact>();
  private readonly groupsById = new Map<string, NewsEventGroup>();

  constructor(private readonly target: NewsImpactTarget) {}

  addImpact(impact: NewsImpact): void {
    this.impactsByIdentity.set(impactIdentity(impact), impact);
  }

  addEventGroup(group: NewsEventGroup): void {
    const existing = this.groupsById.get(group.id);

    if (existing && JSON.stringify(existing) !== JSON.stringify(group)) {
      throw new NewsMarketIntelligenceError(
        `Conflicting NewsEventGroup records for "${group.id}".`,
      );
    }

    this.groupsById.set(group.id, group);
  }

  build(): NewsMarketIntelligenceView {
    const impacts = Array.from(this.impactsByIdentity.values()).sort(compareImpacts);
    const groups = Array.from(this.groupsById.values()).sort((left, right) =>
      compareText(left.id, right.id),
    );
    const articleIds = uniqueSorted([
      ...impacts.map((impact) => impact.articleId),
      ...groups.flatMap((group) => group.articleIds),
    ]);
    const sourceIds = uniqueSorted(groups.flatMap((group) => group.sourceIds));
    const timestamps = groups.flatMap((group) => [group.firstPublishedAt, group.lastPublishedAt]);

    return {
      target: this.target,
      articleIds,
      eventGroupIds: groups.map((group) => group.id),
      impacts,
      sourceIds,
      sourceCount: sourceIds.length,
      ...(impacts.length === 0 ? {} : { direction: aggregateDirection(impacts) }),
      ...(timestamps.length === 0
        ? {}
        : {
            firstPublishedAt: timestamps.reduce((first, timestamp) =>
              compareText(timestamp, first) < 0 ? timestamp : first,
            ),
            lastPublishedAt: timestamps.reduce((last, timestamp) =>
              compareText(timestamp, last) > 0 ? timestamp : last,
            ),
          }),
      evidence: normalizeEvidence(impacts, groups),
    };
  }
}

function normalizeGroups(groups: ReadonlyArray<NewsEventGroup>): ReadonlyArray<NewsEventGroup> {
  const byId = new Map<string, NewsEventGroup>();

  for (const group of groups) {
    const existing = byId.get(group.id);

    if (existing && JSON.stringify(existing) !== JSON.stringify(group)) {
      throw new NewsMarketIntelligenceError(
        `Conflicting NewsEventGroup records for "${group.id}".`,
      );
    }

    byId.set(group.id, group);
  }

  return Array.from(byId.values()).sort((left, right) => compareText(left.id, right.id));
}

function normalizeImpacts(impacts: ReadonlyArray<NewsImpact>): ReadonlyArray<NewsImpact> {
  const byIdentity = new Map<string, NewsImpact>();

  for (const impact of impacts) {
    byIdentity.set(impactIdentity(impact), impact);
  }

  return Array.from(byIdentity.values()).sort(compareImpacts);
}

function builderFor(builders: Map<string, ViewBuilder>, target: NewsImpactTarget): ViewBuilder {
  const identity = targetIdentity(target);
  const existing = builders.get(identity);

  if (existing) {
    return existing;
  }

  const builder = new ViewBuilder(target);
  builders.set(identity, builder);
  return builder;
}

function aggregateDirection(impacts: ReadonlyArray<NewsImpact>): NewsImpactDirection {
  const directions = new Set(impacts.map((impact) => impact.direction));
  const hasPositive = directions.has(NewsImpactDirection.Positive);
  const hasNegative = directions.has(NewsImpactDirection.Negative);

  if (hasPositive && hasNegative) {
    return NewsImpactDirection.Mixed;
  }

  if (directions.size === 1 && hasPositive) {
    return NewsImpactDirection.Positive;
  }

  if (directions.size === 1 && hasNegative) {
    return NewsImpactDirection.Negative;
  }

  if (
    directions.size > 0 &&
    Array.from(directions).every(
      (direction) =>
        direction === NewsImpactDirection.Neutral || direction === NewsImpactDirection.Unknown,
    )
  ) {
    return directions.has(NewsImpactDirection.Neutral)
      ? NewsImpactDirection.Neutral
      : NewsImpactDirection.Unknown;
  }

  return NewsImpactDirection.Unknown;
}

function normalizeEvidence(
  impacts: ReadonlyArray<NewsImpact>,
  groups: ReadonlyArray<NewsEventGroup>,
): ReadonlyArray<NewsMarketIntelligenceEvidence> {
  const evidence = [
    ...impacts.map((impact): NewsMarketIntelligenceEvidence => ({
      kind: NewsMarketIntelligenceEvidenceKind.Impact,
      articleIds: [impact.articleId],
      sourceIds: [],
      impactType: impact.type,
      direction: impact.direction,
      strength: impact.strength,
    })),
    ...groups.map((group): NewsMarketIntelligenceEvidence => ({
      kind: NewsMarketIntelligenceEvidenceKind.EventGroup,
      articleIds: uniqueSorted(group.articleIds),
      sourceIds: uniqueSorted(group.sourceIds),
      eventGroupId: group.id,
    })),
  ];
  const byIdentity = new Map<string, NewsMarketIntelligenceEvidence>();

  for (const item of evidence) {
    byIdentity.set(evidenceIdentity(item), item);
  }

  return Array.from(byIdentity.values()).sort((left, right) =>
    compareTuple(evidenceOrder(left), evidenceOrder(right)),
  );
}

function impactIdentity(impact: NewsImpact): string {
  return [
    impact.articleId,
    impact.type,
    impact.direction,
    impact.strength,
    targetIdentity(impact.target),
  ].join('\u0000');
}

function targetIdentity(target: NewsImpactTarget): string {
  switch (target.kind) {
    case NewsImpactTargetKind.Asset:
      return `asset:${target.assetId}`;
    case NewsImpactTargetKind.Market:
      return `market:${target.marketId}`;
    case NewsImpactTargetKind.Topic:
      return `topic:${target.topicId}`;
  }
}

function targetOrder(target: NewsImpactTarget): ReadonlyArray<string> {
  switch (target.kind) {
    case NewsImpactTargetKind.Asset:
      return [target.kind, target.assetId];
    case NewsImpactTargetKind.Market:
      return [target.kind, target.marketId];
    case NewsImpactTargetKind.Topic:
      return [target.kind, target.topicId];
  }
}

function compareImpacts(left: NewsImpact, right: NewsImpact): number {
  return compareTuple(
    [left.articleId, left.type, left.direction, left.strength, targetIdentity(left.target)],
    [right.articleId, right.type, right.direction, right.strength, targetIdentity(right.target)],
  );
}

function evidenceIdentity(evidence: NewsMarketIntelligenceEvidence): string {
  return [
    evidence.kind,
    evidence.eventGroupId ?? '',
    evidence.articleIds.join(','),
    evidence.sourceIds.join(','),
    evidence.impactType ?? '',
    evidence.direction ?? '',
    evidence.strength ?? '',
  ].join('\u0000');
}

function evidenceOrder(evidence: NewsMarketIntelligenceEvidence): ReadonlyArray<string> {
  return [
    evidence.kind,
    evidence.eventGroupId ?? '',
    evidence.articleIds.join(','),
    evidence.impactType ?? '',
    evidence.direction ?? '',
    evidence.strength ?? '',
  ];
}

function uniqueSorted(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Array.from(new Set(values)).sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTuple(left: ReadonlyArray<string>, right: ReadonlyArray<string>): number {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareText(left[index] ?? '', right[index] ?? '');

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}
