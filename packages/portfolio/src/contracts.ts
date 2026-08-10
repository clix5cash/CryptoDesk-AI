/** Opaque provider-neutral identity for a logical portfolio. */
export type PortfolioId = string;

/** Opaque identity for an asset held by a portfolio. */
export type PortfolioAssetId = string;

/** Opaque identity for a position within a portfolio snapshot. */
export type PortfolioPositionId = string;

/** Opaque identity for a source that supplied portfolio position data. */
export type PortfolioSourceId = string;

/** Opaque provider-neutral identity for an account within a portfolio source. */
export type PortfolioAccountId = string;

/** Derived deterministic identity for a portfolio asset representation. */
export type PortfolioAssetIdentity = string;

/** Derived deterministic identity for a logical portfolio position. */
export type PortfolioPositionIdentity = string;

/** Derived deterministic identity for a portfolio observation snapshot. */
export type PortfolioSnapshotIdentity = string;

/** Opaque provider-neutral network identifier used to scope asset representations. */
export type PortfolioNetworkId = string;

/** ISO-8601 timestamp supplied by the portfolio domain boundary. */
export type IsoTimestamp = string;

/** Provider-neutral source category; it does not imply a concrete integration. */
export enum PortfolioSourceKind {
  Wallet = 'wallet',
  Exchange = 'exchange',
  Defi = 'defi',
  Manual = 'manual',
  Imported = 'imported',
}

/** Economic representation of an asset held by a portfolio. */
export enum PortfolioAssetKind {
  Native = 'native',
  FungibleToken = 'fungible_token',
  Wrapped = 'wrapped',
}

/** Provider-neutral discriminator for economically distinct position records. */
export enum PortfolioPositionKind {
  AssetBalance = 'asset_balance',
  Lending = 'lending',
  Borrowing = 'borrowing',
  Liquidity = 'liquidity',
  Staking = 'staking',
  Derivative = 'derivative',
  Other = 'other',
}

/** A provider-neutral source descriptor retained for portfolio provenance. */
export interface PortfolioSource {
  readonly id: PortfolioSourceId;
  readonly label: string;
  readonly kind?: PortfolioSourceKind;
}

/** A provider-neutral account owned within a declared portfolio source. */
export interface PortfolioAccount {
  readonly id: PortfolioAccountId;
  readonly sourceId: PortfolioSourceId;
  readonly label: string;
  /** Stable external account identity only when explicitly supplied by the source. */
  readonly externalRecordId?: string;
}

/** Provider-neutral descriptive identity for a portfolio-held asset representation. */
export interface PortfolioAsset {
  readonly id: PortfolioAssetId;
  readonly symbol: string;
  readonly name?: string;
  readonly kind?: PortfolioAssetKind;
  /** Required by future adapters when an asset representation is network-scoped. */
  readonly networkId?: PortfolioNetworkId;
  /** A source-supplied contract or asset-locator string; never derived from the symbol. */
  readonly contractAddress?: string;
  /** Explicit underlying asset for a wrapped representation, when known. */
  readonly underlyingAssetId?: PortfolioAssetId;
}

/** An immutable quantity observation for one explicitly identified economic position. */
export interface PortfolioPosition {
  readonly id: PortfolioPositionId;
  readonly asset: PortfolioAsset;
  readonly quantity: number;
  readonly sourceId?: PortfolioSourceId;
  readonly accountId?: PortfolioAccountId;
  readonly kind?: PortfolioPositionKind;
  /** Stable source-record discriminator for independent positions, when supplied. */
  readonly externalRecordId?: string;
  readonly observedAt: IsoTimestamp;
}

/** Immutable provider-neutral portfolio identity and declared data sources. */
export interface Portfolio {
  readonly id: PortfolioId;
  readonly label: string;
  readonly sources: ReadonlyArray<PortfolioSource>;
  readonly accounts?: ReadonlyArray<PortfolioAccount>;
}

/** Immutable point-in-time portfolio holdings without pricing or analysis. */
export interface PortfolioSnapshot {
  readonly portfolio: Portfolio;
  readonly capturedAt: IsoTimestamp;
  readonly positions: ReadonlyArray<PortfolioPosition>;
}
