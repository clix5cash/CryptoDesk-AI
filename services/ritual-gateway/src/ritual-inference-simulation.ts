import {
  AiExecutionStatus,
  PortfolioAiRawExecutionAuthority,
  type PortfolioAiModelExecutionResult,
} from '@cryptodesk-ai/ai';
import {
  createRitualExecutionEvidence,
  createRitualNetworkConfiguration,
  type RitualContractReference,
  type RitualExecutionEvidence,
  type RitualNetworkConfiguration,
  type RitualReferenceRegistry,
} from './ritual-network-boundary.js';

export interface RitualInferenceRequest {
  readonly networkId: string;
  readonly targetIdentifier: string;
  readonly requestId: string;
  readonly input: string;
  readonly modelId?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}
export interface RitualPreparedInferenceRequest {
  readonly requestId: string;
  readonly networkId: string;
  readonly chainId: number;
  readonly targetIdentifier: string;
  readonly targetAddress: string;
  readonly input: string;
  readonly modelId?: string;
  readonly requestHash: string;
}
export type RitualInferenceExecutionTransport = (
  request: RitualPreparedInferenceRequest,
) => Promise<unknown>;
export type RitualInferenceSimulationResult =
  | {
      readonly status: 'completed';
      readonly prepared: RitualPreparedInferenceRequest;
      readonly evidence: RitualExecutionEvidence;
      readonly aiResult: PortfolioAiModelExecutionResult;
    }
  | {
      readonly status: 'failed';
      readonly prepared?: RitualPreparedInferenceRequest;
      readonly reason: 'target_missing' | 'transport_failure' | 'result_invalid';
    };
export interface RitualInferenceSimulation {
  execute(request: RitualInferenceRequest): Promise<RitualInferenceSimulationResult>;
}

export function createRitualInferenceSimulation(
  configuration: RitualNetworkConfiguration,
  registry: RitualReferenceRegistry,
  transport: RitualInferenceExecutionTransport,
): RitualInferenceSimulation {
  if (typeof transport !== 'function')
    throw new TypeError('Ritual inference execution transport is invalid.');
  const network = createRitualNetworkConfiguration(configuration);
  if (registry.networkId !== network.networkId)
    throw new TypeError('Ritual registry network does not match configuration.');
  return {
    async execute(value) {
      const request = validateRequest(value, network);
      const reference = registry.lookup(request.targetIdentifier);
      if (reference === undefined) return { status: 'failed', reason: 'target_missing' };
      const prepared = prepare(request, network, reference);
      let raw: unknown;
      try {
        raw = await transport(Object.freeze({ ...prepared }));
      } catch {
        return { status: 'failed', prepared, reason: 'transport_failure' };
      }
      const result = normalizeResult(raw, request);
      if (result === undefined || result.status === 'failed')
        return { status: 'failed', prepared, reason: 'result_invalid' };
      const evidence = createRitualExecutionEvidence({
        networkId: network.networkId,
        chainId: network.chainId,
        referenceIdentifier: reference.identifier,
        requestId: request.requestId,
        receiptStatus: 'unknown',
        mode: 'simulated',
        ...(result.transactionHash === undefined
          ? {}
          : { transactionHash: result.transactionHash }),
        ...(result.blockNumber === undefined ? {} : { blockNumber: result.blockNumber }),
        ...(result.jobId === undefined ? {} : { jobId: result.jobId }),
        ...(result.observedAt === undefined ? {} : { observedAt: result.observedAt }),
      });
      const aiResult: PortfolioAiModelExecutionResult = Object.freeze({
        executionId: request.requestId,
        status: AiExecutionStatus.Completed,
        authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
        output: result.output,
        ...(request.modelId === undefined
          ? {}
          : { model: { providerId: 'ritual', modelId: request.modelId } }),
      });
      return Object.freeze({ status: 'completed', prepared, evidence, aiResult });
    },
  };
}

