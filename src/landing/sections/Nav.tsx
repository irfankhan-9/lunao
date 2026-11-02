import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from '../components/Logo';
import { navCopy } from '../lib/copy';

interface NavProps {
  onOpenDashboard: () => void;
}

export const Nav: React.FC<NavProps> = ({ onOpenDashboard }) => {
  const [stuck, setStuck] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="landing-nav fixed top-0 left-0 right-0 z-50"
      data-stuck={stuck ? 'true' : 'false'}
    >
      <div className="landing-container flex items-center justify-between h-16 md:h-20">
        <a href="#top" className="flex items-center" aria-label="Lunao home">
          <Logo size={28} showWordmark />
        </a>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
          {navCopy.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-3 py-2 rounded-md font-sans text-sm text-ink-secondary hover:text-ink hover:bg-off-white transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenDashboard}
            className="px-3.5 h-9 rounded-md font-sans text-sm text-ink hover:bg-off-white transition-colors"
          >
            {navCopy.ctaLogIn}
          </button>
          <button
            type="button"
            onClick={onOpenDashboard}
            className="px-4 h-9 rounded-md bg-accent text-white font-sans text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            {navCopy.ctaStart}
          </button>
        </div>

        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={onOpenDashboard}
            className="px-3.5 h-9 rounded-md bg-accent text-white font-sans text-xs font-medium"
          >
            Start free
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="w-10 h-10 rounded-md flex items-center justify-center text-ink hover:bg-off-white"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" strokeWidth={1.8} /> : <Menu className="w-5 h-5" strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden landing-mobile-sheet bg-white border-t border-border-main shadow-md">
          <div className="landing-container py-4 flex flex-col gap-1">
            {navCopy.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 rounded-md font-sans text-sm text-ink-secondary hover:bg-off-white hover:text-ink"
              >
                {l.label}
              </a>
            ))}
            <div className="h-px bg-border-light my-2" />
            <button
              type="button"
              onClick={() => { setMobileOpen(false); onOpenDashboard(); }}
              className="px-3 py-3 rounded-md font-sans text-sm text-ink text-left hover:bg-off-white"
            >
              {navCopy.ctaLogIn}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
