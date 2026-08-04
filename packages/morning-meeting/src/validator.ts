import {
  MorningMeetingBias,
  MorningMeetingEvidenceKind,
  MorningMeetingRiskLevel,
  type MorningMeetingEvidenceReference,
  type MorningMeetingReport,
  type MorningMeetingRequest,
} from './contracts.js';
import { MorningMeetingReportError } from './errors.js';
import { evidenceIdentity, marketViewIdentity, sectionKindRank } from './normalization.js';

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Validates report completeness and deterministic assembly invariants. */
export class MorningMeetingReportValidator {
  validate(report: MorningMeetingReport, request: MorningMeetingRequest): void {
    this.assertNonEmpty(report.id, 'Morning Meeting report ID');
    this.assertIsoTimestamp(report.generatedAt, 'Morning Meeting generatedAt');
    this.assertIsoTimestamp(report.asOf, 'Morning Meeting asOf');

    if (Date.parse(report.generatedAt) < Date.parse(report.asOf)) {
      throw new MorningMeetingReportError('Morning Meeting generatedAt cannot precede asOf.');
    }

    if (report.marketViews.length === 0) {
      throw new MorningMeetingReportError('Morning Meeting requires at least one market view.');
    }

    const marketViewIdentities = new Set<string>();

    for (const marketView of report.marketViews) {
      const identity = marketViewIdentity(marketView);

      if (marketViewIdentities.has(identity)) {
        throw new MorningMeetingReportError(`Duplicate Morning Meeting market view "${identity}".`);
      }

      marketViewIdentities.add(identity);
      this.assertMarketViewScope(marketView, request);
      this.assertMarketViewConsistency(marketView, report.asOf);
      this.assertUniqueEvidence(marketView.evidence, `market view "${identity}"`);
    }

    this.assertRequestedScopeIsRepresented(report, request);
    this.assertDeterministicMarketViewOrder(report);
    this.assertSections(report);
  }

  private assertMarketViewScope(
    marketView: MorningMeetingReport['marketViews'][number],
    request: MorningMeetingRequest,
  ): void {
    if (request.assetIds && !request.assetIds.includes(marketView.assetId)) {
      throw new MorningMeetingReportError(
        `Market view asset "${marketView.assetId}" is outside the requested scope.`,
      );
    }

    if (request.marketIds && !request.marketIds.includes(marketView.marketId)) {
      throw new MorningMeetingReportError(
        `Market view "${marketView.marketId}" is outside the requested scope.`,
      );
    }
  }

  private assertMarketViewConsistency(
    marketView: MorningMeetingReport['marketViews'][number],
    asOf: string,
  ): void {
    const snapshot = marketView.latestSnapshot;

    if (
      snapshot.baseAssetId !== marketView.assetId ||
      snapshot.marketId !== marketView.marketId ||
      snapshot.timeframe !== marketView.timeframe
    ) {
      throw new MorningMeetingReportError(
        `Market view "${marketView.marketId}" does not match its latest snapshot provenance.`,
      );
    }

    this.assertIsoTimestamp(snapshot.capturedAt, 'Market snapshot capturedAt');

    if (Date.parse(snapshot.capturedAt) > Date.parse(asOf)) {
      throw new MorningMeetingReportError(
        `Market view "${marketView.marketId}" contains a snapshot after the report asOf time.`,
      );
    }

    if (!Object.values(MorningMeetingBias).includes(marketView.bias)) {
      throw new MorningMeetingReportError(
        `Market view "${marketView.marketId}" has an invalid bias.`,
      );
    }

    if (!Object.values(MorningMeetingRiskLevel).includes(marketView.riskLevel)) {
      throw new MorningMeetingReportError(
        `Market view "${marketView.marketId}" has an invalid market risk level.`,
      );
    }

    for (const indicator of marketView.indicators) {
      if (
        indicator.assetId !== marketView.assetId ||
        indicator.marketId !== marketView.marketId ||
        indicator.timeframe !== marketView.timeframe
      ) {
        throw new MorningMeetingReportError(
          `Indicator "${indicator.indicator}" does not belong to market view "${marketView.marketId}".`,
        );
      }
    }

    for (const signal of marketView.signals) {
      if (
        signal.assetId !== marketView.assetId ||
        (signal.marketId !== undefined && signal.marketId !== marketView.marketId) ||
        (signal.timeframe !== undefined && signal.timeframe !== marketView.timeframe)
      ) {
        throw new MorningMeetingReportError(
          `Signal "${signal.id}" does not belong to market view "${marketView.marketId}".`,
        );
      }
    }

    for (const reference of marketView.evidence) {
      if (reference.assetId !== marketView.assetId || reference.marketId !== marketView.marketId) {
        throw new MorningMeetingReportError(
          `Evidence does not belong to market view "${marketView.marketId}".`,
        );
      }
    }
  }

