import {
  PortfolioAiModelProviderRegistry,
  invokePortfolioAiModelAdapter,
} from './portfolio-model-adapters.js';
import type {
  PortfolioAiModelExecutionRequest,
  PortfolioAiModelExecutionResult,
} from './portfolio-model-execution.js';

/**
 * Thin opt-in composition service for one explicit provider-neutral execution.
 * Validation, resolution, invocation, result detachment, and failure
 * normalization remain owned by the existing 8B.1/8B.2 boundaries.
 */
export class PortfolioAiModelExecutionService {
  constructor(private readonly registry: PortfolioAiModelProviderRegistry) {}

  execute(request: PortfolioAiModelExecutionRequest): Promise<PortfolioAiModelExecutionResult> {
    return invokePortfolioAiModelAdapter(this.registry, request);
  }
}
