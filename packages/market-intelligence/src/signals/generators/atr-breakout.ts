import type { IndicatorSnapshot } from '../../snapshot.js';
import { MarketSignalType, SignalDirection, SignalStrength } from '../../signals.js';
import type { MarketSignal } from '../../signals.js';
import type { SignalGenerator } from '../types.js';

/** Emits ATR breakouts when price movement exceeds ATR during volatility expansion. */
export class AtrBreakoutSignalGenerator implements SignalGenerator {
  readonly id: string;

  constructor(private readonly atrMultiplier = 1) {
    if (!Number.isFinite(atrMultiplier) || atrMultiplier <= 0) {
      throw new Error('ATR multiplier must be a positive finite number.');
    }

    this.id = `atr-breakout:${atrMultiplier}`;
  }

  generate(indicators: ReadonlyArray<IndicatorSnapshot>): ReadonlyArray<MarketSignal> {
    const atr = indicators.find((indicator) => indicator.indicator === 'atr');

    if (!atr) {
      return [];
    }

    const currentPrice = atr.values.currentPrice;
    const previousPrice = atr.values.previousPrice;
    const currentAtr = atr.values.value;
    const previousAtr = atr.values.previousValue;

    if (
      currentPrice === undefined ||
      previousPrice === undefined ||
      currentAtr === undefined ||
      previousAtr === undefined ||
      previousAtr <= 0
    ) {
      return [];
    }

    const atrRatio = currentAtr / previousAtr;
    const breakoutDistance = currentPrice - previousPrice;
    const threshold = currentAtr * this.atrMultiplier;

    if (atrRatio <= 1) {
      return [];
    }

    if (breakoutDistance > threshold) {
      return [
        this.createSignal(
          atr,
          currentAtr,
          atrRatio,
          breakoutDistance,
          MarketSignalType.BullishAtrBreakout,
          SignalDirection.Bullish,
        ),
      ];
    }

    if (breakoutDistance < -threshold) {
      return [
        this.createSignal(
          atr,
          currentAtr,
          atrRatio,
          breakoutDistance,
          MarketSignalType.BearishAtrBreakout,
          SignalDirection.Bearish,
        ),
      ];
    }

    return [];
  }

  private createSignal(
    indicator: IndicatorSnapshot,
    atr: number,
    atrRatio: number,
    breakoutDistance: number,
    type: MarketSignalType.BullishAtrBreakout | MarketSignalType.BearishAtrBreakout,
    direction: SignalDirection.Bullish | SignalDirection.Bearish,
  ): MarketSignal {
    return {
      id: `${this.id}:${indicator.marketId}:${indicator.timeframe}:${indicator.observedAt}`,
      type,
      direction,
      strength: this.getStrength(atrRatio),
      assetId: indicator.assetId,
      marketId: indicator.marketId,
      timeframe: indicator.timeframe,
      detectedAt: indicator.observedAt,
      summary: `${direction} ATR breakout detected with ATR expansion ratio ${atrRatio}.`,
      evidence: [
        `current_price=${indicator.values.currentPrice}`,
        `previous_price=${indicator.values.previousPrice}`,
        `atr=${atr}`,
        `atr_ratio=${atrRatio}`,
        `breakout_distance=${breakoutDistance}`,
      ],
    };
  }

  private getStrength(atrRatio: number): SignalStrength {
    if (atrRatio >= 1.5) {
      return SignalStrength.Strong;
    }

    if (atrRatio >= 1.2) {
      return SignalStrength.Moderate;
    }

    return SignalStrength.Weak;
  }
}
