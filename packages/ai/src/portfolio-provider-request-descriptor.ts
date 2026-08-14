import { type AiExecutionId } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import { type PortfolioAiTask } from './portfolio-intelligence.js';
import {
  type PortfolioAiModelReference,
  validatePortfolioAiModelExecutionRequest,
} from './portfolio-model-execution.js';
import { PortfolioAiMessagePlanOutputContract } from './portfolio-message-plan.js';
import { PortfolioAiPromptDocumentVersion } from './portfolio-prompt-document.js';
import {
  type PortfolioAiProviderRequest,
  validatePortfolioAiProviderRequest,
} from './portfolio-provider-request.js';

/** Provider-neutral logical request parts, never provider message roles. */
export enum PortfolioAiProviderRequestDescriptorBlockKind {
  Instruction = 'instruction',
  Task = 'task',
  Context = 'context',
  Evidence = 'evidence',
  Constraints = 'constraints',
  OutputContract = 'output_contract',
}

export interface PortfolioAiProviderRequestDescriptorInstructionBlock {
  readonly kind: PortfolioAiProviderRequestDescriptorBlockKind.Instruction;
  readonly text: string;
}

export interface PortfolioAiProviderRequestDescriptorTaskBlock {
  readonly kind: PortfolioAiProviderRequestDescriptorBlockKind.Task;
  readonly task: PortfolioAiTask;
  readonly text: string;
}

export interface PortfolioAiProviderRequestDescriptorContextBlock {
  readonly kind: PortfolioAiProviderRequestDescriptorBlockKind.Context;
  readonly sectionIds: ReadonlyArray<string>;
}

export interface PortfolioAiProviderRequestDescriptorEvidenceBlock {
  readonly kind: PortfolioAiProviderRequestDescriptorBlockKind.Evidence;
  readonly factIds: ReadonlyArray<string>;
}

export interface PortfolioAiProviderRequestDescriptorConstraintsBlock {
  readonly kind: PortfolioAiProviderRequestDescriptorBlockKind.Constraints;
  readonly text: string;
}

export interface PortfolioAiProviderRequestDescriptorOutputContractBlock {
  readonly kind: PortfolioAiProviderRequestDescriptorBlockKind.OutputContract;
  readonly outputContract: PortfolioAiMessagePlanOutputContract.CandidateInterpretation;
  readonly text: string;
}

export type PortfolioAiProviderRequestDescriptorBlock =
  | PortfolioAiProviderRequestDescriptorInstructionBlock
  | PortfolioAiProviderRequestDescriptorTaskBlock
  | PortfolioAiProviderRequestDescriptorContextBlock
  | PortfolioAiProviderRequestDescriptorEvidenceBlock
  | PortfolioAiProviderRequestDescriptorConstraintsBlock
  | PortfolioAiProviderRequestDescriptorOutputContractBlock;

/**
 * A detached, abstract provider-shape descriptor. It retains its validated
 * request source and has no concrete provider request body semantics.
 */
export interface PortfolioAiProviderRequestDescriptor {
  readonly executionId: AiExecutionId;
  readonly model: PortfolioAiModelReference;
  readonly promptDocumentVersion: typeof PortfolioAiPromptDocumentVersion;
  readonly request: PortfolioAiProviderRequest;
  readonly blocks: ReadonlyArray<PortfolioAiProviderRequestDescriptorBlock>;
}

/** Maps a validated provider-neutral request into exact ordered logical request parts. */
export function mapPortfolioAiProviderRequest(
  request: PortfolioAiProviderRequest,
): PortfolioAiProviderRequestDescriptor {
  validatePortfolioAiProviderRequest(request);
  const descriptor: PortfolioAiProviderRequestDescriptor = {
    executionId: request.executionId,
    model: clone(request.model),
    promptDocumentVersion: request.promptDocument.version,
    request: clone(request),
    blocks: expectedBlocks(request),
  };
  validatePortfolioAiProviderRequestDescriptor(descriptor);
  return descriptor;
}

/** Validates exact, detached mapping from a provider-neutral request envelope. */
export function validatePortfolioAiProviderRequestDescriptor(
  descriptor: PortfolioAiProviderRequestDescriptor,
): void {
  if (
    !isPlainRecord(descriptor) ||
    !hasOnlyKeys(descriptor, [
      'executionId',
      'model',
      'promptDocumentVersion',
      'request',
      'blocks',
    ]) ||
    descriptor.request === undefined ||
    !Array.isArray(descriptor.blocks)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI provider request descriptor is malformed.');
  }
  try {
    validatePortfolioAiProviderRequest(descriptor.request);
    validatePortfolioAiModelExecutionRequest({
      executionId: descriptor.executionId,
      context: descriptor.request.promptDocument.plan.input.context,
      model: descriptor.model,
    });
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI provider request descriptor source is invalid.');
  }
  if (
    descriptor.executionId !== descriptor.request.executionId ||
    !sameModelReference(descriptor.model, descriptor.request.model) ||
    descriptor.promptDocumentVersion !== descriptor.request.promptDocument.version
  ) {
    throw new AiBoundaryValidationError(
      'Portfolio AI provider request descriptor identity conflicts.',
    );
  }

  const expected = expectedBlocks(descriptor.request);
  if (descriptor.blocks.length !== expected.length) {
    throw new AiBoundaryValidationError(
      'Portfolio AI provider request descriptor blocks are malformed.',
    );
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (JSON.stringify(descriptor.blocks[index]) !== JSON.stringify(expected[index])) {
      throw new AiBoundaryValidationError(
        'Portfolio AI provider request descriptor blocks are malformed.',
      );
    }
  }
}

function expectedBlocks(
  request: PortfolioAiProviderRequest,
): ReadonlyArray<PortfolioAiProviderRequestDescriptorBlock> {
  return request.promptDocument.blocks.map((block) => {
    switch (block.kind) {
      case 'instruction':
        return {
          kind: PortfolioAiProviderRequestDescriptorBlockKind.Instruction,
          text: block.text,
        };
      case 'task':
        return {
          kind: PortfolioAiProviderRequestDescriptorBlockKind.Task,
          task: block.task,
          text: block.text,
        };
      case 'context':
        return {
          kind: PortfolioAiProviderRequestDescriptorBlockKind.Context,
          sectionIds: clone(block.sectionIds),
        };
      case 'evidence':
        return {
          kind: PortfolioAiProviderRequestDescriptorBlockKind.Evidence,
          factIds: clone(block.factIds),
        };
      case 'constraints':
        return {
          kind: PortfolioAiProviderRequestDescriptorBlockKind.Constraints,
          text: block.text,
        };
      case 'output_contract':
        return {
          kind: PortfolioAiProviderRequestDescriptorBlockKind.OutputContract,
          outputContract: block.outputContract,
          text: block.text,
        };
    }
    throw new AiBoundaryValidationError('Portfolio AI prompt document block is invalid.');
  });
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
