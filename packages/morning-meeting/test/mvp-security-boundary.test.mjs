import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DefaultMorningMeetingMvpApplicationApi,
  MorningMeetingReportError,
} from '../dist/index.js';

test('rejects prototype-shaped and reserved-field MVP inputs before generation and isolates a later call', async () => {
  let generationCount = 0;
  const api = new DefaultMorningMeetingMvpApplicationApi({
    generate: async () => {
      generationCount += 1;
      throw new Error('valid input reached the injected service');
    },
  });
  const inheritedEnvelope = Object.create({
    request: { timeframe: '1h' },
    aiRequested: false,
  });
  const inheritedRequest = Object.create({ timeframe: '1h' });
  const hostileInputs = [
    inheritedEnvelope,
    { request: inheritedRequest, aiRequested: false },
    { request: { timeframe: '1h' }, aiRequested: false, constructor: 'injected' },
    { request: { timeframe: '1h', prototype: {} }, aiRequested: false },
    { request: { timeframe: '1h', __proto_marker__: {} }, aiRequested: false },
  ];

  for (const input of hostileInputs) {
    await assert.rejects(
      () => api.execute(input),
      (error) =>
        error instanceof MorningMeetingReportError &&
        error.message.startsWith('Morning Meeting MVP application'),
    );
  }
  assert.equal(generationCount, 0);

  await assert.rejects(
    () => api.execute({ request: { timeframe: '1h' }, aiRequested: false }),
    (error) =>
      error instanceof MorningMeetingReportError &&
      error.message === 'Morning Meeting MVP application execution failed.',
  );
  assert.equal(generationCount, 1);
});
