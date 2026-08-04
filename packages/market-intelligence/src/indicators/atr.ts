import type { IndicatorSnapshot, MarketSnapshot } from '../snapshot.js';
import { createIndicatorSnapshot, validatePeriod, validateSnapshotSeries } from './engine.js';

/** Average true range over the most recent snapshots in the supplied series. */
export class AtrIndicator {
  readonly family = 'atr';
  readonly id: string;

  constructor(private readonly period: number) {
    validatePeriod(period);
    this.id = `${this.family}:${period}`;
  }

  calculate(snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot {
    validateSnapshotSeries(snapshots);

    const value = calculateAtrValue(snapshots, this.period);
    const latest = snapshots.at(-1);
    const previousSnapshots = snapshots.slice(0, -1);
    const previousValue = calculateAtrValue(previousSnapshots, this.period);
    const previousPrice = previousSnapshots.at(-1)?.lastPrice;

    if (value === undefined || !latest) {
      throw new Error('At least one market snapshot is required.');
    }

    return createIndicatorSnapshot(this.family, snapshots, {
      period: this.period,
      value,
      currentPrice: latest.lastPrice,
      ...(previousValue === undefined ? {} : { previousValue }),
      ...(previousPrice === undefined ? {} : { previousPrice }),
    });
  }
}

function calculateAtrValue(
  snapshots: ReadonlyArray<MarketSnapshot>,
  period: number,
): number | undefined {
  if (snapshots.length === 0) {
    return undefined;
  }

  const firstIndex = Math.max(0, snapshots.length - period);
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

  return rangeCount > 0 ? totalRange / rangeCount : undefined;
}
