import {
  type BoundedActionAuthorizer,
  type BoundedActionExecutionCapability,
  type BoundedActionExecutionFailureKind,
  type BoundedActionExecutionGuardrailConfiguration,
  type BoundedActionIdentity,
  createBoundedActionExecutionGuardrail,
} from './bounded-action-execution-guardrail.js';
import {
  type AutonomousActionCandidateInput,
  createAutonomousRuntimeSafetyContract,
} from './runtime-safety-contract.js';

export type ControlledAutonomousRuntimeConfiguration = BoundedActionExecutionGuardrailConfiguration;

export interface ControlledAutonomousRuntimeRequest {
  readonly runtimeOperationId: string;
  readonly candidate: AutonomousActionCandidateInput;
}

export type ControlledAutonomousRuntimeResult =
  | (BoundedActionIdentity & {
      readonly runtimeOperationId: string;
      readonly status: 'completed';
      readonly output: string;
    })
  | (BoundedActionIdentity & {
      readonly runtimeOperationId: string;
      readonly status: 'failed';
      readonly failureKind: BoundedActionExecutionFailureKind;
    });

export interface ControlledAutonomousRuntime {
  run(request: ControlledAutonomousRuntimeRequest): Promise<ControlledAutonomousRuntimeResult>;
}

/**
 * Creates an explicitly started, single-candidate runtime that delegates all
 * authorization and execution decisions to the existing bounded guardrail.
 */
export function createControlledAutonomousRuntime(
  configuration: ControlledAutonomousRuntimeConfiguration,
  authorize: BoundedActionAuthorizer,
  execute: BoundedActionExecutionCapability,
): ControlledAutonomousRuntime {
  const candidateContract = createAutonomousRuntimeSafetyContract({
    policy: configuration.policy,
  });
  const guardrail = createBoundedActionExecutionGuardrail(configuration, authorize, execute);

  return {
    async run(value) {
      const request = validateAndDetachRequest(value);
      let candidate;
      try {
        candidate = candidateContract.createCandidate(request.candidate);
      } catch {
        throw invalidRequest();
      }
      const result = await guardrail.execute(candidate);
      if (result.status === 'completed') {
        return {
          runtimeOperationId: request.runtimeOperationId,
          status: 'completed',
          ...identityFrom(result),
          output: result.output,
        };
      }
      return {
        runtimeOperationId: request.runtimeOperationId,
        status: 'failed',
        ...identityFrom(result),
        failureKind: result.failureKind,
      };
    },
  };
}

function validateAndDetachRequest(
  value: ControlledAutonomousRuntimeRequest,
): ControlledAutonomousRuntimeRequest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['runtimeOperationId', 'candidate']) ||
    !isNonEmptyString(value.runtimeOperationId) ||
    !isPlainRecord(value.candidate)
  ) {
    throw invalidRequest();
  }
  return {
    runtimeOperationId: value.runtimeOperationId,
    candidate: clone(value.candidate),
  };
}

function identityFrom(value: BoundedActionIdentity): BoundedActionIdentity {
  return {
    executionId: value.executionId,
    actionId: value.actionId,
    actionKind: value.actionKind,
    targetId: value.targetId,
    policyId: value.policyId,
    authorityId: value.authorityId,
    interpretationId: value.interpretationId,
    candidateId: value.candidateId,
  };
}

function invalidRequest(): TypeError {
  return new TypeError('Controlled autonomous runtime request is invalid.');
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
