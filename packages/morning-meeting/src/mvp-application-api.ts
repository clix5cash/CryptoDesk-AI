import { Timeframe } from '@cryptodesk-ai/market-intelligence';
import type {
  MorningMeetingReport,
  MorningMeetingRequest,
  MorningMeetingService,
} from './contracts.js';
import { MorningMeetingReportError } from './errors.js';
import { MorningMeetingNewsBriefSelector } from './news-brief-selector.js';
import type { MorningMeetingPortfolioAiComposition } from './portfolio-ai-composition.js';
import {
  type MorningMeetingPortfolioAiLifecycleResult,
  MorningMeetingPortfolioAiApplicationError,
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
    validateMorningMeetingMvpApplicationApiInput(input);
    const lifecycleRequest = clone(input.request);
    const serviceRequest = clone(lifecycleRequest);
    let report: MorningMeetingReport;
    try {
      report = await this.morningMeetingService.generate(serviceRequest);
    } catch {
      throw new MorningMeetingReportError('Morning Meeting MVP application execution failed.');
    }

    try {
      return composeMorningMeetingPortfolioAiLifecycle({
        request: lifecycleRequest,
        report,
        aiRequested: input.aiRequested,
        ...(input.composition === undefined ? {} : { composition: input.composition }),
        ...(input.aiFailurePolicy === undefined ? {} : { aiFailurePolicy: input.aiFailurePolicy }),
      });
    } catch (error) {
      if (error instanceof MorningMeetingPortfolioAiApplicationError) throw error;
      throw new MorningMeetingReportError('Morning Meeting MVP application execution failed.');
    }
  }
}

/** Validates the complete transport-neutral external execution envelope. */
export function validateMorningMeetingMvpApplicationApiInput(
  input: MorningMeetingMvpApplicationApiInput,
): void {
  if (
    !isPlainRecord(input) ||
    !hasAllowedKeys(input, ['request', 'aiRequested', 'composition', 'aiFailurePolicy']) ||
    !hasOwn(input, 'request') ||
    !isPlainRecord(input.request) ||
    typeof input.aiRequested !== 'boolean' ||
    (input.aiFailurePolicy !== undefined &&
      !Object.values(MorningMeetingPortfolioAiFailurePolicy).includes(input.aiFailurePolicy))
  ) {
    throw new MorningMeetingReportError('Morning Meeting MVP application API input is malformed.');
  }

  validateRequest(input.request);

  if (
    (!input.aiRequested && input.composition !== undefined) ||
    (input.aiFailurePolicy !== undefined && input.composition === undefined)
  ) {
    throw new MorningMeetingReportError(
      'Morning Meeting MVP application API input has contradictory AI options.',
    );
  }
}

function validateRequest(request: MorningMeetingRequest): void {
  if (
    !hasExactOptionalKeys(request, [
      'assetIds',
      'marketIds',
      'timeframe',
      'asOf',
      'newsMarketIntelligenceViews',
      'newsBriefSelectionPolicy',
    ]) ||
    !hasOwn(request, 'timeframe') ||
    !Object.values(Timeframe).includes(request.timeframe) ||
    !isOptionalIdentifierArray(request.assetIds) ||
    !isOptionalIdentifierArray(request.marketIds) ||
    (request.asOf !== undefined && !isIsoTimestamp(request.asOf)) ||
    (request.newsMarketIntelligenceViews !== undefined &&
      (!Array.isArray(request.newsMarketIntelligenceViews) ||
        request.newsMarketIntelligenceViews.some((view) => !isPlainRecord(view)))) ||
    (request.newsBriefSelectionPolicy !== undefined &&
      !isPlainRecord(request.newsBriefSelectionPolicy))
  ) {
    throw new MorningMeetingReportError('Morning Meeting MVP application request is malformed.');
  }

  if (request.newsBriefSelectionPolicy !== undefined) {
    try {
      new MorningMeetingNewsBriefSelector().select(
        { items: [] },
        {
          asOf: request.asOf ?? '1970-01-01T00:00:00.000Z',
          policy: request.newsBriefSelectionPolicy,
        },
      );
    } catch {
      throw new MorningMeetingReportError('Morning Meeting MVP application request is malformed.');
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasAllowedKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasExactOptionalKeys(value: object, allowed: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isOptionalIdentifierArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((entry) => typeof entry === 'string' && entry.trim().length > 0))
  );
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
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
