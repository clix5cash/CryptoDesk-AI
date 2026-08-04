import {
  MarketSignalType,
  SignalDirection,
  SignalStrength,
  type IndicatorSnapshot,
  type MarketSignal,
  type MarketSnapshot,
} from '@cryptodesk-ai/market-intelligence';
import {
  MorningMeetingBias,
  MorningMeetingEvidenceKind,
  MorningMeetingRiskLevel,
  type MorningMeetingEvidenceReference,
} from './contracts.js';
import { evidenceIdentity, normalizeEvidence } from './normalization.js';

export interface MorningMeetingAnalysisInput {
  readonly latestSnapshot: MarketSnapshot;
  readonly indicators: ReadonlyArray<IndicatorSnapshot>;
  readonly signals: ReadonlyArray<MarketSignal>;
}

export interface MorningMeetingAnalysis {
  readonly bias: MorningMeetingBias;
  readonly riskLevel: MorningMeetingRiskLevel;
  readonly evidence: ReadonlyArray<MorningMeetingEvidenceReference>;
}

/** Explicit, provider-neutral thresholds for deterministic meeting analysis. */
export interface MorningMeetingAnalyzerConfig {
  readonly minimumAlignedDirectionalEvidence?: number;
  readonly moderateAtrExpansionRatio?: number;
  readonly highAtrExpansionRatio?: number;
  readonly elevatedRelativeVolume?: number;
  readonly extremeRelativeVolume?: number;
}

const defaultConfig: Required<MorningMeetingAnalyzerConfig> = {
  minimumAlignedDirectionalEvidence: 2,
  moderateAtrExpansionRatio: 1.2,
  highAtrExpansionRatio: 1.5,
  elevatedRelativeVolume: 1.5,
  extremeRelativeVolume: 2,
};

/**
 * Deterministically classifies the supplied market intelligence without
 * fetching data, generating narration, or making execution recommendations.
 */
export class MorningMeetingAnalyzer {
  private readonly config: Required<MorningMeetingAnalyzerConfig>;

  constructor(config: MorningMeetingAnalyzerConfig = {}) {
    this.config = { ...defaultConfig, ...config };
    this.validateConfig();
  }

  analyze(input: MorningMeetingAnalysisInput): MorningMeetingAnalysis {
    const directionalEvidence = this.collectDirectionalEvidence(input);
    const bias = this.deriveBias(directionalEvidence);
    const risk = this.deriveRisk(input);

    return {
      bias,
      riskLevel: risk.level,
      evidence: uniqueEvidence([...directionalEvidence, ...risk.evidence]),
    };
  }

  private deriveBias(evidence: ReadonlyArray<DirectionalEvidence>): MorningMeetingBias {
    const deduplicatedEvidence = uniqueDirectionalEvidence(evidence);
    const bullishCount = deduplicatedEvidence.filter(
      (item) => item.direction === SignalDirection.Bullish && item.countsForBias,
    ).length;
    const bearishCount = deduplicatedEvidence.filter(
      (item) => item.direction === SignalDirection.Bearish && item.countsForBias,
    ).length;

    if (bullishCount >= this.config.minimumAlignedDirectionalEvidence && bearishCount === 0) {
      return MorningMeetingBias.Bullish;
    }

    if (bearishCount >= this.config.minimumAlignedDirectionalEvidence && bullishCount === 0) {
      return MorningMeetingBias.Bearish;
    }

    return MorningMeetingBias.Neutral;
  }

  private collectDirectionalEvidence(
    input: MorningMeetingAnalysisInput,
  ): ReadonlyArray<DirectionalEvidence> {
    const signalEvidence = input.signals.flatMap((signal) => {
      const direction = toDirectionalDirection(signal.direction);

      if (!direction) {
        return [];
      }

      return [
        {
          direction,
          countsForBias: true,
          reference: createSignalReference(signal, input.latestSnapshot),
        },
      ];
    });
    const priceEvidence = input.indicators.flatMap((indicator) => {
      if (indicator.indicator !== 'ema' && indicator.indicator !== 'vwap') {
        return [];
      }

      const value = indicator.values.value;

      if (value === undefined || input.latestSnapshot.lastPrice === value) {
        return [];
      }

      const direction: DirectionalEvidence['direction'] =
        input.latestSnapshot.lastPrice > value ? SignalDirection.Bullish : SignalDirection.Bearish;

      return [
        {
          direction,
          countsForBias: true,
          reference: createIndicatorReference(indicator),
        },
        {
          direction,
          countsForBias: false,
          reference: createSnapshotReference(input.latestSnapshot),
        },
      ];
    });

    return [...signalEvidence, ...priceEvidence];
  }

