import type { IndicatorSnapshot } from '../../snapshot.js';
import { MarketSignalType, SignalDirection, SignalStrength } from '../../signals.js';
import type { MarketSignal } from '../../signals.js';
import type { SignalGenerator } from '../types.js';

/** Emits volume expansion or dry-up signals from a supplied Volume indicator snapshot. */
export class VolumeExpansionSignalGenerator implements SignalGenerator {
  readonly id: string;

  constructor(private readonly minimumRelativeVolume = 1.5) {
    if (!Number.isFinite(minimumRelativeVolume) || minimumRelativeVolume <= 0.5) {
      throw new Error('Minimum relative volume must be a finite number greater than 0.5.');
    }

    this.id = `volume-expansion:${minimumRelativeVolume}`;
  }

  generate(indicators: ReadonlyArray<IndicatorSnapshot>): ReadonlyArray<MarketSignal> {
    const volume = indicators.find((indicator) => indicator.indicator === 'volume');

    if (!volume) {
      return [];
    }

    const current = volume.values.current;
    const average = volume.values.average;
    const relative = volume.values.relative;

    if (current === undefined || average === undefined || relative === undefined) {
      return [];
    }

    if (relative >= this.minimumRelativeVolume) {
      return [
        this.createSignal(
          volume,
          current,
          average,
          relative,
          MarketSignalType.BullishVolumeExpansion,
          SignalDirection.Bullish,
        ),
      ];
    }

    if (relative <= 0.5) {
      return [
        this.createSignal(
          volume,
          current,
          average,
          relative,
          MarketSignalType.BearishVolumeDryUp,
          SignalDirection.Bearish,
        ),
      ];
    }

    return [];
  }

  private createSignal(
    indicator: IndicatorSnapshot,
    current: number,
    average: number,
    relative: number,
    type: MarketSignalType.BullishVolumeExpansion | MarketSignalType.BearishVolumeDryUp,
    direction: SignalDirection.Bullish | SignalDirection.Bearish,
  ): MarketSignal {
    return {
      id: `${this.id}:${indicator.marketId}:${indicator.timeframe}:${indicator.observedAt}`,
      type,
      direction,
      strength: this.getStrength(relative, direction),
      assetId: indicator.assetId,
      marketId: indicator.marketId,
      timeframe: indicator.timeframe,
      detectedAt: indicator.observedAt,
      summary:
        direction === SignalDirection.Bullish
          ? `Volume expansion detected at ${relative}x the average volume.`
          : `Volume dry-up detected at ${relative}x the average volume.`,
      confidence: this.getConfidence(relative, direction),
      evidence: [
        `current_volume=${current}`,
        `average_volume=${average}`,
        `relative_volume=${relative}`,
        `threshold=${this.minimumRelativeVolume}`,
      ],
    };
  }

  private getStrength(relative: number, direction: SignalDirection): SignalStrength {
    if (direction === SignalDirection.Bullish) {
      return relative >= this.minimumRelativeVolume * 2
        ? SignalStrength.Strong
        : SignalStrength.Moderate;
    }

    return relative <= 0.25 ? SignalStrength.Strong : SignalStrength.Moderate;
  }

  private getConfidence(relative: number, direction: SignalDirection): number {
    if (direction === SignalDirection.Bullish) {
      return Math.min(1, relative / (this.minimumRelativeVolume * 2));
    }

    return Math.min(1, 1 - relative);
  }
}
