/** An ISO 8601 timestamp represented as a string. */
export type IsoTimestamp = string;

/** A stable identifier supplied by an AI model provider. */
export type ModelId = string;

/** A stable identifier for an AI execution request. */
export type AiExecutionId = string;

export enum AiMessageRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
}

export enum AiExecutionStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface AiMessage {
  readonly role: AiMessageRole;
  readonly content: string;
  readonly createdAt?: IsoTimestamp;
  readonly name?: string;
}

export interface AiToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface AiToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface AiCitation {
  readonly sourceId: string;
  readonly label: string;
  readonly url?: string;
  readonly excerpt?: string;
}

export interface AiCompletionRequest {
  readonly executionId: AiExecutionId;
  readonly model?: ModelId;
  readonly messages: ReadonlyArray<AiMessage>;
  readonly tools?: ReadonlyArray<AiToolDefinition>;
  readonly temperature?: number;
  readonly metadata?: Record<string, string>;
}

export interface AiCompletionResponse {
  readonly executionId: AiExecutionId;
  readonly status: AiExecutionStatus;
  readonly message?: AiMessage;
  readonly toolCalls: ReadonlyArray<AiToolCall>;
  readonly citations: ReadonlyArray<AiCitation>;
  readonly model?: ModelId;
  readonly completedAt?: IsoTimestamp;
}

/** Provider-neutral boundary for model inference. */
export interface AiExecutionProvider {
  execute(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
