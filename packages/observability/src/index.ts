export type SafeMetadataValue = string | number | boolean | null;
export type SafeMetadata = Readonly<Record<string, SafeMetadataValue>>;

const MAX_ID = 128;
const MAX_TEXT = 256;
const MAX_METADATA = 16;
const SAFE_KEY = /^[a-z][a-z0-9_.-]{0,63}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_KEY =
  /(token|secret|password|credential|authorization|cookie|private|seed|wallet|api[_-]?key|endpoint)/i;
const ABSOLUTE_PATH = /(?:^|\s)(?:\/(?:Users|home|private|var|tmp)|[A-Za-z]:\\)/i;

function fail(message: string): never {
  throw new TypeError(`Observability input is invalid: ${message}`);
}

function text(value: unknown, field: string, max = MAX_TEXT): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    ABSOLUTE_PATH.test(value)
  ) {
    fail(`${field} must be a bounded safe string`);
  }
  return value;
}

function id(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ID ||
    !SAFE_ID.test(value)
  ) {
    fail(`${field} must be a bounded identifier`);
  }
  return value;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
    fail(`${field} must be an explicit UTC timestamp`);
  }
  return value;
}

function metadata(value: unknown): SafeMetadata | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail('metadata must be a flat object');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_METADATA) fail('metadata has too many entries');
  const result: Record<string, SafeMetadataValue> = {};
  for (const [key, item] of entries) {
    if (!SAFE_KEY.test(key) || SECRET_KEY.test(key)) fail('metadata contains an unsafe key');
    if (
      typeof item !== 'string' &&
      typeof item !== 'number' &&
      typeof item !== 'boolean' &&
      item !== null
    ) {
      fail('metadata values must be scalar');
    }
    if (typeof item === 'string' && (item.length > MAX_TEXT || ABSOLUTE_PATH.test(item)))
      fail('metadata contains unsafe text');
    if (typeof item === 'number' && !Number.isFinite(item)) fail('metadata number must be finite');
    result[key] = item as SafeMetadataValue;
  }
  return Object.freeze(result);
}

function freeze<T extends object>(value: T): T {
  return Object.freeze(value);
}

export enum ObservabilityLogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}
export interface StructuredLogInput {
  readonly timestamp: string;
  readonly level: ObservabilityLogLevel;
  readonly component: string;
  readonly event: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly operationId?: string;
  readonly metadata?: SafeMetadata;
}
export interface StructuredLogRecord extends StructuredLogInput {
  readonly metadata?: SafeMetadata;
}
export function createStructuredLogRecord(input: StructuredLogInput): StructuredLogRecord {
  if (!Object.values(ObservabilityLogLevel).includes(input.level)) fail('level is unsupported');
  return freeze({
    timestamp: timestamp(input.timestamp, 'timestamp'),
    level: input.level,
    component: id(input.component, 'component'),
    event: id(input.event, 'event'),
    message: text(input.message, 'message'),
    ...(input.correlationId === undefined
      ? {}
      : { correlationId: id(input.correlationId, 'correlationId') }),
    ...(input.operationId === undefined
      ? {}
      : { operationId: id(input.operationId, 'operationId') }),
    ...(input.metadata === undefined ? {} : { metadata: metadata(input.metadata) }),
  });
}

export enum HealthStatus {
  Healthy = 'healthy',
  Degraded = 'degraded',
  Unavailable = 'unavailable',
  Unknown = 'unknown',
}
export interface HealthObservationInput {
  readonly component: string;
  readonly observedAt: string;
  readonly status: HealthStatus;
  readonly reasonCode?: string;
  readonly metadata?: SafeMetadata;
}
export interface HealthObservation extends HealthObservationInput {
  readonly metadata?: SafeMetadata;
}
export function createHealthObservation(input: HealthObservationInput): HealthObservation {
  if (!Object.values(HealthStatus).includes(input.status)) fail('health status is unsupported');
  return freeze({
    component: id(input.component, 'component'),
    observedAt: timestamp(input.observedAt, 'observedAt'),
    status: input.status,
    ...(input.reasonCode === undefined ? {} : { reasonCode: id(input.reasonCode, 'reasonCode') }),
    ...(input.metadata === undefined ? {} : { metadata: metadata(input.metadata) }),
  });
}

export enum MetricKind {
  Counter = 'counter',
  Gauge = 'gauge',
  Duration = 'duration',
}
export interface MetricObservationInput {
  readonly kind: MetricKind;
  readonly name: string;
  readonly value: number;
  readonly timestamp: string;
  readonly unit: string;
  readonly labels?: SafeMetadata;
}
export interface MetricObservation extends MetricObservationInput {
  readonly labels?: SafeMetadata;
}
export function createMetricObservation(input: MetricObservationInput): MetricObservation {
  if (!Object.values(MetricKind).includes(input.kind)) fail('metric kind is unsupported');
  if (!Number.isFinite(input.value)) fail('metric value must be finite');
  return freeze({
    kind: input.kind,
    name: id(input.name, 'name'),
    value: input.value,
    timestamp: timestamp(input.timestamp, 'timestamp'),
    unit: id(input.unit, 'unit'),
    ...(input.labels === undefined ? {} : { labels: metadata(input.labels) }),
  });
}

export enum FailureRetryability {
  Retryable = 'retryable',
  NotRetryable = 'not_retryable',
  Unknown = 'unknown',
}
export interface FailureTelemetryInput {
  readonly component: string;
  readonly operation: string;
  readonly category: string;
  readonly code: string;
  readonly observedAt: string;
  readonly description: string;
  readonly retryability?: FailureRetryability;
  readonly correlationId?: string;
}
export interface FailureTelemetry extends FailureTelemetryInput {
  readonly retryability: FailureRetryability;
}
export function createFailureTelemetry(input: FailureTelemetryInput): FailureTelemetry {
  if (
    input.retryability !== undefined &&
    !Object.values(FailureRetryability).includes(input.retryability)
  )
    fail('retryability is unsupported');
  return freeze({
    component: id(input.component, 'component'),
    operation: id(input.operation, 'operation'),
    category: id(input.category, 'category'),
    code: id(input.code, 'code'),
    observedAt: timestamp(input.observedAt, 'observedAt'),
    description: text(input.description, 'description'),
    retryability: input.retryability ?? FailureRetryability.Unknown,
    ...(input.correlationId === undefined
      ? {}
      : { correlationId: id(input.correlationId, 'correlationId') }),
  });
}

export interface ObservabilityCorrelationContextInput {
  readonly requestId: string;
  readonly operationId: string;
  readonly candidateId?: string;
  readonly authorizationId?: string;
  readonly executionId?: string;
}
export type ObservabilityCorrelationContext = ObservabilityCorrelationContextInput;
export function createCorrelationContext(
  input: ObservabilityCorrelationContextInput,
): ObservabilityCorrelationContext {
  return freeze({
    requestId: id(input.requestId, 'requestId'),
    operationId: id(input.operationId, 'operationId'),
    ...(input.candidateId === undefined
      ? {}
      : { candidateId: id(input.candidateId, 'candidateId') }),
    ...(input.authorizationId === undefined
      ? {}
      : { authorizationId: id(input.authorizationId, 'authorizationId') }),
    ...(input.executionId === undefined
      ? {}
      : { executionId: id(input.executionId, 'executionId') }),
  });
}
