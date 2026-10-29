import React, { useEffect, useState } from 'react';
import { Logo } from '../components/Logo';
import { footerCopy } from '../lib/copy';

interface FooterProps {
  onOpenDashboard: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenDashboard }) => {
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [status, setStatus] = useState<'live' | 'down' | 'checking'>('checking');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/api/health', { method: 'GET' });
        if (!cancelled) setStatus(res.ok ? 'live' : 'down');
      } catch {
        if (!cancelled) setStatus('down');
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  return (
    <footer className="bg-white border-t border-border-main" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="landing-container pt-16 md:pt-20 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 mb-12">
          <div className="md:col-span-4">
            <Logo size={28} showWordmark />
            <p className="mt-5 font-sans text-ink-secondary text-[14px] leading-relaxed max-w-[34ch]">
              The pipeline that finds local businesses, builds each one a personalized website, and texts the owner the link.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'live' ? 'bg-success animate-pulse' : status === 'down' ? 'bg-danger' : 'bg-ink-tertiary'
                }`}
                aria-hidden="true"
              />
              <span className="font-mono text-[10.5px] text-ink-tertiary">
                {footerCopy.statusLabel} {status === 'live' ? '· operational' : status === 'down' ? '· degraded' : '· checking'}
              </span>
            </div>
          </div>

          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
            {footerCopy.columns.map((col) => {
              const isOpen = openCol === col.label;
              return (
                <div key={col.label}>
                  <button
                    type="button"
                    onClick={() => setOpenCol(isOpen ? null : col.label)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between md:cursor-default"
                  >
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-tertiary font-semibold">
                      {col.label}
                    </span>
                    <span className="md:hidden font-sans text-ink-tertiary text-sm">
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                  <ul
                    className={`mt-3 space-y-2.5 ${isOpen ? 'block' : 'hidden'} md:block`}
                  >
                    {col.links.map((l, i) => {
                      const handleClick = (e: React.MouseEvent) => {
                        if ('auth' in l && l.auth) {
                          e.preventDefault();
                          onOpenDashboard();
                        }
                      };
                      if ('external' in l && l.external) {
                        return (
                          <li key={i}>
                            <a
                              href={l.href}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-sans text-[13.5px] text-ink-secondary hover:text-ink transition-colors"
                            >
                              {l.label}
                            </a>
                          </li>
                        );
                      }
                      return (
                        <li key={i}>
                          <a
                            href={l.href}
                            onClick={handleClick}
                            className="font-sans text-[13.5px] text-ink-secondary hover:text-ink transition-colors"
                          >
                            {l.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border-light pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-[10.5px] text-ink-tertiary">
            <Logo size={14} />
            <span className="ml-1 font-serif text-ink text-sm not-italic">{footerCopy.tagline}</span>
          </div>
          <p className="font-mono text-[10.5px] text-ink-tertiary">{footerCopy.copyright}</p>
        </div>
      </div>
    </footer>
  );
};
