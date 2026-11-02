import React from 'react';
import { XCircle, CheckCircle2 } from 'lucide-react';
import { painPointsCopy } from '../lib/copy';

export const PainPoints: React.FC = () => {
  return (
    <section
      id="pain"
      className="landing-section bg-surface"
      aria-labelledby="pain-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[720px] mb-10 md:mb-14">
          <p className="landing-eyebrow mb-4">{painPointsCopy.eyebrow}</p>
          <h2 id="pain-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em]">
            {painPointsCopy.heading}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {painPointsCopy.pairs.map((p, i) => (
            <div
              key={i}
              className="rounded-xl border border-border-main bg-white shadow-xs overflow-hidden flex flex-col"
            >
              <div className="p-5 md:p-6 border-b border-border-light bg-off-white/80">
                <div className="flex items-center gap-2 mb-2.5">
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={2.2} />
                  <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-rose-600">
                    {painPointsCopy.beforeLabel}
                  </span>
                </div>
                <p className="font-sans text-ink-secondary text-[14.5px] leading-relaxed">
                  {p.before}
                </p>
              </div>

              <div className="p-5 md:p-6 bg-white flex-1">
                <div className="flex items-center gap-2 mb-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={2.2} />
                  <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-emerald-700">
                    {painPointsCopy.afterLabel}
                  </span>
                </div>
                <p className="font-sans text-ink font-medium text-[15px] leading-relaxed">
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
