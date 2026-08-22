import { AiExecutionStatus, type AiExecutionId } from './contracts.js';
import { AiBoundaryValidationError } from './errors.js';
import type { PortfolioAiCandidateAssemblyItem } from './portfolio-candidate-assembly.js';
import {
  PortfolioAiCandidateInterpretationAuthority,
  PortfolioAiCandidateInterpretationKind,
} from './portfolio-model-output-interpretation.js';
import type { PortfolioAiModelReference } from './portfolio-model-execution.js';
import {
  type PortfolioAiProviderExchange,
  validatePortfolioAiProviderExchange,
} from './portfolio-provider-exchange.js';

/** Closed provider-neutral JSON shape accepted from completed model output. */
export interface PortfolioAiStructuredOutputDocument {
  readonly executionId: AiExecutionId;
  readonly providerId: string;
  readonly modelId?: string;
  readonly candidates: ReadonlyArray<PortfolioAiCandidateAssemblyItem>;
}

/**
 * Detached parsed material traceable to one exchange. Parsing changes structure,
 * never trust: these fields remain untrusted and are not validated candidates.
 */
export interface PortfolioAiParsedStructuredOutput {
  readonly executionId: AiExecutionId;
  readonly model: PortfolioAiModelReference;
  readonly authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation;
  readonly candidates: ReadonlyArray<PortfolioAiCandidateAssemblyItem>;
  readonly sourceExchange: PortfolioAiProviderExchange;
}

/**
 * Parses only the closed JSON contract from a validated completed exchange.
 * It performs no prose extraction, reference resolution, candidate validation,
 * grounding, or authority promotion.
 */
export function parsePortfolioAiStructuredOutput(
  exchange: PortfolioAiProviderExchange,
): PortfolioAiParsedStructuredOutput {
  try {
    validatePortfolioAiProviderExchange(exchange);
  } catch (error) {
    throw asBoundaryError(error, 'Portfolio AI structured output exchange is invalid.');
  }
  if (exchange.status !== AiExecutionStatus.Completed) {
    throw new AiBoundaryValidationError(
      'Portfolio AI structured output requires a completed provider exchange.',
    );
  }

  const output = exchange.response.output;
  if (output === undefined) {
    throw new AiBoundaryValidationError('Portfolio AI structured output is missing.');
  }
  const document = parseDocument(output);
  validateIdentity(document, exchange);
  const result: PortfolioAiParsedStructuredOutput = {
    executionId: document.executionId,
    model: clone(exchange.model),
    authority: PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation,
    candidates: clone(document.candidates),
    sourceExchange: clone(exchange),
  };
  validatePortfolioAiParsedStructuredOutput(result);
  return result;
}

/** Structural validation for detached parsed material; it does not resolve references. */
export function validatePortfolioAiParsedStructuredOutput(
  result: PortfolioAiParsedStructuredOutput,
): void {
  if (
    !isPlainRecord(result) ||
    !hasExactKeys(result, ['executionId', 'model', 'authority', 'candidates', 'sourceExchange']) ||
    !isNonEmptyString(result.executionId) ||
    result.authority !==
      PortfolioAiCandidateInterpretationAuthority.UntrustedCandidateInterpretation ||
    !Array.isArray(result.candidates) ||
    !isPlainRecord(result.model) ||
    !hasAllowedKeys(result.model, ['providerId', 'modelId']) ||
    !isNonEmptyString(result.model.providerId) ||
    (result.model.modelId !== undefined && !isNonEmptyString(result.model.modelId))
  ) {
    throw new AiBoundaryValidationError('Parsed Portfolio AI structured output is malformed.');
  }
  try {
    validatePortfolioAiProviderExchange(result.sourceExchange);
  } catch (error) {
    throw asBoundaryError(error, 'Parsed Portfolio AI structured output source is invalid.');
  }
  if (
    result.sourceExchange.status !== AiExecutionStatus.Completed ||
    result.executionId !== result.sourceExchange.executionId ||
    !sameModelReference(result.model, result.sourceExchange.model)
  ) {
    throw new AiBoundaryValidationError(
      'Parsed Portfolio AI structured output identity conflicts.',
    );
  }
  validateCandidates(result.candidates);
}

