import type { IndicatorSnapshot, MarketSnapshot } from '../snapshot.js';
import { createIndicatorSnapshot, validatePeriod, validateSnapshotSeries } from './engine.js';

/** Average true range over the most recent snapshots in the supplied series. */
export class AtrIndicator {
  readonly id = 'atr';

  constructor(private readonly period: number) {
    validatePeriod(period);
  }

  calculate(snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot {
    validateSnapshotSeries(snapshots);

    const firstIndex = Math.max(0, snapshots.length - this.period);
    let totalRange = 0;
    let rangeCount = 0;

    for (let index = firstIndex; index < snapshots.length; index += 1) {
      const snapshot = snapshots[index];

      if (!snapshot) {
        continue;
      }

      const previous = snapshots[index - 1];
      const highLow = snapshot.high - snapshot.low;
      const highClose = previous ? Math.abs(snapshot.high - previous.lastPrice) : highLow;
      const lowClose = previous ? Math.abs(snapshot.low - previous.lastPrice) : highLow;

      totalRange += Math.max(highLow, highClose, lowClose);
      rangeCount += 1;
    }

    return createIndicatorSnapshot(this.id, snapshots, {
      period: this.period,
      value: totalRange / rangeCount,
    });
  }
}
