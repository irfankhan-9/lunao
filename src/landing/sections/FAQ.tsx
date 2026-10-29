import React from 'react';
import { Plus } from 'lucide-react';
import { faqCopy } from '../lib/copy';

export const FAQ: React.FC = () => {
  return (
    <section
      id="faq"
      className="landing-section bg-surface"
      aria-labelledby="faq-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[700px] mb-10 md:mb-14">
          <p className="landing-eyebrow mb-4">{faqCopy.eyebrow}</p>
          <h2 id="faq-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em]">
            {faqCopy.heading}
          </h2>
        </div>

        <div className="max-w-[820px] divide-y divide-border-main border-t border-b border-border-main">
          {faqCopy.items.map((item, i) => (
            <details
              key={i}
              className="group py-5 md:py-6"
            >
              <summary className="flex items-start justify-between gap-6 cursor-pointer list-none">
                <span className="font-sans text-ink text-[16px] md:text-[18px] font-medium leading-snug">
                  {item.q}
                </span>
                <Plus
                  className="w-4 h-4 text-ink-secondary mt-1.5 shrink-0 transition-transform duration-200 group-open:rotate-45"
                  strokeWidth={1.8}
                />
              </summary>
              <p className="mt-3 font-sans text-ink-secondary text-[14.5px] md:text-[15px] leading-relaxed max-w-[68ch]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
