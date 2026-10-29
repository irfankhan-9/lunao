import React from 'react';
import { testimonialsCopy } from '../lib/copy';

export const Testimonials: React.FC = () => {
  return (
    <section
      id="testimonials"
      className="landing-section"
      aria-labelledby="testimonials-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[700px] mb-12 md:mb-16">
          <p className="landing-eyebrow mb-4">{testimonialsCopy.eyebrow}</p>
          <h2 id="testimonials-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em] mb-4">
            {testimonialsCopy.heading}
          </h2>
          <p className="font-sans text-ink-secondary text-base md:text-[17px] leading-relaxed max-w-[58ch]">
            {testimonialsCopy.sub}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {testimonialsCopy.cards.map((c, i) => (
            <figure
              key={i}
              className="flex flex-col p-6 md:p-7 rounded-lg bg-white border border-border-main"
            >
              <blockquote className="font-serif text-ink text-[19px] md:text-[20px] leading-[1.35] mb-5 flex-1">
                &ldquo;{c.quote}&rdquo;
              </blockquote>
              <figcaption>
                <p className="font-sans text-[13.5px] text-ink font-medium">
                  {c.author}
                </p>
                <p className="font-mono text-[10.5px] text-ink-tertiary mt-0.5">
                  {c.meta} · {c.source}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* Live deployment counts */}
        <div className="mt-12 md:mt-16 rounded-lg border border-border-main bg-surface p-6 md:p-8">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-tertiary mb-5">
            From the dashboard
          </p>
          <p className="font-sans text-ink-secondary text-[14px] leading-relaxed mb-6 max-w-[60ch]">
            {testimonialsCopy.liveCounts.heading}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {testimonialsCopy.liveCounts.rows.map((r, i) => (
              <div key={i}>
                <p className="font-serif text-ink text-[36px] md:text-[44px] leading-none tracking-[-0.02em]">
                  {r.value}
                </p>
                <p className="mt-2 font-sans text-[12.5px] text-ink-secondary leading-snug max-w-[28ch]">
                  {r.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
