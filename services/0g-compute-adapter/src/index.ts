export type * from './contracts.js';
export { verificationProperties } from './contracts.js';
export { createSyntheticComputeAdapter } from './adapter.js';
export {
  SyntheticClock,
  createSyntheticTransport,
  syntheticDispatchCount,
  createSyntheticConsumptionStore,
  simulateStateLoss,
} from './synthetic.js';
export type { SyntheticStep, SyntheticTransport, SyntheticConsumptionStore } from './synthetic.js';
export { BoundaryError, hash, sha256 } from './validation.js';
export { parseBoundedJson } from './bounded-json.js';

/** Static limitations, not a runtime activation switch or a live authorization API. */
export const syntheticLimitations = Object.freeze({
  liveExecution: 'blocked',
  remoteAttemptGuarantee: 'not_established',
  financialEnforcement: 'not_established',
  authorizationDurability: 'synthetic_memory_only',
  attestation: 'synthetic_only',
} as const);
