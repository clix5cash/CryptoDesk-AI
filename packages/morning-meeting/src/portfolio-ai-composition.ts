import {
  PortfolioAiResultAuthority,
  type PortfolioAiBuiltContext,
  type PortfolioAiParsedCandidateGroundingResult,
  validatePortfolioAiBuiltContext,
  validatePortfolioAiParsedCandidateGroundingResult,
} from '@cryptodesk-ai/ai';
import type { MorningMeetingReport, MorningMeetingRequest } from './contracts.js';
import { MorningMeetingReportError } from './errors.js';
import { MorningMeetingReportValidator } from './validator.js';

/** Application-owned canonical inputs remain separate from AI interpretation. */
export interface MorningMeetingPortfolioAiCanonicalContext {
  readonly request: MorningMeetingRequest;
  readonly report: MorningMeetingReport;
  readonly portfolioContext: PortfolioAiBuiltContext;
}

/** Closed opt-in input for composing canonical state with already-grounded AI material. */
export interface MorningMeetingPortfolioAiCompositionInput {
  readonly canonical: MorningMeetingPortfolioAiCanonicalContext;
  readonly interpretations: ReadonlyArray<PortfolioAiParsedCandidateGroundingResult>;
}

/**
 * Validated composition envelope. Canonical state and non-authoritative
 * interpretation deliberately remain distinct components.
 */
export interface MorningMeetingPortfolioAiComposition {
  readonly canonical: MorningMeetingPortfolioAiCanonicalContext;
  readonly interpretations: ReadonlyArray<PortfolioAiParsedCandidateGroundingResult>;
}

/** Creates a detached presentation composition without orchestration or prose generation. */
export function composeMorningMeetingPortfolioAi(
  input: MorningMeetingPortfolioAiCompositionInput,
): MorningMeetingPortfolioAiComposition {
  validateMorningMeetingPortfolioAiComposition(input);
  return clone(input);
}

/** Validates canonical ownership, AI trust, reference identity, and ordering only. */
export function validateMorningMeetingPortfolioAiComposition(
  input: MorningMeetingPortfolioAiCompositionInput,
): void {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, ['canonical', 'interpretations']) ||
    !isPlainRecord(input.canonical) ||
    !hasExactKeys(input.canonical, ['request', 'report', 'portfolioContext']) ||
    !Array.isArray(input.interpretations)
  ) {
    throw new MorningMeetingReportError('Morning Meeting Portfolio AI composition is malformed.');
  }

  try {
    new MorningMeetingReportValidator().validate(input.canonical.report, input.canonical.request);
    validatePortfolioAiBuiltContext(input.canonical.portfolioContext);
  } catch (error) {
    throw asCompositionError(error, 'Morning Meeting canonical composition context is invalid.');
  }

  const executionIds = new Set<string>();
  const interpretationIds = new Set<string>();
  for (const interpretation of input.interpretations) {
    try {
      validatePortfolioAiParsedCandidateGroundingResult(interpretation);
    } catch (error) {
      throw asCompositionError(error, 'Morning Meeting AI interpretation is invalid.');
    }
    if (
      interpretation.authority !== PortfolioAiResultAuthority.NonAuthoritativeInterpretation ||
      executionIds.has(interpretation.executionId) ||
      !sameJson(sourceContext(interpretation), input.canonical.portfolioContext)
    ) {
      throw new MorningMeetingReportError(
        'Morning Meeting AI interpretation identity or trust conflicts.',
      );
    }
    executionIds.add(interpretation.executionId);

    for (const grounded of interpretation.grounded.interpretations) {
      if (interpretationIds.has(grounded.id)) {
        throw new MorningMeetingReportError(
          `Duplicate Morning Meeting AI interpretation "${grounded.id}".`,
        );
      }
      interpretationIds.add(grounded.id);
    }
  }
}

function sourceContext(
  interpretation: PortfolioAiParsedCandidateGroundingResult,
): PortfolioAiBuiltContext {
  return interpretation.sourceCandidateValidation.sourceExchange.descriptor.request.promptDocument
    .plan.input.context;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  return (
    Object.keys(value).length === expected.length && expected.every((key) => hasOwn(value, key))
  );
}

function asCompositionError(error: unknown, fallback: string): MorningMeetingReportError {
  return new MorningMeetingReportError(error instanceof Error ? error.message : fallback);
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
