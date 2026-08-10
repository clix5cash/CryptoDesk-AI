import type {
  Portfolio,
  PortfolioAsset,
  PortfolioAssetIdentity,
  PortfolioPosition,
  PortfolioPositionIdentity,
  PortfolioSnapshot,
  PortfolioSnapshotIdentity,
} from './contracts.js';
import { PortfolioValidationError } from './errors.js';

/**
 * Creates a deterministic representation identity from explicit asset fields.
 * Symbols are descriptive only and cannot identify an asset by themselves.
 */
export function portfolioAssetIdentity(asset: PortfolioAsset): PortfolioAssetIdentity {
  assertNonEmpty(asset.id, 'Portfolio asset ID');
  assertNonEmpty(asset.symbol, 'Portfolio asset symbol');
  assertOptionalNonEmpty(asset.networkId, 'Portfolio asset network ID');
  assertOptionalNonEmpty(asset.contractAddress, 'Portfolio asset contract address');
  assertOptionalNonEmpty(asset.underlyingAssetId, 'Portfolio underlying asset ID');

  return JSON.stringify([
    asset.id,
    asset.kind ?? '',
    asset.networkId ?? '',
    asset.contractAddress ?? '',
    asset.underlyingAssetId ?? '',
  ]);
}

/**
 * Creates a deterministic logical-position identity scoped by its explicit
 * source and account provenance. A position ID must be stable across repeated
 * observations; independent positions require distinct IDs or source/account scope.
 */
export function portfolioPositionIdentity(position: PortfolioPosition): PortfolioPositionIdentity {
  assertNonEmpty(position.id, 'Portfolio position ID');
  assertOptionalNonEmpty(position.sourceId, 'Portfolio position source ID');
  assertOptionalNonEmpty(position.accountId, 'Portfolio position account ID');
  assertOptionalNonEmpty(position.externalRecordId, 'Portfolio position external record ID');
  portfolioAssetIdentity(position.asset);

  return JSON.stringify([position.sourceId ?? '', position.accountId ?? '', position.id]);
}

/**
 * Creates a deterministic observation identity from portfolio ID and the
 * explicitly supplied as-of (`capturedAt`) timestamp. It never reads a clock.
 */
export function portfolioSnapshotIdentity(snapshot: PortfolioSnapshot): PortfolioSnapshotIdentity {
  assertNonEmpty(snapshot.portfolio.id, 'Portfolio ID');
  assertIsoTimestamp(snapshot.capturedAt, 'Portfolio snapshot capturedAt');
  return JSON.stringify([snapshot.portfolio.id, snapshot.capturedAt]);
}

/**
 * Validates identity invariants only. It deliberately does not normalize,
 * merge, price, value, or otherwise interpret portfolio positions.
 */
export function validatePortfolioSnapshotIdentity(snapshot: PortfolioSnapshot): void {
  portfolioSnapshotIdentity(snapshot);
  validatePortfolioIdentity(snapshot.portfolio);

  const positions = new Map<PortfolioPositionIdentity, PortfolioPosition>();
  const assets = new Map<string, PortfolioAssetIdentity>();

  for (const position of snapshot.positions) {
    assertIsoTimestamp(position.observedAt, 'Portfolio position observedAt');
    assertQuantity(position.quantity);
    const identity = portfolioPositionIdentity(position);
    const assetIdentity = portfolioAssetIdentity(position.asset);
    const existingAsset = assets.get(position.asset.id);
    if (existingAsset !== undefined && existingAsset !== assetIdentity) {
      throw new PortfolioValidationError(
        `Portfolio asset ID "${position.asset.id}" has conflicting identity fields.`,
      );
    }
    assets.set(position.asset.id, assetIdentity);

    if (position.sourceId !== undefined && !hasSource(snapshot.portfolio, position.sourceId)) {
      throw new PortfolioValidationError(
        `Portfolio position "${position.id}" references unknown source "${position.sourceId}".`,
      );
    }
    if (position.accountId !== undefined) {
      const account = snapshot.portfolio.accounts?.find(
        (candidate) => candidate.id === position.accountId,
      );
      if (account === undefined) {
        throw new PortfolioValidationError(
          `Portfolio position "${position.id}" references unknown account "${position.accountId}".`,
        );
      }
      if (position.sourceId !== undefined && position.sourceId !== account.sourceId) {
        throw new PortfolioValidationError(
          `Portfolio position "${position.id}" has conflicting source and account identity.`,
        );
      }
    }

    const existing = positions.get(identity);
    if (existing !== undefined) {
      if (positionFingerprint(existing) !== positionFingerprint(position)) {
        throw new PortfolioValidationError(
          `Portfolio position identity "${identity}" has conflicting records.`,
        );
      }
      throw new PortfolioValidationError(
        `Portfolio snapshot contains duplicate position "${identity}".`,
      );
    }
    positions.set(identity, position);
  }
}

function validatePortfolioIdentity(portfolio: Portfolio): void {
  assertNonEmpty(portfolio.id, 'Portfolio ID');
  assertNonEmpty(portfolio.label, 'Portfolio label');
  assertUniqueNonEmpty(
    portfolio.sources.map((source) => source.id),
    'Portfolio source ID',
  );
  for (const source of portfolio.sources) {
    assertNonEmpty(source.label, 'Portfolio source label');
  }

  const accounts = portfolio.accounts ?? [];
  assertUniqueNonEmpty(
    accounts.map((account) => account.id),
    'Portfolio account ID',
  );
  for (const account of accounts) {
    assertNonEmpty(account.sourceId, 'Portfolio account source ID');
    assertNonEmpty(account.label, 'Portfolio account label');
    assertOptionalNonEmpty(account.externalRecordId, 'Portfolio account external record ID');
    if (!hasSource(portfolio, account.sourceId)) {
      throw new PortfolioValidationError(
        `Portfolio account "${account.id}" references unknown source "${account.sourceId}".`,
      );
    }
  }
}

function positionFingerprint(position: PortfolioPosition): string {
  return JSON.stringify([
    portfolioAssetIdentity(position.asset),
    position.kind ?? '',
    position.externalRecordId ?? '',
  ]);
}

function hasSource(portfolio: Portfolio, sourceId: string): boolean {
  return portfolio.sources.some((source) => source.id === sourceId);
}

function assertUniqueNonEmpty(values: ReadonlyArray<string>, label: string): void {
  const identities = new Set<string>();
  for (const value of values) {
    assertNonEmpty(value, label);
    if (identities.has(value)) {
      throw new PortfolioValidationError(`${label} "${value}" is duplicated.`);
    }
    identities.add(value);
  }
}

function assertOptionalNonEmpty(value: string | undefined, label: string): void {
  if (value !== undefined) assertNonEmpty(value, label);
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new PortfolioValidationError(`${label} is required.`);
}

function assertIsoTimestamp(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new PortfolioValidationError(`${label} must be a valid ISO timestamp.`);
  }
}

function assertQuantity(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new PortfolioValidationError(
      'Portfolio position quantity must be a finite non-negative number.',
    );
  }
}
