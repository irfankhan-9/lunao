import React from 'react';
import { whyUsCopy } from '../lib/copy';

export const WhyUs: React.FC = () => {
  return (
    <section
      id="why-us"
      className="landing-section"
      aria-labelledby="why-us-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[700px] mb-12 md:mb-16">
          <p className="landing-eyebrow mb-4">{whyUsCopy.eyebrow}</p>
          <h2 id="why-us-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em] mb-4">
            {whyUsCopy.heading}
          </h2>
          <p className="font-sans text-ink-secondary text-base md:text-[17px] leading-relaxed max-w-[58ch]">
            {whyUsCopy.sub}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {whyUsCopy.cells.map((c, i) => (
            <article
              key={i}
              className="flex flex-col p-6 md:p-7 rounded-lg bg-white border border-border-main"
            >
              <h3 className="font-serif text-ink text-[22px] md:text-[24px] leading-[1.15] tracking-tight mb-3">
                {c.label}
              </h3>
              <p className="font-sans text-ink-secondary text-[14.5px] leading-relaxed mb-5 flex-1">
                {c.body}
              </p>
              <span className="self-start inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] text-accent bg-accent-soft border border-accent/15">
                {c.evidence}
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