  private deriveRisk(input: MorningMeetingAnalysisInput): RiskAssessment {
    const atr = input.indicators.find((indicator) => indicator.indicator === 'atr');
    const volume = input.indicators.find((indicator) => indicator.indicator === 'volume');
    const atrExpansionRatio = calculateRatio(atr?.values.value, atr?.values.previousValue);
    const relativeVolume = volume?.values.relative;
    const signals = uniqueSignals(input.signals, input.latestSnapshot);
    const breakoutSignals = signals.filter(isAtrBreakout);
    const directionalSignals = signals.filter(
      (signal) =>
        signal.direction === SignalDirection.Bullish ||
        signal.direction === SignalDirection.Bearish,
    );
    const hasStrongBreakout = breakoutSignals.some(
      (signal) => signal.strength === SignalStrength.Strong,
    );
    const hasStrongConflict =
      directionalSignals.some(
        (signal) =>
          signal.direction === SignalDirection.Bullish && signal.strength === SignalStrength.Strong,
      ) &&
      directionalSignals.some(
        (signal) =>
          signal.direction === SignalDirection.Bearish && signal.strength === SignalStrength.Strong,
      );
    const hasConflictingDirections =
      directionalSignals.some((signal) => signal.direction === SignalDirection.Bullish) &&
      directionalSignals.some((signal) => signal.direction === SignalDirection.Bearish);
    const evidence = uniqueEvidence([
      ...(atrExpansionRatio === undefined || !atr ? [] : [createIndicatorReference(atr)]),
      ...(relativeVolume === undefined || !volume ? [] : [createIndicatorReference(volume)]),
      ...breakoutSignals.map((signal) => createSignalReference(signal, input.latestSnapshot)),
      ...(hasConflictingDirections
        ? directionalSignals.map((signal) => createSignalReference(signal, input.latestSnapshot))
        : []),
    ]);

    if (
      (atrExpansionRatio !== undefined && atrExpansionRatio >= this.config.highAtrExpansionRatio) ||
      (relativeVolume !== undefined && relativeVolume >= this.config.extremeRelativeVolume) ||
      hasStrongBreakout ||
      hasStrongConflict
    ) {
      return { level: MorningMeetingRiskLevel.High, evidence };
    }

    if (
      atrExpansionRatio === undefined &&
      relativeVolume === undefined &&
      breakoutSignals.length === 0
    ) {
      return { level: MorningMeetingRiskLevel.Moderate, evidence };
    }

    if (
      (atrExpansionRatio !== undefined &&
        atrExpansionRatio >= this.config.moderateAtrExpansionRatio) ||
      (relativeVolume !== undefined && relativeVolume >= this.config.elevatedRelativeVolume) ||
      breakoutSignals.length > 0 ||
      hasConflictingDirections
    ) {
      return { level: MorningMeetingRiskLevel.Moderate, evidence };
    }

    return { level: MorningMeetingRiskLevel.Low, evidence };
  }

  private validateConfig(): void {
    if (!Number.isInteger(this.config.minimumAlignedDirectionalEvidence)) {
      throw new Error('Minimum aligned directional evidence must be an integer.');
    }

    if (this.config.minimumAlignedDirectionalEvidence < 1) {
      throw new Error('Minimum aligned directional evidence must be positive.');
    }

    const ratios = [
      this.config.moderateAtrExpansionRatio,
      this.config.highAtrExpansionRatio,
      this.config.elevatedRelativeVolume,
      this.config.extremeRelativeVolume,
    ];

    if (ratios.some((ratio) => !Number.isFinite(ratio) || ratio <= 0)) {
      throw new Error('Morning Meeting analysis ratios must be positive finite numbers.');
    }

    if (
      this.config.highAtrExpansionRatio < this.config.moderateAtrExpansionRatio ||
      this.config.extremeRelativeVolume < this.config.elevatedRelativeVolume
    ) {
      throw new Error('High-risk thresholds cannot be lower than moderate-risk thresholds.');
    }
  }
}

