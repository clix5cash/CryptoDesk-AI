import type { IndicatorSnapshot } from '../snapshot.js';
import type { MarketSignal } from '../signals.js';

export type SignalGeneratorId = string;

/**
 * A provider-neutral signal generator contract.
 * Implementations decide whether supplied indicator snapshots warrant any output.
 */
export interface SignalGenerator {
  readonly id: SignalGeneratorId;
  generate(indicators: ReadonlyArray<IndicatorSnapshot>): ReadonlyArray<MarketSignal>;
}
