import type { IndicatorSnapshot, MarketSnapshot } from '../snapshot.js';
import { createIndicatorSnapshot, validatePeriod, validateSnapshotSeries } from './engine.js';

/** Volume baseline and relative-volume calculation over supplied snapshots. */
export class VolumeIndicator {
  readonly id = 'volume';

  constructor(private readonly period: number) {
    validatePeriod(period);
  }

  calculate(snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot {
    validateSnapshotSeries(snapshots);

    const recentSnapshots = snapshots.slice(-this.period);
    const latest = recentSnapshots.at(-1);

    if (!latest) {
      throw new Error('At least one market snapshot is required.');
    }

    const average =
      recentSnapshots.reduce((total, snapshot) => total + snapshot.volume, 0) /
      recentSnapshots.length;

    return createIndicatorSnapshot(this.id, snapshots, {
      period: this.period,
      current: latest.volume,
      average,
      relative: average === 0 ? 0 : latest.volume / average,
    });
  }
}
