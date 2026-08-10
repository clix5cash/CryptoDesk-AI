import type { IsoTimestamp } from './contracts.js';

/** Opaque provider-neutral identity for one read-only wallet observation source. */
export type WalletId = string;

/** Source-supplied address text; no chain-specific address interpretation occurs here. */
export type WalletAddress = string;

/** Opaque provider-neutral identifier for the network on which a wallet is observed. */
export type WalletNetworkId = string;

/** Opaque provider-neutral identity for an asset representation held by a wallet. */
export type WalletAssetId = string;

/** Source-supplied block-height text, retained without numeric conversion. */
export type WalletBlockHeight = string;

/** Derived deterministic logical identity for one network-scoped wallet address. */
export type WalletIdentity = string;

/** Immutable raw wallet identity and descriptive metadata. */
export interface WalletMetadata {
  readonly id: WalletId;
  readonly address: WalletAddress;
  readonly networkId: WalletNetworkId;
  readonly label?: string;
  /** Stable external source record only when explicitly supplied. */
  readonly externalRecordId?: string;
}

/** A raw network-scoped asset representation; symbols are descriptive only. */
export interface WalletAsset {
  readonly id: WalletAssetId;
  readonly networkId: WalletNetworkId;
  readonly symbol: string;
  readonly name?: string;
  readonly decimals: number;
  /** Source-supplied token contract locator, absent for a network native asset. */
  readonly contractAddress?: string;
}

/** Exact raw balance observation with no price, valuation, or unit conversion. */
export interface WalletBalance {
  readonly asset: WalletAsset;
  /** Source-supplied base-unit balance retained as text to avoid precision loss. */
  readonly amount: string;
}

/** Immutable point-in-time raw blockchain observation for one wallet. */
export interface WalletSnapshot {
  readonly wallet: WalletMetadata;
  /** Optional source-supplied raw asset catalog, including assets with no balance. */
  readonly assets?: ReadonlyArray<WalletAsset>;
  readonly balances: ReadonlyArray<WalletBalance>;
  readonly observedAt: IsoTimestamp;
  readonly blockHeight?: WalletBlockHeight;
}

/** Provider-neutral, read-only query for one wallet observation. */
export interface WalletSnapshotQuery {
  readonly walletId: WalletId;
  /** Required to prevent a wallet query from being network-ambiguous. */
  readonly networkId: WalletNetworkId;
  readonly asOf?: IsoTimestamp;
}

/** Optional injected validator for chain-specific local address rules. */
export interface WalletAddressValidator {
  validate(networkId: WalletNetworkId, address: WalletAddress): void;
}

/** Read-only adapter capability for resolving raw wallet metadata. */
export interface WalletProvider {
  getWalletMetadata(walletId: WalletId): Promise<WalletMetadata>;
}

/** Read-only adapter capability for retrieving raw wallet balance snapshots. */
export interface WalletSnapshotProvider {
  getSnapshot(query: WalletSnapshotQuery): Promise<WalletSnapshot>;
}