interface DirectionalEvidence {
  readonly direction: SignalDirection.Bullish | SignalDirection.Bearish;
  readonly countsForBias: boolean;
  readonly reference: MorningMeetingEvidenceReference;
}

interface RiskAssessment {
  readonly level: MorningMeetingRiskLevel;
  readonly evidence: ReadonlyArray<MorningMeetingEvidenceReference>;
}

function calculateRatio(
  value: number | undefined,
  previousValue: number | undefined,
): number | undefined {
  if (value === undefined || previousValue === undefined || previousValue <= 0) {
    return undefined;
  }

  return value / previousValue;
}

function isAtrBreakout(signal: MarketSignal): boolean {
  return (
    signal.type === MarketSignalType.BullishAtrBreakout ||
    signal.type === MarketSignalType.BearishAtrBreakout
  );
}

function toDirectionalDirection(
  direction: SignalDirection,
): SignalDirection.Bullish | SignalDirection.Bearish | undefined {
  if (direction === SignalDirection.Bullish || direction === SignalDirection.Bearish) {
    return direction;
  }

  return undefined;
}

function createSnapshotReference(snapshot: MarketSnapshot): MorningMeetingEvidenceReference {
  return {
    kind: MorningMeetingEvidenceKind.MarketSnapshot,
    assetId: snapshot.baseAssetId,
    marketId: snapshot.marketId,
    observedAt: snapshot.capturedAt,
  };
}

function createIndicatorReference(indicator: IndicatorSnapshot): MorningMeetingEvidenceReference {
  return {
    kind: MorningMeetingEvidenceKind.IndicatorSnapshot,
    assetId: indicator.assetId,
    marketId: indicator.marketId,
    observedAt: indicator.observedAt,
    indicator: indicator.indicator,
  };
}

function createSignalReference(
  signal: MarketSignal,
  latestSnapshot: MarketSnapshot,
): MorningMeetingEvidenceReference {
  return {
    kind: MorningMeetingEvidenceKind.MarketSignal,
    assetId: signal.assetId,
    marketId: signal.marketId ?? latestSnapshot.marketId,
    observedAt: signal.detectedAt,
    signalId: signal.id,
    sourceRecordId: signal.id,
  };
}

function uniqueEvidence(
  evidence: ReadonlyArray<MorningMeetingEvidenceReference | DirectionalEvidence>,
): ReadonlyArray<MorningMeetingEvidenceReference> {
  const references = evidence.map((item) => ('reference' in item ? item.reference : item));
  return normalizeEvidence(references);
}

function uniqueDirectionalEvidence(
  evidence: ReadonlyArray<DirectionalEvidence>,
): ReadonlyArray<DirectionalEvidence> {
  const identities = new Set<string>();

  return [...evidence]
    .sort((left, right) => {
      const leftIdentity = evidenceIdentity(left.reference);
      const rightIdentity = evidenceIdentity(right.reference);

      return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
    })
    .filter((item) => {
      const identity = evidenceIdentity(item.reference);

      if (identities.has(identity)) {
        return false;
      }

      identities.add(identity);
      return true;
    });
}

function uniqueSignals(
  signals: ReadonlyArray<MarketSignal>,
  latestSnapshot: MarketSnapshot,
): ReadonlyArray<MarketSignal> {
  const identities = new Set<string>();

  return [...signals]
    .sort((left, right) => {
      const leftIdentity = evidenceIdentity(createSignalReference(left, latestSnapshot));
      const rightIdentity = evidenceIdentity(createSignalReference(right, latestSnapshot));

      if (leftIdentity !== rightIdentity) {
        return leftIdentity < rightIdentity ? -1 : 1;
      }

      return signalDeterministicKey(left) < signalDeterministicKey(right)
        ? -1
        : signalDeterministicKey(left) > signalDeterministicKey(right)
          ? 1
          : 0;
    })
    .filter((signal) => {
      const identity = evidenceIdentity(createSignalReference(signal, latestSnapshot));

      if (identities.has(identity)) {
        return false;
      }

      identities.add(identity);
      return true;
    });
}

function signalDeterministicKey(signal: MarketSignal): string {
  return JSON.stringify([
    signal.type,
    signal.direction,
    signal.strength,
    signal.assetId,
    signal.marketId ?? '',
    signal.timeframe ?? '',
    signal.detectedAt,
  ]);
}
