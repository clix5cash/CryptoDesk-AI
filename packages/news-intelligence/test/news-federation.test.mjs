import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FederationAgreement,
  FederationAvailability,
  FederationEligibility,
  FederationFreshness,
  FederationValidationError,
} from '@cryptodesk-ai/federation';
import {
  NewsFederationValidationError,
  NewsObservationRelationshipKind,
  createNewsFederation,
} from '../dist/index.js';

const observedAt = '2026-09-15T00:05:00.000Z';
const policy = {
  referenceTime: '2026-09-15T00:10:00.000Z',
  maximumAgeMilliseconds: 10 * 60 * 1000,
  allowStale: false,
  allowUnknownFreshness: false,
};

function article(sourceId, id, overrides = {}) {
  return {
    id,
    sourceId,
    sourceRecordId: `${sourceId}-record-${id}`,
    title: `Synthetic normalized article ${id}`,
    canonicalUrl: `https://example.com/${sourceId}/${id}`,
    publishedAt: '2026-09-14T23:00:00.000Z',
    observedAt,
    topicIds: ['protocol'],
    ...overrides,
  };
}

function observation(providerId, payload, overrides = {}) {
  return {
    id: `${providerId}-${payload.id}`,
    provider: { id: providerId, label: `Synthetic ${providerId}` },
    receivedAt: '2026-09-15T00:06:00.000Z',
    availability: FederationAvailability.Available,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-news-normalizer`,
      observedAt: payload.observedAt,
      sourceId: payload.sourceId,
      sourceReference: payload.canonicalUrl,
    },
    payload,
    ...overrides,
  };
}

function unavailableObservation(providerId, sourceId) {
  return {
    id: `${providerId}-unavailable`,
    provider: { id: providerId },
    receivedAt: '2026-09-15T00:06:00.000Z',
    availability: FederationAvailability.Unavailable,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-news-normalizer`,
      sourceId,
    },
  };
}

function federate(observations, overrides = {}) {
  return createNewsFederation({
    id: 'news-federation',
    generatedAt: policy.referenceTime,
    observations,
    policy,
    ...overrides,
  });
}

test('retains multiple provider, source, article, and provenance identities', () => {
  const result = federate([
    observation('provider-b', article('source-b', 'article-b')),
    observation('provider-a', article('source-a', 'article-a')),
  ]);

  assert.deepEqual(
    result.federation.observations.map(({ provider }) => provider.id),
    ['provider-a', 'provider-b'],
  );
  assert.deepEqual(
    result.federation.observations.map(({ payload }) => [payload.sourceId, payload.id]),
    [
      ['source-a', 'article-a'],
      ['source-b', 'article-b'],
    ],
  );
  assert.equal(result.federation.observations[0].provenance.sourceId, 'source-a');
  assert.equal(
    result.federation.observations[0].provenance.normalizationBoundary,
    'provider-a-news-normalizer',
  );
});

test('keeps publication, observation, and generation timestamps distinct', () => {
  const result = federate([observation('provider-a', article('source-a', 'article-a'))]);
  const federated = result.federation.observations[0];

  assert.equal(federated.payload.publishedAt, '2026-09-14T23:00:00.000Z');
  assert.equal(federated.payload.observedAt, observedAt);
  assert.equal(result.federation.generatedAt, policy.referenceTime);
  assert.notEqual(federated.payload.publishedAt, federated.payload.observedAt);
});

test('marks duplicate representations only from existing deterministic identity', () => {
  const shared = article('source-a', 'article-a');
  const result = federate([
    observation('provider-a', shared),
    observation('provider-b', { ...shared }),
  ]);

  assert.equal(result.federation.observations.length, 2);
  assert.equal(result.relationships[0].kind, NewsObservationRelationshipKind.Duplicate);
  assert.match(result.relationships[0].evidenceReference, /^source-record:/u);
});

test('leaves unrelated normalized articles unknown rather than disagreement', () => {
  const result = federate([
    observation('provider-a', article('source-a', 'article-a')),
    observation('provider-b', article('source-b', 'article-b')),
  ]);

  assert.equal(result.relationships[0].kind, NewsObservationRelationshipKind.Unknown);
  assert.notEqual(result.federation.comparison.agreement, FederationAgreement.Differ);
});

test('reports existing News event-group evidence without claiming factual agreement', () => {
  const left = article('source-a', 'article-a');
  const right = article('source-b', 'article-b');
  const result = federate([observation('provider-a', left), observation('provider-b', right)], {
    eventGroups: [
      {
        id: 'news-event:synthetic',
        articleIds: [left.id, right.id],
        evidence: [
          { articleId: left.id, sourceId: left.sourceId, eventEvidence: [] },
          { articleId: right.id, sourceId: right.sourceId, eventEvidence: [] },
        ],
      },
    ],
  });

  assert.equal(result.relationships[0].kind, NewsObservationRelationshipKind.SameEvent);
  assert.equal(result.relationships[0].evidenceReference, 'news-event:synthetic');
  assert.notEqual(result.federation.comparison.agreement, FederationAgreement.Agree);
});

