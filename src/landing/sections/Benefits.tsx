import React from 'react';
import {
  Armchair,
  Link,
  Inbox,
  Coins,
  Receipt,
  LayoutTemplate,
  CalendarCheck,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { benefitsCopy } from '../lib/copy';

const ICONS: Record<string, LucideIcon> = {
  Armchair,
  Link,
  Inbox,
  Coins,
  Receipt,
  LayoutTemplate,
  CalendarCheck,
  MessageSquare,
};

export const Benefits: React.FC = () => {
  return (
    <section
      id="benefits"
      className="landing-section"
      aria-labelledby="benefits-heading"
    >
      <div className="landing-container landing-fade">
        <div className="max-w-[700px] mb-12 md:mb-16">
          <p className="landing-eyebrow mb-4">{benefitsCopy.eyebrow}</p>
          <h2 id="benefits-heading" className="font-serif text-ink text-[32px] sm:text-[40px] md:text-[48px] leading-[1.08] tracking-[-0.01em]">
            {benefitsCopy.heading}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
          {benefitsCopy.cells.map((c, i) => {
            const Icon = ICONS[c.icon] ?? Receipt;
            return (
              <article
                key={i}
                className="flex gap-4 p-6 md:p-7 rounded-lg bg-white border border-border-main"
              >
                <div className="shrink-0 w-10 h-10 rounded-md bg-off-white border border-border-light flex items-center justify-center">
                  <Icon className="w-5 h-5 text-ink-secondary" strokeWidth={1.6} />
                </div>
                <div>
                  <h3 className="font-serif text-ink text-[20px] md:text-[22px] leading-[1.2] tracking-tight mb-2">
                    {c.headline}
                  </h3>
                  <p className="font-sans text-ink-secondary text-[14.5px] leading-relaxed">
                    {c.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
