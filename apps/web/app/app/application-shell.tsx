import type { ReactNode } from 'react';

const navigation = [
  ['/app', 'Overview'],
  ['/app/market', 'Market'],
  ['/app#news', 'News'],
  ['/app#portfolio', 'Portfolio'],
  ['/app#morning_meeting', 'Morning Meeting'],
] as const;

export function ApplicationShell({
  activePath,
  children,
  mainId,
}: {
  readonly activePath: string;
  readonly children: ReactNode;
  readonly mainId: string;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href={`#${mainId}`}>
        Skip to main content
      </a>
      <header className="app-header">
        <a className="wordmark" href="/" aria-label="CryptoDesk AI public home">
          <span className="wordmark-mark" aria-hidden="true">
            CD
          </span>
          <span>CryptoDesk AI</span>
        </a>
        <p>Intelligence application / read-only</p>
      </header>

      <div className="app-frame">
        <aside className="app-sidebar">
          <nav aria-label="Intelligence views">
            {navigation.map(([href, label], index) => (
              <a href={href} key={href} aria-current={activePath === href ? 'page' : undefined}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {label}
              </a>
            ))}
          </nav>
          <div className="app-sidebar-note">
            <span>Action boundary</span>
            <p>
              Observation and presentation only. No wallet, trade, transfer, signing, or execution
              controls.
            </p>
          </div>
        </aside>

        <main className="app-main" id={mainId}>
          {children}
          <footer className="app-footer">
            <p>External Ritual verification remains INCONCLUSIVE.</p>
            <a href="/">Return to the public architecture overview</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
