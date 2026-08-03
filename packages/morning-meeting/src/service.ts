import type {
  IndicatorEngine,
  IsoTimestamp,
  MarketId,
  MarketSnapshot,
  MarketSnapshotProvider,
  SignalEngine,
} from '@cryptodesk-ai/market-intelligence';
import {
  MorningMeetingEvidenceKind,
  MorningMeetingSectionKind,
  type MorningMeetingEvidenceReference,
  type MorningMeetingId,
  type MorningMeetingMarketView,
  type MorningMeetingReport,
  type MorningMeetingRequest,
  type MorningMeetingSection,
  type MorningMeetingService,
} from './contracts.js';

/** Explicit source of report identifiers for application composition. */
export interface MorningMeetingIdGenerator {
  generate(): MorningMeetingId;
}

/** Explicit clock boundary for report timestamps. */
export interface MorningMeetingClock {
  now(): IsoTimestamp;
}

/** Dependencies required to assemble a Morning Meeting report. */
export interface MorningMeetingServiceDependencies {
  readonly snapshotProvider: MarketSnapshotProvider;
  readonly indicatorEngine: IndicatorEngine;
  readonly signalEngine: SignalEngine;
  readonly idGenerator: MorningMeetingIdGenerator;
  readonly clock: MorningMeetingClock;
}

/**
 * Provider-neutral orchestration of deterministic Market Intelligence into a
 * structured Morning Meeting report. It intentionally performs no analysis or
 * narrative generation.
 */
export class DefaultMorningMeetingService implements MorningMeetingService {
  constructor(private readonly dependencies: MorningMeetingServiceDependencies) {}

  async generate(request: MorningMeetingRequest): Promise<MorningMeetingReport> {
    const generatedAt = this.dependencies.clock.now();
    const snapshots = await this.dependencies.snapshotProvider.getSnapshots({
      assetIds: request.assetIds,
      marketIds: request.marketIds,
      timeframe: request.timeframe,
      asOf: request.asOf,
    });
    const marketViews = this.groupSnapshotsByMarket(snapshots).map((marketSnapshots) =>
      this.assembleMarketView(marketSnapshots),
    );

    return {
      id: this.dependencies.idGenerator.generate(),
      generatedAt,
      asOf: request.asOf ?? generatedAt,
      timeframe: request.timeframe,
      marketViews,
      sections: marketViews.map((marketView) => this.assembleSection(marketView)),
    };
  }

  private assembleMarketView(snapshots: ReadonlyArray<MarketSnapshot>): MorningMeetingMarketView {
    const latestSnapshot = snapshots.at(-1);

    if (!latestSnapshot) {
      throw new Error('A Morning Meeting market view requires at least one market snapshot.');
    }

    const indicators = this.dependencies.indicatorEngine
      .list()
      .map((indicator) => indicator.calculate(snapshots));
    const signals = this.dependencies.signalEngine.generate(indicators);

    return {
      assetId: latestSnapshot.baseAssetId,
      marketId: latestSnapshot.marketId,
      timeframe: latestSnapshot.timeframe,
      latestSnapshot,
      indicators,
      signals,
      bias: undefined,
      riskLevel: undefined,
      evidence: this.createEvidence(snapshots, indicators, signals, latestSnapshot.marketId),
    };
  }

  private assembleSection(marketView: MorningMeetingMarketView): MorningMeetingSection {
    return {
      id: `market-overview:${marketView.marketId}`,
      kind: MorningMeetingSectionKind.MarketOverview,
      marketIds: [marketView.marketId],
      evidence: marketView.evidence,
    };
  }

  private groupSnapshotsByMarket(
    snapshots: ReadonlyArray<MarketSnapshot>,
  ): ReadonlyArray<ReadonlyArray<MarketSnapshot>> {
    const snapshotsByMarket = new Map<MarketId, MarketSnapshot[]>();

    for (const snapshot of snapshots) {
      const marketSnapshots = snapshotsByMarket.get(snapshot.marketId) ?? [];
      marketSnapshots.push(snapshot);
      snapshotsByMarket.set(snapshot.marketId, marketSnapshots);
    }

    return Array.from(snapshotsByMarket.values());
  }

  private createEvidence(
    snapshots: ReadonlyArray<MarketSnapshot>,
    indicators: MorningMeetingMarketView['indicators'],
    signals: MorningMeetingMarketView['signals'],
    marketId: MarketId,
  ): ReadonlyArray<MorningMeetingEvidenceReference> {
    return [
      ...snapshots.map((snapshot) => ({
        kind: MorningMeetingEvidenceKind.MarketSnapshot,
        assetId: snapshot.baseAssetId,
        marketId: snapshot.marketId,
        observedAt: snapshot.capturedAt,
      })),
      ...indicators.map((indicator) => ({
        kind: MorningMeetingEvidenceKind.IndicatorSnapshot,
        assetId: indicator.assetId,
        marketId: indicator.marketId,
        observedAt: indicator.observedAt,
        indicator: indicator.indicator,
      })),
      ...signals.map((signal) => ({
        kind: MorningMeetingEvidenceKind.MarketSignal,
        assetId: signal.assetId,
        marketId: signal.marketId ?? marketId,
        observedAt: signal.detectedAt,
        signalId: signal.id,
      })),
    ];
  }
}
