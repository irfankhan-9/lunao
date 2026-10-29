import React from 'react';
import { ArrowRight } from 'lucide-react';
import { ctvCopy } from '../lib/copy';

interface CTVProps {
  onOpenDashboard: () => void;
}

export const CTV: React.FC<CTVProps> = ({ onOpenDashboard }) => {
  return (
    <section
      id="ctv"
      className="landing-section bg-off-white"
      aria-labelledby="ctv-heading"
    >
      <div className="landing-container landing-fade text-center max-w-[820px]">
        <h2
          id="ctv-heading"
          className="font-serif text-ink text-[36px] sm:text-[48px] md:text-[64px] leading-[1.05] tracking-[-0.015em] mb-6"
        >
          {ctvCopy.heading}
        </h2>
        <p className="font-sans text-ink-secondary text-[17px] md:text-[19px] leading-relaxed max-w-[60ch] mx-auto mb-10">
          {ctvCopy.body}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={onOpenDashboard}
            className="h-12 px-5 rounded-md bg-accent text-white font-sans text-sm font-medium hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
          >
            {ctvCopy.ctaPrimary}
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </button>
          <a
            href={ctvCopy.mailto}
            className="h-12 px-5 rounded-md border border-border-main bg-white text-ink font-sans text-sm font-medium hover:bg-off-white transition-colors flex items-center justify-center"
          >
            {ctvCopy.ctaSecondary}
          </a>
        </div>
      </div>
    </section>
  );
};
