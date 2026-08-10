import type {
  Portfolio,
  PortfolioAccount,
  PortfolioAsset,
  PortfolioPosition,
  PortfolioSnapshot,
  PortfolioSource,
} from './contracts.js';
import { PortfolioValidationError } from './errors.js';
import {
  portfolioAssetIdentity,
  portfolioPositionIdentity,
  validatePortfolioSnapshotIdentity,
} from './identity.js';

/**
 * Validates, deduplicates equivalent observations, and canonically orders an
 * immutable snapshot. It does not aggregate quantities or derive new facts.
 */
export function normalizePortfolioSnapshot(snapshot: PortfolioSnapshot): PortfolioSnapshot {
  const positionsByIdentity = new Map<string, PortfolioPosition>();

  for (const position of snapshot.positions) {
    const identity = portfolioPositionIdentity(position);
    const existing = positionsByIdentity.get(identity);
    if (existing !== undefined && positionValue(existing) !== positionValue(position)) {
      throw new PortfolioValidationError(
        `Portfolio position identity "${identity}" has conflicting observations.`,
      );
    }
    positionsByIdentity.set(identity, existing ?? clonePosition(position));
  }

  const normalized: PortfolioSnapshot = {
    portfolio: normalizePortfolio(snapshot.portfolio),
    capturedAt: snapshot.capturedAt,
    positions: Array.from(positionsByIdentity.values()).sort(comparePositions),
  };

  validatePortfolioSnapshotIdentity(normalized);
  return normalized;
}

function normalizePortfolio(portfolio: Portfolio): Portfolio {
  return {
    id: portfolio.id,
    label: portfolio.label,
    sources: portfolio.sources
      .map(cloneSource)
      .sort((left, right) => compareText(left.id, right.id)),
    ...(portfolio.accounts === undefined
      ? {}
      : {
          accounts: portfolio.accounts
            .map(cloneAccount)
            .sort(
              (left, right) =>
                compareText(left.sourceId, right.sourceId) || compareText(left.id, right.id),
            ),
        }),
  };
}

function cloneSource(source: PortfolioSource): PortfolioSource {
  return { ...source };
}

function cloneAccount(account: PortfolioAccount): PortfolioAccount {
  return { ...account };
}

function clonePosition(position: PortfolioPosition): PortfolioPosition {
  return {
    ...position,
    asset: cloneAsset(position.asset),
  };
}

function cloneAsset(asset: PortfolioAsset): PortfolioAsset {
  return { ...asset };
}

function comparePositions(left: PortfolioPosition, right: PortfolioPosition): number {
  return (
    compareText(portfolioAssetIdentity(left.asset), portfolioAssetIdentity(right.asset)) ||
    compareText(portfolioPositionIdentity(left), portfolioPositionIdentity(right)) ||
    compareText(left.observedAt, right.observedAt)
  );
}

function positionValue(position: PortfolioPosition): string {
  return JSON.stringify([
    position.id,
    position.sourceId ?? '',
    position.accountId ?? '',
    position.kind ?? '',
    position.externalRecordId ?? '',
    portfolioAssetIdentity(position.asset),
    position.quantity,
    position.observedAt,
  ]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
