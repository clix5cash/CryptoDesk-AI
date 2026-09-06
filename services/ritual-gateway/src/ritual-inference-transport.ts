interface RitualTransportRequest {
  readonly executionId: string;
  readonly providerId: 'ritual';
  readonly modelId?: string;
  readonly targetId: string;
  readonly payload: string;
}

type RitualInjectedTransport = (request: RitualTransportRequest) => Promise<unknown>;

export type RitualTransportOutcome =
  | { readonly kind: 'completed'; readonly output: string }
  | { readonly kind: 'failed'; readonly failureKind: 'runtime_failure' | 'timeout' }
  | { readonly kind: 'invocation_failed' }
  | { readonly kind: 'result_invalid' }
  | { readonly kind: 'identity_mismatch' };

/**
 * Internal single-attempt transport boundary. It prepares a detached request,
 * invokes only the supplied transport, and decodes one closed terminal result.
 */
export async function executeInjectedRitualTransport(
  invocation: RitualTransportRequest,
  transport: RitualInjectedTransport,
): Promise<RitualTransportOutcome> {
  const request = prepareTransportRequest(invocation);
  if (request === undefined) return { kind: 'result_invalid' };

  let response: unknown;
  try {
    response = await transport(clone(request));
  } catch {
    return { kind: 'invocation_failed' };
  }
  return decodeTransportResponse(request, response);
}

function prepareTransportRequest(
  value: RitualTransportRequest,
): RitualTransportRequest | undefined {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'executionId',
      'providerId',
      'targetId',
      'payload',
      ...(value.modelId === undefined ? [] : ['modelId']),
    ]) ||
    !isNonEmptyString(value.executionId) ||
    value.providerId !== 'ritual' ||
    (value.modelId !== undefined && !isNonEmptyString(value.modelId)) ||
    !isNonEmptyString(value.targetId) ||
    !isNonEmptyString(value.payload)
  ) {
    return undefined;
  }
  return clone(value);
}

function decodeTransportResponse(
  request: RitualTransportRequest,
  value: unknown,
): RitualTransportOutcome {
  if (
    !isPlainRecord(value) ||
    !isNonEmptyString(value.executionId) ||
    value.providerId !== 'ritual' ||
    (value.modelId !== undefined && !isNonEmptyString(value.modelId)) ||
    !isNonEmptyString(value.targetId)
  ) {
    return { kind: 'result_invalid' };
  }

  if (!sameIdentity(request, value)) return { kind: 'identity_mismatch' };

  if (
    value.status === 'completed' &&
    hasExactKeys(value, [
      'executionId',
      'providerId',
      'targetId',
      'status',
      'output',
      ...(value.modelId === undefined ? [] : ['modelId']),
    ]) &&
    isNonEmptyString(value.output)
  ) {
    return { kind: 'completed', output: value.output };
  }

  if (
    value.status === 'failed' &&
    hasExactKeys(value, [
      'executionId',
      'providerId',
      'targetId',
      'status',
      'failureKind',
      ...(value.modelId === undefined ? [] : ['modelId']),
    ]) &&
    (value.failureKind === 'runtime_failure' || value.failureKind === 'timeout')
  ) {
    return { kind: 'failed', failureKind: value.failureKind };
  }

  return { kind: 'result_invalid' };
}

function sameIdentity(request: RitualTransportRequest, response: Record<string, unknown>): boolean {
  return (
    response.executionId === request.executionId &&
    response.providerId === request.providerId &&
    response.modelId === request.modelId &&
    response.targetId === request.targetId
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
