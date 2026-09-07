const RITUAL_CHAIN_ID = 1979;
const JSON_RPC_VERSION = '2.0';
const CHAIN_ID_METHOD = 'eth_chainId';
const CHAIN_ID_REQUEST_ID = 'cryptodesk-ritual-chain-id';
const MAX_RESPONSE_BYTES = 16_384;
const TIMEOUT = Symbol('ritual-rpc-timeout');

/** Explicit, instance-owned configuration for the read-only Ritual RPC probe. */
export interface RitualLiveRpcConfiguration {
  readonly endpoint: string;
  readonly expectedChainId: typeof RITUAL_CHAIN_ID;
  readonly timeoutMs?: number;
}

export enum RitualRpcConnectivityFailureKind {
  TransportFailure = 'transport_failure',
  Timeout = 'timeout',
  ResponseInvalid = 'response_invalid',
  RpcFailure = 'rpc_failure',
  ChainMismatch = 'chain_mismatch',
}

export type RitualRpcConnectivityResult =
  | { readonly status: 'connected'; readonly chainId: typeof RITUAL_CHAIN_ID }
  | {
      readonly status: 'failed';
      readonly failureKind: RitualRpcConnectivityFailureKind;
    };

export interface RitualRpcConnectivityChecker {
  /** Performs exactly one read-only `eth_chainId` JSON-RPC request. */
  check(): Promise<RitualRpcConnectivityResult>;
}

interface RitualHttpRequest {
  readonly endpoint: string;
  readonly body: string;
  readonly signal: AbortSignal;
}

interface RitualHttpResponse {
  readonly ok: boolean;
  readonly body: ReadableStream<Uint8Array> | null;
}

type RitualHttpTransport = (request: RitualHttpRequest) => Promise<RitualHttpResponse>;

/**
 * Creates the supported live, read-only Ritual connectivity boundary.
 * It does not perform inference, submit transactions, or discover configuration.
 */
export function createRitualLiveRpcConnectivityChecker(
  configuration: RitualLiveRpcConfiguration,
): RitualRpcConnectivityChecker {
  return createRitualLiveRpcConnectivityCheckerWithTransport(configuration, fetchTransport);
}

/** Gateway-internal deterministic transport seam used by focused tests. */
export function createRitualLiveRpcConnectivityCheckerWithTransport(
  configuration: RitualLiveRpcConfiguration,
  transport: RitualHttpTransport,
): RitualRpcConnectivityChecker {
  const runtime = validateAndDetachConfiguration(configuration);
  if (typeof transport !== 'function') {
    throw new TypeError('Ritual RPC transport is invalid.');
  }

  return {
    async check() {
      return checkConnectivity(runtime, transport);
    },
  };
}

