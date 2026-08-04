import type { IndicatorSnapshot, MarketSnapshot } from '../snapshot.js';
import { createIndicatorSnapshot, validatePeriod, validateSnapshotSeries } from './engine.js';

/** Exponential moving average over the supplied snapshot closing prices. */
export class EmaIndicator {
  readonly family = 'ema';
  readonly id: string;

  constructor(private readonly period: number) {
    validatePeriod(period);
    this.id = `${this.family}:${period}`;
  }

  calculate(snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot {
    validateSnapshotSeries(snapshots);

    const multiplier = 2 / (this.period + 1);
    let value = snapshots[0]?.lastPrice;

    if (value === undefined) {
      throw new Error('At least one market snapshot is required.');
    }

    let previousValue = value;

    for (const snapshot of snapshots.slice(1)) {
      previousValue = value;
      value = snapshot.lastPrice * multiplier + value * (1 - multiplier);
    }

    return createIndicatorSnapshot(this.family, snapshots, {
      period: this.period,
      value,
      previousValue,
    });
  }
}
