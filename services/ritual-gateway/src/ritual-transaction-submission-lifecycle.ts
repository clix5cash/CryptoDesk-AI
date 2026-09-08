import type { RitualTransactionSigningResult } from './ritual-transaction-signing-boundary.js';

type SignedTransaction = Extract<RitualTransactionSigningResult, { readonly status: 'signed' }>;

const MAX_TIMEOUT_MS = 2_147_483_647;

export interface RitualTransactionSubmissionLifecycleConfiguration {
  readonly timeoutMs?: number;
}

/** A signed artifact alone is insufficient; authorization is requested separately. */
export interface RitualTransactionSubmissionRequest {
  readonly executionId: string;
  readonly signedTransaction: SignedTransaction;
}

export interface RitualTransactionSubmissionAuthorizationRequest {
  readonly executionId: string;
  readonly signingRequestId: string;
  readonly signerId: string;
}

export type RitualTransactionSubmissionAuthorizer = (
  request: RitualTransactionSubmissionAuthorizationRequest,
) => Promise<unknown>;

export interface RitualTransactionSubmissionCapabilityRequest {
  readonly executionId: string;
  readonly signingRequestId: string;
  readonly signerId: string;
  readonly signedPayload: string;
}

export type RitualTransactionSubmissionCapability = (
  request: RitualTransactionSubmissionCapabilityRequest,
) => Promise<unknown>;

export interface RitualTransactionSettlementRequest {
  readonly executionId: string;
  readonly submissionId: string;
}

export type RitualTransactionSettlementCapability = (
  request: RitualTransactionSettlementRequest,
) => Promise<unknown>;

export enum RitualTransactionLifecycleFailureKind {
  Unauthorized = 'unauthorized',
  AuthorizationFailed = 'authorization_failed',
  SubmissionFailed = 'submission_failed',
  SubmissionInvalid = 'submission_invalid',
  SettlementFailed = 'settlement_failed',
  SettlementInvalid = 'settlement_invalid',
  IdentityMismatch = 'identity_mismatch',
  Timeout = 'timeout',
}

export type RitualTransactionLifecycleResult =
  | {
      readonly status: 'settled';
      readonly executionId: string;
      readonly submissionId: string;
    }
  | {
      readonly status: 'failed';
      readonly executionId: string;
      readonly failureKind: RitualTransactionLifecycleFailureKind;
    };

export interface RitualTransactionSubmissionLifecycle {
  execute(request: RitualTransactionSubmissionRequest): Promise<RitualTransactionLifecycleResult>;
}

/**
 * Creates an explicitly authorized, single-attempt submission/settlement boundary.
 * All capabilities are required and injected; no live broadcaster is provided.
 */