async function checkConnectivity(
  runtime: RitualLiveRpcConfiguration,
  transport: RitualHttpTransport,
): Promise<RitualRpcConnectivityResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const request: RitualHttpRequest = {
      endpoint: runtime.endpoint,
      body: JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id: CHAIN_ID_REQUEST_ID,
        method: CHAIN_ID_METHOD,
        params: [],
      }),
      signal: controller.signal,
    };
    const operation = executeRpcAttempt(transport, request, runtime.expectedChainId);
    return runtime.timeoutMs === undefined
      ? await operation
      : await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              controller.abort();
              reject(TIMEOUT);
            }, runtime.timeoutMs);
          }),
        ]);
  } catch (error) {
    return failed(
      error === TIMEOUT
        ? RitualRpcConnectivityFailureKind.Timeout
        : RitualRpcConnectivityFailureKind.TransportFailure,
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function executeRpcAttempt(
  transport: RitualHttpTransport,
  request: RitualHttpRequest,
  expectedChainId: typeof RITUAL_CHAIN_ID,
): Promise<RitualRpcConnectivityResult> {
  const response = await invokeTransport(transport, request);
  if (!response.ok) {
    cancelBody(response.body);
    return failed(RitualRpcConnectivityFailureKind.RpcFailure);
  }
  const body = await readBoundedBody(response.body);
  return body === undefined
    ? failed(RitualRpcConnectivityFailureKind.ResponseInvalid)
    : decodeChainIdResponse(body, expectedChainId);
}

async function invokeTransport(
  transport: RitualHttpTransport,
  request: RitualHttpRequest,
): Promise<RitualHttpResponse> {
  const response = await transport({ ...request });
  if (
    response === null ||
    typeof response !== 'object' ||
    typeof response.ok !== 'boolean' ||
    (response.body !== null && !(response.body instanceof ReadableStream))
  ) {
    throw new TypeError('Ritual RPC response is invalid.');
  }
  return { ok: response.ok, body: response.body };
}

async function fetchTransport(request: RitualHttpRequest): Promise<RitualHttpResponse> {
  return fetch(request.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: request.body,
    signal: request.signal,
    redirect: 'error',
  });
}

function decodeChainIdResponse(
  body: string,
  expectedChainId: typeof RITUAL_CHAIN_ID,
): RitualRpcConnectivityResult {
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    return failed(RitualRpcConnectivityFailureKind.ResponseInvalid);
  }

  if (
    !isPlainRecord(value) ||
    value.jsonrpc !== JSON_RPC_VERSION ||
    value.id !== CHAIN_ID_REQUEST_ID
  ) {
    return failed(RitualRpcConnectivityFailureKind.ResponseInvalid);
  }

  if (hasExactKeys(value, ['jsonrpc', 'id', 'error'])) {
    return isJsonRpcError(value.error)
      ? failed(RitualRpcConnectivityFailureKind.RpcFailure)
      : failed(RitualRpcConnectivityFailureKind.ResponseInvalid);
  }

  if (!hasExactKeys(value, ['jsonrpc', 'id', 'result']) || !isJsonRpcQuantity(value.result)) {
    return failed(RitualRpcConnectivityFailureKind.ResponseInvalid);
  }

  const chainId = Number(BigInt(value.result));
  return chainId === expectedChainId
    ? { status: 'connected', chainId: expectedChainId }
    : failed(RitualRpcConnectivityFailureKind.ChainMismatch);
}

function validateAndDetachConfiguration(
  value: RitualLiveRpcConfiguration,
): RitualLiveRpcConfiguration {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'endpoint',
      'expectedChainId',
      ...(value.timeoutMs === undefined ? [] : ['timeoutMs']),
    ]) ||
    !isSafeEndpoint(value.endpoint) ||
    value.expectedChainId !== RITUAL_CHAIN_ID ||
    (value.timeoutMs !== undefined &&
      (!Number.isSafeInteger(value.timeoutMs) || value.timeoutMs <= 0))
  ) {
    throw new TypeError('Ritual live RPC configuration is invalid.');
  }
  return {
    endpoint: value.endpoint,
    expectedChainId: RITUAL_CHAIN_ID,
    ...(value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs }),
  };
}

function isSafeEndpoint(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    hasAsciiControlOrSpace(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      url.username === '' &&
      url.password === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function hasAsciiControlOrSpace(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 32 || code === 127;
  });
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<string | undefined> {
  if (body === null) return undefined;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return undefined;
      byteLength += next.value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The bounded result remains invalid even when transport cleanup fails.
        }
        return undefined;
      }
      chunks.push(next.value.slice());
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  if (body === null) return;
  void body.cancel().catch(() => {
    // HTTP failure remains sanitized regardless of response cleanup behavior.
  });
}

function isJsonRpcQuantity(value: unknown): value is string {
  return typeof value === 'string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/u.test(value);
}

function isJsonRpcError(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ['code', 'message']) &&
    Number.isSafeInteger(value.code) &&
    typeof value.message === 'string'
  );
}

function failed(failureKind: RitualRpcConnectivityFailureKind): RitualRpcConnectivityResult {
  return { status: 'failed', failureKind };
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
