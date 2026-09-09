import {
  AutonomousActionAuthorizationState,
  type AutonomousActionCandidate,
  AutonomousActionCandidateAuthority,
  AutonomousActionKind,
  type AutonomousRuntimePolicyDescriptor,
  createAutonomousRuntimeSafetyContract,
} from './runtime-safety-contract.js';

const MAX_TIMEOUT_MS = 2_147_483_647;

export interface BoundedActionExecutionGuardrailConfiguration {
  readonly policy: AutonomousRuntimePolicyDescriptor;
  readonly executionTimeoutMs?: number;
}

export interface BoundedActionIdentity {
  readonly executionId: string;
  readonly actionId: string;
  readonly actionKind: AutonomousActionKind;
  readonly targetId: string;
  readonly policyId: string;
  readonly authorityId: string;
  readonly interpretationId: string;
  readonly candidateId: string;
}

export type BoundedActionAuthorizationResult =
  | (BoundedActionIdentity & { readonly status: 'authorized' })
  | (BoundedActionIdentity & { readonly status: 'denied' });

export type BoundedActionAuthorizer = (request: BoundedActionIdentity) => Promise<unknown>;

export interface BoundedActionExecutionPermission extends BoundedActionIdentity {
  readonly permissionState: 'authorized_for_single_attempt';
  readonly maximumAttempts: 1;
}

export enum BoundedActionCapabilityFailureKind {
  ExecutionFailed = 'execution_failed',
}

export type BoundedActionCapabilityResult =
  | (BoundedActionIdentity & {
      readonly status: 'completed';
      readonly output: string;
    })
  | (BoundedActionIdentity & {
      readonly status: 'failed';
      readonly failureKind: BoundedActionCapabilityFailureKind;
    });

export type BoundedActionExecutionCapability = (
  request: BoundedActionExecutionPermission,
) => Promise<unknown>;

export enum BoundedActionExecutionFailureKind {
  AuthorizationDenied = 'authorization_denied',
  AuthorizationFailed = 'authorization_failed',
  AuthorizationInvalid = 'authorization_invalid',
  IdentityMismatch = 'identity_mismatch',
  ExecutionFailed = 'execution_failed',
  ExecutionInvalid = 'execution_invalid',
  Timeout = 'timeout',
}

export type BoundedActionExecutionResult =
  | (BoundedActionIdentity & {
      readonly status: 'completed';
      readonly output: string;
    })
  | (BoundedActionIdentity & {
      readonly status: 'failed';
      readonly failureKind: BoundedActionExecutionFailureKind;
    });

export interface BoundedActionExecutionGuardrail {
  execute(candidate: AutonomousActionCandidate): Promise<BoundedActionExecutionResult>;
}

/** Creates one explicitly authorized, single-attempt, provider-neutral guardrail. */
export function createBoundedActionExecutionGuardrail(
  configuration: BoundedActionExecutionGuardrailConfiguration,
  authorize: BoundedActionAuthorizer,
  execute: BoundedActionExecutionCapability,
): BoundedActionExecutionGuardrail {
  const runtime = validateAndDetachConfiguration(configuration);
  if (typeof authorize !== 'function' || typeof execute !== 'function')
    throw invalidConfiguration();
  const candidateContract = createAutonomousRuntimeSafetyContract({ policy: runtime.policy });

  return {
    async execute(value) {
      const candidate = validateAndDetachCandidate(value, candidateContract);
      const identity = candidateIdentity(candidate);
      const authorization = await authorizeOnce(identity, authorize);
      if (authorization.status === 'failed') return failed(identity, authorization.failureKind);
      if (authorization.status === 'denied') {
        return failed(identity, BoundedActionExecutionFailureKind.AuthorizationDenied);
      }
      const permission: BoundedActionExecutionPermission = {
        ...identity,
        permissionState: 'authorized_for_single_attempt',
        maximumAttempts: 1,
      };
      return executeOnce(identity, permission, execute, runtime.executionTimeoutMs);
    },
  };
}

type AuthorizationOutcome =
  | { readonly status: 'authorized' }
  | { readonly status: 'denied' }
  | {
      readonly status: 'failed';
      readonly failureKind: BoundedActionExecutionFailureKind;
    };

async function authorizeOnce(
  identity: BoundedActionIdentity,
  authorize: BoundedActionAuthorizer,
): Promise<AuthorizationOutcome> {
  let value: unknown;
  try {
    value = await authorize(clone(identity));
  } catch {
    return failure(BoundedActionExecutionFailureKind.AuthorizationFailed);
  }
  if (!isPlainRecord(value)) {
    return failure(BoundedActionExecutionFailureKind.AuthorizationInvalid);
  }
  if (identityEntries(identity).some(([key, expected]) => value[key] !== expected)) {
    return failure(BoundedActionExecutionFailureKind.IdentityMismatch);
  }
  if (!hasExactKeys(value, ['status', ...Object.keys(identity)])) {
    return failure(BoundedActionExecutionFailureKind.AuthorizationInvalid);
  }
  if (value.status === 'authorized') return { status: 'authorized' };
  if (value.status === 'denied') return { status: 'denied' };
  return failure(BoundedActionExecutionFailureKind.AuthorizationInvalid);
}

