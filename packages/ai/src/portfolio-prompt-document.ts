import { AiBoundaryValidationError } from './errors.js';
import { type PortfolioAiTask } from './portfolio-intelligence.js';
import {
  PortfolioAiMessagePlanItemKind,
  PortfolioAiMessagePlanOutputContract,
  type PortfolioAiMessagePlan,
  validatePortfolioAiMessagePlan,
} from './portfolio-message-plan.js';

/** Static repository-owned document shape version; it is not a package or provider version. */
export const PortfolioAiPromptDocumentVersion = '1';

/** Provider-neutral logical blocks, not provider message roles. */
export enum PortfolioAiPromptBlockKind {
  Instruction = 'instruction',
  Task = 'task',
  Context = 'context',
  Evidence = 'evidence',
  Constraints = 'constraints',
  OutputContract = 'output_contract',
}

export interface PortfolioAiPromptInstructionBlock {
  readonly kind: PortfolioAiPromptBlockKind.Instruction;
  readonly text: string;
}

export interface PortfolioAiPromptTaskBlock {
  readonly kind: PortfolioAiPromptBlockKind.Task;
  readonly task: PortfolioAiTask;
  readonly text: string;
}

export interface PortfolioAiPromptContextBlock {
  readonly kind: PortfolioAiPromptBlockKind.Context;
  readonly sectionIds: ReadonlyArray<string>;
}

export interface PortfolioAiPromptEvidenceBlock {
  readonly kind: PortfolioAiPromptBlockKind.Evidence;
  readonly factIds: ReadonlyArray<string>;
}

export interface PortfolioAiPromptConstraintsBlock {
  readonly kind: PortfolioAiPromptBlockKind.Constraints;
  readonly text: string;
}

export interface PortfolioAiPromptOutputContractBlock {
  readonly kind: PortfolioAiPromptBlockKind.OutputContract;
  readonly outputContract: PortfolioAiMessagePlanOutputContract.CandidateInterpretation;
  readonly text: string;
}

export type PortfolioAiPromptBlock =
  | PortfolioAiPromptInstructionBlock
  | PortfolioAiPromptTaskBlock
  | PortfolioAiPromptContextBlock
  | PortfolioAiPromptEvidenceBlock
  | PortfolioAiPromptConstraintsBlock
  | PortfolioAiPromptOutputContractBlock;

/** A portable prompt document, not a concrete provider request payload. */
export interface PortfolioAiPromptDocument {
  readonly version: typeof PortfolioAiPromptDocumentVersion;
  readonly plan: PortfolioAiMessagePlan;
  readonly blocks: ReadonlyArray<PortfolioAiPromptBlock>;
}

/** Deterministically creates a detached portable document from a validated message plan. */
export function createPortfolioAiPromptDocument(
  plan: PortfolioAiMessagePlan,
): PortfolioAiPromptDocument {
  validatePortfolioAiMessagePlan(plan);
  const document: PortfolioAiPromptDocument = {
    version: PortfolioAiPromptDocumentVersion,
    plan: clone(plan),
    blocks: expectedBlocks(plan),
  };
  validatePortfolioAiPromptDocument(document);
  return document;
}

/** Validates exact deterministic document construction without parsing or executing it. */
export function validatePortfolioAiPromptDocument(document: PortfolioAiPromptDocument): void {
  if (
    !isPlainRecord(document) ||
    !hasOnlyKeys(document, ['version', 'plan', 'blocks']) ||
    document.version !== PortfolioAiPromptDocumentVersion ||
    document.plan === undefined ||
    !Array.isArray(document.blocks)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI prompt document is malformed.');
  }
  try {
    validatePortfolioAiMessagePlan(document.plan);
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI prompt document plan is invalid.');
  }

  const expected = expectedBlocks(document.plan);
  if (document.blocks.length !== expected.length) {
    throw new AiBoundaryValidationError('Portfolio AI prompt document blocks are malformed.');
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (JSON.stringify(document.blocks[index]) !== JSON.stringify(expected[index])) {
      throw new AiBoundaryValidationError('Portfolio AI prompt document blocks are malformed.');
    }
  }
}

function expectedBlocks(plan: PortfolioAiMessagePlan): ReadonlyArray<PortfolioAiPromptBlock> {
  const task = plan.items.find(
    (item): item is Extract<typeof item, { kind: PortfolioAiMessagePlanItemKind.Task }> =>
      item.kind === PortfolioAiMessagePlanItemKind.Task,
  );
  const context = plan.items.find(
    (item): item is Extract<typeof item, { kind: PortfolioAiMessagePlanItemKind.Context }> =>
      item.kind === PortfolioAiMessagePlanItemKind.Context,
  );
  const evidence = plan.items.find(
    (item): item is Extract<typeof item, { kind: PortfolioAiMessagePlanItemKind.Evidence }> =>
      item.kind === PortfolioAiMessagePlanItemKind.Evidence,
  );
  const outputContract = plan.items.find(
    (item): item is Extract<typeof item, { kind: PortfolioAiMessagePlanItemKind.OutputContract }> =>
      item.kind === PortfolioAiMessagePlanItemKind.OutputContract,
  );
  if (task === undefined || context === undefined || outputContract === undefined) {
    throw new AiBoundaryValidationError('Portfolio AI prompt document plan is malformed.');
  }
  return [
    {
      kind: PortfolioAiPromptBlockKind.Instruction,
      text: 'Use only referenced canonical portfolio evidence.',
    },
    {
      kind: PortfolioAiPromptBlockKind.Task,
      task: task.task,
      text: taskInstruction(task.task),
    },
    { kind: PortfolioAiPromptBlockKind.Context, sectionIds: clone(context.sectionIds) },
    ...(evidence === undefined
      ? []
      : [{ kind: PortfolioAiPromptBlockKind.Evidence as const, factIds: clone(evidence.factIds) }]),
    {
      kind: PortfolioAiPromptBlockKind.Constraints,
      text: 'Preserve explicit coverage and unavailable-data limitations.',
    },
    {
      kind: PortfolioAiPromptBlockKind.OutputContract,
      outputContract: outputContract.outputContract,
      text: 'Produce structured candidate interpretation records with exact references.',
    },
  ];
}

function taskInstruction(task: PortfolioAiTask): string {
  switch (task) {
    case 'explain':
      return 'Explain referenced portfolio facts.';
    case 'interpret':
      return 'Interpret referenced portfolio facts without creating canonical facts.';
  }
  throw new AiBoundaryValidationError('Portfolio AI prompt document task is invalid.');
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
