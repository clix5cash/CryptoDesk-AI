import type { IndicatorSnapshot } from '../../snapshot.js';
import { MarketSignalType, SignalDirection, SignalStrength } from '../../signals.js';
import type { MarketSignal } from '../../signals.js';
import type { SignalGenerator } from '../types.js';

/** Emits a signal only when supplied fast and slow EMA snapshots show a crossover. */
export class EmaCrossSignalGenerator implements SignalGenerator {
  readonly id: string;

  constructor(
    private readonly fastPeriod: number,
    private readonly slowPeriod: number,
  ) {
    if (!Number.isInteger(fastPeriod) || !Number.isInteger(slowPeriod)) {
      throw new Error('EMA periods must be integers.');
    }

    if (fastPeriod < 1 || slowPeriod < 1 || fastPeriod >= slowPeriod) {
      throw new Error('The fast EMA period must be positive and smaller than the slow EMA period.');
    }

    this.id = `ema-cross:${fastPeriod}:${slowPeriod}`;
  }

  generate(indicators: ReadonlyArray<IndicatorSnapshot>): ReadonlyArray<MarketSignal> {
    const fast = this.findEma(indicators, this.fastPeriod);
    const slow = this.findEma(indicators, this.slowPeriod);

    if (!fast || !slow || !this.isComparable(fast, slow)) {
      return [];
    }

    const fastValue = fast.values.value;
    const slowValue = slow.values.value;
    const previousFastValue = fast.values.previousValue;
    const previousSlowValue = slow.values.previousValue;

    if (
      fastValue === undefined ||
      slowValue === undefined ||
      previousFastValue === undefined ||
      previousSlowValue === undefined
    ) {
      return [];
    }

    if (previousFastValue <= previousSlowValue && fastValue > slowValue) {
      return [this.createSignal(fast, MarketSignalType.BullishCross, SignalDirection.Bullish)];
    }

    if (previousFastValue >= previousSlowValue && fastValue < slowValue) {
      return [this.createSignal(fast, MarketSignalType.BearishCross, SignalDirection.Bearish)];
    }

    return [];
  }

  private findEma(
    indicators: ReadonlyArray<IndicatorSnapshot>,
    period: number,
  ): IndicatorSnapshot | undefined {
    return indicators.find(
      (indicator) => indicator.indicator === 'ema' && indicator.values.period === period,
    );
  }

  private isComparable(fast: IndicatorSnapshot, slow: IndicatorSnapshot): boolean {
    return (
      fast.marketId === slow.marketId &&
      fast.assetId === slow.assetId &&
      fast.timeframe === slow.timeframe &&
      fast.observedAt === slow.observedAt
    );
  }

  private createSignal(
    indicator: IndicatorSnapshot,
    type: MarketSignalType.BullishCross | MarketSignalType.BearishCross,
    direction: SignalDirection.Bullish | SignalDirection.Bearish,
  ): MarketSignal {
    return {
      id: `${this.id}:${indicator.marketId}:${indicator.timeframe}:${indicator.observedAt}`,
      type,
      direction,
      strength: SignalStrength.Moderate,
      assetId: indicator.assetId,
      marketId: indicator.marketId,
      timeframe: indicator.timeframe,
      detectedAt: indicator.observedAt,
      summary: `EMA ${this.fastPeriod}/${this.slowPeriod} ${direction} cross detected.`,
      evidence: [
        `fast_period=${this.fastPeriod}`,
        `slow_period=${this.slowPeriod}`,
        `fast_value=${indicator.values.value}`,
      ],
    };
  }
}
