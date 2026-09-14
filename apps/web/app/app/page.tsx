import type { Metadata } from 'next';

import { ApplicationShell } from './application-shell';
import {
  applicationViews,
  formatPresentationLabel,
  type IntelligenceViewPresentation,
} from './presentation';

export const metadata: Metadata = {
  title: 'Intelligence application | CryptoDesk AI',
  description:
    'The read-only CryptoDesk AI intelligence application boundary for canonical and non-authoritative views.',
  alternates: { canonical: '/app' },
  openGraph: {
    title: 'CryptoDesk AI intelligence application',
    description: 'A read-only intelligence experience with visible authority and provenance.',
    url: '/app',
  },
};

const trustProgression = [
  'untrusted_model_execution',
  'untrusted_candidate_interpretation',
  'non_authoritative_interpretation',
] as const;

function StatusBadge({ children, tone }: { children: string; tone: string }) {
  return <span className={`app-badge app-badge-${tone}`}>{children}</span>;
}

function ViewCard({ view }: { view: IntelligenceViewPresentation }) {
  return (
    <article className="app-view-card" id={view.id} aria-labelledby={`${view.id}-title`}>
      <div className="app-view-heading">
        <div>
          <p className="app-overline">Intelligence view</p>
          <h2 id={`${view.id}-title`}>{view.title}</h2>
        </div>
        <div className="app-badge-row" aria-label={`${view.title} state`}>
          <StatusBadge tone={view.authority}>{formatPresentationLabel(view.authority)}</StatusBadge>
          <StatusBadge tone={view.status}>{formatPresentationLabel(view.status)}</StatusBadge>
        </div>
      </div>
      <p className="app-view-summary">{view.summary}</p>
      <dl className="app-view-meta">
        <div>
          <dt>Freshness</dt>
          <dd>{formatPresentationLabel(view.freshness)}</dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{view.observedAt ?? 'Not observed'}</dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd>{view.generatedAt ?? 'Not generated'}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{view.provenance.length === 0 ? 'No source references' : view.provenance.length}</dd>
        </div>
      </dl>
      <div className="app-unavailable" role="status">
        <strong>View unavailable</strong>
        <p>{view.note}</p>
      </div>
    </article>
  );
}

export default function IntelligenceApplication() {
  return (
    <ApplicationShell activePath="/app" mainId="overview">
      <section className="app-intro" aria-labelledby="app-title">
        <div>
          <p className="app-overline">MVP application contract</p>
          <h1 id="app-title">Intelligence, with its authority visible.</h1>
        </div>
        <p>
          This shell defines how future snapshots are presented without becoming a new source of
          canonical truth. No live or synthetic operational data is displayed.
        </p>
      </section>

      <section className="app-contract-grid" aria-label="Presentation contract">
        <article>
          <p className="app-overline">Authority</p>
          <h2>Classification travels with the view.</h2>
          <div className="app-badge-row">
            <StatusBadge tone="canonical">CANONICAL</StatusBadge>
            <StatusBadge tone="interpreted">INTERPRETED</StatusBadge>
            <StatusBadge tone="non_authoritative">NON-AUTHORITATIVE</StatusBadge>
          </div>
          <p>
            Portfolio and Morning Meeting remain canonical owners. The website is presentation only.
          </p>
        </article>
        <article>
          <p className="app-overline">Freshness</p>
          <h2>Time is explicit, not implied.</h2>
          <div className="app-badge-row">
            <StatusBadge tone="stale">STALE</StatusBadge>
            <StatusBadge tone="unavailable">UNAVAILABLE</StatusBadge>
          </div>
          <p>
            Views can carry observed and generated timestamps, freshness, and unavailable state.
          </p>
        </article>
        <article>
          <p className="app-overline">Provenance</p>
          <h2>Sources remain referenceable.</h2>
          <p>
            Provider identity, observation time, and source references can accompany a snapshot
            without provider ranking, consensus, fallback, or automatic selection.
          </p>
        </article>
      </section>

      <section className="app-trust" aria-labelledby="trust-title">
        <div className="app-section-heading">
          <p className="app-overline">Trust progression</p>
          <h2 id="trust-title">Grounded does not mean authoritative.</h2>
        </div>
        <ol>
          {trustProgression.map((stage, index) => (
            <li key={stage}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <code>{stage}</code>
            </li>
          ))}
        </ol>
        <p>
          A non-authoritative interpretation may be displayed alongside canonical state. It cannot
          mutate, repair, or replace that state.
        </p>
      </section>

      <section className="app-views" aria-label="MVP intelligence views">
        {applicationViews.map((view) => (
          <ViewCard key={view.id} view={view} />
        ))}
      </section>

      <section className="app-boundary" aria-labelledby="boundary-title">
        <div>
          <p className="app-overline">Read-only boundary</p>
          <h2 id="boundary-title">No action surface is exposed.</h2>
        </div>
        <ul>
          <li>No trade, transaction, transfer, signing, or portfolio mutation.</li>
          <li>No wallet connection, custody, private-key handling, or credential discovery.</li>
          <li>No live Ritual execution or autonomous research and decision execution.</li>
          <li>No self-starting loop, scheduler, worker, daemon, poller, retry, or fallback.</li>
        </ul>
      </section>
    </ApplicationShell>
  );
}
