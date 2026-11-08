import type { ConsumptionReceipt, RequestManifest } from './contracts.js';
import { copy, exact, freeze, id, integer, plainArray, record, reject } from './validation.js';

const clocks = new WeakSet<object>();
export class SyntheticClock {
  #time: number;
  #next = 0;
  readonly #events = new Map<number, { at: number; callback: () => void }>();
  constructor(now: number) {
    integer(now);
    this.#time = now;
    clocks.add(this);
    Object.freeze(this);
  }
  now(): number {
    return this.#time;
  }
  advance(ms: number): void {
    integer(ms);
    integer(this.#time + ms);
    this.#time += ms;
    for (const [key, event] of [...this.#events]) {
      if (event.at <= this.#time) {
        this.#events.delete(key);
        event.callback();
      }
    }
  }
  /** Internal clock deadlines, never wall-clock timers or scheduled work. */
  at(at: number, callback: () => void): () => void {
    const key = this.#next++;
    this.#events.set(key, { at, callback });
    if (at <= this.#time) {
      this.#events.delete(key);
      callback();
    }
    return () => {
      this.#events.delete(key);
    };
  }
  pending(): number {
    return this.#events.size;
  }
}
export function requireClock(value: SyntheticClock): void {
  if (
    !clocks.has(value) ||
    Object.getPrototypeOf(value) !== SyntheticClock.prototype ||
    Reflect.ownKeys(value).length !== 0 ||
    !Object.isFrozen(value)
  )
    reject('forbidden_capability');
  for (const k of ['now', 'at', 'advance', 'pending'])
    if (Object.hasOwn(value, k)) reject('forbidden_capability');
}

export type SyntheticStep =
  | {
      readonly kind: 'response';
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: Uint8Array;
      readonly delayMs: number;
    }
  | { readonly kind: 'crash' }
  | { readonly kind: 'hang' };
export interface SyntheticTransport {
  readonly kind: 'synthetic_script';
}
interface ScriptState {
  clock: SyntheticClock;
  steps: SyntheticStep[];
  calls: number;
}
const scripts = new WeakMap<SyntheticTransport, ScriptState>();
export function createSyntheticTransport(
  clock: SyntheticClock,
  steps: readonly SyntheticStep[],
): SyntheticTransport {
  requireClock(clock);
  plainArray(steps);
  if (steps.length > 1000) reject('request_invalid');
  const detached: SyntheticStep[] = steps.map((step) => {
    record(step);
    if (step.kind === 'response') {
      exact(step, ['kind', 'status', 'headers', 'body', 'delayMs']);
      integer(step.status, 100, 599);
      integer(step.delayMs, 0, 60_000);
      if (!(step.body instanceof Uint8Array) || step.body.byteLength > 2_097_152)
        reject('request_invalid');
      record(step.headers);
      const headers = copy(step.headers) as Record<string, string>;
      if (Object.values(headers).some((v) => typeof v !== 'string')) reject('request_invalid');
      return {
        kind: 'response' as const,
        status: step.status,
        delayMs: step.delayMs,
        headers: freeze(headers),
        body: new Uint8Array(step.body),
      };
    }
    exact(step, ['kind']);
    if (step.kind !== 'crash' && step.kind !== 'hang') reject('request_invalid');
    return { kind: step.kind };
  });
  const transport: SyntheticTransport = Object.freeze({ kind: 'synthetic_script' });
  scripts.set(transport, { clock, steps: detached, calls: 0 });
  return transport;
}
export function requireTransport(transport: SyntheticTransport, clock: SyntheticClock): void {
  if (scripts.get(transport)?.clock !== clock) reject('forbidden_capability');
}
export function syntheticDispatchCount(transport: SyntheticTransport): number {
  const state = scripts.get(transport);
  if (!state) reject('forbidden_capability');
  return state.calls;
}
/** Only the closed factory can supply execution: arbitrary injected functions are rejected. */
export async function dispatchSynthetic(transport: SyntheticTransport): Promise<unknown> {
  const state = scripts.get(transport);
  if (!state) reject('forbidden_capability');
  const step = state.steps[state.calls++];
  if (!step || step.kind === 'crash') throw new Error('synthetic_transport_failed');
  if (step.kind === 'hang') return new Promise(() => {});
  if (step.delayMs > 0)
    await new Promise<void>((resolve) => state.clock.at(state.clock.now() + step.delayMs, resolve));
  return { status: step.status, headers: copy(step.headers), body: new Uint8Array(step.body) };
}

export interface SyntheticConsumptionStore {
  readonly durability: 'synthetic_memory_only';
}
interface StoreState {
  available: boolean;
  entries: Map<string, string>;
  artifacts: Set<string>;
  clock: SyntheticClock;
  crashAfterConsumption: boolean;
}
const stores = new WeakMap<SyntheticConsumptionStore, StoreState>();
export function createSyntheticConsumptionStore(
  clock: SyntheticClock,
  initialState: 'fresh_test_scope' | 'lost' | 'crash_after_consumption',
): SyntheticConsumptionStore {
  requireClock(clock);
  if (!['fresh_test_scope', 'lost', 'crash_after_consumption'].includes(initialState))
    reject('request_invalid');
  const store: SyntheticConsumptionStore = Object.freeze({ durability: 'synthetic_memory_only' });
  stores.set(store, {
    available: initialState !== 'lost',
    entries: new Map(),
    artifacts: new Set(),
    clock,
    crashAfterConsumption: initialState === 'crash_after_consumption',
  });
  return store;
}
export function requireStore(store: SyntheticConsumptionStore, clock: SyntheticClock): void {
  if (stores.get(store)?.clock !== clock) reject('forbidden_capability');
}
export function simulateStateLoss(store: SyntheticConsumptionStore): void {
  const state = stores.get(store);
  if (!state) reject('forbidden_capability');
  state.available = false; // Never clears tombstones or provides recovery/reset.
}
export function consumeSynthetic(
  store: SyntheticConsumptionStore,
  manifest: RequestManifest,
  manifestDigest: string,
  authorizationId: string,
): ConsumptionReceipt {
  const state = stores.get(store);
  if (!state?.available || state.entries.size >= 40_000) reject('consumption_unavailable');
  id(authorizationId);
  const keys = [
    `request:${manifest.requestId}`,
    `attempt:${manifest.attemptId}`,
    `operation:${manifest.logicalOperationDigest}`,
    `authorization:${authorizationId}`,
  ];
  for (const key of keys) {
    const existing = state.entries.get(key);
    if (existing !== undefined && existing !== manifestDigest)
      reject(key.startsWith('authorization:') ? 'authorization_reused' : 'identity_collision');
  }
  if (keys.slice(0, 3).some((k) => state.entries.has(k))) reject('duplicate_attempt');
  if (state.entries.has(keys[3]!)) reject('authorization_reused');
  // No await between conflict checks and writes: atomic within this JS isolate only.
  keys.forEach((k) => state.entries.set(k, manifestDigest));
  return freeze({
    authorizationId,
    attemptId: manifest.attemptId,
    manifestDigest,
    receiptId: `synthetic:${manifest.attemptId}`,
    dispatchState: 'consumed_before_dispatch',
    durability: 'synthetic_memory_only',
  });
}
export function consumeArtifact(
  store: SyntheticConsumptionStore,
  artifact: string,
  challenge: string,
): void {
  const state = stores.get(store);
  if (!state?.available || state.artifacts.size >= 20_000) reject('consumption_unavailable');
  if (state.artifacts.has(artifact) || state.artifacts.has(challenge))
    reject('verification_replayed');
  state.artifacts.add(artifact);
  state.artifacts.add(challenge);
}
export function consumptionCheckpoint(store: SyntheticConsumptionStore): void {
  const state = stores.get(store);
  if (!state?.available) reject('consumption_unavailable');
  if (state.crashAfterConsumption) {
    state.crashAfterConsumption = false;
    reject('transport_failed');
  }
}
