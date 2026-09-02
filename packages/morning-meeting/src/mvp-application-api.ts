import type { MorningMeetingRequest, MorningMeetingService } from './contracts.js';
import { MorningMeetingReportError } from './errors.js';
import type { MorningMeetingPortfolioAiComposition } from './portfolio-ai-composition.js';
import {
  type MorningMeetingPortfolioAiLifecycleResult,
  MorningMeetingPortfolioAiFailurePolicy,
  composeMorningMeetingPortfolioAiLifecycle,
} from './portfolio-ai-application-flow.js';

/** Closed external input for one application-owned MVP lifecycle call. */
export interface MorningMeetingMvpApplicationApiInput {
  readonly request: MorningMeetingRequest;
  readonly aiRequested: boolean;
  readonly composition?: MorningMeetingPortfolioAiComposition;
  readonly aiFailurePolicy?: MorningMeetingPortfolioAiFailurePolicy;
}

/** Existing Sprint 9D lifecycle result is the MVP API output contract. */
export type MorningMeetingMvpApplicationApiOutput = MorningMeetingPortfolioAiLifecycleResult;

/** Provider- and transport-neutral entry point for an external application caller. */
export interface MorningMeetingMvpApplicationApi {
  execute(
    input: MorningMeetingMvpApplicationApiInput,
  ): Promise<MorningMeetingMvpApplicationApiOutput>;
}

/**
 * Generates canonical Morning Meeting state, then applies the existing optional
 * Portfolio AI lifecycle. It does not execute AI, providers, or transports.
 */
export class DefaultMorningMeetingMvpApplicationApi implements MorningMeetingMvpApplicationApi {
  constructor(private readonly morningMeetingService: MorningMeetingService) {
    if (
      morningMeetingService === null ||
      typeof morningMeetingService !== 'object' ||
      typeof morningMeetingService.generate !== 'function'
    ) {
      throw new MorningMeetingReportError('Morning Meeting MVP application API is misconfigured.');
    }
  }

  async execute(
    input: MorningMeetingMvpApplicationApiInput,
  ): Promise<MorningMeetingMvpApplicationApiOutput> {
    validateInput(input);
    const request = clone(input.request);
    const report = await this.morningMeetingService.generate(request);

    return composeMorningMeetingPortfolioAiLifecycle({
      request,
      report,
      aiRequested: input.aiRequested,
      ...(input.composition === undefined ? {} : { composition: input.composition }),
      ...(input.aiFailurePolicy === undefined ? {} : { aiFailurePolicy: input.aiFailurePolicy }),
    });
  }
}

function validateInput(input: MorningMeetingMvpApplicationApiInput): void {
  if (
    !isPlainRecord(input) ||
    !hasAllowedKeys(input, ['request', 'aiRequested', 'composition', 'aiFailurePolicy']) ||
    !hasOwn(input, 'request') ||
    !isPlainRecord(input.request) ||
    !hasOwn(input.request, 'timeframe') ||
    typeof input.aiRequested !== 'boolean' ||
    (input.aiFailurePolicy !== undefined &&
      !Object.values(MorningMeetingPortfolioAiFailurePolicy).includes(input.aiFailurePolicy))
  ) {
    throw new MorningMeetingReportError('Morning Meeting MVP application API input is malformed.');
  }
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
