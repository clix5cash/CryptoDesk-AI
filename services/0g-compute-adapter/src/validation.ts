import type { ComputeConfig, FailureCode } from './contracts.js';
import { verificationProperties } from './contracts.js';

export class BoundaryError extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}
export function reject(code: FailureCode): never {
  throw new BoundaryError(code);
}
export function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    reject('request_invalid');
  for (const entry of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in entry) || !entry.enumerable) reject('request_invalid');
  }
  if (Reflect.ownKeys(value).length !== Object.keys(value).length) reject('request_invalid');
}
export function exact(
  value: unknown,
  keys: readonly string[],
): asserts value is Record<string, unknown> {
  record(value);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((k) => !keys.includes(k)))
    reject('request_invalid');
}
export function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value))
    reject('request_invalid');
}
export function digestValue(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) reject('request_invalid');
}
export function integer(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    reject('request_invalid');
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function plainArray(value: unknown): asserts value is unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Reflect.ownKeys(value).length !== value.length + 1 ||
    Object.keys(value).length !== value.length ||
    Object.keys(value).some((key, index) => key !== String(index)) ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => !('value' in d))
  )
    reject('request_invalid');
}
// Bounded, canonical JSON encoding without invoking getters, toJSON, or prototypes.
export function canonical(value: unknown, maxBytes = 1_048_576, maxDepth = 64): string {
  let used = 0;
  const active = new Set<object>();
  const add = (s: string) => {
    used += new TextEncoder().encode(s).length;
    if (used > maxBytes) reject('input_limit_exceeded');
    return s;
  };
  function walk(v: unknown, depth: number): string {
    if (depth > maxDepth) reject('input_limit_exceeded');
    if (v === null || typeof v === 'boolean') return add(String(v));
    if (typeof v === 'string') {
      if (v.length > maxBytes) reject('input_limit_exceeded');
      return add(JSON.stringify(v));
    }
    if (typeof v === 'number' && Number.isFinite(v)) return add(JSON.stringify(v));
    if (!v || typeof v !== 'object' || active.has(v)) reject('request_invalid');
    active.add(v);
    let out: string;
    if (Array.isArray(v)) {
      plainArray(v);
      if (v.length > maxBytes) reject('input_limit_exceeded');
      out = add('[') + v.map((x) => walk(x, depth + 1)).join(add(',')) + add(']');
    } else {
      record(v);
      out =
        add('{') +
        Object.keys(v)
          .sort()
          .map((k) => add(JSON.stringify(k)) + add(':') + walk(v[k], depth + 1))
          .join(add(',')) +
        add('}');
    }
    active.delete(v);
    return out;
  }
  const result = walk(value, 0);
  if (new TextEncoder().encode(result).length > maxBytes) reject('input_limit_exceeded');
  return result;
}
export function copy<T>(value: T): T {
  return JSON.parse(canonical(value)) as T;
}
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), (n) => n.toString(16).padStart(2, '0')).join('');
}
export async function hash(value: unknown): Promise<string> {
  return sha256(canonical(value));
}
export function config(value: ComputeConfig): ComputeConfig {
  try {
    value = copy(value);
    record(value);
    const modeKeys =
      value.mode === 'router'
        ? ['allowCrossProviderFallback']
        : ['sdkPackage', 'sdkVersion', 'sdkCommit', 'contractSetDigest'];
    exact(value, [
      'schemaVersion',
      'configId',
      'adapterProviderId',
      'providerAddress',
      'modelId',
      'network',
      'endpoint',
      'credential',
      'limits',
      'verificationPolicy',
      'sourceRevision',
      'streaming',
      'clientRetries',
      'redirects',
      'automaticFunding',
      'mode',
      ...modeKeys,
    ]);
    for (const key of ['configId', 'adapterProviderId', 'modelId', 'sourceRevision'] as const)
      id(value[key]);
    if (
      value.schemaVersion !== 'zg-design-1' ||
      typeof value.providerAddress !== 'string' ||
      !/^0x[a-fA-F0-9]{40}$/.test(value.providerAddress)
    )
      reject('configuration_invalid');
    exact(value.network, ['environment', 'chainId', 'approvedNetworkRevision']);
    if (!(
      (value.network.environment === 'mainnet' && value.network.chainId === 16661) ||
      (value.network.environment === 'testnet' && value.network.chainId === 16602)
    ))
      reject('network_mismatch');
    digestValue(value.network.approvedNetworkRevision);
    // .invalid is reserved and cannot designate a live provider. No live endpoint accepted.
    if (typeof value.endpoint !== 'string' || value.endpoint.length > 2048)
      reject('configuration_invalid');
    const url = new URL(value.endpoint);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.invalid') ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.href !== value.endpoint ||
      url.pathname !== '/v1/chat/completions'
    )
      reject('configuration_invalid');
    exact(value.credential, [
      'credentialRef',
      'generation',
      'kind',
      'audienceConfigId',
      'expiresAt',
    ]);
    id(value.credential.credentialRef);
    id(value.credential.generation);
    integer(value.credential.expiresAt);
    if (
      !value.credential.credentialRef.startsWith('synthetic:') ||
      value.credential.audienceConfigId !== value.configId ||
      value.credential.kind !==
        (value.mode === 'router' ? 'router_inference' : 'direct_provider_inference')
    )
      reject('credential_invalid');
    exact(value.limits, [
      'maxRequestBytes',
      'maxResponseBytes',
      'maxOutputBytes',
      'maxOutputTokens',
      'maxJsonDepth',
      'maxHeaderBytes',
      'totalDeadlineMs',
    ]);
    for (const [k, v] of Object.entries(value.limits))
      integer(v, 1, k === 'maxJsonDepth' ? 64 : k === 'totalDeadlineMs' ? 60_000 : 1_048_576);
    exact(value.verificationPolicy, [
      'policyId',
      'version',
      'required',
      'verifierRevision',
      'maxEvidenceAgeMs',
      'acceptedMeasurementPolicyDigest',
    ]);
    const p = value.verificationPolicy;
    id(p.policyId);
    id(p.version);
    id(p.verifierRevision);
    integer(p.maxEvidenceAgeMs, 1);
    digestValue(p.acceptedMeasurementPolicyDigest);
    if (
      !Array.isArray(p.required) ||
      new Set(p.required).size !== p.required.length ||
      p.required.some((x) => !verificationProperties.includes(x))
    )
      reject('configuration_invalid');
    if (
      value.streaming !== false ||
      value.clientRetries !== 0 ||
      value.redirects !== 'reject' ||
      value.automaticFunding !== false
    )
      reject('configuration_invalid');
    if (value.mode === 'router') {
      if (value.allowCrossProviderFallback !== false) reject('configuration_invalid');
    } else if (value.mode === 'direct') {
      if (
        value.sdkPackage !== '@0gfoundation/0g-compute-ts-sdk' ||
        value.sdkVersion !== '0.9.0' ||
        value.sdkCommit !== 'bff29131f953d5b08ad0c40eb805d8e00408df77'
      )
        reject('configuration_invalid');
      digestValue(value.contractSetDigest);
    } else reject('configuration_invalid');
    return freeze(copy(value));
  } catch (e) {
    if (e instanceof BoundaryError && ['network_mismatch', 'credential_invalid'].includes(e.code))
      throw e;
    reject('configuration_invalid');
  }
}
