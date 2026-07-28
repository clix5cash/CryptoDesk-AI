import type { IndicatorSnapshot } from '../snapshot.js';
import type { MarketSignal } from '../signals.js';
import { SignalRegistry } from './registry.js';
import type { SignalGenerator } from './types.js';

/** Dispatches supplied indicator snapshots to registered signal generators. */
export class SignalEngine {
  constructor(private readonly registry: SignalRegistry = new SignalRegistry()) {}

  register(generator: SignalGenerator): void {
    this.registry.register(generator);
  }

  unregister(generatorId: string): boolean {
    return this.registry.unregister(generatorId);
  }

  generate(indicators: ReadonlyArray<IndicatorSnapshot>): ReadonlyArray<MarketSignal> {
    return this.registry.list().flatMap((generator) => generator.generate(indicators));
  }
}
