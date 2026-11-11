import React, { useState, useEffect } from 'react';
import {
  ChevronDown, Check, ArrowUpRight, AlertCircle, Lock
} from 'lucide-react';
import {
  getVibeCreditBalance,
  getPlanAiConfig,
  syncAllowanceWithServer,
  isFreeVibePlan,
  isModelAllowedOnFree,
  FREE_VIBE_CREDITS,
} from '../lib/vibeCredits';

export interface StudioModelOption {
  id: string;
  provider: 'google' | 'anthropic';
  displayName: string;
  shortName: string;
  humanDescription: string;
  speedTier: 'Fastest' | 'Fast' | 'Balanced';
  reasoningTier: 'Standard' | 'High' | 'Advanced' | 'Deep';
  isRecommended?: boolean;
}

export const STUDIO_MODELS: StudioModelOption[] = [
  // Google Gemini
  {
    id: 'gemini-3.8-flash',
    provider: 'google',
    displayName: 'Gemini 3.8 Flash',
    shortName: '3.8 Flash',
    humanDescription: 'Fastest engine for real-time website layout & styling.',
    speedTier: 'Fastest',
    reasoningTier: 'High',
    isRecommended: true,
  },
  {
    id: 'gemini-3.5-flash',
    provider: 'google',
    displayName: 'Gemini 3.5 Flash',
    shortName: '3.5 Flash',
    humanDescription: 'High-speed multimodal generation with instant responsiveness.',
    speedTier: 'Fast',
    reasoningTier: 'Standard',
  },
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'google',
    displayName: 'Gemini 3.1 Pro Preview',
    shortName: '3.1 Pro',
    humanDescription: 'Deep reasoning for complex multi-section layouts & micro-interactions.',
    speedTier: 'Balanced',
    reasoningTier: 'Deep',
  },
  // Anthropic Claude
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 5.5',
    shortName: 'Haiku 5.5',
    humanDescription: 'Quick responses for copy polish, SEO meta, and small tweaks.',
    speedTier: 'Fast',
    reasoningTier: 'Standard',
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 5.5',
    shortName: 'Sonnet 5.5',
    humanDescription: 'Exceptional coding precision and polished editorial aesthetics.',
    speedTier: 'Balanced',
    reasoningTier: 'Advanced',
  },
  {
    id: 'claude-fable-5-1',
    provider: 'anthropic',
    displayName: 'Claude Fable 5.1',
    shortName: 'Fable 5.1',
    humanDescription: 'Editorial storytelling and brand voice tuning for marketing sites.',
    speedTier: 'Balanced',
    reasoningTier: 'Advanced',
  },
];

interface AiStudioModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
  className?: string;
  lastUsageCredits?: number;
  userPlan?: string;
  aiServerError?: boolean;
}

