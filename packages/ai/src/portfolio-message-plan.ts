import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiModelInput,
  validatePortfolioAiModelInput,
} from './portfolio-model-input.js';
import { type PortfolioAiTask } from './portfolio-intelligence.js';

/** Logical structured roles only; these are not provider chat-message roles. */
export enum PortfolioAiMessagePlanItemKind {
  Task = 'task',
  Context = 'context',
  Evidence = 'evidence',
  OutputContract = 'output_contract',
}

/** Identifies the existing structured candidate boundary expected after future execution. */
export enum PortfolioAiMessagePlanOutputContract {
  CandidateInterpretation = 'portfolio_ai_candidate_interpretation',
}

export interface PortfolioAiMessagePlanTaskItem {
  readonly kind: PortfolioAiMessagePlanItemKind.Task;
  readonly task: PortfolioAiTask;
}

export interface PortfolioAiMessagePlanContextItem {
  readonly kind: PortfolioAiMessagePlanItemKind.Context;
  readonly sectionIds: ReadonlyArray<string>;
}

export interface PortfolioAiMessagePlanEvidenceItem {
  readonly kind: PortfolioAiMessagePlanItemKind.Evidence;
  readonly factIds: ReadonlyArray<string>;
}

export interface PortfolioAiMessagePlanOutputContractItem {
  readonly kind: PortfolioAiMessagePlanItemKind.OutputContract;
  readonly outputContract: PortfolioAiMessagePlanOutputContract.CandidateInterpretation;
}

/** A provider-neutral, structured future model interaction plan. */
export type PortfolioAiMessagePlanItem =
  | PortfolioAiMessagePlanTaskItem
  | PortfolioAiMessagePlanContextItem
  | PortfolioAiMessagePlanEvidenceItem
  | PortfolioAiMessagePlanOutputContractItem;

/**
 * The plan retains its validated model input and exact ordered references. It
 * deliberately has no rendered content, provider message shape, or model settings.
 */
export interface PortfolioAiMessagePlan {
  readonly task: PortfolioAiTask;
  readonly input: PortfolioAiModelInput;
  readonly items: ReadonlyArray<PortfolioAiMessagePlanItem>;
}

/** Builds the one deterministic structured plan allowed for a validated model input. */
export function createPortfolioAiMessagePlan(input: PortfolioAiModelInput): PortfolioAiMessagePlan {
  validatePortfolioAiModelInput(input);
  const plan: PortfolioAiMessagePlan = {
    task: input.task,
    input: clone(input),
    items: [
      { kind: PortfolioAiMessagePlanItemKind.Task, task: input.task },
      { kind: PortfolioAiMessagePlanItemKind.Context, sectionIds: clone(input.sectionIds) },
      ...(input.factIds.length === 0
        ? []
        : [
            {
              kind: PortfolioAiMessagePlanItemKind.Evidence as const,
              factIds: clone(input.factIds),
            },
          ]),
      {
        kind: PortfolioAiMessagePlanItemKind.OutputContract,
        outputContract: PortfolioAiMessagePlanOutputContract.CandidateInterpretation,
      },
    ],
  };
  validatePortfolioAiMessagePlan(plan);
  return plan;
}

/** Validates exact structured plan derivation without rendering or interpreting content. */
export function validatePortfolioAiMessagePlan(plan: PortfolioAiMessagePlan): void {
  if (
    !isPlainRecord(plan) ||
    !hasOnlyKeys(plan, ['task', 'input', 'items']) ||
    plan.input === undefined ||
    !Array.isArray(plan.items)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI message plan is malformed.');
  }
  try {
    validatePortfolioAiModelInput(plan.input);
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI message plan input is invalid.');
  }
  if (plan.task !== plan.input.task) {
    throw new AiBoundaryValidationError('Portfolio AI message plan task conflicts with input.');
  }

  const expected = expectedItems(plan.input);
  if (plan.items.length !== expected.length) {
    throw new AiBoundaryValidationError('Portfolio AI message plan items are malformed.');
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (JSON.stringify(plan.items[index]) !== JSON.stringify(expected[index])) {
      throw new AiBoundaryValidationError('Portfolio AI message plan items are malformed.');
    }
  }
}

function expectedItems(input: PortfolioAiModelInput): ReadonlyArray<PortfolioAiMessagePlanItem> {
  return [
    { kind: PortfolioAiMessagePlanItemKind.Task, task: input.task },
    { kind: PortfolioAiMessagePlanItemKind.Context, sectionIds: input.sectionIds },
    ...(input.factIds.length === 0
      ? []
      : [{ kind: PortfolioAiMessagePlanItemKind.Evidence as const, factIds: input.factIds }]),
    {
      kind: PortfolioAiMessagePlanItemKind.OutputContract,
      outputContract: PortfolioAiMessagePlanOutputContract.CandidateInterpretation,
    },
  ];
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
