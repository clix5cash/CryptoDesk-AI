import type { ModelId } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import type { AIProviderId } from './providers.js';
import {
  type PortfolioAiModelExecutionRequest,
  type PortfolioAiModelExecutionResult,
  type PortfolioAiModelReference,
  validatePortfolioAiModelExecutionRequest,
  validatePortfolioAiModelExecutionResult,
} from './portfolio-model-execution.js';

/** A provider-neutral async adapter for one explicitly selected opaque provider identity. */
export interface PortfolioAiModelProviderAdapter {
  readonly providerId: AIProviderId;
  /** Omitted means this adapter places no contract-level restriction on opaque model IDs. */
  readonly supportedModels?: ReadonlyArray<ModelId>;
  execute(request: PortfolioAiModelExecutionRequest): Promise<PortfolioAiModelExecutionResult>;
}

/** Detached registry view; functions are deliberately not exposed through deterministic listing. */
export interface PortfolioAiModelProviderDescriptor {
  readonly providerId: AIProviderId;
  readonly supportedModels?: ReadonlyArray<ModelId>;
}

/**
 * Explicit instance-scoped registration and resolution for Portfolio execution adapters.
 * It has no auto-registration, provider discovery, fallback, or routing policy.
 */
export class PortfolioAiModelProviderRegistry {
  private readonly adapters = new Map<AIProviderId, PortfolioAiModelProviderAdapter>();

  register(adapter: PortfolioAiModelProviderAdapter): void {
    validateAdapter(adapter);
    if (this.adapters.has(adapter.providerId)) {
      throw new AiBoundaryValidationError(
        `Portfolio AI model provider "${adapter.providerId}" is already registered.`,
      );
    }
    this.adapters.set(adapter.providerId, adapter);
  }

  /** Returns false for an unknown provider; this never mutates another registration. */
  unregister(providerId: AIProviderId): boolean {
    validateProviderId(providerId);
    return this.adapters.delete(providerId);
  }

  get(providerId: AIProviderId): PortfolioAiModelProviderAdapter | undefined {
    validateProviderId(providerId);
    return this.adapters.get(providerId);
  }

  /** Deterministic, detached provider descriptors sorted by opaque provider identity. */
  list(): ReadonlyArray<PortfolioAiModelProviderDescriptor> {
    return Array.from(this.adapters.values())
      .map((adapter) => descriptor(adapter))
      .sort((left, right) => left.providerId.localeCompare(right.providerId));
  }

  /** Resolves only the request's explicit provider/model reference; no fallback exists. */
  resolve(reference: PortfolioAiModelReference): PortfolioAiModelProviderAdapter {
    validateModelReference(reference);
    const adapter = this.adapters.get(reference.providerId);
    if (adapter === undefined) {
      throw new AiBoundaryValidationError(
        `Portfolio AI model provider "${reference.providerId}" is not registered.`,
      );
    }
    if (
      adapter.supportedModels !== undefined &&
      (reference.modelId === undefined || !adapter.supportedModels.includes(reference.modelId))
    ) {
      throw new AiBoundaryValidationError(
        `Portfolio AI model "${reference.modelId ?? ''}" is not supported by provider "${reference.providerId}".`,
      );
    }
    return adapter;
  }
}

/**
 * Resolves and invokes one explicit adapter only. Returned data remains raw,
 * untrusted model output and must still pass separate grounding validation.
 */
export async function invokePortfolioAiModelAdapter(
  registry: PortfolioAiModelProviderRegistry,
  request: PortfolioAiModelExecutionRequest,
): Promise<PortfolioAiModelExecutionResult> {
  if (!(registry instanceof PortfolioAiModelProviderRegistry)) {
    throw new AiBoundaryValidationError('Portfolio AI model provider registry is invalid.');
  }
  validatePortfolioAiModelExecutionRequest(request);
  if (request.model === undefined) {
    throw new AiBoundaryValidationError('Portfolio AI model provider selection must be explicit.');
  }
  const adapter = registry.resolve(request.model);
  let result: PortfolioAiModelExecutionResult;
  try {
    result = await adapter.execute(clone(request));
  } catch {
    throw new AiBoundaryValidationError('Portfolio AI model adapter invocation failed.');
  }
  validatePortfolioAiModelExecutionResult(request, result);
  return clone(result);
}

function validateAdapter(adapter: PortfolioAiModelProviderAdapter): void {
  if (
    !isPlainRecord(adapter) ||
    !hasOnlyKeys(adapter, ['providerId', 'supportedModels', 'execute']) ||
    !isNonEmptyString(adapter.providerId) ||
    typeof adapter.execute !== 'function'
  ) {
    throw new AiBoundaryValidationError('Portfolio AI model provider adapter is malformed.');
  }
  if (adapter.supportedModels !== undefined) {
    if (!Array.isArray(adapter.supportedModels)) {
      throw new AiBoundaryValidationError(
        'Portfolio AI model provider supported models are invalid.',
      );
    }
    const models = new Set<string>();
    for (const modelId of adapter.supportedModels) {
      if (!isNonEmptyString(modelId) || models.has(modelId)) {
        throw new AiBoundaryValidationError(
          'Portfolio AI model provider supported models are invalid.',
        );
      }
      models.add(modelId);
    }
  }
}

function validateModelReference(reference: PortfolioAiModelReference): void {
  if (
    !isPlainRecord(reference) ||
    !hasOnlyKeys(reference, ['providerId', 'modelId']) ||
    !isNonEmptyString(reference.providerId) ||
    (reference.modelId !== undefined && !isNonEmptyString(reference.modelId))
  ) {
    throw new AiBoundaryValidationError('Portfolio AI model reference is malformed.');
  }
}

function validateProviderId(providerId: AIProviderId): void {
  if (!isNonEmptyString(providerId)) {
    throw new AiBoundaryValidationError('Portfolio AI model provider ID is invalid.');
  }
}

function descriptor(adapter: PortfolioAiModelProviderAdapter): PortfolioAiModelProviderDescriptor {
  return {
    providerId: adapter.providerId,
    ...(adapter.supportedModels === undefined
      ? {}
      : { supportedModels: [...adapter.supportedModels] }),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