async function executeOnce(
  identity: BoundedActionIdentity,
  permission: BoundedActionExecutionPermission,
  execute: BoundedActionExecutionCapability,
  timeoutMs: number | undefined,
): Promise<BoundedActionExecutionResult> {
  const state = { timedOut: false };
  const operation = invokeAndDecode(identity, permission, execute, state);
  if (timeoutMs === undefined) return operation;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<BoundedActionExecutionResult>((resolve) => {
        timeout = setTimeout(() => {
          state.timedOut = true;
          resolve(failed(identity, BoundedActionExecutionFailureKind.Timeout));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function invokeAndDecode(
  identity: BoundedActionIdentity,
  permission: BoundedActionExecutionPermission,
  execute: BoundedActionExecutionCapability,
  state: { timedOut: boolean },
): Promise<BoundedActionExecutionResult> {
  let value: unknown;
  try {
    value = await execute(clone(permission));
  } catch {
    return failed(identity, BoundedActionExecutionFailureKind.ExecutionFailed);
  }
  if (state.timedOut) return failed(identity, BoundedActionExecutionFailureKind.Timeout);
  return decodeExecutionResult(value, identity);
}

function decodeExecutionResult(
  value: unknown,
  identity: BoundedActionIdentity,
): BoundedActionExecutionResult {
  if (!isPlainRecord(value)) {
    return failed(identity, BoundedActionExecutionFailureKind.ExecutionInvalid);
  }
  if (identityEntries(identity).some(([key, expected]) => value[key] !== expected)) {
    return failed(identity, BoundedActionExecutionFailureKind.IdentityMismatch);
  }
  const terminalKey = value.status === 'completed' ? ['output'] : ['failureKind'];
  if (!hasExactKeys(value, ['status', ...Object.keys(identity), ...terminalKey])) {
    return failed(identity, BoundedActionExecutionFailureKind.ExecutionInvalid);
  }
  if (value.status === 'completed' && isNonEmptyString(value.output)) {
    return { status: 'completed', ...clone(identity), output: value.output };
  }
  if (
    value.status === 'failed' &&
    value.failureKind === BoundedActionCapabilityFailureKind.ExecutionFailed
  ) {
    return failed(identity, BoundedActionExecutionFailureKind.ExecutionFailed);
  }
  return failed(identity, BoundedActionExecutionFailureKind.ExecutionInvalid);
}

function validateAndDetachCandidate(
  value: AutonomousActionCandidate,
  contract: ReturnType<typeof createAutonomousRuntimeSafetyContract>,
): AutonomousActionCandidate {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'executionId',
      'actionId',
      'actionKind',
      'targetId',
      'policy',
      'origin',
      'candidateAuthority',
      'authorizationState',
      'executable',
    ]) ||
    value.candidateAuthority !== AutonomousActionCandidateAuthority.CandidateOnly ||
    value.authorizationState !== AutonomousActionAuthorizationState.NotAuthorized ||
    value.executable !== false
  ) {
    throw invalidCandidate();
  }
  try {
    return contract.createCandidate({
      executionId: value.executionId,
      actionId: value.actionId,
      actionKind: value.actionKind,
      targetId: value.targetId,
      policy: value.policy,
      origin: value.origin,
    });
  } catch {
    throw invalidCandidate();
  }
}

function candidateIdentity(candidate: AutonomousActionCandidate): BoundedActionIdentity {
  return {
    executionId: candidate.executionId,
    actionId: candidate.actionId,
    actionKind: candidate.actionKind,
    targetId: candidate.targetId,
    policyId: candidate.policy.policyId,
    authorityId: candidate.policy.authorityId,
    interpretationId: candidate.origin.interpretationId,
    candidateId: candidate.origin.candidateId,
  };
}

function validateAndDetachConfiguration(
  value: BoundedActionExecutionGuardrailConfiguration,
): BoundedActionExecutionGuardrailConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'policy',
      ...(value.executionTimeoutMs === undefined ? [] : ['executionTimeoutMs']),
    ]) ||
    !isPlainRecord(value.policy) ||
    !hasExactKeys(value.policy, ['policyId', 'authorityId']) ||
    !isNonEmptyString(value.policy.policyId) ||
    !isNonEmptyString(value.policy.authorityId) ||
    value.policy.policyId === '*' ||
    value.policy.authorityId === '*' ||
    !isValidTimeout(value.executionTimeoutMs)
  ) {
    throw invalidConfiguration();
  }
  return {
    policy: { policyId: value.policy.policyId, authorityId: value.policy.authorityId },
    ...(value.executionTimeoutMs === undefined
      ? {}
      : { executionTimeoutMs: value.executionTimeoutMs }),
  };
}

function failed(
  identity: BoundedActionIdentity,
  failureKind: BoundedActionExecutionFailureKind,
): Extract<BoundedActionExecutionResult, { status: 'failed' }> {
  return { status: 'failed', ...clone(identity), failureKind };
}

function failure(failureKind: BoundedActionExecutionFailureKind): AuthorizationOutcome {
  return { status: 'failed', failureKind };
}

function invalidCandidate(): TypeError {
  return new TypeError('Bounded action candidate is invalid.');
}

function invalidConfiguration(): TypeError {
  return new TypeError('Bounded action execution guardrail configuration is invalid.');
}

function isValidTimeout(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= MAX_TIMEOUT_MS)
  );
}

function identityEntries(value: BoundedActionIdentity) {
  return Object.entries(value);
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

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
    ) as T;
  }
  return value;
}
