import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCorrelationContext,
  createFailureTelemetry,
  createHealthObservation,
  createMetricObservation,
  createStructuredLogRecord,
  FailureRetryability,
  HealthStatus,
  MetricKind,
  ObservabilityLogLevel,
} from '@cryptodesk-ai/observability';

const time = '2026-01-01T00:00:00.000Z';
test('creates deterministic detached structured logs with safe metadata', () => {
  const input = {
    timestamp: time,
    level: ObservabilityLogLevel.Info,
    component: 'demo',
    event: 'started',
    message: 'Local demo started',
    metadata: { mode: 'synthetic' },
  };
  const result = createStructuredLogRecord(input);
  assert.deepEqual(result, { ...input, metadata: { mode: 'synthetic' } });
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => createStructuredLogRecord({ ...input, metadata: { apiKey: 'secret' } }));
});
test('validates health, metrics, failure telemetry, and correlation without a clock', () => {
  assert.equal(
    createHealthObservation({ component: 'demo', observedAt: time, status: HealthStatus.Unknown })
      .status,
    'unknown',
  );
  assert.equal(
    createMetricObservation({
      kind: MetricKind.Counter,
      name: 'demo.count',
      value: 1,
      timestamp: time,
      unit: 'count',
    }).value,
    1,
  );
  assert.equal(
    createFailureTelemetry({
      component: 'demo',
      operation: 'load',
      category: 'input',
      code: 'invalid',
      observedAt: time,
      description: 'Rejected safely',
    }).retryability,
    FailureRetryability.Unknown,
  );
  assert.deepEqual(createCorrelationContext({ requestId: 'req-1', operationId: 'op-1' }), {
    requestId: 'req-1',
    operationId: 'op-1',
  });
  assert.throws(() =>
    createMetricObservation({
      kind: MetricKind.Gauge,
      name: 'x',
      value: Number.NaN,
      timestamp: time,
      unit: 'count',
    }),
  );
});
test('rejects unsafe paths and malformed timestamps rather than serializing errors', () => {
  assert.throws(() =>
    createFailureTelemetry({
      component: 'demo',
      operation: 'x',
      category: 'x',
      code: 'x',
      observedAt: time,
      description: '/Users/alice/.env',
    }),
  );
  assert.throws(() =>
    createHealthObservation({ component: 'demo', observedAt: 'now', status: HealthStatus.Healthy }),
  );
});
