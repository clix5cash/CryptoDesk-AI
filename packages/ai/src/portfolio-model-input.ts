import { AiBoundaryValidationError } from './errors.js';
import {
  type PortfolioAiBuiltContext,
  type PortfolioAiContextFactId,
  validatePortfolioAiBuiltContext,
} from './portfolio-intelligence-context.js';
import { type PortfolioAiTask } from './portfolio-intelligence.js';

/**
 * Provider-neutral structured input for a future model adapter. It contains
 * canonical context plus explicit references only; it is not rendered prompt text.
 */
export interface PortfolioAiModelInput {
  readonly task: PortfolioAiTask;
  readonly context: PortfolioAiBuiltContext;
  readonly factIds: ReadonlyArray<PortfolioAiContextFactId>;
  readonly sectionIds: ReadonlyArray<string>;
}

/**
 * Validates a model-input projection against its already validated canonical
 * context. Selection preserves caller order and never creates Portfolio facts.
 */
export function validatePortfolioAiModelInput(input: PortfolioAiModelInput): void {
  if (
    !isPlainRecord(input) ||
    !hasOnlyKeys(input, ['task', 'context', 'factIds', 'sectionIds']) ||
    input.context === undefined ||
    !Array.isArray(input.factIds) ||
    !Array.isArray(input.sectionIds)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI model input is malformed.');
  }
  try {
    validatePortfolioAiBuiltContext(input.context);
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI model input context is invalid.');
  }
  if (input.task !== input.context.task) {
    throw new AiBoundaryValidationError('Portfolio AI model input task conflicts with context.');
  }
  if (input.factIds.length === 0 && input.sectionIds.length === 0) {
    throw new AiBoundaryValidationError('Portfolio AI model input requires a selected reference.');
  }

  const sections = new Set<string>();
  for (const sectionId of input.sectionIds) {
    if (
      !isNonEmptyString(sectionId) ||
      sections.has(sectionId) ||
      !input.context.sections.some((section) => section.id === sectionId)
    ) {
      throw new AiBoundaryValidationError('Portfolio AI model input section reference is invalid.');
    }
    sections.add(sectionId);
  }

  const facts = new Set<string>();
  for (const factId of input.factIds) {
    const fact = input.context.facts.find((candidate) => candidate.id === factId);
    if (
      !isNonEmptyString(factId) ||
      facts.has(factId) ||
      fact === undefined ||
      !fact.grounding.some((reference) =>
        reference.sectionIds.some((sectionId) => sections.has(sectionId)),
      )
    ) {
      throw new AiBoundaryValidationError('Portfolio AI model input fact reference is invalid.');
    }
    facts.add(factId);
  }
}

/** Returns a detached structured input after deterministic boundary validation. */
export function createPortfolioAiModelInput(input: PortfolioAiModelInput): PortfolioAiModelInput {
  validatePortfolioAiModelInput(input);
  return clone(input);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asBoundaryError(error: unknown, fallback: string): AiBoundaryValidationError {
  return new AiBoundaryValidationError(error instanceof Error ? error.message : fallback);
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => clone(entry)) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
    ) as T;
  }
  return value;
}
