import React from 'react';
import { painPointsCopy } from '../lib/copy';

export const PainPoints: React.FC = () => {
  return (
    <section
      id="pain"
      className="landing-section bg-surface"
      aria-labelledby="pain-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[640px] mb-10 md:mb-14">
          <p className="landing-eyebrow mb-4">{painPointsCopy.eyebrow}</p>
          <h2 id="pain-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em]">
            {painPointsCopy.heading}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {painPointsCopy.pairs.map((p, i) => (
            <div
              key={i}
              className="rounded-lg border border-border-main bg-white overflow-hidden"
            >
              <div className="p-5 md:p-6 border-b border-border-light bg-off-white/60">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary mb-2.5">
                  {painPointsCopy.beforeLabel}
                </p>
                <p className="font-sans text-ink-secondary text-[15px] leading-relaxed italic">
                  {p.before}
                </p>
              </div>
              <div className="p-5 md:p-6">
                <p className="font-mono text-[10px] uppercase tracking-wider text-accent mb-2.5">
                  {painPointsCopy.afterLabel}
                </p>
                <p className="font-sans text-ink text-[15px] leading-relaxed">
                  {p.after}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
