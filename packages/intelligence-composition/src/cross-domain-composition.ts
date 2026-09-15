import {
  FederationAvailability,
  FederationDomain,
  FederationEligibility,
  FederationFreshness,
  FederationStatus,
  type FederationEnvelope,
} from '@cryptodesk-ai/federation';
import type { MarketFederationResult } from '@cryptodesk-ai/market-intelligence';
import type { NewsFederationResult } from '@cryptodesk-ai/news-intelligence';
import type { PortfolioFederationResult } from '@cryptodesk-ai/portfolio';

export type CrossDomainIntelligenceDomain =
  FederationDomain.Market | FederationDomain.News | FederationDomain.Portfolio;

export enum CrossDomainAuthority {
  MarketDeterministic = 'market_deterministic',
  NewsNormalizedDeterministic = 'news_normalized_deterministic',
  PortfolioObservationNonCanonical = 'portfolio_observation_non_canonical',
}

export interface CrossDomainMarketInput {
  readonly domain: FederationDomain.Market;
  readonly result: MarketFederationResult;
}

export interface CrossDomainNewsInput {
  readonly domain: FederationDomain.News;
  readonly result: NewsFederationResult;
}

export interface CrossDomainPortfolioInput {
  readonly domain: FederationDomain.Portfolio;
  readonly result: PortfolioFederationResult;
}

export type CrossDomainIntelligenceInputRecord =
  CrossDomainMarketInput | CrossDomainNewsInput | CrossDomainPortfolioInput;

export interface CrossDomainIntelligenceCompositionInput {
  readonly id: string;
  readonly generatedAt: string;
  /** Explicit domain expectation; omitted results remain visible as missing. */
  readonly expectedDomains: ReadonlyArray<CrossDomainIntelligenceDomain>;
  readonly domains: ReadonlyArray<CrossDomainIntelligenceInputRecord>;
}

export interface CrossDomainMarketRecord extends CrossDomainMarketInput {
  readonly authority: CrossDomainAuthority.MarketDeterministic;
}

export interface CrossDomainNewsRecord extends CrossDomainNewsInput {
  readonly authority: CrossDomainAuthority.NewsNormalizedDeterministic;
}

export interface CrossDomainPortfolioRecord extends CrossDomainPortfolioInput {
  readonly authority: CrossDomainAuthority.PortfolioObservationNonCanonical;
}

export type CrossDomainIntelligenceRecord =
  CrossDomainMarketRecord | CrossDomainNewsRecord | CrossDomainPortfolioRecord;

/** Detached composition only; no field selects, ranks, canonicalizes, or recommends. */
export interface CrossDomainIntelligenceComposition {
  readonly id: string;
  readonly generatedAt: string;
  readonly domains: ReadonlyArray<CrossDomainIntelligenceRecord>;
  readonly missingDomains: ReadonlyArray<CrossDomainIntelligenceDomain>;
  readonly selectedDomain?: never;
  readonly consensusScore?: never;
  readonly globalFreshness?: never;
  readonly canonicalState?: never;
  readonly recommendation?: never;
}

/**
 * Composes validated domain-owned federation results without changing their
 * local authority, freshness, comparison, relationship, or provenance state.
 */
export function composeCrossDomainIntelligence(
  input: CrossDomainIntelligenceCompositionInput,
): CrossDomainIntelligenceComposition {
  validateInput(input);
  const expected = new Set(input.expectedDomains);
  const domains = input.domains
    .map((record): CrossDomainIntelligenceRecord => {
      validateRecord(record);
      if (!expected.has(record.domain)) throw new CrossDomainCompositionValidationError();
      switch (record.domain) {
        case FederationDomain.Market:
          return { ...clone(record), authority: CrossDomainAuthority.MarketDeterministic };
        case FederationDomain.News:
          return { ...clone(record), authority: CrossDomainAuthority.NewsNormalizedDeterministic };
        case FederationDomain.Portfolio:
          return {
            ...clone(record),
            authority: CrossDomainAuthority.PortfolioObservationNonCanonical,
          };
      }
    })
    .sort((left, right) => domainOrder(left.domain) - domainOrder(right.domain));
  const present = new Set(domains.map(({ domain }) => domain));
  const missingDomains = [...expected]
    .filter((domain) => !present.has(domain))
    .sort((left, right) => domainOrder(left) - domainOrder(right));

  return deepFreeze({
    id: input.id,
    generatedAt: input.generatedAt,
    domains,
    missingDomains,
  });
}

