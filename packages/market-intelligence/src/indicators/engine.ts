import type { IndicatorSnapshot, MarketSnapshot } from '../snapshot.js';

/** A pure calculator that turns a supplied market snapshot series into one indicator snapshot. */
export interface Indicator {
  readonly id: string;
  calculate(snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot;
}

/** Extensible registry and dispatcher for provider-neutral indicator calculators. */
export class IndicatorEngine {
  private readonly indicators = new Map<string, Indicator>();

  register(indicator: Indicator): void {
    this.indicators.set(indicator.id, indicator);
  }

  unregister(indicatorId: string): boolean {
    return this.indicators.delete(indicatorId);
  }

  get(indicatorId: string): Indicator | undefined {
    return this.indicators.get(indicatorId);
  }

  list(): ReadonlyArray<Indicator> {
    return Array.from(this.indicators.values());
  }

  calculate(indicatorId: string, snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot {
    const indicator = this.get(indicatorId);

    if (!indicator) {
      throw new Error(`No indicator is registered for "${indicatorId}".`);
    }

    return indicator.calculate(snapshots);
  }
}

export function validateSnapshotSeries(snapshots: ReadonlyArray<MarketSnapshot>): MarketSnapshot {
  const first = snapshots.at(0);

  if (!first) {
    throw new Error('At least one market snapshot is required.');
  }

  for (const snapshot of snapshots) {
    if (snapshot.marketId !== first.marketId || snapshot.timeframe !== first.timeframe) {
      throw new Error('All market snapshots must use the same market and timeframe.');
    }
  }

  return first;
}

export function createIndicatorSnapshot(
  indicator: string,
  snapshots: ReadonlyArray<MarketSnapshot>,
  values: Readonly<Record<string, number>>,
): IndicatorSnapshot {
  const first = validateSnapshotSeries(snapshots);
  const latest = snapshots.at(-1);

  if (!latest) {
    throw new Error('At least one market snapshot is required.');
  }

  return {
    indicator,
    marketId: first.marketId,
    assetId: first.baseAssetId,
    timeframe: first.timeframe,
    observedAt: latest.capturedAt,
    values,
  };
}

export function validatePeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error('Indicator period must be a positive integer.');
  }
}
