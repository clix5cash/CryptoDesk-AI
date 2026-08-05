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
import { MorningMeetingAnalyzer } from './analyzer.js';
import { MorningMeetingReportError } from './errors.js';
import {
  normalizeEvidence,
  normalizeMarketSnapshots,
  normalizeMarketViews,
  normalizeSections,
} from './normalization.js';
import { MorningMeetingReportValidator } from './validator.js';
import { MorningMeetingNewsBriefAssembler } from './news-brief-assembler.js';
import { MorningMeetingNewsBriefSelector } from './news-brief-selector.js';

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
  readonly analyzer: MorningMeetingAnalyzer;
  readonly reportValidator: MorningMeetingReportValidator;
  readonly idGenerator: MorningMeetingIdGenerator;
  readonly clock: MorningMeetingClock;
  readonly newsBriefAssembler?: MorningMeetingNewsBriefAssembler;
  readonly newsBriefSelector?: MorningMeetingNewsBriefSelector;
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
    const providerSnapshots = await this.dependencies.snapshotProvider.getSnapshots({
      assetIds: request.assetIds,
      marketIds: request.marketIds,
      timeframe: request.timeframe,
      asOf: request.asOf,
    });
    const snapshots = normalizeMarketSnapshots(providerSnapshots);
    const marketViews = normalizeMarketViews(
      this.groupSnapshotsByMarket(snapshots).map((marketSnapshots) =>
        this.assembleMarketView(marketSnapshots, request.newsMarketIntelligenceViews),
      ),
    );
    const assembledNewsBrief =
      request.newsMarketIntelligenceViews === undefined
        ? undefined
        : (this.dependencies.newsBriefAssembler ?? new MorningMeetingNewsBriefAssembler()).assemble(
            marketViews.flatMap((marketView) => marketView.evidence),
          );
    const newsBrief =
      assembledNewsBrief === undefined
        ? undefined
        : (this.dependencies.newsBriefSelector ?? new MorningMeetingNewsBriefSelector()).select(
            assembledNewsBrief,
            {
              asOf: request.asOf ?? generatedAt,
              policy: request.newsBriefSelectionPolicy,
            },
          );
    const report = {
      id: this.dependencies.idGenerator.generate(),
      generatedAt,
      asOf: request.asOf ?? generatedAt,
      timeframe: request.timeframe,
      marketViews,
      sections: normalizeSections(
        marketViews.flatMap((marketView) => this.assembleSections(marketView)),
      ),
      ...(newsBrief === undefined ? {} : { newsBrief }),
    };

    this.dependencies.reportValidator.validate(report, request);

    return report;
  }

  private assembleMarketView(
    snapshots: ReadonlyArray<MarketSnapshot>,
    newsMarketIntelligenceViews: MorningMeetingRequest['newsMarketIntelligenceViews'],
  ): MorningMeetingMarketView {
    const latestSnapshot = snapshots.at(-1);

    if (!latestSnapshot) {
      throw new Error('A Morning Meeting market view requires at least one market snapshot.');
    }

    const indicators = this.dependencies.indicatorEngine.list().map((indicator) => {
      try {
        return indicator.calculate(snapshots);
      } catch {
        throw new MorningMeetingReportError(
          `Unable to calculate indicator "${indicator.id}" for market "${latestSnapshot.marketId}".`,
        );
      }
    });
    const signals = this.dependencies.signalEngine.generate(indicators);
    const analysis = this.dependencies.analyzer.analyze({
      latestSnapshot,
      indicators,
      signals,
      newsMarketIntelligenceViews,
    });

    return {
      assetId: latestSnapshot.baseAssetId,
      marketId: latestSnapshot.marketId,
      timeframe: latestSnapshot.timeframe,
      latestSnapshot,
      indicators,
      signals,
      bias: analysis.bias,
      riskLevel: analysis.riskLevel,
      evidence: normalizeEvidence(
        [
          this.createEvidence(snapshots, indicators, signals, latestSnapshot.marketId),
          ...analysis.evidence,
        ].flat(),
      ),
    };
  }

  private assembleSections(
    marketView: MorningMeetingMarketView,
  ): ReadonlyArray<MorningMeetingSection> {
    const snapshotEvidence = marketView.evidence.filter(
      (reference) => reference.kind === MorningMeetingEvidenceKind.MarketSnapshot,
    );
    const trendEvidence = marketView.evidence.filter(
      (reference) =>
        reference.kind === MorningMeetingEvidenceKind.IndicatorSnapshot &&
        (reference.indicator === 'ema' || reference.indicator === 'vwap'),
    );
    const volatilityEvidence = marketView.evidence.filter(
      (reference) =>
        reference.kind === MorningMeetingEvidenceKind.IndicatorSnapshot &&
        reference.indicator === 'atr',
    );
    const volumeEvidence = marketView.evidence.filter(
      (reference) =>
        reference.kind === MorningMeetingEvidenceKind.IndicatorSnapshot &&
        reference.indicator === 'volume',
    );
    const signalEvidence = marketView.evidence.filter(
      (reference) => reference.kind === MorningMeetingEvidenceKind.MarketSignal,
    );
    const newsEvidence = marketView.evidence.filter(
      (reference) => reference.kind === MorningMeetingEvidenceKind.NewsMarketIntelligence,
    );
    const riskEvidence = [...volatilityEvidence, ...volumeEvidence, ...signalEvidence];

    return [
      this.createSection(MorningMeetingSectionKind.MarketOverview, marketView, snapshotEvidence),
      this.createSection(MorningMeetingSectionKind.Trend, marketView, trendEvidence),
      this.createSection(MorningMeetingSectionKind.Volatility, marketView, volatilityEvidence),
      this.createSection(MorningMeetingSectionKind.Volume, marketView, volumeEvidence),
      this.createSection(MorningMeetingSectionKind.Signals, marketView, signalEvidence),
      this.createSection(MorningMeetingSectionKind.News, marketView, newsEvidence),
      this.createSection(MorningMeetingSectionKind.Risk, marketView, riskEvidence),
    ].filter((section): section is MorningMeetingSection => section !== undefined);
  }

  private createSection(
    kind: MorningMeetingSectionKind,
    marketView: MorningMeetingMarketView,
    evidence: ReadonlyArray<MorningMeetingEvidenceReference>,
  ): MorningMeetingSection | undefined {
    if (evidence.length === 0) {
      return undefined;
    }

    return {
      id: `${kind}:${marketView.marketId}`,
      kind,
      marketIds: [marketView.marketId],
      evidence,
    };
  }

  private groupSnapshotsByMarket(
    snapshots: ReadonlyArray<MarketSnapshot>,
  ): ReadonlyArray<ReadonlyArray<MarketSnapshot>> {
    const snapshotsByMarket = new Map<string, MarketSnapshot[]>();

    for (const snapshot of snapshots) {
      const identity = JSON.stringify([
        snapshot.baseAssetId,
        snapshot.marketId,
        snapshot.timeframe,
      ]);
      const marketSnapshots = snapshotsByMarket.get(identity) ?? [];
      marketSnapshots.push(snapshot);
      snapshotsByMarket.set(identity, marketSnapshots);
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
        sourceRecordId: signal.id,
      })),
    ];
  }
}
