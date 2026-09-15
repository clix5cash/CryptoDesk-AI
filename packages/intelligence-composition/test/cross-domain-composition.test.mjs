import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FederationAgreement,
  FederationAvailability,
  FederationDomain,
  FederationFreshness,
} from '@cryptodesk-ai/federation';
import { Timeframe, createMarketFederation } from '@cryptodesk-ai/market-intelligence';
import {
  NewsObservationRelationshipKind,
  createNewsFederation,
} from '@cryptodesk-ai/news-intelligence';
import {
  PortfolioAssetKind,
  PortfolioPositionKind,
  createPortfolioFederation,
} from '@cryptodesk-ai/portfolio';
import {
  CrossDomainAuthority,
  CrossDomainCompositionValidationError,
  composeCrossDomainIntelligence,
} from '../dist/index.js';

const observedAt = '2026-09-15T00:00:00.000Z';
const generatedAt = '2026-09-15T00:05:00.000Z';
const policy = {
  referenceTime: generatedAt,
  maximumAgeMilliseconds: 10 * 60 * 1000,
  allowStale: false,
  allowUnknownFreshness: false,
};

function marketObservation(providerId, lastPrice) {
  return {
    id: `${providerId}-market-observation`,
    provider: { id: providerId },
    receivedAt: '2026-09-15T00:01:00.000Z',
    availability: FederationAvailability.Available,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-synthetic-market-normalizer`,
      sourceId: `${providerId}-market-source`,
      observedAt,
    },
    payload: {
      marketId: 'synthetic-btc-usd',
      baseAssetId: 'synthetic-btc',
      quoteAssetId: 'synthetic-usd',
      timeframe: Timeframe.OneHour,
      capturedAt: observedAt,
      lastPrice,
      high: 11,
      low: 9,
      volume: 100,
    },
  };
}

function newsObservation(providerId, articleId, sourceId) {
  return {
    id: `${providerId}-news-observation`,
    provider: { id: providerId },
    receivedAt: '2026-09-15T00:01:00.000Z',
    availability: FederationAvailability.Available,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-synthetic-news-normalizer`,
      sourceId,
      observedAt,
    },
    payload: {
      id: articleId,
      sourceId,
      title: `${articleId} synthetic title`,
      publishedAt: '2026-09-14T23:00:00.000Z',
      observedAt,
    },
  };
}

function portfolioSnapshot(quantity) {
  return {
    portfolio: {
      id: 'synthetic-portfolio',
      label: 'Synthetic portfolio',
      sources: [{ id: 'synthetic-portfolio-source', label: 'Synthetic source' }],
      accounts: [
        {
          id: 'synthetic-account',
          sourceId: 'synthetic-portfolio-source',
          label: 'Synthetic account',
        },
      ],
    },
    capturedAt: observedAt,
    positions: [
      {
        id: 'synthetic-position',
        asset: {
          id: 'synthetic-asset',
          symbol: 'TEST-ASSET',
          kind: PortfolioAssetKind.Native,
          networkId: 'synthetic-network',
        },
        quantity,
        sourceId: 'synthetic-portfolio-source',
        accountId: 'synthetic-account',
        kind: PortfolioPositionKind.AssetBalance,
        observedAt,
      },
    ],
  };
}

function portfolioObservation(providerId, quantity) {
  return {
    id: `${providerId}-portfolio-observation`,
    provider: { id: providerId },
    receivedAt: '2026-09-15T00:02:00.000Z',
    availability: FederationAvailability.Available,
    provenance: {
      providerId,
      normalizationBoundary: `${providerId}-synthetic-portfolio-normalizer`,
      sourceId: 'synthetic-portfolio-source',
      observedAt: '2026-09-15T00:01:00.000Z',
    },
    payload: portfolioSnapshot(quantity),
  };
}

function domainResults() {
  return {
    market: createMarketFederation({
      id: 'synthetic-market-federation',
      generatedAt,
      observations: [
        marketObservation('synthetic-market-a', 10),
        marketObservation('synthetic-market-b', 12),
      ],
      policy,
    }),
    news: createNewsFederation({
      id: 'synthetic-news-federation',
      generatedAt,
      observations: [
        newsObservation('synthetic-news-a', 'synthetic-article-a', 'synthetic-source-a'),
        newsObservation('synthetic-news-b', 'synthetic-article-b', 'synthetic-source-b'),
      ],
      policy,
    }),
    portfolio: createPortfolioFederation({
      id: 'synthetic-portfolio-federation',
      generatedAt,
      observations: [
        portfolioObservation('synthetic-portfolio-a', 1),
        portfolioObservation('synthetic-portfolio-b', 2),
      ],
      policy,
    }),
  };
}

function records(results = domainResults()) {
  return [
    { domain: FederationDomain.Market, result: results.market },
    { domain: FederationDomain.News, result: results.news },
    { domain: FederationDomain.Portfolio, result: results.portfolio },
  ];
}

function compose(
  domains = records(),
  expectedDomains = [FederationDomain.Market, FederationDomain.News, FederationDomain.Portfolio],
) {
  return composeCrossDomainIntelligence({
    id: 'synthetic-cross-domain-composition',
    generatedAt,
    expectedDomains,
    domains,
  });
}

test('composes Market, News, and Portfolio with explicit stable domain identities', () => {
  const result = compose();
  assert.deepEqual(
    result.domains.map(({ domain }) => domain),
    [FederationDomain.Market, FederationDomain.News, FederationDomain.Portfolio],
  );
  assert.deepEqual(result.missingDomains, []);
});

