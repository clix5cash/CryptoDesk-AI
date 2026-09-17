/** Offline, explicit Ritual network and execution evidence contracts. */

export interface RitualNetworkConfiguration {
  readonly networkId: string;
  readonly chainId: number;
  readonly httpRpcUrl: string;
  readonly wsRpcUrl?: string;
  readonly explorerBaseUrl: string;
  readonly nativeCurrencySymbol: string;
}

export function createRitualNetworkConfiguration(
  value: RitualNetworkConfiguration,
): RitualNetworkConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasKeys(
      value,
      ['networkId', 'chainId', 'httpRpcUrl', 'explorerBaseUrl', 'nativeCurrencySymbol'],
      ['wsRpcUrl'],
    ) ||
    !isBoundedString(value.networkId, 1, 80) ||
    !Number.isSafeInteger(value.chainId) ||
    value.chainId <= 0 ||
    !isUrl(value.httpRpcUrl, 'https:') ||
    (value.wsRpcUrl !== undefined && !isUrl(value.wsRpcUrl, 'wss:')) ||
    !isUrl(value.explorerBaseUrl, 'https:') ||
    !/^[A-Z][A-Z0-9]{1,11}$/.test(value.nativeCurrencySymbol)
  )
    throw new TypeError('Ritual network configuration is invalid.');
  return freeze({ ...value });
}

export type RitualReferenceCategory = 'precompile' | 'system_contract';
export interface RitualContractReference {
  readonly identifier: string;
  readonly category: RitualReferenceCategory;
  readonly address: string;
}
export interface RitualReferenceRegistry {
  readonly networkId: string;
  readonly references: readonly RitualContractReference[];
  lookup(identifier: string): RitualContractReference | undefined;
}

export function createRitualReferenceRegistry(input: {
  readonly networkId: string;
  readonly references: readonly RitualContractReference[];
}): RitualReferenceRegistry {
  if (
    !isPlainRecord(input) ||
    !hasKeys(input, ['networkId', 'references']) ||
    !isBoundedString(input.networkId, 1, 80) ||
    !Array.isArray(input.references)
  ) {
    throw new TypeError('Ritual reference registry is invalid.');
  }
  const seen = new Set<string>();
  const references = input.references.map((reference) => {
    if (
      !isPlainRecord(reference) ||
      !hasKeys(reference, ['identifier', 'category', 'address']) ||
      !isIdentifier(reference.identifier) ||
      !isReferenceCategory(reference.category) ||
      !isAddress(reference.address) ||
      seen.has(reference.identifier)
    ) {
      throw new TypeError('Ritual contract reference is invalid.');
    }
    seen.add(reference.identifier);
    return freeze({
      identifier: reference.identifier,
      category: reference.category,
      address: reference.address.toLowerCase(),
    });
  });
  const detached = freeze(references);
  return freeze({
    networkId: input.networkId,
    references: detached,
    lookup(identifier: string) {
      const found = detached.find((reference) => reference.identifier === identifier);
      return found === undefined ? undefined : freeze({ ...found });
    },
  });
}

export type RitualRpcMethod =
  'eth_chainId' | 'eth_blockNumber' | 'eth_getBlockByNumber' | 'eth_getCode';
export interface RitualRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: string;
  readonly method: RitualRpcMethod;
  readonly params: readonly unknown[];
}
export function createRitualRpcRequest(input: {
  readonly id: string;
  readonly method: RitualRpcMethod;
  readonly params: readonly unknown[];
}): RitualRpcRequest {
  if (
    !isPlainRecord(input) ||
    !hasKeys(input, ['id', 'method', 'params']) ||
    !isBoundedString(input.id, 1, 120) ||
    !['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode'].includes(
      input.method,
    ) ||
    !Array.isArray(input.params) ||
    input.params.length > 8 ||
    !isJsonValue(input.params)
  ) {
    throw new TypeError('Ritual RPC request is invalid.');
  }
  return freeze({
    jsonrpc: '2.0',
    id: input.id,
    method: input.method,
    params: freeze(input.params.map((param) => detachJson(param))),
  });
}

export type RitualRpcResponse =
  | { readonly jsonrpc: '2.0'; readonly id: string; readonly result: unknown }
  | { readonly jsonrpc: '2.0'; readonly id: string; readonly error: { readonly code: number } };

export function validateRitualRpcResponse(
  value: unknown,
  request: RitualRpcRequest,
): RitualRpcResponse {
  if (!isPlainRecord(value) || value.jsonrpc !== '2.0' || value.id !== request.id)
    throw new TypeError('Ritual RPC response is invalid.');
  if (hasKeys(value, ['jsonrpc', 'id', 'result']) && isJsonValue(value.result))
    return freeze({ jsonrpc: '2.0', id: request.id, result: detachJson(value.result) });
  if (
    hasKeys(value, ['jsonrpc', 'id', 'error']) &&
    isPlainRecord(value.error) &&
    isSafeInteger(value.error.code)
  )
    return freeze({ jsonrpc: '2.0', id: request.id, error: { code: value.error.code } });
  throw new TypeError('Ritual RPC response is invalid.');
}

