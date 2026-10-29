import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useCasesCopy } from '../lib/copy';

interface UseCasesProps {
  onPickNiche: (niche: string) => void;
}

export const UseCases: React.FC<UseCasesProps> = ({ onPickNiche: onOpenDashboard }) => {
  return (
    <section
      id="use-cases"
      className="landing-section"
      aria-labelledby="use-cases-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[640px] mb-12 md:mb-16">
          <p className="landing-eyebrow mb-4">{useCasesCopy.eyebrow}</p>
          <h2 id="use-cases-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em] mb-4">
            {useCasesCopy.heading}
          </h2>
          <p className="font-sans text-ink-secondary text-base md:text-[17px] leading-relaxed max-w-[52ch]">
            {useCasesCopy.sub}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {useCasesCopy.cases.map((c, i) => (
            <article
              key={i}
              className="group relative flex flex-col p-6 md:p-7 rounded-lg bg-white border border-border-main hover:border-ink/30 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-serif text-ink text-[24px] md:text-[26px] leading-none tracking-tight">
                  {c.niche}
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <p className="font-sans text-ink-secondary text-[15px] leading-relaxed mb-6 flex-1">
                {c.use}
              </p>
              <div className="flex items-end justify-between pt-4 border-t border-border-light">
                <p className="font-mono text-[11px] text-ink-tertiary leading-snug max-w-[60%]">
                  {c.result}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenDashboard(c.nicheKey)}
                  className="font-sans text-[12px] font-medium text-accent hover:text-accent-hover flex items-center gap-1"
                >
                  {useCasesCopy.cta}
                  <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