test('preserves provider, source, normalization, and observation provenance', () => {
  const result = compose();
  const observations = result.domains.flatMap(
    ({ result: domainResult }) => domainResult.federation.observations,
  );
  assert.ok(
    observations.every(({ provider, provenance }) => provider.id === provenance.providerId),
  );
  assert.ok(
    observations.every(({ provenance }) => provenance.normalizationBoundary.includes('synthetic')),
  );
  assert.ok(observations.every(({ provenance }) => provenance.sourceId?.includes('synthetic')));
});

test('applies existing authority classifications without creating a universal authority', () => {
  const result = compose();
  assert.deepEqual(
    result.domains.map(({ authority }) => authority),
    [
      CrossDomainAuthority.MarketDeterministic,
      CrossDomainAuthority.NewsNormalizedDeterministic,
      CrossDomainAuthority.PortfolioObservationNonCanonical,
    ],
  );
  assert.equal('canonicalState' in result, false);
});

test('preserves Market disagreement unchanged', () => {
  const market = compose().domains[0];
  assert.equal(market.result.comparisons[0].agreement, FederationAgreement.Differ);
  assert.deepEqual(
    market.result.federation.observations.map(({ payload }) => payload.lastPrice),
    [10, 12],
  );
});

test('preserves News uncertainty without inventing agreement or causality', () => {
  const news = compose().domains[1];
  assert.equal(news.result.relationships[0].kind, NewsObservationRelationshipKind.Unknown);
  assert.equal('crossDomainRelationships' in compose(), false);
});

test('keeps Portfolio disagreement observational and non-canonical', () => {
  const portfolio = compose().domains[2];
  assert.equal(portfolio.result.comparisons[0].agreement, FederationAgreement.Differ);
  assert.equal(portfolio.authority, CrossDomainAuthority.PortfolioObservationNonCanonical);
  assert.equal('canonicalPortfolio' in portfolio.result, false);
});

test('retains partial availability and exposes an explicitly missing optional domain', () => {
  const result = compose(records().slice(0, 2));
  assert.deepEqual(result.missingDomains, [FederationDomain.Portfolio]);
  assert.equal(result.domains.length, 2);
});

test('does not fabricate data for an expected domain that is not supplied', () => {
  const result = compose([records()[0]]);
  assert.deepEqual(result.missingDomains, [FederationDomain.News, FederationDomain.Portfolio]);
  assert.equal(
    result.domains.some(({ domain }) => domain === FederationDomain.News),
    false,
  );
  assert.equal(
    result.domains.some(({ domain }) => domain === FederationDomain.Portfolio),
    false,
  );
});

test('retains domain-local freshness without a global freshness field', () => {
  const result = compose();
  assert.ok(
    result.domains.every(({ result: domainResult }) =>
      domainResult.federation.observations.every(
        ({ freshness }) => freshness === FederationFreshness.Current,
      ),
    ),
  );
  assert.equal('globalFreshness' in result, false);
});

test('exposes no selection, winner, consensus, recommendation, or decision', () => {
  const result = compose();
  for (const key of [
    'selectedDomain',
    'selectedProvider',
    'winner',
    'consensusScore',
    'recommendation',
    'decision',
  ]) {
    assert.equal(key in result, false);
  }
});

test('is deterministic for equivalent reordered domain inputs and expectations', () => {
  const forward = compose(records());
  const reverse = compose([...records()].reverse(), [
    FederationDomain.Portfolio,
    FederationDomain.News,
    FederationDomain.Market,
  ]);
  assert.deepEqual(forward, reverse);
});

test('returns a deeply detached and frozen immutable composition', () => {
  const inputRecords = structuredClone(records());
  const result = compose(inputRecords);
  inputRecords[0].result.federation.observations[0].payload.lastPrice = 999;

  assert.equal(result.domains[0].result.federation.observations[0].payload.lastPrice, 10);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.domains[0].result.federation.observations[0].payload), true);
});

test('fails closed for unsupported, duplicate, or masquerading domain identities', () => {
  const current = records();
  assert.throws(
    () =>
      composeCrossDomainIntelligence({
        id: 'x',
        generatedAt,
        expectedDomains: [FederationDomain.Context],
        domains: [],
      }),
    CrossDomainCompositionValidationError,
  );
  assert.throws(() => compose([current[0], current[0]]), CrossDomainCompositionValidationError);
  assert.throws(
    () => compose([{ domain: FederationDomain.News, result: current[0].result }]),
    CrossDomainCompositionValidationError,
  );
});

test('fails closed when nested provider provenance no longer matches', () => {
  const current = structuredClone(records());
  current[0].result.federation.observations[0].provenance.providerId = 'substituted-provider';
  assert.throws(() => compose(current), CrossDomainCompositionValidationError);
});

test('rejects unexpected composition and domain-result fields', () => {
  const current = structuredClone(records());
  assert.throws(
    () =>
      composeCrossDomainIntelligence({
        id: 'x',
        generatedAt,
        expectedDomains: [FederationDomain.Market],
        domains: [],
        selectedDomain: FederationDomain.Market,
      }),
    CrossDomainCompositionValidationError,
  );
  current[0].result.consensusScore = 1;
  assert.throws(() => compose(current), CrossDomainCompositionValidationError);
});

test('does not reinterpret or mutate domain-owned comparison and relationship arrays', () => {
  const source = domainResults();
  const result = compose(records(source));
  assert.deepEqual(result.domains[0].result.comparisons, source.market.comparisons);
  assert.deepEqual(result.domains[1].result.relationships, source.news.relationships);
  assert.deepEqual(result.domains[2].result.comparisons, source.portfolio.comparisons);
});

test('supports an explicitly scoped subset without adding absent domains', () => {
  const marketOnly = compose([records()[0]], [FederationDomain.Market]);
  assert.equal(marketOnly.domains.length, 1);
  assert.deepEqual(marketOnly.missingDomains, []);
});
