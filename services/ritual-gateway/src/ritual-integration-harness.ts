import {
  createRitualInferenceSimulation,
  type RitualInferenceExecutionTransport,
  type RitualInferenceRequest,
  type RitualInferenceSimulationResult,
} from './ritual-inference-simulation.js';
import {
  createRitualReadOnlyVerificationAdapter,
  type ReadOnlyRitualRpcTransport,
} from './ritual-read-only-verification.js';
import {
  type RitualNetworkConfiguration,
  type RitualReferenceRegistry,
} from './ritual-network-boundary.js';

export interface RitualActivationPolicy {
  readonly requiredReferences: readonly {
    readonly identifier: string;
    readonly requireCodePresent?: boolean;
  }[];
}
export type RitualActivationStatus = 'blocked' | 'read_only_verified';
export interface RitualActivationReport {
  readonly status: RitualActivationStatus;
  readonly networkStatus: 'verified' | 'mismatch' | 'inconclusive';
  readonly networkId: string;
  readonly requiredReferences: readonly {
    readonly identifier: string;
    readonly status: 'code_present' | 'code_absent' | 'inconclusive' | 'not_checked';
  }[];
  readonly reason?: 'network_not_verified' | 'required_reference_not_satisfied';
  readonly inferenceRequestId?: string;
  readonly inferenceStatus?: 'completed' | 'failed';
  readonly evidenceMode?: 'simulated';
  readonly aiTrustEntry?: 'untrusted_model_execution';
}
export type RitualIntegrationHarnessResult =
  | { readonly activation: RitualActivationReport; readonly inference?: undefined }
  | {
      readonly activation: RitualActivationReport;
      readonly inference: RitualInferenceSimulationResult;
    };
export interface RitualIntegrationHarness {
  run(
    request: RitualInferenceRequest,
    policy: RitualActivationPolicy,
  ): Promise<RitualIntegrationHarnessResult>;
}

export function createRitualIntegrationHarness(
  configuration: RitualNetworkConfiguration,
  registry: RitualReferenceRegistry,
  networkTransport: ReadOnlyRitualRpcTransport,
  inferenceTransport: RitualInferenceExecutionTransport,
): RitualIntegrationHarness {
  const verification = createRitualReadOnlyVerificationAdapter(
    configuration,
    registry,
    networkTransport,
  );
  const simulation = createRitualInferenceSimulation(configuration, registry, inferenceTransport);
  return {
    async run(request, policy) {
      const requirements = validatePolicy(policy);
      const verificationReport = await verification.verify({
        referenceIdentifiers: requirements.map((requirement) => requirement.identifier),
      });
      const referenceResults = requirements.map((requirement) => {
        const found = verificationReport.references.find(
          (reference) => reference.identifier === requirement.identifier,
        );
        return {
          identifier: requirement.identifier,
          status: found?.status ?? ('not_checked' as const),
        };
      });
      if (verificationReport.network.status !== 'verified') {
        return Object.freeze({
          activation: Object.freeze({
            status: 'blocked' as const,
            networkStatus: verificationReport.network.status,
            networkId: verificationReport.network.networkId,
            requiredReferences: Object.freeze(referenceResults),
            reason: 'network_not_verified' as const,
          }),
        });
      }
      const satisfied = requirements.every((requirement) => {
        const found = verificationReport.references.find(
          (reference) => reference.identifier === requirement.identifier,
        );
        return (
          found !== undefined &&
          found.status !== 'inconclusive' &&
          (!requirement.requireCodePresent || found.status === 'code_present')
        );
      });
      if (!satisfied) {
        return Object.freeze({
          activation: Object.freeze({
            status: 'blocked' as const,
            networkStatus: verificationReport.network.status,
            networkId: verificationReport.network.networkId,
            requiredReferences: Object.freeze(referenceResults),
            reason: 'required_reference_not_satisfied' as const,
          }),
        });
      }
      const activation = Object.freeze({
        status: 'read_only_verified' as const,
        networkStatus: 'verified' as const,
        networkId: verificationReport.network.networkId,
        requiredReferences: Object.freeze(referenceResults),
      });
      const inference = await simulation.execute(request);
      return Object.freeze({
        activation: Object.freeze({
          ...activation,
          inferenceRequestId: request.requestId,
          inferenceStatus: inference.status,
          ...(inference.status === 'completed'
            ? {
                evidenceMode: 'simulated' as const,
                aiTrustEntry: 'untrusted_model_execution' as const,
              }
            : {}),
        }),
        inference,
      });
    },
  };
}

function validatePolicy(
  value: RitualActivationPolicy,
): readonly { readonly identifier: string; readonly requireCodePresent?: boolean }[] {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !Array.isArray(value.requiredReferences)
  )
    throw new TypeError('Ritual activation policy is invalid.');
  const seen = new Set<string>();
  return Object.freeze(
    value.requiredReferences.map((requirement) => {
      if (
        requirement === null ||
        typeof requirement !== 'object' ||
        Object.getPrototypeOf(requirement) !== Object.prototype ||
        !hasKeys(requirement, ['identifier'], ['requireCodePresent']) ||
        typeof requirement.identifier !== 'string' ||
        !/^[a-z][a-z0-9_]{1,63}$/.test(requirement.identifier) ||
        (requirement.requireCodePresent !== undefined &&
          typeof requirement.requireCodePresent !== 'boolean') ||
        seen.has(requirement.identifier)
      )
        throw new TypeError('Ritual activation policy is invalid.');
      seen.add(requirement.identifier);
      return Object.freeze({
        identifier: requirement.identifier,
        ...(requirement.requireCodePresent === undefined
          ? {}
          : { requireCodePresent: requirement.requireCodePresent }),
      });
    }),
  );
}
function hasKeys(
  value: object,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}
