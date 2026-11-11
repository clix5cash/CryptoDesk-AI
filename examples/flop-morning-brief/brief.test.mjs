import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runBrief } from './brief.mjs';

const snapshot = JSON.parse(await readFile(new URL('./sample.json', import.meta.url)));
const options = { apiKey: 'fake-key', model: 'test-model' };

function completion(fundingView = 'positive funding') {
  return Response.json({
    id: 'completion-123',
    choices: [{
      message: {
        content: JSON.stringify({
          assets: [
            { symbol: 'BTC', fundingView, priceUsd: 1 },
            { symbol: 'ETH', fundingView: 'negative funding' },
            { symbol: 'SOL', fundingView: 'funding unavailable' },
          ],
        }),
      },
    }],
  });
}

test('preserves source values and separates gateway metadata from settlement', async () => {
  const result = await runBrief(snapshot, {
    ...options,
    fetchImpl: async (url, request) => {
      assert.equal(url, 'https://api.flop.network/v1/chat/completions');
      assert.equal(request.headers.Authorization, 'Bearer fake-key');
      assert.equal(JSON.parse(request.body).model, 'test-model');
      return completion();
    },
  });
  assert.equal(result.assets[0].priceUsd, snapshot.assets[0].priceUsd);
  assert.deepEqual(result.assets[2].missing, ['openInterestUsd', 'fundingRate']);
  assert.equal(result.gateway.completionId, 'completion-123');
  assert.equal(result.gateway.settlement, 'unverified');
});

test('rejects a finding that contradicts the source data', async () => {
  await assert.rejects(
    runBrief(snapshot, { ...options, fetchImpl: async () => completion('negative funding') }),
    /does not match source funding data for BTC/,
  );
});

test('rejects an incomplete snapshot before calling the gateway', async () => {
  await assert.rejects(runBrief({ ...snapshot, assets: [] }, options), /Expected one row/);
});

test('surfaces a gateway error without returning its body', async () => {
  await assert.rejects(
    runBrief(snapshot, {
      ...options,
      fetchImpl: async () => new Response('private details', { status: 401 }),
    }),
    /^Error: FLOP gateway returned HTTP 401\.$/,
  );
});
