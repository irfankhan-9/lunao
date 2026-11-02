import React from 'react';
import { Check } from 'lucide-react';
import { pricingCopy } from '../lib/copy';

interface PricingProps {
  onPickPlan: (planId: string) => void;
}

export const Pricing: React.FC<PricingProps> = ({ onPickPlan: onOpenDashboard }) => {
  return (
    <section
      id="pricing"
      className="landing-section bg-surface"
      aria-labelledby="pricing-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[700px] mb-12 md:mb-16">
          <p className="landing-eyebrow mb-4">{pricingCopy.eyebrow}</p>
          <h2 id="pricing-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em] mb-4">
            {pricingCopy.heading}
          </h2>
          <p className="font-sans text-ink-secondary text-base md:text-[17px] leading-relaxed max-w-[58ch]">
            {pricingCopy.sub}
          </p>
        </div>

        {/* Desktop: 4-up grid. Mobile: horizontal scroll. */}
        <div className="-mx-5 px-5 md:mx-0 md:px-0 overflow-x-auto scrollbar-none">
          <div className="flex md:grid md:grid-cols-4 gap-4 md:gap-5 min-w-[960px] md:min-w-0 pb-2">
            {pricingCopy.plans.map((p) => (
              <article
                key={p.id}
                className={`flex-1 min-w-[230px] md:min-w-0 flex flex-col p-6 rounded-xl bg-white border ${
                  p.recommended ? 'border-accent ring-2 ring-accent/20 shadow-md' : 'border-border-main'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-serif text-ink text-[22px] leading-none">
                    {p.name}
                  </h3>
                  {p.recommended && (
                    <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-accent bg-accent-soft border border-accent/20 px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="font-sans text-ink-secondary text-[12.5px] leading-relaxed mb-4 min-h-[36px]">
                  {p.tagline}
                </p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="font-sans text-ink text-[34px] font-bold leading-none">
                    {p.price}
                  </span>
                  <span className="font-sans text-ink-tertiary text-sm">{p.cadence}</span>
                </div>
                <p className="font-mono text-[11px] font-semibold text-accent mb-5">{p.credits}</p>

                <ul className="space-y-2.5 mb-6 flex-1 border-t border-border-light pt-4">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex gap-2 font-sans text-[13px] text-ink-secondary leading-snug">
                      <Check className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" strokeWidth={2.5} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => onOpenDashboard(p.id)}
                  className={`h-11 rounded-lg font-sans text-sm font-semibold transition-all ${
                    p.recommended
                      ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
                      : 'bg-off-white text-ink hover:bg-border-light border border-border-main'
                  }`}
                >
                  {p.cta}
                </button>
              </article>
            ))}
          </div>
        </div>

        {/* Credit math table */}
        <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div>
            <h3 className="font-serif text-ink text-[24px] md:text-[28px] leading-[1.15] tracking-tight mb-3">
              {pricingCopy.creditMathHeading}
            </h3>
            <p className="font-sans text-ink-secondary text-[15px] leading-relaxed max-w-[44ch]">
              {pricingCopy.rolloverNote}
            </p>
          </div>
          <div className="rounded-xl border border-border-main bg-white overflow-hidden shadow-xs">
            <div className="grid grid-cols-2 px-4 py-3 bg-off-white border-b border-border-light text-[10px] font-mono font-bold uppercase tracking-wider text-ink-tertiary">
              <div>Action</div>
              <div className="text-right">Cost</div>
            </div>
            {pricingCopy.creditMathRows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-2 px-4 py-3.5 border-b border-border-light last:border-b-0 items-center"
              >
                <div className="font-sans text-[14px] font-medium text-ink">{r.action}</div>
                <div className="text-right font-mono text-[13px] font-bold text-accent">{r.cost}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
