import React, { useState, useEffect } from 'react';
import { Check, Shield, AlertCircle, TrendingUp, Info, Zap, Award } from 'lucide-react';
import { playConfirmSuccess, playSoftTap } from '../utils/audio';
import { SidebarTab } from '../types';
import { PartnerCodeBox } from '../specialModes/PartnerCodeBox';
import { resetVibeCreditsToPlan } from '../lib/vibeCredits';

interface PlansProps {
  setActiveTab: (tab: SidebarTab) => void;
  setUserPlan: (plan: string) => void;
  userPlan: string;
  userCredits: number;
}

export const Plans: React.FC<PlansProps> = ({
  setActiveTab,
  setUserPlan,
  userPlan,
  userCredits
}) => {
  // FOMO Interactive Seat States
  const [agencySeats, setAgencySeats] = useState(170);
  const [proSeats, setProSeats] = useState(400);

  // Smooth ticking effect for FOMO counters
  useEffect(() => {
    const timer = setInterval(() => {
      // Agency seats: go from 170 up to 240, then reset to 170
      setAgencySeats((prev) => {
        const next = prev + Math.floor(Math.random() * 2) + 1;
        return next >= 240 ? 170 : next;
      });

      // Pro seats: go from 400 up to 520, then reset to 400
      setProSeats((prev) => {
        const next = prev + Math.floor(Math.random() * 3) + 1;
        return next >= 520 ? 400 : next;
      });
    }, 6000); // ticked every 6 seconds for a realistic simulation

    return () => clearInterval(timer);
  }, []);

  const handleSelectPlan = (planName: string) => {
    setUserPlan(planName);
    resetVibeCreditsToPlan(planName);
    playConfirmSuccess();
  };

  const planCards = [
    {
      id: 'Free',
      name: 'Free',
      price: '$0',
      credits: '30 credits (one-time)',
      textColor: 'text-ink-secondary',
      borderColor: 'border-border-main',
      badgeColor: 'bg-off-white text-ink-secondary border-border-main',
      icon: <Award className="w-5 h-5 text-ink-secondary" />,
      tagline: 'Trial sandbox for testing the Lunao engine',
      features: [
        '30 one-time Lunao Credits included',
        'Trial AI allowance included',
        '1 trial Owner PWA business',
        'Rebrand & deploy websites (3 credits/site)',
        'Apify Google Maps lead finder (4 credits/lead)',
        'Per email discovery: 2 credits',
        'Standard processing speeds & basic templates'
      ]
    },
    {
      id: 'Starter',
      name: 'Starter',
      price: '$97',
      credits: '2,500 credits / month',
      textColor: 'text-success',
      borderColor: 'border-border-main',
      badgeColor: 'bg-success-soft text-success border-success/10',
      icon: <Award className="w-5 h-5 text-success" />,
      tagline: 'Best for testing campaigns in local niches & cities',
      features: [
        '2,500 Lunao Credits / month',
        '500 AI Credits / month ($7 value)',
        'Up to 8 Owner PWA businesses',
        'AI Vibe Coding Studio & multi-page templates',
        'Rebrand & deploy websites (3 credits/site)',
        'Apify Google Maps lead finder (4 credits/lead)',
        'Per email discovery: 2 credits',
        'Send 1-seg SMS (4 credits) / 2-seg SMS (8 credits)',
        'Connect own Telnyx account (0 credits per SMS)'
      ]
    },
    {
      id: 'Pro',
      name: 'Pro',
      price: '$187',
      credits: '6,500 credits / month',
      textColor: 'text-purple-600',
      borderColor: 'border-border-main',
      badgeColor: 'bg-purple-50 text-purple-600 border-purple-500/10',
      icon: <Shield className="w-5 h-5 text-purple-600" />,
      tagline: 'Built for power users & growing agencies',
      isPopular: true,
      fomo: {
        total: 600,
        taken: proSeats,
        label: 'Limited intake: 600 users allowed'
      },
      features: [
        '6,500 Lunao Credits / month',
        '1,200 AI Credits / month ($12 value)',
        'Up to 25 Owner PWA businesses',
        'AI Vibe Coding Studio & multi-page templates',
        'Rebrand & deploy websites (3 credits/site)',
        'Apify Google Maps lead finder (4 credits/lead)',
        'Per email discovery: 2 credits',
        'Send 1-seg SMS (4 credits) / 2-seg SMS (8 credits)',
        'Connect own Telnyx account (0 credits per SMS)'
      ]
    },
    {
      id: 'Agency',
      name: 'Agency',
      price: '$297',
      credits: '12,000 credits / month',
      textColor: 'text-red-600',
      borderColor: 'border-border-main',
      badgeColor: 'bg-red-50 text-red-600 border-red-500/10',
      icon: <Shield className="w-5 h-5 text-red-600" />,
      tagline: 'Full high-volume automation suite',
      fomo: {
        total: 250,
        taken: agencySeats,
        label: 'Strict beta limit: 250 users max'
      },
      features: [
        '12,000 Lunao Credits / month',
        '2,500 AI Credits / month ($15 value)',
        'Up to 100 Owner PWA businesses',
        'AI Vibe Coding Studio (Full access)',
        'Rebrand & deploy websites (3 credits/site)',
        'Apify Google Maps lead finder (4 credits/lead)',
        'Per email discovery: 2 credits',
        'Send 1-seg SMS (4 credits) / 2-seg SMS (8 credits)',
        'Connect own Telnyx account (0 credits per SMS)',
        'Multi-client management & custom domain routing'
      ]
    }
  ];

  const planNormalized = (userPlan || '').toLowerCase();
  const isVibeCodingEligible = ['pro', 'agency'].some(tier => planNormalized.includes(tier));
  
  const getVibeCodingCredits = (plan: string): number => {
    const p = (plan || '').toLowerCase();
    const stored = typeof window !== 'undefined' ? localStorage.getItem('lunao_vibe_credits') : null;
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (p.includes('agency')) return 1000;
    if (p.includes('pro')) return 350;
    return 0;
  };

  const vibeCodingCredits = getVibeCodingCredits(userPlan);

  return (
    <div id="plans-tab-root-container" className="space-y-8 animate-fade-in font-sans text-left pb-16">
      
      {/* Page Header */}
      <header id="plans-view-header" className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border-main gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-serif text-ink tracking-tight font-normal">Subscription plans</h1>
          <p className="text-sm text-ink-secondary">Select the plan tier that fits your outreach goals. Upgrade or switch instantly to adjust credits.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 select-none">
          {/* Current Live Balance Card */}
          <div className="bg-success-soft/30 border border-success/15 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-left shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shrink-0"></span>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-ink-secondary">Current Live Balance</div>
              <div className="text-lg font-bold font-sans text-ink">{userCredits.toLocaleString()} Credits</div>
            </div>
          </div>

          {/* Vibe Coding Credits Card */}
          {isVibeCodingEligible && (
            <div className="bg-accent-soft/30 border border-accent/20 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-left shadow-2xs">
              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse shrink-0"></span>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-extrabold text-ink-secondary">Vibe Coding Balance</div>
                <div className="text-lg font-bold font-sans text-ink">{vibeCodingCredits.toLocaleString()} Credits</div>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              playSoftTap();
              setActiveTab('dashboard');
            }}
            className="px-4 py-2 border border-border-main text-ink text-xs font-bold uppercase tracking-wider rounded bg-white hover:bg-off-white active:scale-95 transition-all cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* Credit System Guide Card */}
      <div className="bg-white border border-border-main rounded-xl p-5 md:p-6 shadow-3xs">
        <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between">
          <div className="space-y-2 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent-soft text-accent border border-accent/20">
              <Info className="w-3 h-3" />
              Transparent Pricing & Action Charges
            </span>
            <h2 className="text-xl font-serif text-ink tracking-tight font-normal">Action Credit Rates</h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Every subscription tier is loaded with monthly credits debited strictly based on performance actions. Connected Telnyx SMS charges 0 credits.
            </p>
          </div>
          
          {/* Exchange Rates Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 w-full md:max-w-2xl">
            <div className="bg-off-white border border-border-light rounded-lg p-2.5 text-center">
              <span className="text-[9px] uppercase font-bold text-ink-secondary tracking-widest block mb-0.5">Deploy Site</span>
              <div className="text-sm font-bold text-ink font-sans">3 Credits</div>
              <span className="text-[9px] text-ink-tertiary">Per website</span>
            </div>
            
            <div className="bg-off-white border border-border-light rounded-lg p-2.5 text-center">
              <span className="text-[9px] uppercase font-bold text-ink-secondary tracking-widest block mb-0.5">Apify Lead</span>
              <div className="text-sm font-bold text-ink font-sans">4 Credits</div>
              <span className="text-[9px] text-ink-tertiary">Per Maps lead</span>
            </div>

            <div className="bg-off-white border border-border-light rounded-lg p-2.5 text-center">
              <span className="text-[9px] uppercase font-bold text-ink-secondary tracking-widest block mb-0.5">Email Dork</span>
              <div className="text-sm font-bold text-ink font-sans">2 Credits</div>
              <span className="text-[9px] text-ink-tertiary">Per email</span>
            </div>

            <div className="bg-off-white border border-border-light rounded-lg p-2.5 text-center">
              <span className="text-[9px] uppercase font-bold text-ink-secondary tracking-widest block mb-0.5">1-Seg SMS</span>
              <div className="text-sm font-bold text-ink font-sans">4 Credits</div>
              <span className="text-[9px] text-ink-tertiary">0 w/ own Telnyx</span>
            </div>

            <div className="bg-off-white border border-border-light rounded-lg p-2.5 text-center col-span-2 sm:col-span-1">
              <span className="text-[9px] uppercase font-bold text-ink-secondary tracking-widest block mb-0.5">2-Seg SMS</span>
              <div className="text-sm font-bold text-ink font-sans">8 Credits</div>
              <span className="text-[9px] text-ink-tertiary">0 w/ own Telnyx</span>
            </div>
          </div>
        </div>
      </div>

      {/* Plans Pricing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {planCards.map((plan) => {
          const normalizePlan = (name: string) => name.replace(' Plan', '').replace(' Tier', '').trim().toLowerCase();
          const isActive = normalizePlan(userPlan) === normalizePlan(plan.name);
          
          return (
            <div
              key={plan.id}
              className={`bg-white border rounded-2xl flex flex-col justify-between overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-accent ${
                plan.isPopular ? 'border-accent ring-1 ring-accent/20 scale-102 lg:-translate-y-2' : 'border-border-main'
              } ${isActive ? 'bg-accent-soft/10 ring-2 ring-accent/30' : ''}`}
            >
              {/* Popular Tab or Spacer */}
              {plan.isPopular ? (
                <div className="bg-accent text-white text-[10px] font-bold uppercase tracking-wider text-center py-1.5 w-full">
                  Most Popular Choice
                </div>
              ) : (
                <div className="h-2 w-full bg-transparent" />
              )}

              {/* Main plan contents */}
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-ink font-sans">{plan.name}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${plan.badgeColor}`}>
                      {plan.name}
                    </span>
                  </div>

                  {/* Pricing details */}
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-serif text-ink font-semibold">{plan.price}</span>
                    <span className="text-xs text-ink-secondary font-sans">/ month</span>
                  </div>

                  <div className="mt-1.5 mb-3">
                    {isActive ? (
                      <div className="flex flex-col gap-1 bg-success-soft/30 px-3 py-1.5 rounded-lg border border-success/10">
                        <span className="text-[10px] font-bold text-success uppercase tracking-wider">Active Credits Remaining</span>
                        <span className="text-base font-extrabold text-success font-sans leading-none">{userCredits.toLocaleString()} Credits</span>
                      </div>
                    ) : (
                      plan.id === 'Pro' || plan.id === 'Agency' ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-accent font-bold font-sans">
                            {plan.id === 'Pro' ? '3,000' : '7,000'} total credits
                          </span>
                          <span className="text-[10px] text-success font-bold tracking-wide uppercase flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-success"></span>
                            {plan.id === 'Pro' ? '2,500 + 500 Bonus' : '6,000 + 1,000 Bonus'}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-accent font-semibold font-sans">{plan.credits}</p>
                      )
                    )}
                  </div>
                  <p className="text-[11.5px] text-ink-secondary leading-relaxed mb-6 block border-b border-border-light pb-4 min-h-[48px]">
                    {plan.tagline}
                  </p>

                  {/* FOMO Section */}
                  {plan.fomo && (
                    <div className="mb-6 p-3 bg-red-50/50 border border-red-500/10 rounded-lg space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between text-[11px] font-medium text-red-700">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
                          {plan.fomo.label}
                        </span>
                        <span className="font-semibold font-mono">{plan.fomo.taken} / {plan.fomo.total}</span>
                      </div>
                      <div className="w-full bg-red-200/40 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-red-600 h-full rounded-full transition-all duration-1000 ease-out" 
                          style={{ width: `${(plan.fomo.taken / plan.fomo.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-red-600/80 leading-normal">
                        Only {plan.fomo.total - plan.fomo.taken} configurations remaining today before queue locks.
                      </p>
                    </div>
                  )}

                  {/* Features list */}
                  <ul className="space-y-3 text-left">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="p-0.5 rounded-full bg-accent-soft text-accent shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-accent" />
                        </span>
                        <span className="text-[11.5px] text-ink-secondary leading-normal">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Purchase / Select Button */}
              <div className="p-6 pt-0 mt-6 shrink-0">
                <button
                  onClick={() => handleSelectPlan(`${plan.name} Plan`)}
                  className={`w-full py-2.5 rounded text-center text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-97 cursor-pointer ${
                    isActive
                      ? 'bg-ink text-white hover:bg-ink-secondary shadow-sm'
                      : plan.isPopular
                      ? 'bg-accent text-white hover:bg-accent-hover shadow-md'
                      : 'bg-off-white border border-border-main text-ink hover:bg-surface'
                  }`}
                >
                  {isActive ? 'Current Active Tier' : `Select ${plan.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop-only Partner & Enterprise Access Code Box */}
      <PartnerCodeBox />

    </div>
  );
};
