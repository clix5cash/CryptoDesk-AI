import { type AiExecutionId } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiModelReference,
  PortfolioAiRawExecutionAuthority,
  validatePortfolioAiModelExecutionRequest,
} from './portfolio-model-execution.js';
import {
  type PortfolioAiNormalizedProviderResponse,
  validatePortfolioAiNormalizedProviderResponse,
} from './portfolio-normalized-provider-response.js';
import {
  type PortfolioAiProviderRequestDescriptor,
  validatePortfolioAiProviderRequestDescriptor,
} from './portfolio-provider-request-descriptor.js';

/**
 * One provider-neutral request/response round trip. Canonical evidence remains
 * owned by the existing request chain; raw output remains untrusted and opaque.
 */
export interface PortfolioAiProviderExchange {
  readonly executionId: AiExecutionId;
  readonly model: PortfolioAiModelReference;
  readonly status: PortfolioAiNormalizedProviderResponse['status'];
  readonly authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution;
  readonly descriptor: PortfolioAiProviderRequestDescriptor;
  readonly response: PortfolioAiNormalizedProviderResponse;
}

/** Binds existing validated artifacts into one detached provider-neutral exchange. */
export function createPortfolioAiProviderExchange(
  descriptor: PortfolioAiProviderRequestDescriptor,
  response: PortfolioAiNormalizedProviderResponse,
): PortfolioAiProviderExchange {
  const exchange: PortfolioAiProviderExchange = {
    executionId: descriptor.executionId,
    model: clone(descriptor.model),
    status: response.status,
    authority: PortfolioAiRawExecutionAuthority.UntrustedModelExecution,
    descriptor: clone(descriptor),
    response: clone(response),
  };
  validatePortfolioAiProviderExchange(exchange);
  return exchange;
}

/** Validates exact request/descriptor/normalized-response ownership and identity. */
export function validatePortfolioAiProviderExchange(exchange: PortfolioAiProviderExchange): void {
  if (
    !isPlainRecord(exchange) ||
    !hasOnlyKeys(exchange, [
      'executionId',
      'model',
      'status',
      'authority',
      'descriptor',
      'response',
    ]) ||
    exchange.model === undefined ||
    exchange.descriptor === undefined ||
    exchange.response === undefined
  ) {
    throw new AiBoundaryValidationError('Portfolio AI provider exchange is malformed.');
  }
  try {
    validatePortfolioAiProviderRequestDescriptor(exchange.descriptor);
    validatePortfolioAiModelExecutionRequest({
      executionId: exchange.executionId,
      context: exchange.descriptor.request.promptDocument.plan.input.context,
      model: exchange.model,
    });
    validatePortfolioAiNormalizedProviderResponse(exchange.descriptor, exchange.response);
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI provider exchange reference is invalid.');
  }
  if (
    exchange.executionId !== exchange.descriptor.executionId ||
    exchange.executionId !== exchange.response.executionId ||
    !sameModelReference(exchange.model, exchange.descriptor.model) ||
    !sameModelReference(exchange.model, exchange.response.model) ||
    exchange.status !== exchange.response.status ||
    exchange.authority !== PortfolioAiRawExecutionAuthority.UntrustedModelExecution ||
    exchange.authority !== exchange.response.authority
  ) {
    throw new AiBoundaryValidationError('Portfolio AI provider exchange identity conflicts.');
  }
}

function sameModelReference(
  left: PortfolioAiModelReference,
  right: PortfolioAiModelReference,
): boolean {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function asBoundaryError(error: unknown, fallback: string): AiBoundaryValidationError {
  return new AiBoundaryValidationError(error instanceof Error ? error.message : fallback);
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
    ) as T;
  }
  return value;
}
