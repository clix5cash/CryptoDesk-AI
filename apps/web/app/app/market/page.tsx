import type { Metadata } from 'next';

import { ApplicationShell } from '../application-shell';
import {
  applicationViews,
  formatPresentationLabel,
  type IntelligenceViewPresentation,
} from '../presentation';

export const metadata: Metadata = {
  title: 'Market intelligence | CryptoDesk AI',
  description:
    'A read-only Market Intelligence view with explicit freshness, provenance, and availability.',
  alternates: { canonical: '/app/market' },
  openGraph: {
    title: 'CryptoDesk AI market intelligence',
    description: 'Deterministic market presentation with explicit freshness and provenance.',
    url: '/app/market',
  },
};

function getMarketView(): IntelligenceViewPresentation {
  const view = applicationViews.find((candidate) => candidate.id === 'market');
  if (!view) throw new Error('Market presentation contract is unavailable.');
  return view;
}

const supportedSnapshotFields = [
  ['Identity', 'Market, base asset, quote asset, and timeframe'],
  ['Price', 'Last, high, and low values from a normalized snapshot'],
  ['Activity', 'Volume plus optional price change and liquidity'],
  ['Time', 'Captured or observed timestamp supplied by the domain record'],
] as const;

const supportedIntelligence = [
  [
    'Indicators',
    'Named deterministic indicator values with market, asset, timeframe, and observation time.',
  ],
  [
    'Signals',
    'Type, direction, strength, detected time, summary, confidence when supplied, and evidence references.',
  ],
] as const;

export default function MarketIntelligencePage() {
  const marketView = getMarketView();

  return (
    <ApplicationShell activePath="/app/market" mainId="market-view">
      <section className="market-intro" aria-labelledby="market-title">
        <div>
          <p className="app-overline">Market intelligence</p>
          <h1 id="market-title">A time-bound view, never implied live.</h1>
        </div>
        <p>
          This route presents normalized Market Intelligence outputs without recalculating domain
          logic or becoming market authority. No provider is connected in the website runtime.
        </p>
      </section>

      <section className="market-state" aria-labelledby="market-state-title">
        <div className="market-state-heading">
          <div>
            <p className="app-overline">Current view state</p>
            <h2 id="market-state-title">Market snapshot unavailable</h2>
          </div>
          <div className="app-badge-row" aria-label="Market view classification">
            <span className="app-badge app-badge-deterministic">
              {formatPresentationLabel(marketView.authority)}
            </span>
            <span className="app-badge app-badge-unavailable">
              {formatPresentationLabel(marketView.status)}
            </span>
          </div>
        </div>
        <p>{marketView.note}</p>
        <dl className="market-state-meta">
          <div>
            <dt>Freshness</dt>
            <dd>{formatPresentationLabel(marketView.freshness)}</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{marketView.observedAt ?? 'Not observed'}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{marketView.generatedAt ?? 'Not generated'}</dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>No source references</dd>
          </div>
        </dl>
      </section>

      <section className="market-contract" aria-labelledby="snapshot-contract-title">
        <div className="app-section-heading">
          <p className="app-overline">Supported snapshot contract</p>
          <h2 id="snapshot-contract-title">Only fields the domain already supplies.</h2>
          <p>
            Values appear only when a validated snapshot is provided. Missing optional fields stay
            absent; the presentation layer does not infer them.
          </p>
        </div>
        <div className="market-field-grid">
          {supportedSnapshotFields.map(([label, detail]) => (
            <article key={label}>
              <h3>{label}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="market-contract" aria-labelledby="intelligence-contract-title">
        <div className="app-section-heading">
          <p className="app-overline">Deterministic intelligence</p>
          <h2 id="intelligence-contract-title">Indicators and signals remain traceable.</h2>
        </div>
        <div className="market-intelligence-grid">
          {supportedIntelligence.map(([label, detail]) => (
            <article key={label}>
              <span>Supported</span>
              <h3>{label}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="market-provenance" aria-labelledby="provenance-title">
        <div>
          <p className="app-overline">Freshness + provenance</p>
          <h2 id="provenance-title">Evidence accompanies the snapshot.</h2>
        </div>
        <div>
          <p>
            A future validated result may carry source identity, provider label, observation time,
            and a safe reference. With no timestamp, freshness remains unknown.
          </p>
          <p>
            No provider ranking, consensus, fallback, automatic selection, polling, or refresh loop
            is performed here.
          </p>
        </div>
      </section>

      <aside className="market-exclusions" aria-labelledby="market-exclusions-title">
        <p className="app-overline">Explicitly absent</p>
        <h2 id="market-exclusions-title">No invented market surface.</h2>
        <p>
          This view does not display order books, funding, open interest, liquidations, dominance,
          RSI, or any other field without a supplied supported domain record. It exposes no trading,
          wallet, signing, transaction, or autonomous action control.
        </p>
      </aside>
    </ApplicationShell>
  );
}
