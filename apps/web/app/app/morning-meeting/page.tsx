import type { Metadata } from 'next';

import { ApplicationShell } from '../application-shell';
import {
  applicationViews,
  formatPresentationLabel,
  type IntelligenceViewPresentation,
} from '../presentation';

export const metadata: Metadata = {
  title: 'Morning Meeting | CryptoDesk AI',
  description:
    'A read-only Morning Meeting experience separating canonical reports, contributor evidence, and non-authoritative interpretation.',
  alternates: { canonical: '/app/morning-meeting' },
  openGraph: {
    title: 'CryptoDesk AI Morning Meeting',
    description: 'Canonical briefing structure with explicit evidence, availability, and trust.',
    url: '/app/morning-meeting',
  },
};

function getMorningMeetingView(): IntelligenceViewPresentation {
  const view = applicationViews.find((candidate) => candidate.id === 'morning_meeting');
  if (!view) throw new Error('Morning Meeting presentation contract is unavailable.');
  return view;
}

const reportFields = [
  ['Identity', 'Stable report identity plus generated and as-of timestamps'],
  ['Scope', 'Explicit timeframe and requested market or asset scope'],
  ['Market views', 'Snapshots, indicators, signals, bias, risk level, and evidence by market'],
  ['Sections', 'Typed deterministic evidence groups with stable identities and market references'],
] as const;

const contributors = [
  {
    label: 'Market',
    authority: 'DETERMINISTIC',
    detail: 'Market views and evidence are produced from existing Market Intelligence records.',
  },
  {
    label: 'News',
    authority: 'DETERMINISTIC / OPTIONAL',
    detail:
      'A structured News brief appears only when request-scoped News Intelligence is supplied.',
  },
  {
    label: 'Portfolio',
    authority: 'CANONICAL CONTEXT / OPTIONAL',
    detail:
      'Portfolio context belongs to optional AI composition; it is not a native report section.',
  },
] as const;

export default function MorningMeetingPage() {
  const meetingView = getMorningMeetingView();

  return (
    <ApplicationShell activePath="/app/morning-meeting" mainId="morning-meeting-view">
      <section className="meeting-intro" aria-labelledby="meeting-title">
        <div>
          <p className="app-overline">Morning Meeting</p>
          <h1 id="meeting-title">A briefing boundary, not an invented narrative.</h1>
        </div>
        <p>
          Morning Meeting owns its canonical report and application state. This route can format a
          validated report and its evidence, while optional AI prose stays visibly separate and
          non-authoritative.
        </p>
      </section>

      <section className="meeting-state" aria-labelledby="meeting-state-title">
        <div className="meeting-state-heading">
          <div>
            <p className="app-overline">Current briefing state</p>
            <h2 id="meeting-state-title">No validated Morning Meeting report connected</h2>
          </div>
          <div className="app-badge-row" aria-label="Morning Meeting view classification">
            <span className="app-badge app-badge-canonical">
              {formatPresentationLabel(meetingView.authority)}
            </span>
            <span className="app-badge app-badge-unavailable">
              {formatPresentationLabel(meetingView.status)}
            </span>
          </div>
        </div>
        <p>{meetingView.note}</p>
        <dl className="meeting-state-meta">
          <div>
            <dt>Freshness</dt>
            <dd>{formatPresentationLabel(meetingView.freshness)}</dd>
          </div>
          <div>
            <dt>As of</dt>
            <dd>{meetingView.observedAt ?? 'Not observed'}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{meetingView.generatedAt ?? 'Not generated'}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>No report references</dd>
          </div>
        </dl>
      </section>

      <article className="meeting-report" aria-labelledby="meeting-report-title">
        <div className="app-section-heading">
          <p className="app-overline">Canonical report</p>
          <h2 id="meeting-report-title">Structured facts retain report ownership.</h2>
          <p>
            A supplied report is rendered without recomputation or invented sections. Formatting and
            grouping in the browser create no new analytical authority.
          </p>
        </div>
        <div className="meeting-field-grid">
          {reportFields.map(([label, detail]) => (
            <section key={label}>
              <h3>{label}</h3>
              <p>{detail}</p>
            </section>
          ))}
        </div>
      </article>

      <section className="meeting-contributors" aria-labelledby="meeting-contributors-title">
        <div className="app-section-heading">
          <p className="app-overline">Contributor boundaries</p>
          <h2 id="meeting-contributors-title">Each domain keeps its own semantics.</h2>
        </div>
        <div className="meeting-contributor-grid">
          {contributors.map((contributor) => (
            <article key={contributor.label}>
              <span>{contributor.authority}</span>
              <h3>{contributor.label}</h3>
              <p>{contributor.detail}</p>
              <strong>UNAVAILABLE</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="meeting-separation" aria-labelledby="meeting-separation-title">
        <div className="app-section-heading">
          <p className="app-overline">Authority separation</p>
          <h2 id="meeting-separation-title">
            Report facts and AI prose never share one authority.
          </h2>
        </div>
        <div className="meeting-region-grid">
          <article>
            <div className="meeting-region-label">
              <span>REPORT</span>
              <span className="app-badge app-badge-canonical">CANONICAL</span>
            </div>
            <h3>No canonical report supplied</h3>
            <p>Report sections and evidence appear here only after canonical validation.</p>
          </article>
          <article className="meeting-interpretation-region">
            <div className="meeting-region-label">
              <span>INTERPRETATION</span>
              <span className="app-badge app-badge-non_authoritative">NON-AUTHORITATIVE</span>
            </div>
            <h3>No AI narrative supplied</h3>
            <p>
              Optional grounded prose remains separate, traceable to execution and fact references,
              and cannot modify the canonical report.
            </p>
          </article>
        </div>
      </section>

      <section className="meeting-provenance" aria-labelledby="meeting-provenance-title">
        <div>
          <p className="app-overline">Freshness + evidence</p>
          <h2 id="meeting-provenance-title">Every available contribution remains time-bound.</h2>
        </div>
        <div>
          <p>
            Report generation time, as-of time, market observation time, source-record identity,
            indicator and signal references, and optional News provenance remain explicit.
          </p>
          <p>
            Missing contributors stay unavailable and completeness is never implied. No provider
            fallback, ranking, consensus, refresh, or report-generation loop runs here.
          </p>
        </div>
      </section>

      <aside className="meeting-exclusions" aria-labelledby="meeting-exclusions-title">
        <p className="app-overline">Read-only boundary</p>
        <h2 id="meeting-exclusions-title">No fabricated briefing or action surface.</h2>
        <p>
          No market condition, headline, portfolio value, report section, AI narrative, timestamp,
          score, risk assessment, or recommendation is fabricated. This route exposes no wallet,
          trading, signing, transfer, approval, strategy execution, or autonomous control.
        </p>
      </aside>
    </ApplicationShell>
  );
}
