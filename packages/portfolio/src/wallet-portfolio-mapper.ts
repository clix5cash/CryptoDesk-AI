import type {
  Portfolio,
  PortfolioAccount,
  PortfolioAsset,
  PortfolioId,
  PortfolioPosition,
  PortfolioSnapshot,
  PortfolioSource,
} from './contracts.js';
import { PortfolioAssetKind, PortfolioPositionKind, PortfolioSourceKind } from './contracts.js';
import { PortfolioValidationError } from './errors.js';
import { normalizePortfolioSnapshot } from './normalization.js';
import { normalizeWalletSnapshot, walletAssetIdentity } from './wallet-normalization.js';
import type { WalletAddressValidator, WalletAsset, WalletSnapshot } from './wallet.js';

/** Explicit, provider-neutral destination identities for mapping one wallet observation. */
export interface WalletPortfolioMapping {
  readonly portfolioId: PortfolioId;
  readonly portfolioLabel: string;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly accountId: string;
  readonly accountLabel: string;
  /** Optional caller-supplied account record retained without interpretation. */
  readonly accountExternalRecordId?: string;
}

/** Optional local validation boundary retained from Wallet normalization. */
export interface WalletPortfolioMappingOptions {
  readonly addressValidator?: WalletAddressValidator;
}

/**
 * Maps one canonical wallet observation into an immutable Portfolio snapshot.
 * It preserves exact base-unit balance text and composes existing Wallet and
 * Portfolio validation/normalization boundaries without aggregation.
 */
export function mapWalletSnapshotToPortfolioSnapshot(
  snapshot: WalletSnapshot,
  mapping: WalletPortfolioMapping,
  options: WalletPortfolioMappingOptions = {},
): PortfolioSnapshot {
  validateMapping(mapping);
  const walletSnapshot = normalizeWalletSnapshot(snapshot, {
    ...(options.addressValidator === undefined
      ? {}
      : { addressValidator: options.addressValidator }),
  });
  const portfolio = mapPortfolio(walletSnapshot, mapping);
  const positions = walletSnapshot.balances.map((balance) =>
    mapBalance(balance.asset, balance.amount, walletSnapshot, mapping),
  );

  return normalizePortfolioSnapshot({
    portfolio,
    capturedAt: walletSnapshot.observedAt,
    positions,
  });
}

function mapPortfolio(snapshot: WalletSnapshot, mapping: WalletPortfolioMapping): Portfolio {
  const source: PortfolioSource = {
    id: mapping.sourceId,
    label: mapping.sourceLabel,
    kind: PortfolioSourceKind.Wallet,
    externalRecordId: snapshot.wallet.id,
    networkId: snapshot.wallet.networkId,
    externalLocator: snapshot.wallet.address,
  };
  const account: PortfolioAccount = {
    id: mapping.accountId,
    sourceId: source.id,
    label: mapping.accountLabel,
    externalRecordId: mapping.accountExternalRecordId ?? snapshot.wallet.externalRecordId,
  };

  return {
    id: mapping.portfolioId,
    label: mapping.portfolioLabel,
    sources: [source],
    accounts: [account],
  };
}

function mapBalance(
  walletAsset: WalletAsset,
  amount: string,
  snapshot: WalletSnapshot,
  mapping: WalletPortfolioMapping,
): PortfolioPosition {
  const asset = mapWalletAssetToPortfolioAsset(walletAsset);
  return {
    id: deterministicWalletPositionId(snapshot, walletAsset),
    asset,
    quantity: amount,
    sourceId: mapping.sourceId,
    accountId: mapping.accountId,
    kind: PortfolioPositionKind.AssetBalance,
    externalRecordId: walletAsset.id,
    observedAt: snapshot.observedAt,
  };
}

/** Maps source-supplied asset metadata without interpreting its economics. */
export function mapWalletAssetToPortfolioAsset(asset: WalletAsset): PortfolioAsset {
  return {
    id: asset.id,
    symbol: asset.symbol,
    ...(asset.name === undefined ? {} : { name: asset.name }),
    kind:
      asset.contractAddress === undefined
        ? PortfolioAssetKind.Native
        : PortfolioAssetKind.FungibleToken,
    networkId: asset.networkId,
    ...(asset.contractAddress === undefined ? {} : { contractAddress: asset.contractAddress }),
    decimals: asset.decimals,
  };
}

/** Stable position ID derived only from explicit wallet and asset identities. */
export function deterministicWalletPositionId(
  snapshot: WalletSnapshot,
  asset: WalletAsset,
): string {
  return JSON.stringify([
    snapshot.wallet.id,
    snapshot.wallet.networkId,
    snapshot.wallet.address,
    walletAssetIdentity(asset),
  ]);
}

function validateMapping(mapping: WalletPortfolioMapping): void {
  const values: ReadonlyArray<readonly [string, string]> = [
    [mapping.portfolioId, 'Wallet Portfolio mapping portfolio ID'],
    [mapping.portfolioLabel, 'Wallet Portfolio mapping portfolio label'],
    [mapping.sourceId, 'Wallet Portfolio mapping source ID'],
    [mapping.sourceLabel, 'Wallet Portfolio mapping source label'],
    [mapping.accountId, 'Wallet Portfolio mapping account ID'],
    [mapping.accountLabel, 'Wallet Portfolio mapping account label'],
  ];
  for (const [value, label] of values) {
    if (!value.trim()) throw new PortfolioValidationError(`${label} is required.`);
  }
  if (mapping.accountExternalRecordId !== undefined && !mapping.accountExternalRecordId.trim()) {
    throw new PortfolioValidationError(
      'Wallet Portfolio mapping account external record ID is required.',
    );
  }
}
