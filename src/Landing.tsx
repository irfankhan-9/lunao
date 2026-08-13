import React, { useEffect, useRef } from 'react';
import { Nav } from './landing/sections/Nav';
import { Hero } from './landing/sections/Hero';
import { SocialProof } from './landing/sections/SocialProof';
import { UseCases } from './landing/sections/UseCases';
import { PainPoints } from './landing/sections/PainPoints';
import { WhyUs } from './landing/sections/WhyUs';
import { HowItWorks } from './landing/sections/HowItWorks';
import { Benefits } from './landing/sections/Benefits';
import { Pricing } from './landing/sections/Pricing';
import { Testimonials } from './landing/sections/Testimonials';
import { CTV } from './landing/sections/CTV';
import { FAQ } from './landing/sections/FAQ';
import { Footer } from './landing/sections/Footer';
import { SectionDivider } from './landing/components/SectionDivider';
import './landing/index.css';

// v2: there's no per-user signup/login — the dashboard is gated behind a single
// shared password (server/lib/siteGate.js). Clicking any "open dashboard" CTA routes
// to /site-gate where the visitor enters the password to unlock the cookie, then
// the SPA at /app loads with the authenticated session.
function openDashboard() {
  // For localhost development: bypass the password gate and go directly to the dashboard.
  // In production, this navigates to /site-gate to enter the shared password first.
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalhost) {
    window.location.href = '/app';
  } else {
    window.location.href = '/site-gate';
  }
}

export const Landing: React.FC = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Single IntersectionObserver toggles data-visible on .landing-fade elements.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      root.querySelectorAll<HTMLElement>('.landing-fade').forEach((el) => {
        el.dataset.visible = 'true';
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = 'true';
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    root.querySelectorAll<HTMLElement>('.landing-fade').forEach((el) => {
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="landing-root">
      <Nav onOpenDashboard={openDashboard} />

      <main id="main-content-flow" className="pt-16 md:pt-20">
        <SectionDivider withMark />
        <Hero onOpenDashboard={openDashboard} />

        <SectionDivider withMark />
        <SocialProof />

        <SectionDivider withMark />
        <UseCases onPickNiche={openDashboard} />

        <SectionDivider withMark />
        <PainPoints />

        <SectionDivider withMark />
        <WhyUs />

        <SectionDivider withMark />
        <HowItWorks />

        <SectionDivider withMark />
        <Benefits />

        <SectionDivider withMark />
        <Pricing onPickPlan={openDashboard} />

        <SectionDivider withMark />
        <Testimonials />

        <SectionDivider withMark />
        <CTV onOpenDashboard={openDashboard} />

        <SectionDivider withMark />
        <FAQ />
      </main>

      <Footer onOpenDashboard={openDashboard} />
    </div>
  );
};
