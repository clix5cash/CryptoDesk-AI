import {
  FederationAvailability,
  FederationDomain,
  createFederationEnvelope,
} from '@cryptodesk-ai/federation';

const referenceTime = '2026-01-01T00:00:00.000Z';

const envelope = createFederationEnvelope({
  id: 'quick-start-synthetic-envelope',
  domain: FederationDomain.Context,
  generatedAt: referenceTime,
  policy: {
    referenceTime,
    maximumAgeMilliseconds: 60_000,
    allowStale: false,
    allowUnknownFreshness: false,
  },
  observations: [
    {
      id: 'quick-start-observation-alpha',
      domain: FederationDomain.Context,
      provider: { id: 'synthetic-provider-alpha', label: 'Synthetic provider A' },
      receivedAt: referenceTime,
      availability: FederationAvailability.Available,
      provenance: {
        providerId: 'synthetic-provider-alpha',
        normalizationBoundary: 'quick-start-demo',
        observedAt: referenceTime,
        sourceId: 'synthetic-source-alpha',
      },
      comparisonKey: 'same-deterministic-fixture',
      payload: { kind: 'synthetic-demo-observation' },
    },
    {
      id: 'quick-start-observation-beta',
      domain: FederationDomain.Context,
      provider: { id: 'synthetic-provider-beta', label: 'Synthetic provider B' },
      receivedAt: referenceTime,
      availability: FederationAvailability.Available,
      provenance: {
        providerId: 'synthetic-provider-beta',
        normalizationBoundary: 'quick-start-demo',
        observedAt: referenceTime,
        sourceId: 'synthetic-source-beta',
      },
      comparisonKey: 'same-deterministic-fixture',
      payload: { kind: 'synthetic-demo-observation' },
    },
  ],
});

console.log('CryptoDesk AI developer quick-start demo');
console.log('Synthetic observations retained:', envelope.observations.length);
console.log('Federation status:', envelope.status);
console.log('Comparison:', envelope.comparison.agreement);
console.log(
  'Provider identities:',
  envelope.observations.map(({ provider }) => provider.id).join(', '),
);
console.log('No live providers, credentials, wallets, or Ritual execution used.');
