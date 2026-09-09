/** The initial action surface is deliberately non-mutating and non-executable. */
export enum AutonomousActionKind {
  PrepareOperatorReview = 'prepare_operator_review',
}

/** Candidate construction carries no authorization or execution permission. */
export enum AutonomousActionAuthorizationState {
  NotAuthorized = 'not_authorized',
}

export enum AutonomousActionCandidateAuthority {
  CandidateOnly = 'candidate_only',
}

export interface AutonomousRuntimePolicyDescriptor {
  readonly policyId: string;
  readonly authorityId: string;
}

export interface AutonomousActionOrigin {
  readonly interpretationId: string;
  readonly candidateId: string;
}

export interface AutonomousRuntimeSafetyConfiguration {
  readonly policy: AutonomousRuntimePolicyDescriptor;
}

export interface AutonomousActionCandidateInput {
  readonly executionId: string;
  readonly actionId: string;
  readonly actionKind: AutonomousActionKind;
  readonly targetId: string;
  readonly policy: AutonomousRuntimePolicyDescriptor;
  readonly origin: AutonomousActionOrigin;
}

export interface AutonomousActionCandidate extends AutonomousActionCandidateInput {
  readonly candidateAuthority: AutonomousActionCandidateAuthority.CandidateOnly;
  readonly authorizationState: AutonomousActionAuthorizationState.NotAuthorized;
  readonly executable: false;
}

export interface AutonomousRuntimeSafetyContract {
  createCandidate(input: AutonomousActionCandidateInput): AutonomousActionCandidate;
}

/**
 * Creates detached action candidates only. It performs no authorization,
 * execution, provider selection, persistence, canonical mutation, or discovery.
 */
export function createAutonomousRuntimeSafetyContract(
  configuration: AutonomousRuntimeSafetyConfiguration,
): AutonomousRuntimeSafetyContract {
  const runtime = validateAndDetachConfiguration(configuration);
  return {
    createCandidate(value) {
      const input = validateAndDetachInput(value, runtime.policy);
      return {
        ...input,
        candidateAuthority: AutonomousActionCandidateAuthority.CandidateOnly,
        authorizationState: AutonomousActionAuthorizationState.NotAuthorized,
        executable: false,
      };
    },
  };
}

function validateAndDetachConfiguration(
  value: AutonomousRuntimeSafetyConfiguration,
): AutonomousRuntimeSafetyConfiguration {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['policy']) || !isValidPolicy(value.policy)) {
    throw invalid();
  }
  return { policy: clonePolicy(value.policy) };
}

function validateAndDetachInput(
  value: AutonomousActionCandidateInput,
  policy: AutonomousRuntimePolicyDescriptor,
): AutonomousActionCandidateInput {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'executionId',
      'actionId',
      'actionKind',
      'targetId',
      'policy',
      'origin',
    ]) ||
    !isNonEmptyString(value.executionId) ||
    !isNonEmptyString(value.actionId) ||
    value.actionKind !== AutonomousActionKind.PrepareOperatorReview ||
    !isNonEmptyString(value.targetId) ||
    !isValidPolicy(value.policy) ||
    value.policy.policyId !== policy.policyId ||
    value.policy.authorityId !== policy.authorityId ||
    !isValidOrigin(value.origin)
  ) {
    throw invalid();
  }
  return {
    executionId: value.executionId,
    actionId: value.actionId,
    actionKind: value.actionKind,
    targetId: value.targetId,
    policy: clonePolicy(value.policy),
    origin: {
      interpretationId: value.origin.interpretationId,
      candidateId: value.origin.candidateId,
    },
  };
}

function isValidPolicy(value: unknown): value is AutonomousRuntimePolicyDescriptor {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ['policyId', 'authorityId']) &&
    isNonEmptyString(value.policyId) &&
    isNonEmptyString(value.authorityId)
  );
}

function isValidOrigin(value: unknown): value is AutonomousActionOrigin {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ['interpretationId', 'candidateId']) &&
    isNonEmptyString(value.interpretationId) &&
    isNonEmptyString(value.candidateId)
  );
}

function clonePolicy(value: AutonomousRuntimePolicyDescriptor): AutonomousRuntimePolicyDescriptor {
  return { policyId: value.policyId, authorityId: value.authorityId };
}

function invalid(): TypeError {
  return new TypeError('Autonomous runtime safety contract input is invalid.');
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
