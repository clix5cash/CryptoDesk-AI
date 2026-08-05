import type { MarketSnapshot } from '@cryptodesk-ai/market-intelligence';
import {
  MorningMeetingEvidenceKind,
  MorningMeetingSectionKind,
  type MorningMeetingEvidenceReference,
  type MorningMeetingMarketView,
  type MorningMeetingSection,
} from './contracts.js';
import { MorningMeetingReportError } from './errors.js';

const evidenceKindOrder: Readonly<Record<MorningMeetingEvidenceKind, number>> = {
  [MorningMeetingEvidenceKind.MarketSnapshot]: 0,
  [MorningMeetingEvidenceKind.IndicatorSnapshot]: 1,
  [MorningMeetingEvidenceKind.MarketSignal]: 2,
  [MorningMeetingEvidenceKind.NewsMarketIntelligence]: 3,
};

const sectionKindOrder: Readonly<Record<MorningMeetingSectionKind, number>> = {
  [MorningMeetingSectionKind.MarketOverview]: 0,
  [MorningMeetingSectionKind.Trend]: 1,
  [MorningMeetingSectionKind.Momentum]: 2,
  [MorningMeetingSectionKind.Volatility]: 3,
  [MorningMeetingSectionKind.Volume]: 4,
  [MorningMeetingSectionKind.Signals]: 5,
  [MorningMeetingSectionKind.News]: 6,
  [MorningMeetingSectionKind.Risk]: 7,
};

/** Normalizes provider snapshots into one deterministic series per logical observation. */
export function normalizeMarketSnapshots(
  snapshots: ReadonlyArray<MarketSnapshot>,
): ReadonlyArray<MarketSnapshot> {
  const snapshotsByIdentity = new Map<string, MarketSnapshot>();

  for (const snapshot of snapshots) {
    const key = snapshotIdentity(snapshot);
    const existing = snapshotsByIdentity.get(key);

    if (existing && !areEquivalentSnapshots(existing, snapshot)) {
      throw new MorningMeetingReportError(
        `Conflicting market snapshots were supplied for "${key}".`,
      );
    }

    snapshotsByIdentity.set(key, existing ?? snapshot);
  }

  return Array.from(snapshotsByIdentity.values()).sort(compareSnapshots);
}

/** Deduplicates and sorts evidence by source record ID when available, then logical identity. */
export function normalizeEvidence(
  evidence: ReadonlyArray<MorningMeetingEvidenceReference>,
): ReadonlyArray<MorningMeetingEvidenceReference> {
  const identities = new Set<string>();

  return [...evidence].sort(compareEvidence).filter((reference) => {
    const identity = evidenceIdentity(reference);

    if (identities.has(identity)) {
      return false;
    }

    identities.add(identity);
    return true;
  });
}

/** Orders market views independently of provider response or map insertion order. */
export function normalizeMarketViews(
  marketViews: ReadonlyArray<MorningMeetingMarketView>,
): ReadonlyArray<MorningMeetingMarketView> {
  return [...marketViews]
    .map((marketView) => ({
      ...marketView,
      indicators: [...marketView.indicators].sort(compareIndicators),
      signals: [...marketView.signals].sort(compareSignals),
      evidence: normalizeEvidence(marketView.evidence),
    }))
    .sort(compareMarketViews);
}

/** Orders sections by analytical category and then their market identity. */
export function normalizeSections(
  sections: ReadonlyArray<MorningMeetingSection>,
): ReadonlyArray<MorningMeetingSection> {
  return sections
    .map((section) => ({
      ...section,
      marketIds: [...new Set(section.marketIds)].sort(compareText),
      evidence: normalizeEvidence(section.evidence),
    }))
    .sort(compareSections);
}

export function marketViewIdentity(marketView: MorningMeetingMarketView): string {
  return JSON.stringify([marketView.assetId, marketView.marketId, marketView.timeframe]);
}

export function evidenceIdentity(reference: MorningMeetingEvidenceReference): string {
  if (reference.sourceRecordId) {
    return `source:${reference.sourceRecordId}`;
  }

  return JSON.stringify([
    reference.kind,
    reference.assetId,
    reference.marketId,
    reference.observedAt,
    reference.indicator ?? '',
    reference.signalId ?? '',
    reference.newsTargetKind ?? '',
    reference.newsTargetId ?? '',
    reference.newsDirection ?? '',
    reference.newsArticleIds?.join(',') ?? '',
    reference.newsEventGroupIds?.join(',') ?? '',
    reference.newsSourceIds?.join(',') ?? '',
    reference.newsSourceRecordIds?.join(',') ?? '',
  ]);
}

