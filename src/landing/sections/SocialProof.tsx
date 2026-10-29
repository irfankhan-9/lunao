import React from 'react';
import { socialProofCopy } from '../lib/copy';

export const SocialProof: React.FC = () => {
  return (
    <section
      id="proof"
      className="landing-section bg-surface"
      aria-labelledby="proof-heading"
    >
      <div className="landing-container landing-fade">
        <div className="text-center mb-12 md:mb-16">
          <p className="landing-eyebrow mb-4">{socialProofCopy.eyebrow}</p>
          <h2 id="proof-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em] max-w-[24ch] mx-auto">
            {socialProofCopy.heading}
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-y-10 gap-x-6 md:gap-x-4">
          {socialProofCopy.metrics.map((m, i) => (
            <div key={i} className="text-center md:px-2">
              <div className="font-serif text-ink text-[44px] sm:text-[56px] md:text-[64px] leading-none tracking-[-0.02em]">
                {m.value}
                {m.suffix && (
                  <span className="font-sans text-[18px] md:text-[20px] text-ink-secondary ml-1 align-baseline">
                    {m.suffix}
                  </span>
                )}
              </div>
              <p className="mt-3 font-sans text-[13px] md:text-sm text-ink-secondary leading-snug max-w-[24ch] mx-auto">
                {m.label}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-14 text-center font-mono text-[11px] text-ink-tertiary max-w-[60ch] mx-auto">
          {socialProofCopy.caption}
        </p>
      </div>
    </section>
  );
};