export function createRitualTransactionSubmissionLifecycle(
  configuration: RitualTransactionSubmissionLifecycleConfiguration,
  authorize: RitualTransactionSubmissionAuthorizer,
  submit: RitualTransactionSubmissionCapability,
  observeSettlement: RitualTransactionSettlementCapability,
): RitualTransactionSubmissionLifecycle {
  const runtime = validateAndDetachConfiguration(configuration);
  if (
    typeof authorize !== 'function' ||
    typeof submit !== 'function' ||
    typeof observeSettlement !== 'function'
  ) {
    throw new TypeError('Ritual transaction lifecycle capability is invalid.');
  }

  return {
    async execute(value) {
      const request = validateAndDetachRequest(value);
      const state = { timedOut: false };
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const operation = runLifecycle(request, state, authorize, submit, observeSettlement);
      if (runtime.timeoutMs === undefined) return operation;
      try {
        return await Promise.race([
          operation,
          new Promise<RitualTransactionLifecycleResult>((resolve) => {
            timeout = setTimeout(() => {
              state.timedOut = true;
              resolve(failed(request.executionId, RitualTransactionLifecycleFailureKind.Timeout));
            }, runtime.timeoutMs);
          }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    },
  };
}

async function runLifecycle(
  request: RitualTransactionSubmissionRequest,
  state: { timedOut: boolean },
  authorize: RitualTransactionSubmissionAuthorizer,
  submit: RitualTransactionSubmissionCapability,
  observeSettlement: RitualTransactionSettlementCapability,
): Promise<RitualTransactionLifecycleResult> {
  const identity = authorizationRequest(request);
  let authorization: unknown;
  try {
    authorization = await authorize({ ...identity });
  } catch {
    return failed(request.executionId, RitualTransactionLifecycleFailureKind.AuthorizationFailed);
  }
  if (state.timedOut)
    return failed(request.executionId, RitualTransactionLifecycleFailureKind.Timeout);
  if (!isAuthorized(identity, authorization)) {
    return failed(request.executionId, RitualTransactionLifecycleFailureKind.Unauthorized);
  }

  let submission: unknown;
  try {
    submission = await submit({
      ...identity,
      signedPayload: request.signedTransaction.signedPayload,
    });
  } catch {
    return failed(request.executionId, RitualTransactionLifecycleFailureKind.SubmissionFailed);
  }
  if (state.timedOut)
    return failed(request.executionId, RitualTransactionLifecycleFailureKind.Timeout);
  const decodedSubmission = decodeSubmission(request.executionId, submission);
  if ('failureKind' in decodedSubmission) return decodedSubmission;

  let settlement: unknown;
  try {
    settlement = await observeSettlement({
      executionId: request.executionId,
      submissionId: decodedSubmission.submissionId,
    });
  } catch {
    return failed(request.executionId, RitualTransactionLifecycleFailureKind.SettlementFailed);
  }
  if (state.timedOut)
    return failed(request.executionId, RitualTransactionLifecycleFailureKind.Timeout);
  return decodeSettlement(request.executionId, decodedSubmission.submissionId, settlement);
}

function authorizationRequest(
  request: RitualTransactionSubmissionRequest,
): RitualTransactionSubmissionAuthorizationRequest {
  return {
    executionId: request.executionId,
    signingRequestId: request.signedTransaction.signingRequestId,
    signerId: request.signedTransaction.signerId,
  };
}

function isAuthorized(
  request: RitualTransactionSubmissionAuthorizationRequest,
  value: unknown,
): boolean {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ['status', 'executionId', 'signingRequestId', 'signerId']) &&
    value.status === 'authorized' &&
    value.executionId === request.executionId &&
    value.signingRequestId === request.signingRequestId &&
    value.signerId === request.signerId
  );
}

function decodeSubmission(
  executionId: string,
  value: unknown,
):
  | { readonly submissionId: string }
  | Extract<RitualTransactionLifecycleResult, { status: 'failed' }> {
  if (!isPlainRecord(value)) {
    return failed(executionId, RitualTransactionLifecycleFailureKind.SubmissionInvalid);
  }
  if (value.executionId !== executionId) {
    return failed(executionId, RitualTransactionLifecycleFailureKind.IdentityMismatch);
  }
  if (
    value.status !== 'submitted' ||
    !hasExactKeys(value, ['status', 'executionId', 'submissionId']) ||
    !isNonEmptyString(value.submissionId)
  ) {
    return failed(executionId, RitualTransactionLifecycleFailureKind.SubmissionInvalid);
  }
  return { submissionId: value.submissionId };
}

function decodeSettlement(
  executionId: string,
  submissionId: string,
  value: unknown,
): RitualTransactionLifecycleResult {
  if (!isPlainRecord(value)) {
    return failed(executionId, RitualTransactionLifecycleFailureKind.SettlementInvalid);
  }
  if (value.executionId !== executionId || value.submissionId !== submissionId) {
    return failed(executionId, RitualTransactionLifecycleFailureKind.IdentityMismatch);
  }
  if (
    value.status === 'settled' &&
    hasExactKeys(value, ['status', 'executionId', 'submissionId'])
  ) {
    return { status: 'settled', executionId, submissionId };
  }
  if (value.status === 'failed' && hasExactKeys(value, ['status', 'executionId', 'submissionId'])) {
    return failed(executionId, RitualTransactionLifecycleFailureKind.SettlementFailed);
  }
  return failed(executionId, RitualTransactionLifecycleFailureKind.SettlementInvalid);
}

function validateAndDetachConfiguration(
  value: RitualTransactionSubmissionLifecycleConfiguration,
): RitualTransactionSubmissionLifecycleConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, value.timeoutMs === undefined ? [] : ['timeoutMs']) ||
    (value.timeoutMs !== undefined &&
      (typeof value.timeoutMs !== 'number' ||
        !Number.isSafeInteger(value.timeoutMs) ||
        value.timeoutMs <= 0 ||
        value.timeoutMs > MAX_TIMEOUT_MS))
  ) {
    throw new TypeError('Ritual transaction lifecycle configuration is invalid.');
  }
  return value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs };
}

function validateAndDetachRequest(
  value: RitualTransactionSubmissionRequest,
): RitualTransactionSubmissionRequest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['executionId', 'signedTransaction']) ||
    !isNonEmptyString(value.executionId) ||
    !isPlainRecord(value.signedTransaction) ||
    !hasExactKeys(value.signedTransaction, [
      'status',
      'signingRequestId',
      'signerId',
      'signedPayload',
    ]) ||
    value.signedTransaction.status !== 'signed' ||
    value.signedTransaction.signingRequestId !== value.executionId ||
    !isNonEmptyString(value.signedTransaction.signerId) ||
    !isNonEmptyString(value.signedTransaction.signedPayload)
  ) {
    throw new TypeError('Ritual transaction submission request is invalid.');
  }
  return {
    executionId: value.executionId,
    signedTransaction: {
      status: 'signed',
      signingRequestId: value.executionId,
      signerId: value.signedTransaction.signerId,
      signedPayload: value.signedTransaction.signedPayload,
    },
  };
}

function failed(
  executionId: string,
  failureKind: RitualTransactionLifecycleFailureKind,
): Extract<RitualTransactionLifecycleResult, { status: 'failed' }> {
  return { status: 'failed', executionId, failureKind };
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
