import {
  PortfolioRiskDataState,
  PortfolioPresentationSchemaVersion,
  validatePortfolioPresentationPayload,
  type PortfolioPresentationPayload,
} from '@cryptodesk-ai/portfolio';
import { AiBoundaryValidationError } from './errors.js';

/** Externally supplied opaque identity for one requested AI interpretation. */
export type PortfolioAiAnalysisId = string;

/** Externally supplied opaque identity for an AI interpretation entry. */
export type PortfolioAiInterpretationId = string;

/** AI consumers may only explain or interpret existing canonical Portfolio facts. */
export enum PortfolioAiTask {
  Explain = 'explain',
  Interpret = 'interpret',
}

/** The only canonical source accepted by this initial Portfolio AI boundary. */
export enum PortfolioAiCanonicalSourceKind {
  PresentationPayload = 'portfolio_presentation_payload',
}

/** Stable reference to the exact schema-versioned deterministic payload consumed by AI. */
export interface PortfolioAiCanonicalSourceReference {
  readonly kind: PortfolioAiCanonicalSourceKind.PresentationPayload;
  readonly schemaVersion: typeof PortfolioPresentationSchemaVersion;
  readonly portfolioId: string;
  readonly capturedAt: string;
  readonly asOf: string;
}

/** Immutable input for a future AI layer; the payload remains the authoritative source of facts. */
export interface PortfolioAiContext {
  readonly analysisId: PortfolioAiAnalysisId;
  readonly task: PortfolioAiTask;
  readonly source: PortfolioAiCanonicalSourceReference;
  readonly payload: PortfolioPresentationPayload;
}

/** Reference to one canonical presentation record and the sections that expose it. */
export interface PortfolioAiGroundingReference {
  readonly presentationItemId: string;
  readonly sectionIds: ReadonlyArray<string>;
}

/** Explicit authority marker prevents AI output from being confused with canonical Portfolio facts. */
export enum PortfolioAiResultAuthority {
  NonAuthoritativeInterpretation = 'non_authoritative_interpretation',
}

/** A future AI-produced interpretation. It contains no canonical financial fields. */
export interface PortfolioAiInterpretation {
  readonly id: PortfolioAiInterpretationId;
  readonly authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation;
  /** Opaque future interpretation content; this sprint does not generate it. */
  readonly content: string;
  readonly grounding: ReadonlyArray<PortfolioAiGroundingReference>;
  /** Must remain exactly aligned with the source payload coverage state. */
  readonly coverageState?: PortfolioRiskDataState;
}

/** Immutable, non-authoritative result contract for a future AI interpretation layer. */
export interface PortfolioAiAnalysisResult {
  readonly analysisId: PortfolioAiAnalysisId;
  readonly task: PortfolioAiTask;
  readonly authority: PortfolioAiResultAuthority.NonAuthoritativeInterpretation;
  readonly coverageState?: PortfolioRiskDataState;
  readonly interpretations: ReadonlyArray<PortfolioAiInterpretation>;
}

/** Validates canonical Portfolio AI context without transforming or mutating its payload. */
export function validatePortfolioAiContext(context: PortfolioAiContext): void {
  if (
    context === null ||
    typeof context !== 'object' ||
    !context.analysisId?.trim() ||
    !Object.values(PortfolioAiTask).includes(context.task) ||
    context.source === undefined ||
    context.payload === undefined
  ) {
    throw new AiBoundaryValidationError('Portfolio AI context is malformed.');
  }

  try {
    validatePortfolioPresentationPayload(context.payload);
  } catch (error) {
    throw new AiBoundaryValidationError(
      error instanceof Error ? error.message : 'Portfolio AI canonical payload is invalid.',
    );
  }

  const { source, payload } = context;
  if (
    source.kind !== PortfolioAiCanonicalSourceKind.PresentationPayload ||
    source.schemaVersion !== PortfolioPresentationSchemaVersion ||
    source.portfolioId !== payload.portfolioId ||
    source.capturedAt !== payload.capturedAt ||
    source.asOf !== payload.asOf
  ) {
    throw new AiBoundaryValidationError(
      'Portfolio AI canonical source reference conflicts with its payload.',
    );
  }
}

/** Validates a non-authoritative AI result against an authoritative canonical context. */
export function validatePortfolioAiAnalysisResult(
  context: PortfolioAiContext,
  result: PortfolioAiAnalysisResult,
): void {
  validatePortfolioAiContext(context);
  if (
    result === null ||
    typeof result !== 'object' ||
    result.analysisId !== context.analysisId ||
    result.task !== context.task ||
    result.authority !== PortfolioAiResultAuthority.NonAuthoritativeInterpretation ||
    result.coverageState !== context.payload.coverage.state ||
    !Array.isArray(result.interpretations)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI analysis result is malformed.');
  }

  const interpretationIds = new Set<string>();
  for (const interpretation of result.interpretations) {
    if (
      !interpretation.id?.trim() ||
      interpretationIds.has(interpretation.id) ||
      interpretation.authority !== PortfolioAiResultAuthority.NonAuthoritativeInterpretation ||
      !interpretation.content?.trim() ||
      interpretation.coverageState !== context.payload.coverage.state ||
      !Array.isArray(interpretation.grounding) ||
      interpretation.grounding.length === 0
    ) {
      throw new AiBoundaryValidationError('Portfolio AI interpretation is malformed.');
    }
    interpretationIds.add(interpretation.id);
    validateGrounding(context.payload, interpretation.grounding);
  }
}

function validateGrounding(
  payload: PortfolioPresentationPayload,
  grounding: ReadonlyArray<PortfolioAiGroundingReference>,
): void {
  const references = new Set<string>();
  for (const reference of grounding) {
    if (
      reference === null ||
      typeof reference !== 'object' ||
      !reference.presentationItemId?.trim() ||
      references.has(reference.presentationItemId) ||
      !Array.isArray(reference.sectionIds) ||
      reference.sectionIds.length === 0 ||
      !payload.items.some((item) => item.id === reference.presentationItemId)
    ) {
      throw new AiBoundaryValidationError('Portfolio AI grounding reference is invalid.');
    }
    references.add(reference.presentationItemId);

    const sectionIds = new Set<string>();
    for (const sectionId of reference.sectionIds) {
      const section = payload.sections.find((candidate) => candidate.id === sectionId);
      if (
        !sectionId?.trim() ||
        sectionIds.has(sectionId) ||
        section === undefined ||
        !section.itemIds.includes(reference.presentationItemId)
      ) {
        throw new AiBoundaryValidationError('Portfolio AI grounding reference is invalid.');
      }
      sectionIds.add(sectionId);
    }
  }
}
