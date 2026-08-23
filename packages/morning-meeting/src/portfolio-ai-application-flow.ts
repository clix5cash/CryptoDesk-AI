import {
  PortfolioAiResultAuthority,
  type PortfolioAiContextFactReference,
  type PortfolioAiGroundedInterpretation,
} from '@cryptodesk-ai/ai';
import type { MorningMeetingReport, MorningMeetingRequest } from './contracts.js';
import { MorningMeetingReportError } from './errors.js';
import {
  type MorningMeetingPortfolioAiComposition,
  validateMorningMeetingPortfolioAiComposition,
} from './portfolio-ai-composition.js';
import { MorningMeetingReportValidator } from './validator.js';

/** Explicit application policy for invalid optional AI composition. */
export enum MorningMeetingPortfolioAiFailurePolicy {
  Reject = 'reject',
  Omit = 'omit',
}

/** Opt-in application orchestration input; canonical report generation remains independent. */
export interface MorningMeetingPortfolioAiApplicationInput {
  readonly request: MorningMeetingRequest;
  readonly report: MorningMeetingReport;
  readonly composition?: MorningMeetingPortfolioAiComposition;
  readonly aiFailurePolicy?: MorningMeetingPortfolioAiFailurePolicy;
}

/** Provider-neutral trace locator for non-authoritative descriptive content. */
export interface MorningMeetingPortfolioAiNarrativeTrace {
  readonly executionId: string;
  readonly providerId: string;
  readonly modelId?: string;
  readonly candidateId: string;
  readonly factReferences: ReadonlyArray<PortfolioAiContextFactReference>;
  readonly sectionIds: ReadonlyArray<string>;
}

/** User-visible AI prose remains explicitly separate and non-authoritative. */
export interface MorningMeetingPortfolioAiNarrativeItem {
  readonly id: string;
  readonly authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation;
  readonly content: string;
  readonly coverageState: PortfolioAiGroundedInterpretation['coverageState'];
  readonly trace: MorningMeetingPortfolioAiNarrativeTrace;
}

export interface MorningMeetingPortfolioAiNarrative {
  readonly authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation;
  readonly items: ReadonlyArray<MorningMeetingPortfolioAiNarrativeItem>;
}

/** Application output keeps canonical report state and optional AI prose authority-distinct. */
export interface MorningMeetingPortfolioAiApplicationOutput {
  readonly canonicalReport: MorningMeetingReport;
  readonly aiNarrative?: MorningMeetingPortfolioAiNarrative;
}

/**
 * Adds validated descriptive AI material to presentation without changing the
 * canonical report. It performs no report generation, matching, or inference.
 */
export function composeMorningMeetingPortfolioAiApplicationOutput(
  input: MorningMeetingPortfolioAiApplicationInput,
): MorningMeetingPortfolioAiApplicationOutput {
  validateInputShape(input);
  new MorningMeetingReportValidator().validate(input.report, input.request);
  const canonicalReport = clone(input.report);

  if (input.composition === undefined) return { canonicalReport };

  try {
    validateMorningMeetingPortfolioAiComposition(input.composition);
    if (
      !sameJson(input.composition.canonical.request, input.request) ||
      !sameJson(input.composition.canonical.report, input.report)
    ) {
      throw new MorningMeetingReportError(
        'Morning Meeting Portfolio AI composition conflicts with the canonical report.',
      );
    }
  } catch (error) {
    if (input.aiFailurePolicy === MorningMeetingPortfolioAiFailurePolicy.Omit) {
      return { canonicalReport };
    }
    throw asReportError(error);
  }

  return {
    canonicalReport,
    aiNarrative: {
      authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
      items: input.composition.interpretations.flatMap((interpretation) =>
        interpretation.grounded.interpretations.map((grounded) => ({
          id: grounded.id,
          authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation,
          content: grounded.content,
          coverageState: grounded.coverageState,
          trace: {
            executionId: interpretation.executionId,
            providerId: interpretation.providerId,
            ...(interpretation.modelId === undefined ? {} : { modelId: interpretation.modelId }),
            candidateId: grounded.id,
            factReferences: clone(grounded.factReferences),
            sectionIds: clone(grounded.sectionIds ?? []),
          },
        })),
      ),
    },
  };
}

function validateInputShape(input: MorningMeetingPortfolioAiApplicationInput): void {
  if (
    !isPlainRecord(input) ||
    !hasAllowedKeys(input, ['request', 'report', 'composition', 'aiFailurePolicy']) ||
    !hasOwn(input, 'request') ||
    !hasOwn(input, 'report') ||
    (input.aiFailurePolicy !== undefined &&
      !Object.values(MorningMeetingPortfolioAiFailurePolicy).includes(input.aiFailurePolicy))
  ) {
    throw new MorningMeetingReportError(
      'Morning Meeting Portfolio AI application input is malformed.',
    );
  }
}

function asReportError(error: unknown): MorningMeetingReportError {
  return error instanceof MorningMeetingReportError
    ? error
    : new MorningMeetingReportError(
        error instanceof Error ? error.message : 'Morning Meeting Portfolio AI composition failed.',
      );
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

function hasAllowedKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
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
