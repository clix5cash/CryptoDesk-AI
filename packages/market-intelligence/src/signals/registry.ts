import type { SignalGenerator, SignalGeneratorId } from './types.js';

/** Registry of signal generator implementations. */
export class SignalRegistry {
  private readonly generators = new Map<SignalGeneratorId, SignalGenerator>();

  register(generator: SignalGenerator): void {
    this.generators.set(generator.id, generator);
  }

  unregister(generatorId: SignalGeneratorId): boolean {
    return this.generators.delete(generatorId);
  }

  get(generatorId: SignalGeneratorId): SignalGenerator | undefined {
    return this.generators.get(generatorId);
  }

  list(): ReadonlyArray<SignalGenerator> {
    return Array.from(this.generators.values());
  }
}