export type RitualNetworkVerificationStatus = 'verified' | 'inconclusive' | 'mismatch';
export interface RitualNetworkVerificationResult {
  readonly status: RitualNetworkVerificationStatus;
  readonly networkId: string;
  readonly expectedChainId: number;
  readonly observedChainId?: number;
  readonly blockNumber?: number;
  readonly latestBlockHash?: string;
  readonly latestBlockTimestamp?: number;
  readonly reason: 'chain_match_and_block_observed' | 'chain_id_mismatch' | 'insufficient_evidence';
}
export function verifyRitualNetwork(input: {
  readonly configuration: RitualNetworkConfiguration;
  readonly observed: {
    readonly chainId?: number;
    readonly blockNumber?: number;
    readonly latestBlockHash?: string;
    readonly latestBlockTimestamp?: number;
  };
}): RitualNetworkVerificationResult {
  const configuration = createRitualNetworkConfiguration(input.configuration);
  const observed = input.observed;
  if (
    !isPlainRecord(observed) ||
    !hasKeys(observed, [], ['chainId', 'blockNumber', 'latestBlockHash', 'latestBlockTimestamp']) ||
    (observed.chainId !== undefined &&
      (!Number.isSafeInteger(observed.chainId) || observed.chainId <= 0)) ||
    (observed.blockNumber !== undefined &&
      (!Number.isSafeInteger(observed.blockNumber) || observed.blockNumber <= 0)) ||
    (observed.latestBlockHash !== undefined && !isHash(observed.latestBlockHash)) ||
    (observed.latestBlockTimestamp !== undefined &&
      (!Number.isSafeInteger(observed.latestBlockTimestamp) || observed.latestBlockTimestamp < 0))
  )
    throw new TypeError('Ritual network evidence is invalid.');
  const base = {
    networkId: configuration.networkId,
    expectedChainId: configuration.chainId,
    ...(observed.chainId === undefined ? {} : { observedChainId: observed.chainId }),
    ...(observed.blockNumber === undefined ? {} : { blockNumber: observed.blockNumber }),
    ...(observed.latestBlockHash === undefined
      ? {}
      : { latestBlockHash: observed.latestBlockHash.toLowerCase() }),
    ...(observed.latestBlockTimestamp === undefined
      ? {}
      : { latestBlockTimestamp: observed.latestBlockTimestamp }),
  };
  if (observed.chainId !== undefined && observed.chainId !== configuration.chainId)
    return freeze({ ...base, status: 'mismatch', reason: 'chain_id_mismatch' });
  if (observed.chainId === configuration.chainId && observed.blockNumber !== undefined)
    return freeze({ ...base, status: 'verified', reason: 'chain_match_and_block_observed' });
  return freeze({ ...base, status: 'inconclusive', reason: 'insufficient_evidence' });
}

export interface RitualExecutionEvidence {
  readonly networkId: string;
  readonly chainId: number;
  readonly referenceIdentifier: string;
  readonly transactionHash?: string;
  readonly requestId?: string;
  readonly jobId?: string;
  readonly blockNumber?: number;
  readonly inputHash?: string;
  readonly outputHash?: string;
  readonly receiptStatus?: 'success' | 'failure' | 'unknown';
  readonly observedAt?: string;
  readonly explorerUrl?: string;
  readonly mode?: 'simulated' | 'live';
}
export function createRitualExecutionEvidence(
  value: RitualExecutionEvidence,
): RitualExecutionEvidence {
  if (
    !isPlainRecord(value) ||
    !hasKeys(
      value,
      ['networkId', 'chainId', 'referenceIdentifier'],
      [
        'transactionHash',
        'requestId',
        'jobId',
        'blockNumber',
        'inputHash',
        'outputHash',
        'receiptStatus',
        'observedAt',
        'explorerUrl',
        'mode',
      ],
    ) ||
    !isBoundedString(value.networkId, 1, 80) ||
    !Number.isSafeInteger(value.chainId) ||
    value.chainId <= 0 ||
    !isIdentifier(value.referenceIdentifier) ||
    !optionalString(value.transactionHash, isHash) ||
    !optionalString(value.inputHash, isHash) ||
    !optionalString(value.outputHash, isHash) ||
    !optionalString(value.requestId, (v) => isBoundedString(v, 1, 120)) ||
    !optionalString(value.jobId, (v) => isBoundedString(v, 1, 120)) ||
    (value.blockNumber !== undefined &&
      (!Number.isSafeInteger(value.blockNumber) || value.blockNumber <= 0)) ||
    (value.receiptStatus !== undefined &&
      !['success', 'failure', 'unknown'].includes(value.receiptStatus)) ||
    !optionalString(value.observedAt, (v) => isBoundedString(v, 1, 80)) ||
    !optionalString(value.explorerUrl, (v) => isUrl(v, 'https:')) ||
    (value.mode !== undefined && value.mode !== 'simulated' && value.mode !== 'live')
  )
    throw new TypeError('Ritual execution evidence is invalid.');
  return freeze({ ...value });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
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
function isBoundedString(value: unknown, min: number, max: number): value is string {
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
function isReferenceCategory(value: unknown): value is RitualReferenceCategory {
  return value === 'precompile' || value === 'system_contract';
}
function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
function isAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}
function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}
function isUrl(value: unknown, protocol: string): value is string {
  try {
    const url = new URL(String(value));
    return (
      url.protocol === protocol &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}
function optionalString(value: unknown, predicate: (value: string) => boolean): boolean {
  return value === undefined || (typeof value === 'string' && predicate(value));
}
function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return typeof value !== 'number' || Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 16_384;
  if (Array.isArray(value)) return value.length <= 64 && value.every(isJsonValue);
  return (
    isPlainRecord(value) &&
    Object.keys(value).length <= 64 &&
    Object.values(value).every(isJsonValue)
  );
}
function detachJson<T>(value: T): T {
  return structuredClone(value);
}
function freeze<T>(value: T): T {
  return Object.freeze(value);
}
