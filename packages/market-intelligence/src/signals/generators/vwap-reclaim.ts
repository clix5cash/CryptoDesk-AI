import type { IndicatorSnapshot } from '../../snapshot.js';
import { MarketSignalType, SignalDirection, SignalStrength } from '../../signals.js';
import type { MarketSignal } from '../../signals.js';
import type { SignalGenerator } from '../types.js';

/** Emits VWAP reclaim signals when price crosses VWAP with relative-volume confirmation. */
export class VwapReclaimSignalGenerator implements SignalGenerator {
  readonly id: string;

  constructor(private readonly minimumRelativeVolume = 1) {
    if (!Number.isFinite(minimumRelativeVolume) || minimumRelativeVolume < 0) {
      throw new Error('Minimum relative volume must be a non-negative finite number.');
    }

    this.id = `vwap-reclaim:${minimumRelativeVolume}`;
  }

  generate(indicators: ReadonlyArray<IndicatorSnapshot>): ReadonlyArray<MarketSignal> {
    const vwap = indicators.find((indicator) => indicator.indicator === 'vwap');
    const volume = indicators.find((indicator) => indicator.indicator === 'volume');

    if (!vwap || !volume || !this.isComparable(vwap, volume)) {
      return [];
    }

    const currentPrice = vwap.values.currentPrice;
    const previousPrice = vwap.values.previousPrice;
    const currentVwap = vwap.values.value;
    const previousVwap = vwap.values.previousValue;
    const relativeVolume = volume.values.relative;

    if (
      currentPrice === undefined ||
      previousPrice === undefined ||
      currentVwap === undefined ||
      previousVwap === undefined ||
      relativeVolume === undefined ||
      relativeVolume < this.minimumRelativeVolume
    ) {
      return [];
    }

    if (previousPrice <= previousVwap && currentPrice > currentVwap) {
      return [
        this.createSignal(
          vwap,
          relativeVolume,
          MarketSignalType.BullishVwapReclaim,
          SignalDirection.Bullish,
        ),
      ];
    }

    if (previousPrice >= previousVwap && currentPrice < currentVwap) {
      return [
        this.createSignal(
          vwap,
          relativeVolume,
          MarketSignalType.BearishVwapReclaim,
          SignalDirection.Bearish,
        ),
      ];
    }

    return [];
  }

  private isComparable(vwap: IndicatorSnapshot, volume: IndicatorSnapshot): boolean {
    return (
      vwap.marketId === volume.marketId &&
      vwap.assetId === volume.assetId &&
      vwap.timeframe === volume.timeframe &&
      vwap.observedAt === volume.observedAt
    );
  }

  private createSignal(
    indicator: IndicatorSnapshot,
    relativeVolume: number,
    type: MarketSignalType.BullishVwapReclaim | MarketSignalType.BearishVwapReclaim,
    direction: SignalDirection.Bullish | SignalDirection.Bearish,
  ): MarketSignal {
    return {
      id: `${this.id}:${indicator.marketId}:${indicator.timeframe}:${indicator.observedAt}`,
      type,
      direction,
      strength: relativeVolume >= 1.5 ? SignalStrength.Strong : SignalStrength.Moderate,
      assetId: indicator.assetId,
      marketId: indicator.marketId,
      timeframe: indicator.timeframe,
      detectedAt: indicator.observedAt,
      summary: `${direction} VWAP reclaim detected with relative volume ${relativeVolume}.`,
      evidence: [
        `current_price=${indicator.values.currentPrice}`,
        `previous_price=${indicator.values.previousPrice}`,
        `current_vwap=${indicator.values.value}`,
        `previous_vwap=${indicator.values.previousValue}`,
        `relative_volume=${relativeVolume}`,
      ],
    };
  }
}
