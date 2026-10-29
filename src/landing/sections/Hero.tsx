import React from 'react';
import { ArrowRight, ExternalLink, Check } from 'lucide-react';
import { heroCopy } from '../lib/copy';

interface HeroProps {
  onOpenDashboard: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenDashboard }) => {
  return (
    <section
      id="top"
      className="landing-section pt-28 md:pt-36 pb-12 md:pb-20"
      aria-labelledby="hero-heading"
    >
      <div className="landing-container grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        {/* Copy column */}
        <div className="lg:col-span-6 landing-fade" data-visible="true">
          <p className="landing-eyebrow mb-5">{heroCopy.eyebrow}</p>
          <h1
            id="hero-heading"
            className="font-serif text-ink leading-[1.02] tracking-[-0.01em] text-[44px] sm:text-[56px] md:text-[68px] lg:text-[76px] mb-6"
          >
            {heroCopy.headline}
          </h1>
          <p className="font-sans text-ink-secondary text-[17px] md:text-[19px] leading-[1.55] max-w-[56ch] mb-8">
            {heroCopy.sub}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onOpenDashboard}
              className="h-12 px-5 rounded-md bg-accent text-white font-sans text-sm font-medium hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
            >
              {heroCopy.ctaPrimary}
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
            <a
              href="#how-it-works"
              className="h-12 px-5 rounded-md border border-border-main bg-white text-ink font-sans text-sm font-medium hover:bg-off-white transition-colors flex items-center justify-center"
            >
              {heroCopy.ctaSecondary}
            </a>
          </div>
          <p className="mt-4 font-mono text-[11px] text-ink-tertiary">
            {heroCopy.microTrust}
          </p>
        </div>

        {/* Product preview column */}
        <div className="lg:col-span-6 landing-fade" data-visible="true">
          <div className="relative rounded-xl bg-white border border-border-main shadow-sm overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-1.5 px-4 h-9 border-b border-border-light bg-off-white">
              <span className="w-2.5 h-2.5 rounded-full bg-border-main" />
              <span className="w-2.5 h-2.5 rounded-full bg-border-main" />
              <span className="w-2.5 h-2.5 rounded-full bg-border-main" />
              <div className="ml-3 flex-1 max-w-[260px] h-5 rounded-md bg-white border border-border-light flex items-center px-2.5">
                <span className="font-mono text-[10px] text-ink-tertiary truncate">
                  app.lunao.io / campaigns
                </span>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="landing-eyebrow">{heroCopy.previewEyebrow}</p>
                <p className="font-mono text-[10px] text-ink-tertiary">live · 5 rows</p>
              </div>
              <div className="rounded-md border border-border-light overflow-hidden">
                <div className="grid grid-cols-12 px-3.5 py-2.5 bg-off-white border-b border-border-light text-[10px] font-mono uppercase tracking-wider text-ink-tertiary">
                  <div className="col-span-3">Niche</div>
                  <div className="col-span-3">City</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1 text-right">Cr</div>
                  <div className="col-span-3 text-right">URL</div>
                </div>
                {heroCopy.previewRows.map((row, i) => (
                  <div
                    key={i}
                    data-row={i}
                    className="landing-hero-row grid grid-cols-12 items-center px-3.5 py-3 border-b border-border-light last:border-b-0"
                  >
                    <div className="col-span-3 font-sans text-[12px] text-ink">{row.niche}</div>
                    <div className="col-span-3 font-sans text-[12px] text-ink-secondary">{row.city}</div>
                    <div className="col-span-2">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-success-soft text-success border border-success/15">
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        {row.status}
                      </span>
                    </div>
                    <div className="col-span-1 text-right font-mono text-[11px] text-ink-secondary">{row.credits}</div>
                    <div className="col-span-3 text-right font-mono text-[10px] text-ink-tertiary truncate flex items-center justify-end gap-1">
                      {row.url}
                      <ExternalLink className="w-2.5 h-2.5" strokeWidth={2} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="font-mono text-[10px] text-ink-tertiary">
                  sms-bulk-pages.pages.dev
                </p>
                <p className="font-mono text-[10px] text-ink-tertiary">
                  refreshed 2s ago
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
