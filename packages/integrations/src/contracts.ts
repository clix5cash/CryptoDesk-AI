export type IntegrationId = string;
export type ConnectionId = string;
export type IsoTimestamp = string;

export enum IntegrationCapability {
  MarketData = 'market_data',
  News = 'news',
  Portfolio = 'portfolio',
  OnChainData = 'on_chain_data',
  Notification = 'notification',
  AiExecution = 'ai_execution',
}

export enum IntegrationConnectionStatus {
  Disconnected = 'disconnected',
  Connected = 'connected',
  Degraded = 'degraded',
  Failed = 'failed',
}

export interface IntegrationDescriptor {
  readonly id: IntegrationId;
  readonly displayName: string;
  readonly capabilities: ReadonlyArray<IntegrationCapability>;
}

export interface CredentialReference {
  readonly key: string;
  readonly secretReference: string;
}

export interface IntegrationConnection {
  readonly id: ConnectionId;
  readonly integrationId: IntegrationId;
  readonly status: IntegrationConnectionStatus;
  readonly connectedAt?: IsoTimestamp;
  readonly lastCheckedAt?: IsoTimestamp;
}

export interface IntegrationHealth {
  readonly connectionId: ConnectionId;
  readonly status: IntegrationConnectionStatus;
  readonly checkedAt: IsoTimestamp;
  readonly message?: string;
}

export interface IntegrationError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

/** Provider-neutral lifecycle boundary for an external integration. */
export interface IntegrationConnector {
  readonly descriptor: IntegrationDescriptor;
  connect(credentials: ReadonlyArray<CredentialReference>): Promise<IntegrationConnection>;
  getHealth(connectionId: ConnectionId): Promise<IntegrationHealth>;
  disconnect(connectionId: ConnectionId): Promise<void>;
}
