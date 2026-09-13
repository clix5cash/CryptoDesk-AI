const capabilities = [
  {
    index: '01',
    title: 'Market intelligence',
    body: 'Deterministic market snapshots, indicators, and signals built on normalized provider data.',
  },
  {
    index: '02',
    title: 'News intelligence',
    body: 'RSS and Atom ingestion with normalization, classification, grouping, impact, and provenance.',
  },
  {
    index: '03',
    title: 'Portfolio intelligence',
    body: 'Canonical identity, valuation, allocation, risk, insight, and presentation models.',
  },
  {
    index: '04',
    title: 'Morning Meeting',
    body: 'Deterministic reports with optional AI narration kept separate from canonical application state.',
  },
  {
    index: '05',
    title: 'Provider-neutral AI',
    body: 'Explicit execution, parsing, grounding, and traceability contracts independent of one provider.',
  },
  {
    index: '06',
    title: 'Ritual Gateway',
    body: 'An isolated boundary for Ritual connectivity, transaction, inference, and provenance lifecycles.',
  },
  {
    index: '07',
    title: 'Runtime Safety',
    body: 'Provider-neutral authorization and single-attempt execution contracts with terminal finality.',
  },
] as const;

const conceptualFlow = ['Observe', 'Think', 'Remember', 'Decide', 'Act'] as const;

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="CryptoDesk AI home">
          <span className="wordmark-mark" aria-hidden="true">
            CD
          </span>
          <span>CryptoDesk AI</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#architecture">Architecture</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#safety">Safety</a>
          <a
            className="nav-cta"
            href="https://github.com/clix5cash/CryptoDesk-AI"
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="project-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="pulse" aria-hidden="true" /> Public open-source MVP
            </p>
            <h1 id="project-title">
              Intelligence with
              <span> explicit boundaries.</span>
            </h1>
            <p className="hero-summary">
              CryptoDesk AI is an open-source, multi-package architecture for deterministic crypto
              market, news, portfolio, and Morning Meeting intelligence—with AI and execution kept
              inside deliberate trust and authority boundaries.
            </p>
            <div className="hero-actions">
              <a
                className="button button-primary"
                href="https://github.com/clix5cash/CryptoDesk-AI"
                target="_blank"
                rel="noreferrer noopener"
              >
                Explore the repository <span aria-hidden="true">↗</span>
              </a>
              <a className="button button-secondary" href="#architecture">
                See the architecture <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>

          <aside className="release-card" aria-label="Project release status">
            <div className="release-card-header">
              <span>Release status</span>
              <span className="status-pill">Active development</span>
            </div>
            <dl>
              <div>
                <dt>Release</dt>
                <dd>v0.1.0-mvp</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>Public / Apache-2.0</dd>
              </div>
              <div>
                <dt>Runtime model</dt>
                <dd>Explicitly invoked</dd>
              </div>
              <div>
                <dt>Ritual verification</dt>
                <dd>INCONCLUSIVE</dd>
              </div>
            </dl>
            <p>
              External Ritual verification remains INCONCLUSIVE. Local and injected lifecycle tests
              are not evidence of externally verified live Ritual inference or action.
            </p>
          </aside>
        </section>

        <section className="flow-section" id="architecture" aria-labelledby="architecture-title">
          <div className="section-heading">
            <p className="section-kicker">01 / System model</p>
            <h2 id="architecture-title">A deliberate path from signal to action.</h2>
            <p>
              The sequence organizes system responsibilities. It is a conceptual architecture
              model—not a claim of unrestricted autonomous execution.
            </p>
          </div>
          <ol className="conceptual-flow">
            {conceptualFlow.map((step, index) => (
              <li key={step}>
                <span className="flow-index">0{index + 1}</span>
                <strong>{step}</strong>
                {index < conceptualFlow.length - 1 ? (
                  <span className="flow-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="architecture-note">
            <p>Observation</p>
            <span aria-hidden="true" />
            <p>Deterministic domains</p>
            <span aria-hidden="true" />
            <p>Non-authoritative AI</p>
            <span aria-hidden="true" />
            <p>Explicit authorization</p>
          </div>
        </section>

        <section
          className="capabilities-section"
          id="capabilities"
          aria-labelledby="capabilities-title"
        >
          <div className="section-heading split-heading">
            <div>
              <p className="section-kicker">02 / Architecture layers</p>
              <h2 id="capabilities-title">Composable intelligence, separated by contract.</h2>
            </div>
            <p>
              Each layer has a bounded responsibility. Provider-specific integration remains outside
              canonical domain ownership.
            </p>
          </div>
          <div className="capability-grid">
            {capabilities.map((capability) => (
              <article className="capability-card" key={capability.title}>
                <span>{capability.index}</span>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="safety-section" id="safety" aria-labelledby="safety-title">
          <div className="section-heading safety-heading">
            <p className="section-kicker">03 / Trust &amp; safety</p>
            <h2 id="safety-title">Model output is not authority.</h2>
            <p>
              CryptoDesk AI favors explicit contracts and visible handoffs over hidden authority.
              Interpretation never becomes canonical merely because a model produced it.
            </p>
          </div>

          <div className="safety-layout">
            <div className="trust-track" aria-label="AI trust progression">
              <div>
                <span>01</span>
                <code>untrusted_model_execution</code>
                <p>Opaque provider output enters a validated execution envelope.</p>
              </div>
              <div>
                <span>02</span>
                <code>untrusted_candidate_interpretation</code>
                <p>Structure is parsed and validated, without granting authority.</p>
              </div>
              <div>
                <span>03</span>
                <code>non_authoritative_interpretation</code>
                <p>References are grounded, but the result remains descriptive.</p>
              </div>
            </div>

            <div className="guardrails">
              <h3>Bounded by design</h3>
              <ul>
                <li>Portfolio and Morning Meeting retain canonical authority.</li>
                <li>Execution requires explicit authorization.</li>
                <li>Permission is operation-local and single-attempt.</li>
                <li>Authorized execution occurs at most once, then stops.</li>
                <li>Runtime Safety owns no wallet or private key.</li>
                <li>No self-starting loop, scheduling, or autonomous trading authority.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="open-source-section" aria-labelledby="open-source-title">
          <div>
            <p className="section-kicker">04 / Open source</p>
            <h2 id="open-source-title">Inspect the boundaries. Challenge the contracts.</h2>
          </div>
          <p>
            The source, architecture record, security policy, and first public MVP release are
            available on GitHub under Apache License 2.0.
          </p>
          <div className="open-source-actions">
            <a
              className="button button-primary"
              href="https://github.com/clix5cash/CryptoDesk-AI"
              target="_blank"
              rel="noreferrer noopener"
            >
              View source <span aria-hidden="true">↗</span>
            </a>
            <a
              className="text-link"
              href="https://github.com/clix5cash/CryptoDesk-AI/releases/tag/v0.1.0-mvp"
              target="_blank"
              rel="noreferrer noopener"
            >
              Read the v0.1.0-mvp release <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>CryptoDesk AI</p>
        <p>Open-source crypto intelligence with explicit boundaries.</p>
        <a
          href="https://github.com/clix5cash/CryptoDesk-AI"
          target="_blank"
          rel="noreferrer noopener"
        >
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </div>
  );
}
