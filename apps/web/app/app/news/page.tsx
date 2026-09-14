import type { Metadata } from 'next';

import { ApplicationShell } from '../application-shell';
import {
  applicationViews,
  formatPresentationLabel,
  type IntelligenceViewPresentation,
} from '../presentation';

export const metadata: Metadata = {
  title: 'News intelligence | CryptoDesk AI',
  description:
    'A read-only News Intelligence view separating normalized source records, deterministic metadata, and non-authoritative interpretation.',
  alternates: { canonical: '/app/news' },
  openGraph: {
    title: 'CryptoDesk AI news intelligence',
    description: 'Source-aware news presentation with explicit freshness, provenance, and trust.',
    url: '/app/news',
  },
};

function getNewsView(): IntelligenceViewPresentation {
  const view = applicationViews.find((candidate) => candidate.id === 'news');
  if (!view) throw new Error('News presentation contract is unavailable.');
  return view;
}

const sourceFields = [
  ['Identity', 'Article, source, and optional source-record identifiers'],
  ['Source content', 'Title plus optional source-supplied excerpt, content, authors, and language'],
  ['Reference', 'Optional validated canonical URL and source associations'],
  ['Time', 'Published and observed timestamps supplied by the normalized record'],
] as const;

const deterministicMetadata = [
  {
    title: 'Classification',
    body: 'Explicit asset and market relevance, configured categories, events, strength, and machine-readable rule evidence.',
  },
  {
    title: 'Impact mechanism',
    body: 'Rule-based type, direction, qualitative strength, target, and evidence—not sentiment, probability, or a price forecast.',
  },
  {
    title: 'Event grouping',
    body: 'Provenance-preserving groups for explicitly classified occurrences, with article, source, target, and publication-time references.',
  },
] as const;

export default function NewsIntelligencePage() {
  const newsView = getNewsView();

  return (
    <ApplicationShell activePath="/app/news" mainId="news-view">
      <section className="news-intro" aria-labelledby="news-title">
        <div>
          <p className="app-overline">News intelligence</p>
          <h1 id="news-title">Source records stay distinct from interpretation.</h1>
        </div>
        <p>
          This route can present normalized news and deterministic enrichment without turning source
          text, rules, or model output into application-owned fact. No feed is connected in the
          website runtime.
        </p>
      </section>

      <section className="news-state" aria-labelledby="news-state-title">
        <div className="news-state-heading">
          <div>
            <p className="app-overline">Current view state</p>
            <h2 id="news-state-title">No validated source connected</h2>
          </div>
          <div className="app-badge-row" aria-label="News view classification">
            <span className="app-badge app-badge-deterministic">
              {formatPresentationLabel(newsView.authority)}
            </span>
            <span className="app-badge app-badge-unavailable">
              {formatPresentationLabel(newsView.status)}
            </span>
          </div>
        </div>
        <p>{newsView.note}</p>
        <dl className="news-state-meta">
          <div>
            <dt>Freshness</dt>
            <dd>{formatPresentationLabel(newsView.freshness)}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>Not published</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{newsView.observedAt ?? 'Not observed'}</dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>No source references</dd>
          </div>
        </dl>
      </section>

      <section className="news-separation" aria-labelledby="separation-title">
        <div className="app-section-heading">
          <p className="app-overline">Authority separation</p>
          <h2 id="separation-title">Evidence and interpretation never share one voice.</h2>
        </div>
        <div className="news-region-grid">
          <article className="news-source-region">
            <div className="news-region-label">
              <span>SOURCE</span>
              <span className="app-badge app-badge-unavailable">UNAVAILABLE</span>
            </div>
            <h3>Normalized source record</h3>
            <p>
              Headline, publication, timestamps, safe reference, and source-supplied text appear
              here only after validation. No article is connected.
            </p>
          </article>
          <article className="news-interpretation-region">
            <div className="news-region-label">
              <span>INTERPRETATION</span>
              <span className="app-badge app-badge-non_authoritative">NON-AUTHORITATIVE</span>
            </div>
            <h3>No interpretation generated</h3>
            <p>
              No News AI interpretation contract is connected. If one is supplied later, it must
              remain separately labeled and must not restate model output as reported fact.
            </p>
          </article>
        </div>
      </section>

      <section className="news-contract" aria-labelledby="source-contract-title">
        <div className="app-section-heading">
          <p className="app-overline">Normalized source contract</p>
          <h2 id="source-contract-title">Only source-backed fields are eligible.</h2>
          <p>
            Optional fields remain absent when a source does not supply them. The web layer neither
            repairs nor invents article content.
          </p>
        </div>
        <div className="news-field-grid">
          {sourceFields.map(([label, detail]) => (
            <article key={label}>
              <h3>{label}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="news-contract" aria-labelledby="metadata-contract-title">
        <div className="app-section-heading">
          <p className="app-overline">Deterministic system metadata</p>
          <h2 id="metadata-contract-title">Rules remain traceable to evidence.</h2>
        </div>
        <div className="news-metadata-grid">
          {deterministicMetadata.map((item) => (
            <article key={item.title}>
              <span>DETERMINISTIC</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="news-provenance" aria-labelledby="news-provenance-title">
        <div>
          <p className="app-overline">Freshness + provenance</p>
          <h2 id="news-provenance-title">Publication and observation are separate.</h2>
        </div>
        <div>
          <p>
            A validated record may carry source identity, an article or feed reference,
            <code> publishedAt</code>, and <code>observedAt</code>. Interpretation may separately
            carry a generation time.
          </p>
          <p>
            With no timestamps, freshness remains unknown. Rendering the route does not make news
            current or live.
          </p>
        </div>
      </section>

      <aside className="news-exclusions" aria-labelledby="news-exclusions-title">
        <p className="app-overline">Explicitly absent</p>
        <h2 id="news-exclusions-title">No fabricated signal or action layer.</h2>
        <p>
          No headline, source, sentiment score, urgency, credibility, recommendation, ranking,
          consensus, or apparently live feed is fabricated. Provider and parser failures resolve to
          bounded unavailable/error presentation and never expose raw exception or response text.
        </p>
      </aside>
    </ApplicationShell>
  );
}
