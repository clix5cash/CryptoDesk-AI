import { PortfolioInsightValidationError } from './errors.js';
import { portfolioAssetIdentity } from './identity.js';
import type {
  PortfolioInsight,
  PortfolioInsightAnalysis,
  PortfolioInsightEvidence,
} from './insight.js';
import { validatePortfolioInsightAnalysis, type PortfolioInsightAnalysisInput } from './insight.js';
import {
  PortfolioInsightPriority,
  PortfolioInsightPriorityReason,
  type PortfolioPrioritizedInsightAnalysis,
} from './insight-prioritization.js';
import type { PortfolioCoverage } from './allocation.js';
import type { PortfolioRiskDataState } from './risk.js';
import type { PortfolioPositionValuation, PortfolioValuation } from './valuation.js';

/** Stable, transport- and UI-neutral sections of structured Portfolio presentation. */
export enum PortfolioPresentationSection {
  PrioritizedInsights = 'prioritized_insights',
}

/** Explicit coverage facts preserved without estimating unvalued positions. */
export interface PortfolioPresentationCoverage {
  readonly state?: PortfolioRiskDataState;
  readonly valuation: PortfolioCoverage;
}

/** Canonical evidence with only relevant, already-valued price provenance attached. */
export interface PortfolioPresentationEvidence {
  readonly insight: PortfolioInsightEvidence;
  readonly valuationPositions: ReadonlyArray<PortfolioPositionValuation>;
}

/** One immutable, presentation-ready view of an already-prioritized insight. */
export interface PortfolioPresentationItem {
  /** Directly reuses the canonical Portfolio insight identity. */
  readonly id: string;
  readonly category: PortfolioInsight['category'];
  readonly severity?: PortfolioInsight['severity'];
  readonly priority: PortfolioInsightPriority;
  readonly priorityReasons: ReadonlyArray<PortfolioInsightPriorityReason>;
  /** Canonical asset, position, allocation, or unavailable-data target identity. */
  readonly targetIdentity: string;
  readonly evidence: PortfolioPresentationEvidence;
}

/** Ordered, structured presentation records for one consumer-neutral section. */
export interface PortfolioPresentationRecords {
  readonly section: PortfolioPresentationSection;
  readonly items: ReadonlyArray<PortfolioPresentationItem>;
}

/** Detached deterministic Portfolio Intelligence output for future transport or UI layers. */
export interface PortfolioPresentation {
  readonly portfolioId: string;
  readonly capturedAt: string;
  readonly asOf: string;
  readonly currency: string;
  readonly totalValuedValue: string;
  readonly coverage: PortfolioPresentationCoverage;
  readonly sections: ReadonlyArray<PortfolioPresentationRecords>;
}

/** Explicit canonical inputs only; no provider, UI, or upstream orchestration is involved. */
export interface PortfolioPresentationInput extends PortfolioInsightAnalysisInput {
  readonly insights: PortfolioInsightAnalysis;
  readonly prioritizedInsights: PortfolioPrioritizedInsightAnalysis;
}

/**
 * Organizes already-computed canonical facts for presentation without
 * recalculating valuation, allocation, risk, severity, or priority.
 */
export function createPortfolioPresentation(
  input: PortfolioPresentationInput,
): PortfolioPresentation {
  validatePresentationInput(input);
  const snapshot = input.snapshot;
  return {
    portfolioId: snapshot.portfolio.id,
    capturedAt: snapshot.capturedAt,
    asOf: input.prioritizedInsights.asOf,
    currency: input.valuation.currency,
    totalValuedValue: input.valuation.totalValue,
    coverage: {
      ...(input.prioritizedInsights.coverageState === undefined
        ? {}
        : { state: input.prioritizedInsights.coverageState }),
      valuation: clone(input.allocation.coverage),
    },
    sections: [
      {
        section: PortfolioPresentationSection.PrioritizedInsights,
        items: input.prioritizedInsights.insights.map((item) =>
          presentationItem(item.insight, item.priority, item.reasons, input.valuation),
        ),
      },
    ],
  };
}

