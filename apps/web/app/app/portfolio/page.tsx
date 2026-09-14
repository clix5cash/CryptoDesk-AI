import type { Metadata } from 'next';

import { ApplicationShell } from '../application-shell';
import {
  applicationViews,
  formatPresentationLabel,
  type IntelligenceViewPresentation,
} from '../presentation';

export const metadata: Metadata = {
  title: 'Portfolio intelligence | CryptoDesk AI',
  description:
    'A read-only Portfolio Intelligence view preserving canonical ownership, coverage, freshness, and provenance.',
  alternates: { canonical: '/app/portfolio' },
  openGraph: {
    title: 'CryptoDesk AI portfolio intelligence',
    description: 'Canonical Portfolio presentation with explicit availability and provenance.',
    url: '/app/portfolio',
  },
};

function getPortfolioView(): IntelligenceViewPresentation {
  const view = applicationViews.find((candidate) => candidate.id === 'portfolio');
  if (!view) throw new Error('Portfolio presentation contract is unavailable.');
  return view;
}

const canonicalRecords = [
  ['Identity', 'Portfolio, source, account, asset, position, and snapshot identities'],
  ['Holdings', 'Immutable positions with source quantity, asset identity, and observation time'],
  ['Valuation', 'Explicit currency, as-of time, valued totals, position values, and coverage'],
  ['Allocation', 'Already-computed asset, network, source, and account allocation records'],
] as const;

const intelligenceRecords = [
  {
    title: 'Coverage',
    body: 'Valued and unvalued position coverage stays explicit; missing price or precision is never estimated.',
  },
  {
    title: 'Descriptive risk',
    body: 'Rule-based concentration and exposure observations retain thresholds, evidence, and data-quality state.',
  },
  {
    title: 'Insights',
    body: 'Deterministic evidence-only categories and priorities contain no narrative, prediction, or recommendation.',
  },
] as const;

export default function PortfolioIntelligencePage() {
  const portfolioView = getPortfolioView();

  return (
    <ApplicationShell activePath="/app/portfolio" mainId="portfolio-view">
      <section className="portfolio-intro" aria-labelledby="portfolio-title">
        <div>
          <p className="app-overline">Portfolio intelligence</p>
          <h1 id="portfolio-title">Canonical state, presented without mutation.</h1>
        </div>
        <p>
          Portfolio Intelligence owns portfolio identity, snapshots, valuation, allocation, risk,
          and evidence-backed insights. This website can present validated records; it cannot create
          or change them.
        </p>
      </section>

      <section className="portfolio-state" aria-labelledby="portfolio-state-title">
        <div className="portfolio-state-heading">
          <div>
            <p className="app-overline">Current view state</p>
            <h2 id="portfolio-state-title">No validated portfolio snapshot connected</h2>
          </div>
          <div className="app-badge-row" aria-label="Portfolio view classification">
            <span className="app-badge app-badge-canonical">
              {formatPresentationLabel(portfolioView.authority)}
            </span>
            <span className="app-badge app-badge-unavailable">
              {formatPresentationLabel(portfolioView.status)}
            </span>
          </div>
        </div>
        <p>{portfolioView.note}</p>
        <dl className="portfolio-state-meta">
          <div>
            <dt>Freshness</dt>
            <dd>{formatPresentationLabel(portfolioView.freshness)}</dd>
          </div>
          <div>
            <dt>Captured</dt>
            <dd>{portfolioView.observedAt ?? 'Not captured'}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{portfolioView.generatedAt ?? 'Not generated'}</dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>No snapshot references</dd>
          </div>
        </dl>
      </section>

      <section className="portfolio-authority" aria-labelledby="portfolio-authority-title">
        <div>
          <p className="app-overline">Authority boundary</p>
          <h2 id="portfolio-authority-title">Portfolio owns the record.</h2>
        </div>
        <div className="portfolio-authority-flow">
          <div>
            <span>CANONICAL</span>
            <h3>Portfolio Intelligence</h3>
            <p>Owns canonical Portfolio state and deterministic domain outputs.</p>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <span>PRESENTATION</span>
            <h3>Web application</h3>
            <p>Formats supplied records without persistence, recalculation, or mutation.</p>
          </div>
        </div>
      </section>

      <section className="portfolio-contract" aria-labelledby="portfolio-contract-title">
        <div className="app-section-heading">
          <p className="app-overline">Canonical record surface</p>
          <h2 id="portfolio-contract-title">Only Portfolio-owned fields are eligible.</h2>
          <p>
            Values appear only when a validated Portfolio record is supplied. Optional or missing
            facts remain absent rather than being inferred by the interface.
          </p>
        </div>
        <div className="portfolio-field-grid">
          {canonicalRecords.map(([label, detail]) => (
            <article key={label}>
              <h3>{label}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="portfolio-contract" aria-labelledby="portfolio-intelligence-title">
        <div className="app-section-heading">
          <p className="app-overline">Deterministic intelligence</p>
          <h2 id="portfolio-intelligence-title">Analysis remains traceable to canonical facts.</h2>
        </div>
        <div className="portfolio-intelligence-grid">
          {intelligenceRecords.map((item) => (
            <article key={item.title}>
              <span>DETERMINISTIC</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="portfolio-provenance" aria-labelledby="portfolio-provenance-title">
        <div>
          <p className="app-overline">Freshness + provenance</p>
          <h2 id="portfolio-provenance-title">Snapshot time and analysis time remain explicit.</h2>
        </div>
        <div>
          <p>
            A validated presentation may reference portfolio and snapshot identity, captured and
            as-of timestamps, source records, price observations, coverage, and evidence.
          </p>
          <p>
            With no validated snapshot or timestamp, freshness remains unknown. Wallet addresses and
            external locators are not displayed by this view.
          </p>
        </div>
      </section>

      <aside className="portfolio-exclusions" aria-labelledby="portfolio-exclusions-title">
        <p className="app-overline">Read-only boundary</p>
        <h2 id="portfolio-exclusions-title">No fabricated balance or financial action surface.</h2>
        <p>
          No holdings, quantities, values, allocation, performance, profit or loss, or advice is
          fabricated. This route exposes no wallet connection, custody, editing, trading, transfer,
          signing, rebalancing, transaction, or autonomous control.
        </p>
      </aside>
    </ApplicationShell>
  );
}