test('does not infer duplicates from similar headlines or shared canonical topics', () => {
  const result = federate([
    observation(
      'provider-a',
      article('source-a', 'article-a', { title: 'Synthetic protocol update' }),
    ),
    observation(
      'provider-b',
      article('source-b', 'article-b', { title: 'Synthetic protocol update' }),
    ),
  ]);

  assert.equal(result.relationships[0].kind, NewsObservationRelationshipKind.Unknown);
});

test('retains stale observations without treating old publication time as freshness', () => {
  const staleObservedAt = '2026-09-14T00:00:00.000Z';
  const payload = article('source-a', 'article-a', {
    publishedAt: '2026-01-01T00:00:00.000Z',
    observedAt: staleObservedAt,
  });
  const result = federate([
    observation('provider-a', payload, {
      provenance: {
        providerId: 'provider-a',
        normalizationBoundary: 'provider-a-news-normalizer',
        observedAt: staleObservedAt,
        sourceId: payload.sourceId,
      },
    }),
  ]);

  assert.equal(result.federation.observations[0].freshness, FederationFreshness.Stale);
  assert.equal(result.federation.observations[0].eligibility, FederationEligibility.Ineligible);
  assert.equal(result.federation.observations[0].payload.publishedAt, payload.publishedAt);
});

test('retains unavailable providers beside eligible articles without substitution', () => {
  const result = federate([
    unavailableObservation('provider-a', 'source-a'),
    observation('provider-b', article('source-b', 'article-b')),
  ]);

  assert.equal(result.federation.observations.length, 2);
  assert.equal(result.federation.observations[0].freshness, FederationFreshness.Unavailable);
  assert.equal(result.federation.observations[0].eligibility, FederationEligibility.Unavailable);
  assert.equal(result.federation.observations[1].eligibility, FederationEligibility.Eligible);
});

test('keeps eligible observations non-selected and non-authoritative', () => {
  const result = federate([observation('provider-a', article('source-a', 'article-a'))]);

  assert.equal(result.federation.observations[0].eligibility, FederationEligibility.Eligible);
  assert.equal('selectedObservationId' in result, false);
  assert.equal('selectedObservationId' in result.federation, false);
  assert.equal('selectedArticle' in result, false);
  assert.equal('selectedProvider' in result, false);
});

test('is deterministic, detached, frozen, and independent of input ordering', () => {
  const first = observation('provider-a', article('source-a', 'article-a'));
  const second = observation('provider-b', article('source-b', 'article-b'));
  const forward = federate([first, second]);
  const reverse = federate([second, first]);
  first.payload.title = 'mutated after federation';

  assert.deepEqual(forward, reverse);
  assert.equal(
    forward.federation.observations[0].payload.title,
    'Synthetic normalized article article-a',
  );
  assert.equal(Object.isFrozen(forward), true);
  assert.equal(Object.isFrozen(forward.relationships), true);
});

test('fails closed for non-normalized and provider-specific article fields', () => {
  assert.throws(
    () =>
      federate([
        observation('provider-a', article('source-a', 'article-a', { title: ' padded ' })),
      ]),
    NewsFederationValidationError,
  );
  assert.throws(
    () =>
      federate([
        observation(
          'provider-a',
          article('source-a', 'article-a', { rawFeedXml: '<synthetic />' }),
        ),
      ]),
    NewsFederationValidationError,
  );
});

test('fails closed for source, observation-time, and provider provenance mismatches', () => {
  const payload = article('source-a', 'article-a');
  assert.throws(
    () =>
      federate([
        observation('provider-a', payload, {
          provenance: {
            providerId: 'provider-a',
            normalizationBoundary: 'synthetic-news-normalizer',
            observedAt,
            sourceId: 'source-b',
          },
        }),
      ]),
    NewsFederationValidationError,
  );
  assert.throws(
    () =>
      federate([
        observation('provider-a', payload, {
          provenance: {
            providerId: 'provider-a',
            normalizationBoundary: 'synthetic-news-normalizer',
            observedAt: '2026-09-15T00:04:00.000Z',
            sourceId: payload.sourceId,
          },
        }),
      ]),
    NewsFederationValidationError,
  );
  assert.throws(
    () =>
      federate([
        observation('provider-a', payload, {
          provenance: {
            providerId: 'provider-b',
            normalizationBoundary: 'synthetic-news-normalizer',
            observedAt,
            sourceId: payload.sourceId,
          },
        }),
      ]),
    FederationValidationError,
  );
});

test('fails closed for malformed envelopes and invalid event evidence', () => {
  assert.throws(
    () => createNewsFederation({ id: 'missing-fields' }),
    NewsFederationValidationError,
  );
  const payload = article('source-a', 'article-a');
  assert.throws(
    () =>
      federate([observation('provider-a', payload)], {
        eventGroups: [
          {
            id: 'news-event:invalid',
            articleIds: [payload.id],
            evidence: [{ articleId: payload.id, sourceId: 'wrong-source', eventEvidence: [] }],
          },
        ],
      }),
    NewsFederationValidationError,
  );
});
