import React from 'react';
import { Check, Search, Smartphone, MessageSquare } from 'lucide-react';
import { howItWorksCopy } from '../lib/copy';

const StepMock: React.FC<{ kind: string }> = ({ kind }) => {
  if (kind === 'search') {
    return (
      <div className="rounded-md bg-white border border-border-light p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.8} />
          <span className="font-mono text-[10px] text-ink-tertiary">niche</span>
          <span className="font-sans text-[12px] text-ink">Barber</span>
        </div>
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.8} />
          <span className="font-mono text-[10px] text-ink-tertiary">city</span>
          <span className="font-sans text-[12px] text-ink">Austin, TX</span>
        </div>
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.8} />
          <span className="font-mono text-[10px] text-ink-tertiary">radius</span>
          <span className="font-sans text-[12px] text-ink">25 miles</span>
        </div>
      </div>
    );
  }
  if (kind === 'results') {
    return (
      <div className="rounded-md bg-white border border-border-light overflow-hidden">
        {[
          { n: 'Vintage Cuts', s: 'thin site' },
          { n: 'North Loop Barbers', s: 'no booking' },
          { n: 'East Side Shaves', s: 'few reviews' },
          { n: 'Crown & Comb', s: 'no mobile' },
        ].map((r, i) => (
          <div key={i} className="flex items-center justify-between px-2.5 py-1.5 border-b border-border-light last:border-b-0">
            <span className="font-sans text-[11px] text-ink truncate">{r.n}</span>
            <span className="font-mono text-[9px] text-ink-tertiary">{r.s}</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'preview') {
    return (
      <div className="rounded-md bg-white border border-border-light overflow-hidden">
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border-light bg-off-white">
          <span className="w-1.5 h-1.5 rounded-full bg-border-main" />
          <span className="w-1.5 h-1.5 rounded-full bg-border-main" />
          <span className="w-1.5 h-1.5 rounded-full bg-border-main" />
        </div>
        <div className="p-3 space-y-1.5">
          <div className="h-2.5 w-3/4 rounded bg-ink/80" />
          <div className="h-1.5 w-1/2 rounded bg-ink-tertiary/40" />
          <div className="mt-2 h-6 w-20 rounded bg-accent" />
        </div>
        <div className="px-2.5 py-1.5 border-t border-border-light">
          <p className="font-mono text-[9px] text-ink-tertiary truncate">
            vintage-cuts-barber-lounge-austin.pages.dev
          </p>
        </div>
      </div>
    );
  }
  if (kind === 'sms') {
    return (
      <div className="rounded-md bg-white border border-border-light p-3 space-y-2">
        <div className="flex gap-2 items-start">
          <div className="w-6 h-6 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
            <Smartphone className="w-3 h-3 text-accent" strokeWidth={1.8} />
          </div>
          <div className="rounded-md rounded-tl-sm bg-off-white border border-border-light px-2.5 py-1.5 max-w-[85%]">
            <p className="font-sans text-[10.5px] text-ink leading-relaxed">
              Hey Arthur — built this for{' '}
              <span className="font-medium">Vintage Cuts Barber Lounge</span> at{' '}
              <span className="font-medium">vintage-cuts-barber-lounge-austin.pages.dev</span>.
              Open it on your phone and let me know what you would change.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pl-8">
          <MessageSquare className="w-3 h-3 text-success" strokeWidth={2} />
          <span className="font-mono text-[9px] text-success">Delivered · 0.4s</span>
        </div>
      </div>
    );
  }
  return null;
};

export const HowItWorks: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="landing-section bg-surface"
      aria-labelledby="how-it-works-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[700px] mb-12 md:mb-16">
          <p className="landing-eyebrow mb-4">{howItWorksCopy.eyebrow}</p>
          <h2 id="how-it-works-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em] mb-4">
            {howItWorksCopy.heading}
          </h2>
          <p className="font-sans text-ink-secondary text-base md:text-[17px] leading-relaxed max-w-[58ch]">
            {howItWorksCopy.sub}
          </p>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 list-none p-0">
          {howItWorksCopy.steps.map((s, i) => (
            <li
              key={i}
              className="flex flex-col p-6 md:p-7 rounded-lg bg-white border border-border-main"
            >
              <div className="flex items-baseline gap-3 mb-3">
                <span className="font-mono text-[11px] text-accent tracking-wider">
                  STEP {s.n}
                </span>
                <span className="font-serif text-ink text-[22px] md:text-[24px] leading-[1.15] tracking-tight">
                  {s.title}
                </span>
              </div>
              <p className="font-sans text-ink-secondary text-[14.5px] leading-relaxed mb-5">
                {s.body}
              </p>
              <div className="mt-auto">
                <StepMock kind={s.mockKind} />
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-ink-tertiary">
          <span className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-success" strokeWidth={2.5} />
            No code required
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-success" strokeWidth={2.5} />
            No setup fees
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-success" strokeWidth={2.5} />
            Real Telnyx SMS, not a mock
          </span>
        </div>
      </div>
    </section>
  );
};
