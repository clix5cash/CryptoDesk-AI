/** Opaque provider-neutral identity for a logical portfolio. */
export type PortfolioId = string;

/** Opaque identity for an asset held by a portfolio. */
export type PortfolioAssetId = string;

/** Opaque identity for a position within a portfolio snapshot. */
export type PortfolioPositionId = string;

/** Opaque identity for a source that supplied portfolio position data. */
export type PortfolioSourceId = string;

/** ISO-8601 timestamp supplied by the portfolio domain boundary. */
export type IsoTimestamp = string;

/** A provider-neutral source descriptor retained for portfolio provenance. */
export interface PortfolioSource {
  readonly id: PortfolioSourceId;
  readonly label: string;
}

/** Provider-neutral descriptive identity for a portfolio-held asset. */
export interface PortfolioAsset {
  readonly id: PortfolioAssetId;
  readonly symbol: string;
  readonly name?: string;
}

/** An immutable quantity observation for one explicitly identified portfolio asset. */
export interface PortfolioPosition {
  readonly id: PortfolioPositionId;
  readonly asset: PortfolioAsset;
  readonly quantity: number;
  readonly sourceId?: PortfolioSourceId;
  readonly observedAt: IsoTimestamp;
}

/** Immutable provider-neutral portfolio identity and declared data sources. */
export interface Portfolio {
  readonly id: PortfolioId;
  readonly label: string;
  readonly sources: ReadonlyArray<PortfolioSource>;
}

/** Immutable point-in-time portfolio holdings without pricing or analysis. */
export interface PortfolioSnapshot {
  readonly portfolio: Portfolio;
  readonly capturedAt: IsoTimestamp;
  readonly positions: ReadonlyArray<PortfolioPosition>;
}
