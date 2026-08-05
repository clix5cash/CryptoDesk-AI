import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NewsCategory,
  NewsClassificationField,
  NewsClassifier,
  NewsEventType,
  NewsImpactAnalyzer,
  NewsImpactDirection,
  NewsImpactStrength,
  NewsImpactTargetKind,
  NewsImpactType,
} from '../dist/index.js';

const timestamps = {
  publishedAt: '2026-08-05T01:00:00.000Z',
  observedAt: '2026-08-05T02:00:00.000Z',
};

const classificationRules = [
  {
    id: 'listing-event',
    category: NewsCategory.Listing,
    event: NewsEventType.TokenListing,
    field: NewsClassificationField.Title,
    matches: ['listed'],
  },
  {
    id: 'delisting-event',
    category: NewsCategory.Listing,
    event: NewsEventType.TokenDelisting,
    field: NewsClassificationField.Title,
    matches: ['delisted'],
  },
  {
    id: 'security-event',
    category: NewsCategory.Security,
    event: NewsEventType.SecurityIncident,
    field: NewsClassificationField.Title,
    matches: ['security incident'],
  },
  {
    id: 'governance-event',
    category: NewsCategory.Governance,
    event: NewsEventType.GovernanceVote,
    field: NewsClassificationField.Title,
    matches: ['governance vote'],
  },
];

const impactRules = [
  {
    id: 'listing-impact',
    event: NewsEventType.TokenListing,
    type: NewsImpactType.Listing,
    direction: NewsImpactDirection.Positive,
    strength: NewsImpactStrength.Strong,
    targetKind: NewsImpactTargetKind.Asset,
  },
  {
    id: 'delisting-impact',
    event: NewsEventType.TokenDelisting,
    type: NewsImpactType.Delisting,
    direction: NewsImpactDirection.Negative,
    strength: NewsImpactStrength.Strong,
    targetKind: NewsImpactTargetKind.Asset,
  },
  {
    id: 'security-impact',
    event: NewsEventType.SecurityIncident,
    type: NewsImpactType.Security,
    direction: NewsImpactDirection.Negative,
    strength: NewsImpactStrength.Strong,
    targetKind: NewsImpactTargetKind.Asset,
  },
  {
    id: 'governance-impact',
    event: NewsEventType.GovernanceVote,
    type: NewsImpactType.Governance,
    strength: NewsImpactStrength.Moderate,
    targetKind: NewsImpactTargetKind.Asset,
  },
];

function article(overrides = {}) {
  return {
    id: 'article-1',
    sourceId: 'source-a',
    sourceRecordId: 'record-a',
    title: 'Bitcoin listed',
    assetIds: ['bitcoin'],
    ...timestamps,
    ...overrides,
  };
}

function classifier() {
  return new NewsClassifier({
    assets: [
      { assetId: 'bitcoin', aliases: ['Bitcoin'] },
      { assetId: 'ethereum', aliases: ['Ethereum'] },
    ],
    rules: classificationRules,
  });
}

function analyze(source, rules = impactRules) {
  return new NewsImpactAnalyzer({ rules }).analyze(source, classifier().classify(source));
}

test('derives configured positive listing and negative delisting/security impacts', () => {
  const listing = analyze(article());
  assert.equal(listing[0]?.articleId, 'article-1');
  assert.equal(listing[0]?.type, NewsImpactType.Listing);
  assert.equal(listing[0]?.direction, NewsImpactDirection.Positive);
  assert.equal(listing[0]?.strength, NewsImpactStrength.Explicit);
  assert.deepEqual(listing[0]?.target, { kind: NewsImpactTargetKind.Asset, assetId: 'bitcoin' });
  assert.deepEqual(listing[0]?.evidence[0]?.triggerEvidence, [
    {
      ruleId: 'listing-event',
      field: NewsClassificationField.Title,
      matchedValue: 'listed',
    },
  ]);
  assert.equal(listing[0]?.evidence[0]?.sourceRecordId, 'record-a');

  assert.equal(
    analyze(article({ title: 'Bitcoin delisted' }))[0]?.direction,
    NewsImpactDirection.Negative,
  );
  assert.equal(
    analyze(article({ title: 'Bitcoin security incident' }))[0]?.type,
    NewsImpactType.Security,
  );
});

test('keeps governance direction unknown unless a configured rule specifies it', () => {
  const impacts = analyze(article({ title: 'Bitcoin governance vote' }));

  assert.equal(impacts[0]?.direction, NewsImpactDirection.Unknown);
  assert.equal(impacts[0]?.strength, NewsImpactStrength.Explicit);
});

test('preserves explicit and multiple deterministic asset targets', () => {
  const impacts = analyze(article({ assetIds: ['ethereum', 'bitcoin'] }));

  assert.deepEqual(
    impacts.map((impact) => impact.target),
    [
      { kind: NewsImpactTargetKind.Asset, assetId: 'bitcoin' },
      { kind: NewsImpactTargetKind.Asset, assetId: 'ethereum' },
    ],
  );
  assert.deepEqual(
    impacts.map((impact) => impact.strength),
    [NewsImpactStrength.Explicit, NewsImpactStrength.Explicit],
  );
});

test('does not fabricate impacts when classifications or configured targets are absent', () => {
  const source = article({ title: 'Routine update', assetIds: undefined });
  assert.deepEqual(analyze(source), []);
  assert.deepEqual(analyze(article({ title: 'Token listed', assetIds: undefined })), []);
});

test('deduplicates repeated trigger and target evidence without inflating impacts', () => {
  const source = article();
  const classification = classifier().classify(source);
  const baseline = new NewsImpactAnalyzer({ rules: impactRules }).analyze(source, classification);
  const duplicateClassification = {
    ...classification,
    assets: [...classification.assets, ...classification.assets],
    events: [...classification.events, ...classification.events],
  };
  const impacts = new NewsImpactAnalyzer({ rules: impactRules }).analyze(
    source,
    duplicateClassification,
  );

  assert.equal(impacts.length, 1);
  assert.equal(impacts[0]?.evidence.length, 1);
  assert.equal(impacts[0]?.evidence[0]?.triggerEvidence.length, 1);
  assert.deepEqual(
    impacts[0]?.evidence[0]?.targetEvidence,
    baseline[0]?.evidence[0]?.targetEvidence,
  );
});

test('is deterministic for reordered impact rule configuration without pseudo-confidence values', () => {
  const source = article();
  const expected = analyze(source);
  const actual = analyze(source, [...impactRules].reverse());

  assert.deepEqual(actual, expected);
  assert.equal('confidence' in (actual[0] ?? {}), false);
});
