import {
  AiExecutionStatus,
  type PortfolioAiModelExecutionRequest,
  type PortfolioAiModelExecutionResult,
  type PortfolioAiModelProviderAdapter,
  PortfolioAiRawExecutionAuthority,
  type PortfolioAiProviderRequestDescriptor,
  validatePortfolioAiProviderRequestDescriptor,
} from '@cryptodesk-ai/ai';

const OPENAI_PROVIDER_ID = 'openai';

/** Runtime-owned configuration. It must never be copied into provider-neutral artifacts. */
export interface OpenAiPortfolioRuntimeConfiguration {
  readonly apiKey: string;
  readonly endpoint: string;
  /** Omitted preserves the existing unbounded runtime behavior. */
  readonly timeoutMs?: number;
}

/** Runtime-local transport input. The authorization value is intentionally not an AI contract. */
export interface OpenAiRuntimeTransportRequest {
  readonly endpoint: string;
  readonly authorization: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
}

/** Minimal runtime-local HTTP response needed by the vendor mapper. */
export interface OpenAiRuntimeTransportResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type OpenAiRuntimeTransport = (
  request: OpenAiRuntimeTransportRequest,
) => Promise<OpenAiRuntimeTransportResponse>;

/**
 * Creates one concrete OpenAI Responses adapter behind the existing AI-owned
 * provider-neutral interface. Configuration and vendor shapes remain captured
 * inside this runtime package.
 */
export function createOpenAiPortfolioModelProviderAdapter(
  configuration: OpenAiPortfolioRuntimeConfiguration,
  transport: OpenAiRuntimeTransport = fetchTransport,
): PortfolioAiModelProviderAdapter {
  const runtime = validateAndDetachConfiguration(configuration);
  if (typeof transport !== 'function') throw new TypeError('OpenAI runtime transport is invalid.');

  return {
    providerId: OPENAI_PROVIDER_ID,
    async execute(request) {
      return executeOpenAiRequest(request, JSON.stringify(request.context), runtime, transport);
    },
    async executeProviderRequest(descriptor) {
      validatePortfolioAiProviderRequestDescriptor(descriptor);
      const request = executionRequestFromDescriptor(descriptor);
      return executeOpenAiRequest(
        request,
        JSON.stringify(descriptor.request.promptDocument),
        runtime,
        transport,
      );
    },
  };
}

