import {
  createRitualRpcRequest,
  type RitualContractReference,
  type RitualNetworkConfiguration,
  type RitualNetworkVerificationResult,
  type RitualReferenceRegistry,
  type RitualRpcRequest,
  validateRitualRpcResponse,
  verifyRitualNetwork,
} from './ritual-network-boundary.js';

export type ReadOnlyRitualRpcTransport = (request: RitualRpcRequest) => Promise<unknown>;

export type RitualReferenceProbeStatus = 'code_present' | 'code_absent' | 'inconclusive';
export interface RitualReferenceProbeResult {
  readonly identifier: string;
  readonly category: RitualContractReference['category'];
  readonly address: string;
  readonly status: RitualReferenceProbeStatus;
  readonly codeLength?: number;
  readonly reason?: 'transport_failure' | 'response_invalid' | 'reference_missing';
}

export interface RitualReadOnlyVerificationReport {
  readonly network: RitualNetworkVerificationResult;
  readonly references: readonly RitualReferenceProbeResult[];
  readonly reason?: 'transport_failure' | 'response_invalid' | 'registry_network_mismatch';
}

export interface RitualReadOnlyVerificationAdapter {
  verify(options?: {
    readonly referenceIdentifiers?: readonly string[];
  }): Promise<RitualReadOnlyVerificationReport>;
}

export function createRitualReadOnlyVerificationAdapter(
  configuration: RitualNetworkConfiguration,
  registry: RitualReferenceRegistry,
  transport: ReadOnlyRitualRpcTransport,
): RitualReadOnlyVerificationAdapter {
  if (typeof transport !== 'function')
    throw new TypeError('Ritual read-only transport is invalid.');
  if (registry.networkId !== configuration.networkId)
    throw new TypeError('Ritual registry network does not match configuration.');
  const selectedConfiguration = createDetachedConfiguration(configuration);
  return {
    async verify(options = {}) {
      const identifiers = validateIdentifiers(options.referenceIdentifiers ?? []);
      const network = await probeNetwork(selectedConfiguration, transport);
      if (network.report.status !== 'verified')
        return freeze({
          network: network.report,
          references: [],
          ...(network.reason === undefined ? {} : { reason: network.reason }),
        });
      const references = await probeReferences(registry, identifiers, transport);
      return freeze({ network: network.report, references: freeze(references) });
    },
  };
}

async function probeNetwork(
  configuration: RitualNetworkConfiguration,
  transport: ReadOnlyRitualRpcTransport,
): Promise<{
  readonly report: RitualNetworkVerificationResult;
  readonly reason?: 'transport_failure' | 'response_invalid';
}> {
  const chain = await call(
    transport,
    createRitualRpcRequest({ id: 'ritual-network-chain-id', method: 'eth_chainId', params: [] }),
  );
  if (!chain.ok) return { report: inconclusive(configuration), reason: chain.reason };
  const chainId = quantity(chain.value.result);
  if (chainId === undefined)
    return { report: inconclusive(configuration), reason: 'response_invalid' };
  if (chainId !== configuration.chainId)
    return { report: verifyRitualNetwork({ configuration, observed: { chainId } }) };

  const block = await call(
    transport,
    createRitualRpcRequest({
      id: 'ritual-network-block-number',
      method: 'eth_blockNumber',
      params: [],
    }),
  );
  if (!block.ok) return { report: inconclusive(configuration), reason: block.reason };
  const blockNumber = quantity(block.value.result);
  if (blockNumber === undefined || blockNumber <= 0)
    return { report: inconclusive(configuration), reason: 'response_invalid' };

  const latest = await call(
    transport,
    createRitualRpcRequest({
      id: 'ritual-network-latest-block',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
    }),
  );
  if (!latest.ok) return { report: inconclusive(configuration), reason: latest.reason };
  const blockEvidence = parseLatestBlock(latest.value.result);
  if (blockEvidence === undefined)
    return { report: inconclusive(configuration), reason: 'response_invalid' };
  return {
    report: verifyRitualNetwork({
      configuration,
      observed: { chainId, blockNumber, ...blockEvidence },
    }),
  };
}

async function probeReferences(
  registry: RitualReferenceRegistry,
  identifiers: readonly string[],
  transport: ReadOnlyRitualRpcTransport,
): Promise<RitualReferenceProbeResult[]> {
  const results: RitualReferenceProbeResult[] = [];
  for (const identifier of identifiers) {
    const reference = registry.lookup(identifier);
    if (reference === undefined) {
      results.push({
        identifier,
        category: 'system_contract',
        address: '',
        status: 'inconclusive',
        reason: 'reference_missing',
      });
      continue;
    }
    const response = await call(
      transport,
      createRitualRpcRequest({
        id: `ritual-code-${identifier}`,
        method: 'eth_getCode',
        params: [reference.address, 'latest'],
      }),
    );
    if (!response.ok) {
      results.push({ ...reference, status: 'inconclusive', reason: response.reason });
      continue;
    }
    const code = response.value.result;
    if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) {
      results.push({ ...reference, status: 'inconclusive', reason: 'response_invalid' });
    } else if (code === '0x') {
      results.push({ ...reference, status: 'code_absent', codeLength: 0 });
    } else {
      results.push({ ...reference, status: 'code_present', codeLength: (code.length - 2) / 2 });
    }
  }
  return results;
}

async function call(
  transport: ReadOnlyRitualRpcTransport,
  request: RitualRpcRequest,
): Promise<
  | {
      readonly ok: true;
      readonly value: Extract<
        ReturnType<typeof validateRitualRpcResponse>,
        { readonly result: unknown }
      >;
    }
  | { readonly ok: false; readonly reason: 'transport_failure' | 'response_invalid' }
> {
  try {
    const raw = await transport(request);
    const value = validateRitualRpcResponse(raw, request);
    if ('error' in value) return { ok: false, reason: 'response_invalid' };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: 'transport_failure' };
  }
}

function parseLatestBlock(
  value: unknown,
): { readonly latestBlockHash: string; readonly latestBlockTimestamp: number } | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !['hash', 'timestamp'].includes(key)) ||
    typeof record.hash !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(record.hash)
  )
    return undefined;
  const timestamp = quantity(record.timestamp);
  return timestamp === undefined
    ? undefined
    : { latestBlockHash: record.hash.toLowerCase(), latestBlockTimestamp: timestamp };
}

function quantity(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value))
    return undefined;
  try {
    const number = Number(BigInt(value));
    return Number.isSafeInteger(number) ? number : undefined;
  } catch {
    return undefined;
  }
}

function inconclusive(configuration: RitualNetworkConfiguration): RitualNetworkVerificationResult {
  return {
    status: 'inconclusive',
    networkId: configuration.networkId,
    expectedChainId: configuration.chainId,
    reason: 'insufficient_evidence',
  };
}
function createDetachedConfiguration(
  value: RitualNetworkConfiguration,
): RitualNetworkConfiguration {
  return Object.freeze({ ...value });
}
function validateIdentifiers(value: readonly string[]): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (identifier) => typeof identifier !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(identifier),
    )
  )
    throw new TypeError('Ritual reference selection is invalid.');
  return Object.freeze([...value]);
}
function freeze<T>(value: T): T {
  return Object.freeze(value);
}
