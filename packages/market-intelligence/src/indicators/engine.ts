import type { IndicatorSnapshot, MarketSnapshot } from '../snapshot.js';

export type IndicatorFamily = string;
export type IndicatorInstanceId = string;

/** A pure calculator that turns a supplied market snapshot series into one indicator snapshot. */
export interface Indicator {
  /** Stable identity of this configured calculator instance, such as `ema:9`. */
  readonly id: IndicatorInstanceId;
  /** Provider-neutral analytical family represented in resulting snapshots, such as `ema`. */
  readonly family: IndicatorFamily;
  calculate(snapshots: ReadonlyArray<MarketSnapshot>): IndicatorSnapshot;
}

/** Extensible registry and dispatcher for provider-neutral indicator calculators. */
export class IndicatorEngine {
  private readonly indicators = new Map<IndicatorInstanceId, Indicator>();

  register(indicator: Indicator): void {
    this.indicators.set(indicator.id, indicator);
  }

  unregister(indicatorId: IndicatorInstanceId): boolean {
    const indicator = this.resolve(indicatorId);

    return indicator ? this.indicators.delete(indicator.id) : false;
  }

  get(indicatorId: IndicatorInstanceId): Indicator | undefined {
    return this.resolve(indicatorId);
  }

  list(): ReadonlyArray<Indicator> {
    return Array.from(this.indicators.values());
  }

  listByFamily(family: IndicatorFamily): ReadonlyArray<Indicator> {
    return this.list().filter((indicator) => indicator.family === family);
  }

  calculate(
    indicatorId: IndicatorInstanceId,
    snapshots: ReadonlyArray<MarketSnapshot>,
  ): IndicatorSnapshot {
    const indicator = this.resolve(indicatorId);

    if (!indicator) {
      throw new Error(`No indicator is registered for "${indicatorId}".`);
    }

    return indicator.calculate(snapshots);
  }

  private resolve(indicatorId: IndicatorInstanceId): Indicator | undefined {
    const directMatch = this.indicators.get(indicatorId);

    if (directMatch) {
      return directMatch;
    }

    const familyMatches = this.listByFamily(indicatorId);

    if (familyMatches.length > 1) {
      throw new Error(
        `Indicator family "${indicatorId}" has multiple registered configurations; use an instance ID.`,
      );
    }

    return familyMatches[0];
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
