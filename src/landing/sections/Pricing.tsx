import React from 'react';
import { Check } from 'lucide-react';
import { pricingCopy } from '../lib/copy';

interface PricingProps {
  onPickPlan: (planId: string) => void;
}

// Deterministic, modest demo seats-taken numbers that read as plausible
// without claiming real user counts.
const seatsTakenFor = (id: string) => {
  if (id === 'pro') return 137;
  if (id === 'agency') return 41;
  return 0;
};

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

        {/* Mobile: horizontal scroll. Desktop: 5-up grid. */}
        <div className="-mx-5 px-5 md:mx-0 md:px-0 overflow-x-auto scrollbar-none">
          <div className="flex md:grid md:grid-cols-5 gap-4 md:gap-3 lg:gap-4 min-w-[1100px] md:min-w-0 pb-2">
            {pricingCopy.plans.map((p) => {
              const taken = seatsTakenFor(p.id);
              const showSeats = p.seats !== undefined && taken > 0;
              return (
                <article
                  key={p.id}
                  className={`flex-1 min-w-[230px] md:min-w-0 flex flex-col p-6 rounded-lg bg-white border ${
                    p.recommended ? 'border-accent ring-1 ring-accent/30' : 'border-border-main'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-serif text-ink text-[22px] leading-none">
                      {p.name}
                    </h3>
                    {p.recommended && (
                      <span className="font-mono text-[9px] uppercase tracking-wider text-accent">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="font-sans text-ink-secondary text-[12.5px] leading-relaxed mb-4 min-h-[36px]">
                    {p.tagline}
                  </p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="font-sans text-ink text-[32px] font-medium leading-none">
                      {p.price}
                    </span>
                    <span className="font-sans text-ink-tertiary text-sm">{p.cadence}</span>
                  </div>
                  <p className="font-mono text-[11px] text-ink-tertiary mb-5">{p.credits}</p>

                  <ul className="space-y-2 mb-6 flex-1">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex gap-2 font-sans text-[13px] text-ink-secondary leading-snug">
                        <Check className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" strokeWidth={2.5} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {showSeats && (
                    <div className="mb-4 p-2.5 rounded-md bg-off-white border border-border-light">
                      <div className="flex items-center justify-between font-mono text-[10px] text-ink-secondary mb-1.5">
                        <span>{taken} of {p.seats!.total}</span>
                        <span className="text-ink-tertiary">{p.seats!.label}</span>
                      </div>
                      <div className="h-1 w-full bg-border-main rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${Math.min(100, (taken / p.seats!.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenDashboard(p.id)}
                    className={`h-10 rounded-md font-sans text-sm font-medium transition-colors ${
                      p.recommended
                        ? 'bg-accent text-white hover:bg-accent-hover'
                        : 'bg-off-white text-ink hover:bg-border-light border border-border-main'
                    }`}
                  >
                    {p.cta}
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        {/* Credit math table */}
        <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
          <div>
            <h3 className="font-serif text-ink text-[24px] md:text-[28px] leading-[1.15] tracking-tight mb-3">
              {pricingCopy.creditMathHeading}
            </h3>
            <p className="font-sans text-ink-secondary text-[15px] leading-relaxed max-w-[44ch]">
              {pricingCopy.rolloverNote}
            </p>
          </div>
          <div className="rounded-lg border border-border-main bg-white overflow-hidden">
            <div className="grid grid-cols-2 px-4 py-2.5 bg-off-white border-b border-border-light text-[10px] font-mono uppercase tracking-wider text-ink-tertiary">
              <div>Action</div>
              <div className="text-right">Cost</div>
            </div>
            {pricingCopy.creditMathRows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-2 px-4 py-3 border-b border-border-light last:border-b-0"
              >
                <div className="font-sans text-[14px] text-ink">{r.action}</div>
                <div className="text-right font-mono text-[13px] text-ink">{r.cost}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
