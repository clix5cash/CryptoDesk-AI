export type PortfolioId = string;
export type AccountId = string;
export type AssetId = string;
export type PositionId = string;
export type IsoTimestamp = string;

export enum AccountKind {
  Wallet = 'wallet',
  Exchange = 'exchange',
  Custody = 'custody',
}

export enum PositionKind {
  Spot = 'spot',
  Derivative = 'derivative',
  Lending = 'lending',
  Borrowing = 'borrowing',
  LiquidityPool = 'liquidity_pool',
  Staking = 'staking',
}

export enum RiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export interface PortfolioAccount {
  readonly id: AccountId;
  readonly portfolioId: PortfolioId;
  readonly kind: AccountKind;
  readonly label: string;
  readonly chainId?: string;
}

export interface PortfolioPosition {
  readonly id: PositionId;
  readonly accountId: AccountId;
  readonly assetId: AssetId;
  readonly kind: PositionKind;
  readonly quantity: number;
  readonly marketValue?: number;
  readonly valuationCurrency: string;
  readonly observedAt: IsoTimestamp;
}

export interface PortfolioExposure {
  readonly dimension: string;
  readonly value: string;
  readonly marketValue: number;
  readonly percentage: number;
}

export interface PortfolioRisk {
  readonly level: RiskLevel;
  readonly category: string;
  readonly summary: string;
  readonly affectedPositionIds: ReadonlyArray<PositionId>;
}

export interface PortfolioSnapshot {
  readonly portfolioId: PortfolioId;
  readonly capturedAt: IsoTimestamp;
  readonly totalValue: number;
  readonly valuationCurrency: string;
  readonly positions: ReadonlyArray<PortfolioPosition>;
  readonly exposures: ReadonlyArray<PortfolioExposure>;
  readonly risks: ReadonlyArray<PortfolioRisk>;
}

/** Provider-neutral boundary for portfolio snapshots. */
export interface PortfolioDataProvider {
  getSnapshot(portfolioId: PortfolioId, asOf?: IsoTimestamp): Promise<PortfolioSnapshot>;
}
