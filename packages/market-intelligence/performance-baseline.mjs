import { performance } from 'node:perf_hooks';

import {
  FederationAvailability,
  FederationDomain,
  createFederationEnvelope,
} from '@cryptodesk-ai/federation';
import { Timeframe } from '@cryptodesk-ai/market-intelligence';
import { createMarketFederation } from './dist/index.js';

const timestamp = '2026-01-01T00:00:00.000Z';
const policy = {
  referenceTime: timestamp,
  maximumAgeMilliseconds: 60_000,
  allowStale: false,
  allowUnknownFreshness: false,
};
const genericInput = {
  id: 'performance-baseline',
  domain: FederationDomain.Context,
  generatedAt: timestamp,
  policy,
  observations: ['alpha', 'beta'].map((providerId) => ({
    id: `observation-${providerId}`,
    domain: FederationDomain.Context,
    provider: { id: `synthetic-${providerId}` },
    receivedAt: timestamp,
    availability: FederationAvailability.Available,
    provenance: {
      providerId: `synthetic-${providerId}`,
      normalizationBoundary: 'performance-baseline',
      observedAt: timestamp,
      sourceId: `synthetic-source-${providerId}`,
    },
    comparisonKey: 'same-fixture',
    payload: { fixture: true },
  })),
};
const marketObservation = (providerId) => ({
  id: `market-${providerId}`,
  provider: { id: `synthetic-${providerId}` },
  receivedAt: timestamp,
  availability: FederationAvailability.Available,
  provenance: {
    providerId: `synthetic-${providerId}`,
    normalizationBoundary: 'performance-baseline',
    observedAt: timestamp,
    sourceId: `synthetic-market-source-${providerId}`,
  },
  payload: {
    marketId: 'synthetic-btc-usd',
    baseAssetId: 'btc',
    quoteAssetId: 'usd',
    timeframe: Timeframe.OneHour,
    capturedAt: timestamp,
    lastPrice: 100,
    high: 101,
    low: 99,
    volume: 10,
  },
});
const marketInput = {
  id: 'market-performance-baseline',
  generatedAt: timestamp,
  policy,
  observations: [marketObservation('alpha'), marketObservation('beta')],
};

function measure(label, operation, iterations = 5_000) {
  for (let index = 0; index < 100; index += 1) operation();
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) operation();
  const elapsedMilliseconds = performance.now() - start;
  console.log(
    `${label}: ${elapsedMilliseconds.toFixed(3)} ms total; ${(elapsedMilliseconds / iterations).toFixed(6)} ms/op; ${iterations} iterations`,
  );
}

console.log('CryptoDesk AI performance baseline (synthetic, local, no network)');
measure('Federation qualification', () => createFederationEnvelope(genericInput));
measure('Market federation qualification', () => createMarketFederation(marketInput));
console.log('No provider latency, persistence, cache, retry, or production SLA measured.');