export function sectionKindRank(kind: MorningMeetingSectionKind): number {
  return sectionKindOrder[kind];
}

function snapshotIdentity(snapshot: MarketSnapshot): string {
  return JSON.stringify([
    snapshot.baseAssetId,
    snapshot.marketId,
    snapshot.quoteAssetId,
    snapshot.timeframe,
    snapshot.capturedAt,
  ]);
}

function areEquivalentSnapshots(left: MarketSnapshot, right: MarketSnapshot): boolean {
  return (
    left.marketId === right.marketId &&
    left.baseAssetId === right.baseAssetId &&
    left.quoteAssetId === right.quoteAssetId &&
    left.timeframe === right.timeframe &&
    left.capturedAt === right.capturedAt &&
    left.lastPrice === right.lastPrice &&
    left.high === right.high &&
    left.low === right.low &&
    left.volume === right.volume &&
    left.priceChangePercent === right.priceChangePercent &&
    left.liquidity === right.liquidity
  );
}

function compareSnapshots(left: MarketSnapshot, right: MarketSnapshot): number {
  return compareTuple(
    [left.baseAssetId, left.marketId, left.timeframe, left.capturedAt, left.quoteAssetId],
    [right.baseAssetId, right.marketId, right.timeframe, right.capturedAt, right.quoteAssetId],
  );
}

function compareMarketViews(
  left: MorningMeetingMarketView,
  right: MorningMeetingMarketView,
): number {
  return compareTuple(
    [left.assetId, left.marketId, left.timeframe],
    [right.assetId, right.marketId, right.timeframe],
  );
}

function compareEvidence(
  left: MorningMeetingEvidenceReference,
  right: MorningMeetingEvidenceReference,
): number {
  const kindDifference = evidenceKindOrder[left.kind] - evidenceKindOrder[right.kind];

  return (
    kindDifference ||
    compareTuple(
      [
        left.assetId,
        left.marketId,
        left.observedAt,
        left.indicator ?? '',
        left.signalId ?? '',
        left.newsTargetKind ?? '',
        left.newsTargetId ?? '',
        left.newsDirection ?? '',
        left.newsArticleIds?.join(',') ?? '',
        left.newsEventGroupIds?.join(',') ?? '',
        left.newsSourceIds?.join(',') ?? '',
        left.newsSourceRecordIds?.join(',') ?? '',
        left.sourceRecordId ?? '',
      ],
      [
        right.assetId,
        right.marketId,
        right.observedAt,
        right.indicator ?? '',
        right.signalId ?? '',
        right.newsTargetKind ?? '',
        right.newsTargetId ?? '',
        right.newsDirection ?? '',
        right.newsArticleIds?.join(',') ?? '',
        right.newsEventGroupIds?.join(',') ?? '',
        right.newsSourceIds?.join(',') ?? '',
        right.newsSourceRecordIds?.join(',') ?? '',
        right.sourceRecordId ?? '',
      ],
    )
  );
}

function compareSections(left: MorningMeetingSection, right: MorningMeetingSection): number {
  const kindDifference = sectionKindRank(left.kind) - sectionKindRank(right.kind);

  return (
    kindDifference ||
    compareTuple([left.marketIds.join(','), left.id], [right.marketIds.join(','), right.id])
  );
}

function compareIndicators(
  left: MorningMeetingMarketView['indicators'][number],
  right: MorningMeetingMarketView['indicators'][number],
): number {
  return compareTuple(
    [left.indicator, left.observedAt, left.marketId, left.assetId],
    [right.indicator, right.observedAt, right.marketId, right.assetId],
  );
}

function compareSignals(
  left: MorningMeetingMarketView['signals'][number],
  right: MorningMeetingMarketView['signals'][number],
): number {
  return compareTuple(
    [left.detectedAt, left.id, left.marketId ?? '', left.assetId],
    [right.detectedAt, right.id, right.marketId ?? '', right.assetId],
  );
}

function compareTuple(left: ReadonlyArray<string>, right: ReadonlyArray<string>): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = compareText(left[index] ?? '', right[index] ?? '');

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