async function executeOpenAiRequest(
  request: PortfolioAiModelExecutionRequest,
  input: string,
  runtime: OpenAiPortfolioRuntimeConfiguration,
  transport: OpenAiRuntimeTransport,
): Promise<PortfolioAiModelExecutionResult> {
  if (request.model?.providerId !== OPENAI_PROVIDER_ID) {
    return failed(request, 'provider_identity_mismatch', 'Provider identity is not supported.');
  }
  if (request.model.modelId === undefined) {
    return failed(request, 'model_required', 'An explicit model identity is required.');
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = invokeTransport(transport, {
      endpoint: runtime.endpoint,
      authorization: `Bearer ${runtime.apiKey}`,
      body: { model: request.model.modelId, input },
      signal: controller.signal,
    });
    const { response, payload } =
      runtime.timeoutMs === undefined
        ? await operation
        : await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => {
                controller.abort();
                reject(RUNTIME_TIMEOUT);
              }, runtime.timeoutMs);
            }),
          ]);
    if (!response.ok) {
      return failed(request, 'provider_request_failed', 'The provider request failed.');
    }
    return mapCompletedResponse(request, payload);
  } catch (error) {
    if (error === RUNTIME_TIMEOUT) {
      return failed(request, 'provider_timeout', 'The provider request timed out.');
    }
    return failed(request, 'provider_transport_failed', 'The provider transport failed.');
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

const RUNTIME_TIMEOUT = Symbol('openai-runtime-timeout');

async function invokeTransport(
  transport: OpenAiRuntimeTransport,
  request: OpenAiRuntimeTransportRequest,
): Promise<{ response: OpenAiRuntimeTransportResponse; payload: unknown }> {
  const response = await transport(request);
  return { response, payload: await response.json() };
}

function executionRequestFromDescriptor(
  descriptor: PortfolioAiProviderRequestDescriptor,
): PortfolioAiModelExecutionRequest {
  return {
    executionId: descriptor.executionId,
    context: descriptor.request.promptDocument.plan.input.context,
    model: descriptor.model,
  };
}

async function fetchTransport(
  request: OpenAiRuntimeTransportRequest,
): Promise<OpenAiRuntimeTransportResponse> {
  return fetch(request.endpoint, {
    method: 'POST',
    headers: {
      authorization: request.authorization,
      'content-type': 'application/json',
    },
    body: JSON.stringify(request.body),
    signal: request.signal,
  });
}

function mapCompletedResponse(
  request: PortfolioAiModelExecutionRequest,
  payload: unknown,
): PortfolioAiModelExecutionResult {
  if (!isRecord(payload)) {
    return failed(request, 'provider_response_invalid', 'The provider response is invalid.');
  }
  if (payload.status !== 'completed') {
    return failed(
      request,
      'provider_response_incomplete',
      'The provider response is not complete.',
    );
  }
  if (payload.model !== request.model?.modelId) {
    return failed(
      request,
      'provider_model_identity_mismatch',
      'The provider response model identity conflicts with the request.',
    );
  }
  const output = extractOutput(payload);
  if (output === undefined) {
    return failed(request, 'provider_response_invalid', 'The provider response is invalid.');
  }
  const usage = mapUsage(payload.usage);
  return {
    executionId: request.executionId,
    status: AiExecutionStatus.Completed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    output,
    model: detachModel(request),
    ...(usage === undefined ? {} : { usage }),
  };
}

function extractOutput(payload: Record<string, unknown>): string | undefined {
  if (!Array.isArray(payload.output)) return undefined;
  const text: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === 'output_text' && isNonEmptyString(content.text)) {
        text.push(content.text);
      }
    }
  }
  const output = text.join('');
  return isNonEmptyString(output) ? output : undefined;
}

function mapUsage(value: unknown): { inputUnits?: number; outputUnits?: number } | undefined {
  if (!isRecord(value)) return undefined;
  const inputUnits = safeUnit(value.input_tokens);
  const outputUnits = safeUnit(value.output_tokens);
  if (inputUnits === undefined && outputUnits === undefined) return undefined;
  return {
    ...(inputUnits === undefined ? {} : { inputUnits }),
    ...(outputUnits === undefined ? {} : { outputUnits }),
  };
}

function failed(
  request: PortfolioAiModelExecutionRequest,
  code: string,
  message: string,
): PortfolioAiModelExecutionResult {
  return {
    executionId: request.executionId,
    status: AiExecutionStatus.Failed,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    failure: { code, message },
    ...(request.model === undefined ? {} : { model: detachModel(request) }),
  };
}

function detachModel(request: PortfolioAiModelExecutionRequest) {
  return {
    providerId: request.model?.providerId as string,
    ...(request.model?.modelId === undefined ? {} : { modelId: request.model.modelId }),
  };
}

function validateAndDetachConfiguration(
  value: OpenAiPortfolioRuntimeConfiguration,
): OpenAiPortfolioRuntimeConfiguration {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['apiKey', 'endpoint', 'timeoutMs'].includes(key)) ||
    !isNonEmptyString(value.apiKey) ||
    !isNonEmptyString(value.endpoint) ||
    (value.timeoutMs !== undefined &&
      (!Number.isSafeInteger(value.timeoutMs) || value.timeoutMs <= 0))
  ) {
    throw new TypeError('OpenAI runtime configuration is invalid.');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(value.endpoint);
  } catch {
    throw new TypeError('OpenAI runtime configuration is invalid.');
  }
  if (endpoint.protocol !== 'https:') {
    throw new TypeError('OpenAI runtime configuration is invalid.');
  }
  return {
    apiKey: value.apiKey,
    endpoint: endpoint.toString(),
    ...(value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs }),
  };
}

function safeUnit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
