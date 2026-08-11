import { PortfolioInsightValidationError } from './errors.js';
import { PortfolioInsightCategory, PortfolioInsightSeverity } from './insight.js';
import {
  PortfolioInsightPriority,
  PortfolioInsightPriorityReason,
} from './insight-prioritization.js';
import {
  PortfolioPresentationSection,
  validatePortfolioPresentation,
  type PortfolioPresentation,
  type PortfolioPresentationComposedSection,
  type PortfolioPresentationItem,
  type PortfolioPresentationSectionComposition,
} from './presentation.js';

/** Stable consumer-payload shape version, independent from package or runtime versions. */
export const PortfolioPresentationSchemaVersion = '1';

/** JSON-safe normalized consumer contract: canonical records plus section references. */
export interface PortfolioPresentationPayload {
  readonly schemaVersion: typeof PortfolioPresentationSchemaVersion;
  readonly portfolioId: string;
  readonly capturedAt: string;
  readonly asOf: string;
  readonly currency: string;
  readonly totalValuedValue: string;
  readonly coverage: PortfolioPresentation['coverage'];
  readonly items: ReadonlyArray<PortfolioPresentationItem>;
  readonly sections: ReadonlyArray<PortfolioPresentationComposedSection>;
}

/** Serializes existing canonical presentation records without recalculating intelligence. */
export function serializePortfolioPresentation(
  presentation: PortfolioPresentation,
  sections: PortfolioPresentationSectionComposition,
): PortfolioPresentationPayload {
  validatePortfolioPresentation(presentation);
  validateComposition(presentation, sections);
  assertJsonSafe(presentation);
  assertJsonSafe(sections);
  const payload: PortfolioPresentationPayload = {
    schemaVersion: PortfolioPresentationSchemaVersion,
    portfolioId: presentation.portfolioId,
    capturedAt: presentation.capturedAt,
    asOf: presentation.asOf,
    currency: presentation.currency,
    totalValuedValue: presentation.totalValuedValue,
    coverage: clone(presentation.coverage),
    items: clone(presentation.sections[0]!.items),
    sections: clone(sections.sections),
  };
  validatePortfolioPresentationPayload(payload);
  return payload;
}

/** Validates a consumer payload without introducing a transport parser or runtime. */
export function validatePortfolioPresentationPayload(payload: PortfolioPresentationPayload): void {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    payload.schemaVersion !== PortfolioPresentationSchemaVersion ||
    !payload.portfolioId?.trim() ||
    !payload.capturedAt?.trim() ||
    !payload.asOf?.trim() ||
    !payload.currency?.trim() ||
    !payload.totalValuedValue?.trim() ||
    payload.coverage === undefined ||
    !Array.isArray(payload.items) ||
    !Array.isArray(payload.sections)
  ) {
    throw new PortfolioInsightValidationError('Portfolio presentation payload is malformed.');
  }
  assertJsonSafe(payload);
  const itemIds = new Set<string>();
  for (const item of payload.items) {
    if (
      !item.id?.trim() ||
      itemIds.has(item.id) ||
      item.evidence?.insight?.portfolioId !== payload.portfolioId
    ) {
      throw new PortfolioInsightValidationError('Portfolio presentation payload item is invalid.');
    }

    if (!Object.values(PortfolioInsightCategory).includes(item.category)) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation payload item category is invalid.',
      );
    }

    if (
      item.severity !== undefined &&
      !Object.values(PortfolioInsightSeverity).includes(item.severity)
    ) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation payload item severity is invalid.',
      );
    }

    if (!Object.values(PortfolioInsightPriority).includes(item.priority)) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation payload item priority is invalid.',
      );
    }

    if (!Array.isArray(item.priorityReasons) || item.priorityReasons.length === 0) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation payload item priority reasons are invalid.',
      );
    }

    const priorityReasons = new Set<string>();
    for (const reason of item.priorityReasons) {
      if (
        !Object.values(PortfolioInsightPriorityReason).includes(reason) ||
        priorityReasons.has(reason)
      ) {
        throw new PortfolioInsightValidationError(
          'Portfolio presentation payload item priority reasons are invalid.',
        );
      }
      priorityReasons.add(reason);
    }

    itemIds.add(item.id);
  }
  const sectionIds = new Set<string>();
  let previousOrder = -1;
  for (const section of payload.sections) {
    const order = sectionOrder(section.section);
    if (
      order < previousOrder ||
      sectionIds.has(section.id) ||
      section.id !== JSON.stringify([payload.portfolioId, section.section]) ||
      !Array.isArray(section.itemIds)
    ) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation payload section is invalid.',
      );
    }
    previousOrder = order;
    sectionIds.add(section.id);
    const references = new Set<string>();
    for (const itemId of section.itemIds) {
      if (!itemIds.has(itemId) || references.has(itemId)) {
        throw new PortfolioInsightValidationError(
          'Portfolio presentation payload item reference is invalid.',
        );
      }
      references.add(itemId);
    }
  }
}

/** Canonical no-whitespace JSON representation with recursively sorted object keys. */
export function stringifyPortfolioPresentationPayload(
  payload: PortfolioPresentationPayload,
): string {
  validatePortfolioPresentationPayload(payload);
  return canonicalJson(payload);
}

function validateComposition(
  presentation: PortfolioPresentation,
  sections: PortfolioPresentationSectionComposition,
): void {
  if (
    sections === null ||
    typeof sections !== 'object' ||
    sections.portfolioId !== presentation.portfolioId ||
    sections.capturedAt !== presentation.capturedAt ||
    sections.asOf !== presentation.asOf ||
    sections.currency !== presentation.currency ||
    sections.totalValuedValue !== presentation.totalValuedValue ||
    !Array.isArray(sections.sections)
  ) {
    throw new PortfolioInsightValidationError(
      'Portfolio presentation sections conflict with presentation.',
    );
  }
}

function sectionOrder(section: PortfolioPresentationSection): number {
  const order = [
    PortfolioPresentationSection.Overview,
    PortfolioPresentationSection.Valuation,
    PortfolioPresentationSection.Coverage,
    PortfolioPresentationSection.Concentration,
    PortfolioPresentationSection.Exposure,
    PortfolioPresentationSection.DataQuality,
    PortfolioPresentationSection.PrioritizedInsights,
  ].indexOf(section);
  if (order < 0)
    throw new PortfolioInsightValidationError(
      'Portfolio presentation payload section kind is invalid.',
    );
  return order;
}

function assertJsonSafe(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation payload must not contain non-finite numbers.',
      );
    }
    return;
  }
  if (
    typeof value !== 'object' ||
    (Array.isArray(value) === false && Object.getPrototypeOf(value) !== Object.prototype)
  ) {
    throw new PortfolioInsightValidationError('Portfolio presentation payload must be JSON-safe.');
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJsonSafe(item);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key.length === 0 || entry === undefined) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation payload must be JSON-safe.',
      );
    }
    assertJsonSafe(entry);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
