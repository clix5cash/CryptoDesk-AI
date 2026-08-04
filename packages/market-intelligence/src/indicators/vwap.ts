import type { IndicatorSnapshot, MarketSnapshot } from '../snapshot.js';
import { createIndicatorSnapshot, validateSnapshotSeries } from './engine.js';

/** Volume-weighted average price over the supplied snapshots. */
export class VwapIndicator {
  readonly id = 'vwap';
  readonly family = 'vwap';

  calculate(snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot {
    validateSnapshotSeries(snapshots);

    const value = calculateVwapValue(snapshots);
    const latest = snapshots.at(-1);
    const previousSnapshots = snapshots.slice(0, -1);
    const previousValue = calculateVwapValue(previousSnapshots);
    const previousPrice = previousSnapshots.at(-1)?.lastPrice;

    if (value === undefined || !latest) {
      throw new Error('VWAP requires a positive aggregate volume.');
    }

    return createIndicatorSnapshot(this.family, snapshots, {
      value,
      volume: snapshots.reduce((total, snapshot) => total + snapshot.volume, 0),
      currentPrice: latest.lastPrice,
      ...(previousValue === undefined ? {} : { previousValue }),
      ...(previousPrice === undefined ? {} : { previousPrice }),
    });
  }
}

function calculateVwapValue(snapshots: ReadonlyArray<MarketSnapshot>): number | undefined {
  let totalVolume = 0;
  let totalPriceVolume = 0;

  for (const snapshot of snapshots) {
    totalVolume += snapshot.volume;
    totalPriceVolume += snapshot.lastPrice * snapshot.volume;
  }

  return totalVolume > 0 ? totalPriceVolume / totalVolume : undefined;
}