function validatePresentationInput(input: PortfolioPresentationInput): void {
  if (input === null || typeof input !== 'object' || input.prioritizedInsights === undefined) {
    throw new PortfolioInsightValidationError('Portfolio presentation input is required.');
  }
  validatePortfolioInsightAnalysis(input, input.insights);
  const prioritized = input.prioritizedInsights;
  if (
    prioritized.portfolioId !== input.snapshot.portfolio.id ||
    prioritized.asOf !== input.risk.asOf ||
    prioritized.coverageState !== input.insights.coverageState ||
    !Array.isArray(prioritized.insights)
  ) {
    throw new PortfolioInsightValidationError(
      'Prioritized Portfolio insight analysis conflicts with canonical presentation input.',
    );
  }
  const canonical = new Map(input.insights.insights.map((insight) => [insight.id, insight]));
  const ids = new Set<string>();
  for (const prioritizedInsight of prioritized.insights) {
    const insight = prioritizedInsight.insight;
    if (!insight?.id || ids.has(insight.id) || canonical.get(insight.id) === undefined) {
      throw new PortfolioInsightValidationError(
        'Prioritized Portfolio insight identity is invalid.',
      );
    }
    if (JSON.stringify(canonical.get(insight.id)) !== JSON.stringify(insight)) {
      throw new PortfolioInsightValidationError(
        'Prioritized Portfolio insight evidence conflicts with canonical insight evidence.',
      );
    }
    if (!Object.values(PortfolioInsightPriority).includes(prioritizedInsight.priority)) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation insight priority is invalid.',
      );
    }
    if (!Array.isArray(prioritizedInsight.reasons) || prioritizedInsight.reasons.length === 0) {
      throw new PortfolioInsightValidationError(
        'Portfolio presentation insight priority reasons are required.',
      );
    }
    const reasons = new Set<PortfolioInsightPriorityReason>();
    for (const reason of prioritizedInsight.reasons) {
      if (!Object.values(PortfolioInsightPriorityReason).includes(reason) || reasons.has(reason)) {
        throw new PortfolioInsightValidationError(
          'Portfolio presentation insight priority reasons are invalid.',
        );
      }
      reasons.add(reason);
    }
    ids.add(insight.id);
  }
}

function presentationItem(
  insight: PortfolioInsight,
  priority: PortfolioInsightPriority,
  reasons: ReadonlyArray<PortfolioInsightPriorityReason>,
  valuation: PortfolioValuation,
): PortfolioPresentationItem {
  return {
    id: insight.id,
    category: insight.category,
    ...(insight.severity === undefined ? {} : { severity: insight.severity }),
    priority,
    priorityReasons: [...reasons],
    targetIdentity: targetIdentity(insight),
    evidence: {
      insight: clone(insight.evidence),
      valuationPositions: relevantValuations(insight.evidence, valuation).map(clone),
    },
  };
}

function relevantValuations(
  evidence: PortfolioInsightEvidence,
  valuation: PortfolioValuation,
): ReadonlyArray<PortfolioPositionValuation> {
  const positionIdentities = new Set<string>([
    ...(evidence.positionIdentity === undefined ? [] : [evidence.positionIdentity]),
    ...(evidence.allocation?.positionIdentities ?? []),
  ]);
  const assetIdentity =
    evidence.asset === undefined ? undefined : portfolioAssetIdentity(evidence.asset);
  return valuation.positions.filter(
    (position) =>
      positionIdentities.has(position.positionIdentity) ||
      (assetIdentity !== undefined && portfolioAssetIdentity(position.asset) === assetIdentity),
  );
}

function targetIdentity(insight: PortfolioInsight): string {
  if (insight.evidence.allocation !== undefined) return insight.evidence.allocation.identity;
  if (insight.evidence.positionIdentity !== undefined) return insight.evidence.positionIdentity;
  if (insight.evidence.asset !== undefined) return portfolioAssetIdentity(insight.evidence.asset);
  return insight.evidence.unavailableReason ?? insight.id;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
