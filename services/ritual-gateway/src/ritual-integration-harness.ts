import {
  createRitualInferenceSimulation,
  type RitualInferenceExecutionTransport,
  type RitualInferenceRequest,
  type RitualInferenceSimulationResult,
} from './ritual-inference-simulation.js';
import {
  createRitualReadOnlyVerificationAdapter,
  type ReadOnlyRitualRpcTransport,
  type RitualReadOnlyVerificationReport,
} from './ritual-read-only-verification.js';
import {
  createRitualNetworkConfiguration,
  createRitualReferenceRegistry,
  createRitualRpcRequest,
  validateRitualRpcResponse,
  verifyRitualNetwork,
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
      const activation = assessRitualActivation(
        configuration,
        registry,
        verificationReport,
        policy,
      );
      if (activation.status === 'blocked') return Object.freeze({ activation });
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

/** Pure evidence assessment. This function has no execution or transport capabilities. */
export function assessRitualActivation(
  configuration: RitualNetworkConfiguration,
  registry: RitualReferenceRegistry,
  evidence: unknown,
  policy: RitualActivationPolicy,
): RitualActivationReport {
  const selected = createRitualNetworkConfiguration(configuration);
  const references = createRitualReferenceRegistry({
    networkId: registry.networkId,
    references: registry.references,
  });
  const requirements = validatePolicy(policy);
  const blocked = (): RitualActivationReport =>
    Object.freeze({
      status: 'blocked',
      networkStatus: 'inconclusive',
      networkId: selected.networkId,
      requiredReferences: Object.freeze(
        requirements.map(({ identifier }) =>
          Object.freeze({ identifier, status: 'not_checked' as const }),
        ),
      ),
      reason: 'network_not_verified',
    });
  try {
    // Reuse bounded JSON validation before examining caller-supplied evidence.
    const request = createRitualRpcRequest({ id: 'evidence', method: 'eth_chainId', params: [] });
    const envelope = validateRitualRpcResponse(
      { jsonrpc: '2.0', id: request.id, result: evidence },
      request,
    );
    if (!('result' in envelope)) return blocked();
    const report = envelope.result as RitualReadOnlyVerificationReport;
    if (
      !report ||
      !hasKeys(report, ['network', 'references'], ['reason']) ||
      report.reason !== undefined ||
      references.networkId !== selected.networkId ||
      !Array.isArray(report.references) ||
      report.references.length > 64
    )
      return blocked();
    const network = report.network;
    if (
      !network ||
      !hasKeys(
        network,
        ['status', 'networkId', 'expectedChainId', 'reason'],
        ['observedChainId', 'blockNumber', 'latestBlockHash', 'latestBlockTimestamp'],
      ) ||
      network.networkId !== selected.networkId ||
      network.expectedChainId !== selected.chainId
    )
      return blocked();
    const checked = verifyRitualNetwork({
      configuration: selected,
      observed: {
        ...(network.observedChainId === undefined ? {} : { chainId: network.observedChainId }),
        ...(network.blockNumber === undefined ? {} : { blockNumber: network.blockNumber }),
        ...(network.latestBlockHash === undefined
          ? {}
          : { latestBlockHash: network.latestBlockHash }),
        ...(network.latestBlockTimestamp === undefined
          ? {}
          : { latestBlockTimestamp: network.latestBlockTimestamp }),
      },
    });
    if (checked.status !== network.status || checked.reason !== network.reason) return blocked();
    if (network.status !== 'verified')
      return Object.freeze({ ...blocked(), networkStatus: network.status });
    if (network.latestBlockHash === undefined || network.latestBlockTimestamp === undefined)
      return blocked();
    const seen = new Set<string>();
    for (const reference of report.references) {
      if (
        !reference ||
        !hasKeys(
          reference,
          ['networkId', 'chainId', 'blockNumber', 'identifier', 'category', 'address', 'status'],
          ['codeLength', 'reason'],
        ) ||
        seen.has(reference.identifier) ||
        reference.networkId !== selected.networkId ||
        reference.chainId !== selected.chainId ||
        reference.blockNumber !== network.blockNumber
      )
        return blocked();
      seen.add(reference.identifier);
      const expected = references.lookup(reference.identifier);
      if (!expected) {
        if (
          reference.status !== 'inconclusive' ||
          reference.reason !== 'reference_missing' ||
          reference.address !== '' ||
          reference.category !== 'system_contract' ||
          reference.codeLength !== undefined
        )
          return blocked();
        continue;
      }
      if (reference.address !== expected.address || reference.category !== expected.category)
        return blocked();
      if (reference.status === 'inconclusive') {
        if (
          !['transport_failure', 'response_invalid'].includes(reference.reason ?? '') ||
          reference.codeLength !== undefined
        )
          return blocked();
      } else if (reference.status === 'code_present' || reference.status === 'code_absent') {
        if (
          reference.reason !== undefined ||
          !Number.isSafeInteger(reference.codeLength) ||
          (reference.codeLength ?? -1) < 0 ||
          (reference.codeLength ?? 0) > 8191 ||
          (reference.status === 'code_present'
            ? reference.codeLength === 0
            : reference.codeLength !== 0)
        )
          return blocked();
      } else return blocked();
    }
    const results = Object.freeze(
      requirements.map(({ identifier }) =>
        Object.freeze({
          identifier,
          status:
            report.references.find((reference) => reference.identifier === identifier)?.status ??
            ('not_checked' as const),
        }),
      ),
    );
    const satisfied = requirements.every((requirement) => {
      const found = report.references.find(
        (reference) => reference.identifier === requirement.identifier,
      );
      return (
        found !== undefined &&
        found.status !== 'inconclusive' &&
        (!requirement.requireCodePresent || found.status === 'code_present')
      );
    });
    return Object.freeze({
      status: satisfied ? 'read_only_verified' : 'blocked',
      networkStatus: 'verified',
      networkId: selected.networkId,
      requiredReferences: results,
      ...(satisfied ? {} : { reason: 'required_reference_not_satisfied' as const }),
    });
  } catch {
    return blocked();
  }
}

function validatePolicy(
  value: RitualActivationPolicy,
): readonly { readonly identifier: string; readonly requireCodePresent?: boolean }[] {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !hasKeys(value, ['requiredReferences']) ||
    !Array.isArray(value.requiredReferences) ||
    value.requiredReferences.length > 64
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
