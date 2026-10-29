import React, { useState, useEffect } from 'react';
import { Sparkles, ChevronRight, Zap } from 'lucide-react';
import {
  getVibeCreditBalance,
  getPlanAiConfig,
} from '../lib/vibeCredits';

interface VibeCreditBadgeProps {
  className?: string;
  size?: 'sm' | 'md';
  showValueLabel?: boolean;
  interactive?: boolean;
}

export const VibeCreditBadge: React.FC<VibeCreditBadgeProps> = ({
  className = '',
  size = 'sm',
  showValueLabel = true,
  interactive = true,
}) => {
  const [balance, setBalance] = useState<number>(() => getVibeCreditBalance());
  const [justDeducted, setJustDeducted] = useState(false);
  const [userPlan, setUserPlan] = useState<string>(() => {
    try {
      return localStorage.getItem('lunao_user_plan') || 'Starter Plan';
    } catch {
      return 'Starter Plan';
    }
  });

  const planConfig = getPlanAiConfig(userPlan);

  useEffect(() => {
    const handleCreditChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.balance === 'number') {
        setBalance(detail.balance);
        setJustDeducted(true);
        setTimeout(() => setJustDeducted(false), 1200);
      } else {
        setBalance(getVibeCreditBalance());
      }
    };

    const handlePlanChange = () => {
      try {
        const p = localStorage.getItem('lunao_user_plan') || 'Starter Plan';
        setUserPlan(p);
        setBalance(getVibeCreditBalance(p));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('lunao_vibe_credits_changed', handleCreditChange);
    window.addEventListener('lunao_special_mode_changed', handlePlanChange);
    window.addEventListener('storage', handlePlanChange);
    window.addEventListener('lunao:plan-changed', handlePlanChange);

    return () => {
      window.removeEventListener('lunao_vibe_credits_changed', handleCreditChange);
      window.removeEventListener('lunao_special_mode_changed', handlePlanChange);
      window.removeEventListener('storage', handlePlanChange);
      window.removeEventListener('lunao:plan-changed', handlePlanChange);
    };
  }, []);

  const dollarValRemaining = (balance * planConfig.creditCostUsd).toFixed(2);

  const handleClick = () => {
    if (!interactive) return;
    try {
      window.dispatchEvent(new CustomEvent('lunao:switch-tab', { detail: 'plans' }));
    } catch {
      /* ignore */
    }
  };

  if (size === 'sm') {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={`Lunao AI Credits: ${balance.toLocaleString()} remaining.`}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all select-none ${
          justDeducted
            ? 'bg-accent/15 border-accent text-accent scale-102 ring-2 ring-accent/30'
            : 'bg-white border-border-main text-ink hover:border-accent/40 hover:bg-off-white shadow-2xs'
        } ${interactive ? 'cursor-pointer' : 'cursor-default'} ${className}`}
      >
        <span className="font-bold text-ink tracking-tight font-sans">
          {balance.toLocaleString()}
        </span>
        <span className="text-[11px] text-ink-secondary font-sans font-medium">AI Credits</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Lunao AI Credits: ${balance.toLocaleString()} remaining.`}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs select-none shadow-2xs ${
        justDeducted
          ? 'bg-accent/15 border-accent text-accent scale-102 ring-2 ring-accent/30'
          : 'bg-white border-border-main text-ink hover:border-accent/50 hover:bg-off-white'
      } ${interactive ? 'cursor-pointer' : 'cursor-default'} ${className}`}
    >
      <div className="flex items-center gap-1">
        <span className="font-mono font-bold text-ink">{balance.toLocaleString()}</span>
        <span className="text-xs text-ink-secondary font-medium font-sans">AI Credits</span>
      </div>
      {interactive && <ChevronRight className="w-3 h-3 text-ink-tertiary ml-0.5" />}
    </button>
  );
};
