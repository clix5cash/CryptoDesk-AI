import type {
  AiCitation,
  AiExecutionId,
  AiExecutionStatus,
  AiMessage,
  AiToolCall,
  AiToolDefinition,
  IsoTimestamp,
  ModelId,
} from './contracts.js';

export type AIProviderId = string;
export type AIRequestId = string;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | ReadonlyArray<JsonValue> | { readonly [key: string]: JsonValue };
export type JsonSchema = { readonly [key: string]: JsonValue };

export enum AIProviderCapability {
  Chat = 'chat',
  Embeddings = 'embeddings',
  StructuredOutput = 'structured_output',
  ToolCalling = 'tool_calling',
}

export interface ProviderModelDescriptor {
  readonly id: ModelId;
  readonly displayName?: string;
  readonly capabilities: ReadonlyArray<AIProviderCapability>;
}

/** Base identity and capability contract shared by every AI provider. */
export interface AIProvider {
  readonly id: AIProviderId;
  readonly displayName: string;
  readonly capabilities: ReadonlyArray<AIProviderCapability>;
  readonly models?: ReadonlyArray<ProviderModelDescriptor>;
}

export interface ChatRequest {
  readonly requestId: AIRequestId;
  readonly model?: ModelId;
  readonly messages: ReadonlyArray<AiMessage>;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly metadata?: Record<string, string>;
}

export interface ChatResponse {
  readonly requestId: AIRequestId;
  readonly status: AiExecutionStatus;
  readonly message?: AiMessage;
  readonly citations: ReadonlyArray<AiCitation>;
  readonly model?: ModelId;
  readonly completedAt?: IsoTimestamp;
}

export interface ChatProvider extends AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export interface EmbeddingRequest {
  readonly requestId: AIRequestId;
  readonly model?: ModelId;
  readonly input: ReadonlyArray<string>;
  readonly dimensions?: number;
  readonly metadata?: Record<string, string>;
}

export interface EmbeddingVector {
  readonly index: number;
  readonly values: ReadonlyArray<number>;
}

export interface EmbeddingResponse {
  readonly requestId: AIRequestId;
  readonly embeddings: ReadonlyArray<EmbeddingVector>;
  readonly model?: ModelId;
  readonly dimensions: number;
  readonly completedAt?: IsoTimestamp;
}

export interface EmbeddingProvider extends AIProvider {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

export interface StructuredOutputRequest {
  readonly requestId: AIRequestId;
  readonly model?: ModelId;
  readonly messages: ReadonlyArray<AiMessage>;
  readonly schemaName: string;
  readonly schema: JsonSchema;
  readonly temperature?: number;
  readonly metadata?: Record<string, string>;
}

export interface StructuredOutputResponse<TOutput = unknown> {
  readonly requestId: AIRequestId;
  readonly status: AiExecutionStatus;
  readonly output?: TOutput;
  readonly rawOutput?: string;
  readonly citations: ReadonlyArray<AiCitation>;
  readonly model?: ModelId;
  readonly completedAt?: IsoTimestamp;
}

export interface StructuredOutputProvider extends AIProvider {
  generateStructured<TOutput>(
    request: StructuredOutputRequest,
  ): Promise<StructuredOutputResponse<TOutput>>;
}

export interface ToolCallingRequest {
  readonly requestId: AIRequestId;
  readonly executionId?: AiExecutionId;
  readonly model?: ModelId;
  readonly messages: ReadonlyArray<AiMessage>;
  readonly tools: ReadonlyArray<AiToolDefinition>;
  readonly temperature?: number;
  readonly metadata?: Record<string, string>;
}

export interface ToolCallingResponse {
  readonly requestId: AIRequestId;
  readonly status: AiExecutionStatus;
  readonly message?: AiMessage;
  readonly toolCalls: ReadonlyArray<AiToolCall>;
  readonly citations: ReadonlyArray<AiCitation>;
  readonly model?: ModelId;
  readonly completedAt?: IsoTimestamp;
}

export interface ToolCallingProvider extends AIProvider {
  createToolCalls(request: ToolCallingRequest): Promise<ToolCallingResponse>;
}

export interface ProviderFactoryRequest {
  readonly providerId: AIProviderId;
  readonly configuration?: Record<string, JsonValue>;
}

export interface ProviderFactoryResponse {
  readonly provider: AIProvider;
  readonly createdAt: IsoTimestamp;
}

/** Creates configured provider instances without coupling callers to a vendor SDK. */
export interface ProviderFactory {
  create(request: ProviderFactoryRequest): Promise<ProviderFactoryResponse>;
  list(): Promise<ReadonlyArray<AIProvider>>;
}