export const AiStudioModelSelector: React.FC<AiStudioModelSelectorProps> = ({
  selectedModel,
  onSelectModel,
  disabled = false,
  className = '',
  lastUsageCredits,
  userPlan,
  aiServerError = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [balance, setBalance] = useState<number>(() => getVibeCreditBalance(userPlan));
  const [monthlyMax, setMonthlyMax] = useState<number>(0);
  const planConfig = getPlanAiConfig(userPlan);

  useEffect(() => {
    syncAllowanceWithServer().then((res) => {
      if (res) {
        setBalance(res.balanceCredits);
        if (res.monthlyCredits > 0) {
          setMonthlyMax(res.monthlyCredits);
        }
      }
    });

    const handleCreditsChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.balance === 'number') {
        setBalance(detail.balance);
      } else {
        setBalance(getVibeCreditBalance(userPlan));
      }
    };

    window.addEventListener('lunao_vibe_credits_changed', handleCreditsChange);
    return () => window.removeEventListener('lunao_vibe_credits_changed', handleCreditsChange);
  }, [userPlan]);

  const activeModel = STUDIO_MODELS.find(m => m.id === selectedModel) || STUDIO_MODELS[0];
  const isFreePlan = isFreeVibePlan(userPlan);
  const effectiveBalance = Math.max(0, balance);
  const isExhausted = (isFreePlan ? effectiveBalance < 1 : effectiveBalance <= 0) && !aiServerError;
  const isLow = isFreePlan ? false : (effectiveBalance > 0 && effectiveBalance < 5);

  // Free accounts run on a one-time grant and are limited to Flash-tier models.
  useEffect(() => {
    if (isFreePlan && !isModelAllowedOnFree(selectedModel)) {
      onSelectModel('gemini-3.8-flash');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreePlan, selectedModel]);

  const maxCredits = Math.max(
    effectiveBalance,
    isFreePlan ? FREE_VIBE_CREDITS : (monthlyMax || planConfig.monthlyCredits || 10)
  );
  const percentRemaining = Math.min(100, Math.max(0, (effectiveBalance / maxCredits) * 100));

  const handleUpgradeClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    window.dispatchEvent(new CustomEvent('lunao:switch-tab', { detail: 'plans' }));
  };

  const googleModels = STUDIO_MODELS.filter(m => m.provider === 'google');
  const anthropicModels = STUDIO_MODELS.filter(m => m.provider === 'anthropic');

  const formattedBalance = isFreePlan
    ? (effectiveBalance >= 1 ? '1' : '0')
    : effectiveBalance.toLocaleString(undefined, {
        minimumFractionDigits: effectiveBalance % 1 !== 0 ? 1 : 0,
        maximumFractionDigits: 2,
      });

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Brand-consistent Compact Badge Pill */}
      <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100/90 border border-slate-200/90 shadow-2xs">
        {/* Model Dropdown Trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          title="Select AI Model"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 text-xs font-semibold text-slate-800 transition-all hover:bg-slate-50 hover:border-slate-300 shadow-2xs select-none ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeModel.provider === 'google' ? 'bg-blue-600' : 'bg-amber-600'}`} />
          <span className="truncate max-w-[130px] sm:max-w-none">
            {activeModel.displayName}
          </span>
          {activeModel.isRecommended && (
            <span className="hidden sm:inline-block px-1 py-0.2 rounded text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
              Default
            </span>
          )}
          <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Subtle Divider */}
        <div className="w-px h-3.5 bg-slate-200 mx-1 shrink-0" />

        {/* Credits Balance Pill */}
        <button
          type="button"
          onClick={handleUpgradeClick}
          title={isFreePlan ? `${formattedBalance} free AI prompt${effectiveBalance >= 1 ? '' : 's'} available. Click to manage plan.` : `${formattedBalance} AI credits available. Click to manage plan.`}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 transition-colors cursor-pointer select-none"
        >
          <span className={`font-mono font-bold ${isExhausted ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'}`}>
            {formattedBalance}
          </span>
          <span className="text-[11px] text-slate-500 font-medium">{isFreePlan ? (effectiveBalance >= 1 ? 'Prompt' : 'Prompts') : 'Credits'}</span>

          {typeof lastUsageCredits === 'number' && lastUsageCredits > 0 && (
            <span className="text-[10px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200/60 animate-in fade-in">
              -{lastUsageCredits < 0.1 ? lastUsageCredits.toFixed(2) : lastUsageCredits.toFixed(1)}
            </span>
          )}
        </button>
      </div>

      {/* Professional Brand-Consistent Light Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-64 sm:w-72 p-2 rounded-xl bg-white border border-slate-200 shadow-xl max-h-[350px] overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150 space-y-1">
            
            {/* Header */}
            <div className="px-2 py-1 mb-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">AI Website Engine</p>
                <p className="text-[11px] text-slate-500">Choose the model that generates your website.</p>
              </div>
            </div>

            {/* Google Gemini Group */}
            <div className="space-y-1">
              <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                Google Gemini
              </div>
              {googleModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (isFreePlan && !isModelAllowedOnFree(m.id)) {
                      handleUpgradeClick();
                      setIsOpen(false);
                      return;
                    }
                    onSelectModel(m.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start justify-between gap-2 p-2 rounded-lg text-left transition-all ${
                    selectedModel === m.id
                      ? 'bg-blue-50/70 border border-blue-200/80 text-blue-900 shadow-2xs'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-slate-900">{m.displayName}</span>
                      {m.isRecommended && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{m.humanDescription}</p>
                    {isFreePlan && !isModelAllowedOnFree(m.id) && (
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Starter plan or above
                      </p>
                    )}
                  </div>
                  {selectedModel === m.id && (
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </div>

            {/* Anthropic Claude Group */}
            <div className="space-y-1 mt-2.5 pt-2 border-t border-slate-100">
              <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                Anthropic Claude
              </div>
              {anthropicModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (isFreePlan && !isModelAllowedOnFree(m.id)) {
                      handleUpgradeClick();
                      setIsOpen(false);
                      return;
                    }
                    onSelectModel(m.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start justify-between gap-2 p-2 rounded-lg text-left transition-all ${
                    selectedModel === m.id
                      ? 'bg-amber-50/70 border border-amber-200/80 text-amber-950 shadow-2xs'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-slate-900">{m.displayName}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{m.humanDescription}</p>
                    {isFreePlan && !isModelAllowedOnFree(m.id) && (
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Starter plan or above
                      </p>
                    )}
                  </div>
                  {selectedModel === m.id && (
                    <Check className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </div>

            {/* Monthly Allowance Footer Card */}
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 px-2 py-1 bg-slate-50/80 rounded-lg">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-slate-500 font-medium">{isFreePlan ? 'Free AI Credits (one-time)' : 'Monthly AI Credits'}</span>
                <span className="font-mono font-bold text-slate-800">
                  {formattedBalance} / {maxCredits.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isExhausted ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${percentRemaining}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px]">
                <span className="text-slate-400">{planConfig.planName}</span>
              </div>
            </div>

          </div>
        </>
      )}

      {/* AI Server Error or Credit Exhausted Notice Pill */}
      {aiServerError ? (
        <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>AI Servers Busy / Down. Please try again.</span>
        </div>
      ) : isExhausted ? (
        <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span>{isFreePlan ? 'Free vibe credits used.' : 'Credits exhausted.'}</span>
          <button
            type="button"
            onClick={handleUpgradeClick}
            className="font-bold underline hover:text-red-900 cursor-pointer ml-1"
          >
            Upgrade
          </button>
        </div>
      ) : null}
    </div>
  );
};
