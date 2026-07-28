import type { IndicatorSnapshot, MarketSnapshot } from '../snapshot.js';
import { createIndicatorSnapshot, validateSnapshotSeries } from './engine.js';

/** Volume-weighted average price over the supplied snapshots. */
export class VwapIndicator {
  readonly id = 'vwap';

  calculate(snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot {
    validateSnapshotSeries(snapshots);

    let totalVolume = 0;
    let totalPriceVolume = 0;

    for (const snapshot of snapshots) {
      totalVolume += snapshot.volume;
      totalPriceVolume += snapshot.lastPrice * snapshot.volume;
    }

    if (totalVolume <= 0) {
      throw new Error('VWAP requires a positive aggregate volume.');
    }

    return createIndicatorSnapshot(this.id, snapshots, {
      value: totalPriceVolume / totalVolume,
      volume: totalVolume,
    });
  }
}