function validateInput(input: CrossDomainIntelligenceCompositionInput): void {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, ['id', 'generatedAt', 'expectedDomains', 'domains']) ||
    !isIdentifier(input.id) ||
    !isTimestamp(input.generatedAt) ||
    !Array.isArray(input.expectedDomains) ||
    input.expectedDomains.length === 0 ||
    !Array.isArray(input.domains)
  ) {
    throw new CrossDomainCompositionValidationError();
  }
  const expected = new Set<CrossDomainIntelligenceDomain>();
  for (const domain of input.expectedDomains) {
    if (!isSupportedDomain(domain) || expected.has(domain)) {
      throw new CrossDomainCompositionValidationError();
    }
    expected.add(domain);
  }
  const present = new Set<CrossDomainIntelligenceDomain>();
  for (const record of input.domains) {
    if (!isPlainRecord(record) || !isSupportedDomain(record.domain) || present.has(record.domain)) {
      throw new CrossDomainCompositionValidationError();
    }
    present.add(record.domain);
  }
}

function validateRecord(record: CrossDomainIntelligenceInputRecord): void {
  if (!isPlainRecord(record) || !hasExactKeys(record, ['domain', 'result'])) {
    throw new CrossDomainCompositionValidationError();
  }
  switch (record.domain) {
    case FederationDomain.Market:
      validateDomainResult(record.result, FederationDomain.Market, 'comparisons');
      break;
    case FederationDomain.News:
      validateDomainResult(record.result, FederationDomain.News, 'relationships');
      break;
    case FederationDomain.Portfolio:
      validateDomainResult(record.result, FederationDomain.Portfolio, 'comparisons');
      break;
    default:
      throw new CrossDomainCompositionValidationError();
  }
}

function validateDomainResult(
  result: MarketFederationResult | NewsFederationResult | PortfolioFederationResult,
  domain: CrossDomainIntelligenceDomain,
  domainCollection: 'comparisons' | 'relationships',
): void {
  if (
    !isPlainRecord(result) ||
    !hasExactKeys(result, ['federation', domainCollection]) ||
    !Array.isArray(result[domainCollection]) ||
    hasOwn(result, 'selectedObservationId')
  ) {
    throw new CrossDomainCompositionValidationError();
  }
  validateEnvelope(result.federation, domain);
}

function validateEnvelope(
  envelope: FederationEnvelope<unknown>,
  domain: CrossDomainIntelligenceDomain,
): void {
  if (
    !isPlainRecord(envelope) ||
    !hasExactKeys(envelope, [
      'id',
      'domain',
      'generatedAt',
      'status',
      'policy',
      'observations',
      'comparison',
    ]) ||
    envelope.domain !== domain ||
    !Object.values(FederationStatus).includes(envelope.status) ||
    !Array.isArray(envelope.observations)
  ) {
    throw new CrossDomainCompositionValidationError();
  }
  for (const observation of envelope.observations) {
    if (
      !isPlainRecord(observation) ||
      observation.domain !== domain ||
      !isPlainRecord(observation.provider) ||
      !isPlainRecord(observation.provenance) ||
      observation.provider.id !== observation.provenance.providerId ||
      !Object.values(FederationAvailability).includes(
        observation.availability as FederationAvailability,
      ) ||
      !Object.values(FederationFreshness).includes(observation.freshness as FederationFreshness) ||
      !Object.values(FederationEligibility).includes(
        observation.eligibility as FederationEligibility,
      )
    ) {
      throw new CrossDomainCompositionValidationError();
    }
  }
}

function isSupportedDomain(value: unknown): value is CrossDomainIntelligenceDomain {
  return (
    value === FederationDomain.Market ||
    value === FederationDomain.News ||
    value === FederationDomain.Portfolio
  );
}

function domainOrder(domain: CrossDomainIntelligenceDomain): number {
  switch (domain) {
    case FederationDomain.Market:
      return 0;
    case FederationDomain.News:
      return 1;
    case FederationDomain.Portfolio:
      return 2;
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value: object, expected: ReadonlyArray<string>): boolean {
  return (
    Object.keys(value).length === expected.length && expected.every((key) => hasOwn(value, key))
  );
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
    ) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

export class CrossDomainCompositionValidationError extends Error {
  constructor() {
    super('Cross-domain intelligence composition input is invalid.');
    this.name = 'CrossDomainCompositionValidationError';
  }
}
