import { PortfolioValidationError } from './errors.js';
import { validateWalletSnapshotIdentity } from './wallet-identity.js';
import type {
  WalletAddressValidator,
  WalletAsset,
  WalletBalance,
  WalletSnapshot,
} from './wallet.js';

/** Explicit optional dependency for local, network-specific address checks. */
export interface WalletSnapshotNormalizationOptions {
  readonly addressValidator?: WalletAddressValidator;
}

/**
 * Validates, deduplicates, and canonically orders raw wallet observations.
 * It preserves base-unit text and does not convert, aggregate, or map balances.
 */
export function normalizeWalletSnapshot(
  snapshot: WalletSnapshot,
  options: WalletSnapshotNormalizationOptions = {},
): WalletSnapshot {
  validateWalletSnapshotIdentity(snapshot, options.addressValidator);

  const catalogProvided = snapshot.assets !== undefined;
  const assetsById = new Map<string, WalletAsset>();
  for (const asset of snapshot.assets ?? []) {
    registerAsset(assetsById, asset, snapshot.wallet.networkId);
  }

  const balancesByAssetIdentity = new Map<string, WalletBalance>();
  for (const balance of snapshot.balances) {
    validateBalance(balance, snapshot.wallet.networkId);
    const catalogAsset = assetsById.get(balance.asset.id);
    if (catalogProvided && catalogAsset === undefined) {
      throw new PortfolioValidationError(
        `Wallet balance references unknown asset "${balance.asset.id}".`,
      );
    }
    if (catalogAsset !== undefined && assetValue(catalogAsset) !== assetValue(balance.asset)) {
      throw new PortfolioValidationError(
        `Wallet asset ID "${balance.asset.id}" has conflicting catalog and balance records.`,
      );
    }
    if (!catalogProvided) registerAsset(assetsById, balance.asset, snapshot.wallet.networkId);

    const identity = walletAssetIdentity(balance.asset);
    const existing = balancesByAssetIdentity.get(identity);
    if (existing !== undefined && balanceValue(existing) !== balanceValue(balance)) {
      throw new PortfolioValidationError(
        `Wallet balance for asset identity "${identity}" has conflicting observations.`,
      );
    }
    balancesByAssetIdentity.set(identity, existing ?? cloneBalance(balance));
  }

  return {
    wallet: { ...snapshot.wallet },
    ...(catalogProvided
      ? { assets: Array.from(assetsById.values()).map(cloneAsset).sort(compareAssets) }
      : {}),
    balances: Array.from(balancesByAssetIdentity.values()).sort(compareBalances),
    observedAt: snapshot.observedAt,
    ...(snapshot.blockHeight === undefined ? {} : { blockHeight: snapshot.blockHeight }),
  };
}

/** Stable network-scoped identity for ordering and duplicate detection; symbols are excluded. */
export function walletAssetIdentity(asset: WalletAsset): string {
  validateAsset(asset, asset.networkId);
  return JSON.stringify([asset.id, asset.networkId, asset.contractAddress ?? '']);
}

function registerAsset(
  assetsById: Map<string, WalletAsset>,
  asset: WalletAsset,
  walletNetworkId: string,
): void {
  validateAsset(asset, walletNetworkId);
  const existing = assetsById.get(asset.id);
  if (existing !== undefined) {
    if (assetValue(existing) !== assetValue(asset)) {
      throw new PortfolioValidationError(
        `Wallet asset ID "${asset.id}" has conflicting identity or metadata records.`,
      );
    }
    return;
  }
  assetsById.set(asset.id, cloneAsset(asset));
}

function validateAsset(asset: WalletAsset, walletNetworkId: string): void {
  assertNonEmpty(asset.id, 'Wallet asset ID');
  assertNonEmpty(asset.networkId, 'Wallet asset network ID');
  assertNonEmpty(asset.symbol, 'Wallet asset symbol');
  assertOptionalNonEmpty(asset.name, 'Wallet asset name');
  assertOptionalNonEmpty(asset.contractAddress, 'Wallet asset contract address');
  if (!Number.isInteger(asset.decimals) || asset.decimals < 0) {
    throw new PortfolioValidationError('Wallet asset decimals must be a non-negative integer.');
  }
  if (asset.networkId !== walletNetworkId) {
    throw new PortfolioValidationError(
      `Wallet asset "${asset.id}" belongs to network "${asset.networkId}", not wallet network "${walletNetworkId}".`,
    );
  }
}

function validateBalance(balance: WalletBalance, walletNetworkId: string): void {
  validateAsset(balance.asset, walletNetworkId);
  assertNonEmpty(balance.amount, 'Wallet balance amount');
  if (balance.amount.trim() !== balance.amount || /\s/u.test(balance.amount)) {
    throw new PortfolioValidationError('Wallet balance amount must not contain whitespace.');
  }
}

function cloneAsset(asset: WalletAsset): WalletAsset {
  return { ...asset };
}

function cloneBalance(balance: WalletBalance): WalletBalance {
  return { asset: cloneAsset(balance.asset), amount: balance.amount };
}

function compareAssets(left: WalletAsset, right: WalletAsset): number {
  return compareText(walletAssetIdentity(left), walletAssetIdentity(right));
}

function compareBalances(left: WalletBalance, right: WalletBalance): number {
  return compareText(walletAssetIdentity(left.asset), walletAssetIdentity(right.asset));
}

function assetValue(asset: WalletAsset): string {
  return JSON.stringify([
    walletAssetIdentity(asset),
    asset.symbol,
    asset.name ?? '',
    asset.decimals,
  ]);
}

function balanceValue(balance: WalletBalance): string {
  return JSON.stringify([assetValue(balance.asset), balance.amount]);
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new PortfolioValidationError(`${label} is required.`);
}

function assertOptionalNonEmpty(value: string | undefined, label: string): void {
  if (value !== undefined) assertNonEmpty(value, label);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
