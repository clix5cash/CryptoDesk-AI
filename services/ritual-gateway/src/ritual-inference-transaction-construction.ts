import type { RitualTransactionSigningRequest } from './ritual-transaction-signing-boundary.js';

const RITUAL_CHAIN_ID = 1979;

/** Explicit, detached construction policy owned by one gateway instance. */
export interface RitualInferenceTransactionConfiguration {
  readonly expectedChainId: typeof RITUAL_CHAIN_ID;
  readonly targetId: string;
  readonly signerId: string;
}

/** Closed input for one deterministic, network-free construction operation. */
export interface RitualInferenceTransactionConstructionInput {
  readonly executionId: string;
  readonly chainId: typeof RITUAL_CHAIN_ID;
  readonly targetId: string;
  readonly payload: string;
}

/**
 * Gateway-owned construction result. `signingRequest.payload` is an opaque
 * deterministic envelope, not an encoded or broadcastable chain transaction.
 */
export interface RitualInferenceTransactionConstructionResult {
  readonly executionId: string;
  readonly chainId: typeof RITUAL_CHAIN_ID;
  readonly targetId: string;
  readonly signingRequest: RitualTransactionSigningRequest;
}

export interface RitualInferenceTransactionConstructor {
  construct(
    input: RitualInferenceTransactionConstructionInput,
  ): RitualInferenceTransactionConstructionResult;
}

/** Creates a pure construction boundary with no signer or network side effect. */
export function createRitualInferenceTransactionConstructor(
  configuration: RitualInferenceTransactionConfiguration,
): RitualInferenceTransactionConstructor {
  const runtime = validateAndDetachConfiguration(configuration);
  return {
    construct(value) {
      const input = validateAndDetachInput(value, runtime);
      return {
        executionId: input.executionId,
        chainId: RITUAL_CHAIN_ID,
        targetId: input.targetId,
        signingRequest: {
          signingRequestId: input.executionId,
          signerId: runtime.signerId,
          payload: serializeSignableEnvelope(input),
        },
      };
    },
  };
}

function validateAndDetachConfiguration(
  value: RitualInferenceTransactionConfiguration,
): RitualInferenceTransactionConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['expectedChainId', 'targetId', 'signerId']) ||
    value.expectedChainId !== RITUAL_CHAIN_ID ||
    !isNonEmptyString(value.targetId) ||
    !isNonEmptyString(value.signerId)
  ) {
    throw new TypeError('Ritual inference transaction configuration is invalid.');
  }
  return {
    expectedChainId: RITUAL_CHAIN_ID,
    targetId: value.targetId,
    signerId: value.signerId,
  };
}

function validateAndDetachInput(
  value: RitualInferenceTransactionConstructionInput,
  runtime: RitualInferenceTransactionConfiguration,
): RitualInferenceTransactionConstructionInput {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['executionId', 'chainId', 'targetId', 'payload']) ||
    !isNonEmptyString(value.executionId) ||
    value.chainId !== runtime.expectedChainId ||
    !isNonEmptyString(value.targetId) ||
    value.targetId !== runtime.targetId ||
    !isNonEmptyString(value.payload)
  ) {
    throw new TypeError('Ritual inference transaction construction input is invalid.');
  }
  return {
    executionId: value.executionId,
    chainId: RITUAL_CHAIN_ID,
    targetId: value.targetId,
    payload: value.payload,
  };
}

function serializeSignableEnvelope(input: RitualInferenceTransactionConstructionInput): string {
  return JSON.stringify({
    chainId: RITUAL_CHAIN_ID,
    targetId: input.targetId,
    payload: input.payload,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
