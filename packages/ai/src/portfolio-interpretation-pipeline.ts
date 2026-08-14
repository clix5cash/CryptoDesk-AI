import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiCandidateAssemblyItem,
  assemblePortfolioAiCandidateInterpretation,
} from './portfolio-candidate-assembly.js';
import { groundPortfolioAiCandidateInterpretation } from './portfolio-candidate-grounding.js';
import {
  buildPortfolioAiContext,
  type PortfolioAiBuiltContext,
  type PortfolioAiContextBuilderInput,
  type PortfolioAiContextSelectionOptions,
} from './portfolio-intelligence-context.js';
import { type PortfolioAiCandidateInterpretationResult } from './portfolio-model-output-interpretation.js';
import {
  type PortfolioAiModelExecutionRequest,
  type PortfolioAiModelExecutionResult,
  type PortfolioAiModelReference,
} from './portfolio-model-execution.js';
import { PortfolioAiModelExecutionService } from './portfolio-model-execution-service.js';
import type { PortfolioAiGroundedInterpretationResult } from './portfolio-grounded-interpretation.js';

/** Explicit provider/model selection fields for one orchestration run. */
export type PortfolioAiInterpretationPipelineExecutionInput = Pick<
  PortfolioAiModelExecutionRequest,
  'executionId' | 'model'
>;

/** Caller-owned inputs for the opt-in deterministic Portfolio AI composition boundary. */
export interface PortfolioAiInterpretationPipelineInput {
  readonly context: PortfolioAiContextBuilderInput;
  readonly contextOptions?: PortfolioAiContextSelectionOptions;
  readonly execution: PortfolioAiInterpretationPipelineExecutionInput;
  readonly candidates: ReadonlyArray<PortfolioAiCandidateAssemblyItem>;
}

/** Existing trust-boundary artifacts produced by one explicitly requested run. */
export interface PortfolioAiInterpretationPipelineResult {
  readonly context: PortfolioAiBuiltContext;
  readonly request: PortfolioAiModelExecutionRequest;
  readonly execution: PortfolioAiModelExecutionResult;
  readonly candidate: PortfolioAiCandidateInterpretationResult;
  readonly grounded: PortfolioAiGroundedInterpretationResult;
}

/**
 * Thin opt-in coordinator for the completed 8A–8C boundaries. It neither
 * parses raw output nor adds authority, policy, provider selection, or facts.
 */
export class PortfolioAiInterpretationPipeline {
  constructor(private readonly executionService: PortfolioAiModelExecutionService) {}

  async execute(
    input: PortfolioAiInterpretationPipelineInput,
  ): Promise<PortfolioAiInterpretationPipelineResult> {
    validateInput(input);
    const context = buildPortfolioAiContext(input.context, input.contextOptions);
    const transientRequest: PortfolioAiModelExecutionRequest = {
      executionId: input.execution.executionId,
      context,
      ...(input.execution.model === undefined ? {} : { model: input.execution.model }),
    };
    const execution = await this.executionService.execute(transientRequest);
    const request = detachedRequest(transientRequest);
    const candidate = assemblePortfolioAiCandidateInterpretation({
      context,
      request,
      execution,
      candidates: input.candidates,
    });
    const grounded = groundPortfolioAiCandidateInterpretation({
      context,
      request,
      execution,
      candidate,
    });
    return { context, request, execution, candidate, grounded };
  }
}

function validateInput(input: PortfolioAiInterpretationPipelineInput): void {
  if (
    !isPlainRecord(input) ||
    !hasOnlyKeys(input, ['context', 'contextOptions', 'execution', 'candidates']) ||
    !isPlainRecord(input.execution) ||
    !hasOnlyKeys(input.execution, ['executionId', 'model']) ||
    !Array.isArray(input.candidates)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI interpretation pipeline input is malformed.');
  }
}

function detachedRequest(
  request: PortfolioAiModelExecutionRequest,
): PortfolioAiModelExecutionRequest {
  return {
    executionId: request.executionId,
    context: request.context,
    ...(request.model === undefined ? {} : { model: detachedModel(request.model) }),
  };
}

function detachedModel(model: PortfolioAiModelReference): PortfolioAiModelReference {
  return {
    providerId: model.providerId,
    ...(model.modelId === undefined ? {} : { modelId: model.modelId }),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