function parseDocument(output: string): PortfolioAiStructuredOutputDocument {
  let value: unknown;
  try {
    value = JSON.parse(output) as unknown;
  } catch {
    throw new AiBoundaryValidationError('Portfolio AI structured output is malformed JSON.');
  }
  if (
    !isPlainRecord(value) ||
    !hasAllowedKeys(value, ['executionId', 'providerId', 'modelId', 'candidates']) ||
    !hasOwn(value, 'executionId') ||
    !hasOwn(value, 'providerId') ||
    !hasOwn(value, 'candidates') ||
    !isNonEmptyString(value.executionId) ||
    !isNonEmptyString(value.providerId) ||
    (value.modelId !== undefined && !isNonEmptyString(value.modelId)) ||
    !Array.isArray(value.candidates)
  ) {
    throw new AiBoundaryValidationError('Portfolio AI structured output document is malformed.');
  }
  validateCandidates(value.candidates);
  return value as unknown as PortfolioAiStructuredOutputDocument;
}

function validateIdentity(
  document: PortfolioAiStructuredOutputDocument,
  exchange: PortfolioAiProviderExchange,
): void {
  if (
    document.executionId !== exchange.executionId ||
    document.providerId !== exchange.model.providerId ||
    document.modelId !== exchange.model.modelId
  ) {
    throw new AiBoundaryValidationError('Portfolio AI structured output identity conflicts.');
  }
}

function validateCandidates(candidates: ReadonlyArray<unknown>): void {
  const candidateIds = new Set<string>();
  for (const candidate of candidates) {
    if (
      !isPlainRecord(candidate) ||
      !hasAllowedKeys(candidate, ['id', 'kind', 'content', 'factReferences', 'sectionIds']) ||
      !hasOwn(candidate, 'id') ||
      !hasOwn(candidate, 'kind') ||
      !hasOwn(candidate, 'content') ||
      !isNonEmptyString(candidate.id) ||
      candidateIds.has(candidate.id) ||
      candidate.kind !== PortfolioAiCandidateInterpretationKind.Descriptive ||
      !isNonEmptyString(candidate.content) ||
      (candidate.factReferences !== undefined && !Array.isArray(candidate.factReferences)) ||
      (candidate.sectionIds !== undefined && !isStringArray(candidate.sectionIds)) ||
      (candidate.factReferences === undefined && candidate.sectionIds === undefined) ||
      (candidate.factReferences?.length === 0 && candidate.sectionIds?.length === 0)
    ) {
      throw new AiBoundaryValidationError('Portfolio AI structured output candidate is malformed.');
    }
    candidateIds.add(candidate.id);
    validateReferences(candidate.factReferences as ReadonlyArray<unknown> | undefined);
  }
}

function validateReferences(references: ReadonlyArray<unknown> | undefined): void {
  if (references === undefined) return;
  const factIds = new Set<string>();
  for (const reference of references) {
    if (
      !isPlainRecord(reference) ||
      !hasExactKeys(reference, ['factId', 'presentationItemId', 'sectionIds']) ||
      !isNonEmptyString(reference.factId) ||
      factIds.has(reference.factId) ||
      !isNonEmptyString(reference.presentationItemId) ||
      !isNonEmptyStringArray(reference.sectionIds)
    ) {
      throw new AiBoundaryValidationError(
        'Portfolio AI structured output fact reference is malformed.',
      );
    }
    factIds.add(reference.factId);
  }
}

function isStringArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

function isNonEmptyStringArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.length > 0 && isStringArray(value);
}

function sameModelReference(left: PortfolioAiModelReference, right: PortfolioAiModelReference) {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  return (
    Object.keys(value).length === expected.length && expected.every((key) => hasOwn(value, key))
  );
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
