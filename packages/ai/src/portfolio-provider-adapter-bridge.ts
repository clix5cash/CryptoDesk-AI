import {
  PortfolioAiModelProviderRegistry,
  invokePortfolioAiModelAdapter,
  invokePortfolioAiProviderRequestAdapter,
} from './portfolio-model-adapters.js';
import type { PortfolioAiModelExecutionResult } from './portfolio-model-execution.js';
import {
  type PortfolioAiProviderRequestDescriptor,
  validatePortfolioAiProviderRequestDescriptor,
} from './portfolio-provider-request-descriptor.js';

/**
 * Delegates one validated descriptor through the existing explicit
 * provider-neutral adapter boundary. The returned result remains raw,
 * untrusted model execution output.
 */
export function invokePortfolioAiProviderAdapterBridge(
  registry: PortfolioAiModelProviderRegistry,
  descriptor: PortfolioAiProviderRequestDescriptor,
): Promise<PortfolioAiModelExecutionResult> {
  validatePortfolioAiProviderRequestDescriptor(descriptor);
  const adapter =
    registry instanceof PortfolioAiModelProviderRegistry
      ? registry.get(descriptor.model.providerId)
      : undefined;
  if (adapter?.executeProviderRequest !== undefined) {
    return invokePortfolioAiProviderRequestAdapter(registry, descriptor);
  }
  return invokePortfolioAiModelAdapter(registry, {
    executionId: descriptor.executionId,
    context: descriptor.request.promptDocument.plan.input.context,
    model: descriptor.model,
  });
}
