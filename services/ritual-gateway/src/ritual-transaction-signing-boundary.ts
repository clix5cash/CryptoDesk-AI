/** Explicit, instance-owned identity for one injected signing capability. */
export interface RitualTransactionSigningConfiguration {
  readonly signerId: string;
}

/** Opaque input prepared outside this Sprint 10D.1 boundary. */
export interface RitualTransactionSigningRequest {
  readonly signingRequestId: string;
  readonly signerId: string;
  readonly payload: string;
}

/** Capability supplied explicitly by the gateway operator; it contains no key material. */
export type RitualTransactionSignerCapability = (
  request: RitualTransactionSigningRequest,
) => Promise<unknown>;

export enum RitualTransactionSigningFailureKind {
  SignerFailure = 'signer_failure',
  ResultInvalid = 'result_invalid',
  IdentityMismatch = 'identity_mismatch',
}

export type RitualTransactionSigningResult =
  | {
      readonly status: 'signed';
      readonly signingRequestId: string;
      readonly signerId: string;
      readonly signedPayload: string;
    }
  | {
      readonly status: 'failed';
      readonly signingRequestId: string;
      readonly signerId: string;
      readonly failureKind: RitualTransactionSigningFailureKind;
    };

export interface RitualTransactionSigningBoundary {
  /** Invokes exactly the one explicitly supplied capability. It never submits a transaction. */
  sign(request: RitualTransactionSigningRequest): Promise<RitualTransactionSigningResult>;
}

/**
 * Creates the gateway-owned signing boundary for an already prepared opaque payload.
 * Construction, broadcast, settlement, wallet discovery, and credential ownership stay outside it.
 */
export function createRitualTransactionSigningBoundary(
  configuration: RitualTransactionSigningConfiguration,
  signer: RitualTransactionSignerCapability,
): RitualTransactionSigningBoundary {
  const runtime = validateAndDetachConfiguration(configuration);
  if (typeof signer !== 'function') {
    throw new TypeError('Ritual transaction signer capability is invalid.');
  }
  const capability = signer;

  return {
    async sign(value) {
      const request = validateAndDetachRequest(value, runtime.signerId);
      let result: unknown;
      try {
        result = await capability({ ...request });
      } catch {
        return failed(request, RitualTransactionSigningFailureKind.SignerFailure);
      }
      return decodeSignerResult(request, result);
    },
  };
}

function validateAndDetachConfiguration(
  value: RitualTransactionSigningConfiguration,
): RitualTransactionSigningConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['signerId']) ||
    !isNonEmptyString(value.signerId)
  ) {
    throw new TypeError('Ritual transaction signing configuration is invalid.');
  }
  return { signerId: value.signerId };
}

function validateAndDetachRequest(
  value: RitualTransactionSigningRequest,
  signerId: string,
): RitualTransactionSigningRequest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['signingRequestId', 'signerId', 'payload']) ||
    !isNonEmptyString(value.signingRequestId) ||
    !isNonEmptyString(value.signerId) ||
    !isNonEmptyString(value.payload) ||
    value.signerId !== signerId
  ) {
    throw new TypeError('Ritual transaction signing request is invalid.');
  }
  return { signingRequestId: value.signingRequestId, signerId, payload: value.payload };
}

function decodeSignerResult(
  request: RitualTransactionSigningRequest,
  value: unknown,
): RitualTransactionSigningResult {
  if (!isPlainRecord(value)) {
    return failed(request, RitualTransactionSigningFailureKind.ResultInvalid);
  }
  if (value.signingRequestId !== request.signingRequestId || value.signerId !== request.signerId) {
    return failed(request, RitualTransactionSigningFailureKind.IdentityMismatch);
  }
  if (
    value.status !== 'signed' ||
    !hasExactKeys(value, ['status', 'signingRequestId', 'signerId', 'signedPayload']) ||
    !isNonEmptyString(value.signedPayload)
  ) {
    return failed(request, RitualTransactionSigningFailureKind.ResultInvalid);
  }
  return {
    status: 'signed',
    signingRequestId: request.signingRequestId,
    signerId: request.signerId,
    signedPayload: value.signedPayload,
  };
}

function failed(
  request: RitualTransactionSigningRequest,
  failureKind: RitualTransactionSigningFailureKind,
): RitualTransactionSigningResult {
  return {
    status: 'failed',
    signingRequestId: request.signingRequestId,
    signerId: request.signerId,
    failureKind,
  };
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
