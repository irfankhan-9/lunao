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
import { CTV } from './landing/sections/CTV';
import { FAQ } from './landing/sections/FAQ';
import { Footer } from './landing/sections/Footer';
import { SectionDivider } from './landing/components/SectionDivider';
import './landing/index.css';

interface LandingProps {
  onOpenAuth?: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onOpenAuth }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleOpenAuth = () => {
    if (onOpenAuth) {
      onOpenAuth();
      return;
    }
    try {
      localStorage.setItem('lunao_route', '/auth');
      window.history.pushState({}, '', '/auth');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      window.location.href = '/auth';
    }
  };

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
      <Nav onOpenDashboard={handleOpenAuth} />

      <main id="main-content-flow" className="pt-16 md:pt-20">
        <SectionDivider withMark />
        <Hero onOpenDashboard={handleOpenAuth} />

        <SectionDivider withMark />
        <SocialProof />

        <SectionDivider withMark />
        <UseCases onPickNiche={handleOpenAuth} />

        <SectionDivider withMark />
        <PainPoints />

        <SectionDivider withMark />
        <WhyUs />

        <SectionDivider withMark />
        <HowItWorks />

        <SectionDivider withMark />
        <Benefits />

        <SectionDivider withMark />
        <Pricing onPickPlan={handleOpenAuth} />

        <SectionDivider withMark />
        <CTV onOpenDashboard={handleOpenAuth} />

        <SectionDivider withMark />
        <FAQ />
      </main>

      <Footer onOpenDashboard={handleOpenAuth} />
    </div>
  );
};