  private assertSections(report: MorningMeetingReport): void {
    const sectionIds = new Set<string>();
    const sectionIdentities = new Set<string>();
    let previousRank = -1;
    let previousMarketKey = '';

    for (const section of report.sections) {
      this.assertNonEmpty(section.id, 'Morning Meeting section ID');

      if (sectionIds.has(section.id)) {
        throw new MorningMeetingReportError(`Duplicate Morning Meeting section "${section.id}".`);
      }

      sectionIds.add(section.id);
      const sectionIdentity = JSON.stringify([section.kind, section.marketIds]);

      if (sectionIdentities.has(sectionIdentity)) {
        throw new MorningMeetingReportError(`Duplicate Morning Meeting section "${section.id}".`);
      }

      sectionIdentities.add(sectionIdentity);
      const rank = sectionKindRank(section.kind);
      const marketKey = JSON.stringify(section.marketIds);

      if (rank < previousRank || (rank === previousRank && marketKey < previousMarketKey)) {
        throw new MorningMeetingReportError(
          'Morning Meeting sections are not deterministically ordered.',
        );
      }

      previousRank = rank;
      previousMarketKey = marketKey;

      if (new Set(section.marketIds).size !== section.marketIds.length) {
        throw new MorningMeetingReportError(
          `Section "${section.id}" contains duplicate market IDs.`,
        );
      }

      if (
        section.marketIds.some(
          (marketId, index) => index > 0 && (section.marketIds[index - 1] ?? '') > marketId,
        )
      ) {
        throw new MorningMeetingReportError(`Section "${section.id}" market IDs are not ordered.`);
      }

      for (const marketId of section.marketIds) {
        if (!report.marketViews.some((marketView) => marketView.marketId === marketId)) {
          throw new MorningMeetingReportError(
            `Section "${section.id}" references unknown market "${marketId}".`,
          );
        }
      }

      this.assertUniqueEvidence(section.evidence, `section "${section.id}"`);
    }
  }

  private assertUniqueEvidence(
    evidence: ReadonlyArray<MorningMeetingEvidenceReference>,
    owner: string,
  ): void {
    const identities = new Set<string>();

    for (const reference of evidence) {
      this.assertEvidence(reference, owner);
      const identity = evidenceIdentity(reference);

      if (identities.has(identity)) {
        throw new MorningMeetingReportError(`Duplicate evidence in ${owner}.`);
      }

      identities.add(identity);
    }
  }

  private assertEvidence(reference: MorningMeetingEvidenceReference, owner: string): void {
    this.assertNonEmpty(reference.assetId, `Evidence asset ID in ${owner}`);
    this.assertNonEmpty(reference.marketId, `Evidence market ID in ${owner}`);
    this.assertIsoTimestamp(reference.observedAt, `Evidence observedAt in ${owner}`);

    if (reference.sourceRecordId !== undefined) {
      this.assertNonEmpty(reference.sourceRecordId, `Evidence source record ID in ${owner}`);
    }

    if (!Object.values(MorningMeetingEvidenceKind).includes(reference.kind)) {
      throw new MorningMeetingReportError(`Evidence in ${owner} has an invalid kind.`);
    }

    if (reference.kind === MorningMeetingEvidenceKind.IndicatorSnapshot && !reference.indicator) {
      throw new MorningMeetingReportError(
        `Indicator evidence in ${owner} requires an indicator ID.`,
      );
    }

    if (reference.kind === MorningMeetingEvidenceKind.MarketSignal && !reference.signalId) {
      throw new MorningMeetingReportError(`Signal evidence in ${owner} requires a signal ID.`);
    }
  }

  private assertDeterministicMarketViewOrder(report: MorningMeetingReport): void {
    for (let index = 1; index < report.marketViews.length; index += 1) {
      const previous = report.marketViews[index - 1];
      const current = report.marketViews[index];

      if (!previous || !current) {
        continue;
      }

      if (marketViewIdentity(previous) > marketViewIdentity(current)) {
        throw new MorningMeetingReportError(
          'Morning Meeting market views are not deterministically ordered.',
        );
      }
    }
  }

  private assertRequestedScopeIsRepresented(
    report: MorningMeetingReport,
    request: MorningMeetingRequest,
  ): void {
    for (const assetId of request.assetIds ?? []) {
      if (!report.marketViews.some((marketView) => marketView.assetId === assetId)) {
        throw new MorningMeetingReportError(
          `No market snapshot was returned for requested asset "${assetId}".`,
        );
      }
    }

    for (const marketId of request.marketIds ?? []) {
      if (!report.marketViews.some((marketView) => marketView.marketId === marketId)) {
        throw new MorningMeetingReportError(
          `No market snapshot was returned for requested market "${marketId}".`,
        );
      }
    }
  }

  private assertNonEmpty(value: string, label: string): void {
    if (!value.trim()) {
      throw new MorningMeetingReportError(`${label} is required.`);
    }
  }

  private assertIsoTimestamp(value: string, label: string): void {
    if (!isoTimestampPattern.test(value) || Number.isNaN(Date.parse(value))) {
      throw new MorningMeetingReportError(`${label} must be a valid ISO timestamp.`);
    }
  }
}
