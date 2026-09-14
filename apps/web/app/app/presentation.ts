export type IntelligenceViewId = 'overview' | 'market' | 'news' | 'portfolio' | 'morning_meeting';

export type IntelligenceViewStatus =
  'loading' | 'ready' | 'empty' | 'stale' | 'error' | 'unavailable';

export type AuthorityClassification =
  'canonical' | 'deterministic' | 'interpreted' | 'non_authoritative';

export type FreshnessClassification = 'current' | 'stale' | 'unknown';

export interface PresentationSourceReference {
  readonly id: string;
  readonly label: string;
  readonly provider?: string;
  readonly observedAt?: string;
  readonly reference?: string;
}

/**
 * Web-owned display metadata around a domain result. It references source
 * material without copying or replacing any canonical domain model.
 */
export interface IntelligenceViewPresentation {
  readonly id: IntelligenceViewId;
  readonly title: string;
  readonly summary: string;
  readonly status: IntelligenceViewStatus;
  readonly authority: AuthorityClassification;
  readonly freshness: FreshnessClassification;
  readonly observedAt?: string;
  readonly generatedAt?: string;
  readonly provenance: ReadonlyArray<PresentationSourceReference>;
  readonly note?: string;
}

export const applicationViews: ReadonlyArray<IntelligenceViewPresentation> = [
  {
    id: 'market',
    title: 'Market',
    summary: 'Deterministic snapshots, indicators, and signals from normalized provider input.',
    status: 'unavailable',
    authority: 'deterministic',
    freshness: 'unknown',
    provenance: [],
    note: 'No market snapshot is connected to this presentation route yet.',
  },
  {
    id: 'news',
    title: 'News',
    summary: 'Normalized articles, classifications, impact, and traceable source references.',
    status: 'unavailable',
    authority: 'deterministic',
    freshness: 'unknown',
    provenance: [],
    note: 'No news snapshot is connected to this presentation route yet.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio',
    summary: 'Canonical Portfolio valuation, allocation, risk, insights, and presentation records.',
    status: 'unavailable',
    authority: 'canonical',
    freshness: 'unknown',
    provenance: [],
    note: 'No portfolio or private user data is requested by this route.',
  },
  {
    id: 'morning_meeting',
    title: 'Morning Meeting',
    summary: 'Canonical report state with optional interpretation kept visibly separate.',
    status: 'unavailable',
    authority: 'canonical',
    freshness: 'unknown',
    provenance: [],
    note: 'No report has been generated for this presentation route.',
  },
] as const;

export function formatPresentationLabel(value: string): string {
  return value.replaceAll('_', '-').toUpperCase();
}