function validateRequest(
  value: RitualInferenceRequest,
  network: RitualNetworkConfiguration,
): RitualInferenceRequest {
  if (
    !isPlain(value) ||
    !hasKeys(
      value,
      ['networkId', 'targetIdentifier', 'requestId', 'input'],
      ['modelId', 'metadata'],
    ) ||
    value.networkId !== network.networkId ||
    !isIdentifier(value.targetIdentifier) ||
    !bounded(value.requestId, 1, 120) ||
    !bounded(value.input, 1, 8192) ||
    (value.modelId !== undefined && !bounded(value.modelId, 1, 120)) ||
    (value.metadata !== undefined &&
      (!isPlain(value.metadata) ||
        Object.keys(value.metadata).length > 8 ||
        Object.values(value.metadata).some((entry) => !bounded(entry, 1, 256))))
  )
    throw new TypeError('Ritual inference request is invalid.');
  return Object.freeze({
    ...value,
    ...(value.metadata === undefined ? {} : { metadata: Object.freeze({ ...value.metadata }) }),
  });
}

function prepare(
  request: RitualInferenceRequest,
  network: RitualNetworkConfiguration,
  reference: RitualContractReference,
): RitualPreparedInferenceRequest {
  const body = JSON.stringify({
    networkId: network.networkId,
    chainId: network.chainId,
    target: reference.identifier,
    address: reference.address,
    requestId: request.requestId,
    input: request.input,
    modelId: request.modelId ?? null,
  });
  return Object.freeze({
    requestId: request.requestId,
    networkId: network.networkId,
    chainId: network.chainId,
    targetIdentifier: reference.identifier,
    targetAddress: reference.address,
    input: request.input,
    ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
    requestHash: fnv(body),
  });
}

function normalizeResult(
  value: unknown,
  request: RitualInferenceRequest,
):
  | {
      readonly status: 'completed';
      readonly output: string;
      readonly transactionHash?: string;
      readonly blockNumber?: number;
      readonly jobId?: string;
      readonly observedAt?: string;
    }
  | { readonly status: 'failed' }
  | undefined {
  if (
    !isPlain(value) ||
    !hasKeys(
      value,
      ['requestId', 'status'],
      ['output', 'failure', 'transactionHash', 'blockNumber', 'jobId', 'observedAt'],
    ) ||
    value.requestId !== request.requestId ||
    (value.status !== 'completed' && value.status !== 'failed')
  )
    return undefined;
  if (
    value.status === 'completed' &&
    typeof value.output === 'string' &&
    bounded(value.output, 1, 16_384) &&
    optionalHash(value.transactionHash) &&
    optionalPositive(value.blockNumber) &&
    optionalBounded(value.jobId, 1, 120) &&
    optionalBounded(value.observedAt, 1, 80) &&
    value.failure === undefined
  )
    return {
      status: 'completed',
      output: value.output,
      ...(value.transactionHash === undefined ? {} : { transactionHash: value.transactionHash }),
      ...(value.blockNumber === undefined ? {} : { blockNumber: value.blockNumber }),
      ...(value.jobId === undefined ? {} : { jobId: value.jobId }),
      ...(value.observedAt === undefined ? {} : { observedAt: value.observedAt }),
    };
  if (
    value.status === 'failed' &&
    value.output === undefined &&
    isPlain(value.failure) &&
    typeof value.failure.code === 'string' &&
    bounded(value.failure.code, 1, 64) &&
    typeof value.failure.message === 'string' &&
    bounded(value.failure.message, 1, 256)
  )
    return { status: 'failed' };
  return undefined;
}

function fnv(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `0x${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function isPlain(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
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
function bounded(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= min &&
    value.length <= max &&
    value.trim() === value
  );
}
function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{1,63}$/.test(value);
}
function optionalHash(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value));
}
function optionalPositive(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
  );
}
function optionalBounded(value: unknown, min: number, max: number): value is string | undefined {
  return value === undefined || bounded(value, min, max);
}
