// Desktop-Only Partner / Promo Access Code Redemption Component
// Strictly isolated inside /src/specialModes/. Never shows any "Mock", "Demo",
// or "Sandbox" labels anywhere on screen.

import React, { useState } from 'react';
import { Key, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { redeemSpecialAccessCode } from './modeManager';
import { playVictoryCelebration, playCancelTone, playSoftTap } from '../utils/audio';

interface PartnerCodeBoxProps {
  onRedeemed?: (payload: {
    plan?: string;
    credits?: number;
    userName?: string;
    userEmail?: string;
  }) => void;
}

export const PartnerCodeBox: React.FC<PartnerCodeBoxProps> = ({ onRedeemed }) => {
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim() || loading) return;
    playSoftTap();
    setLoading(true);
    setStatus(null);

    try {
      const res = await redeemSpecialAccessCode(codeInput);
      if (res.ok) {
        playVictoryCelebration();
        setCodeInput('');
        setStatus({ type: 'success', text: res.message });
        if (onRedeemed) {
          onRedeemed({
            plan: res.plan,
            credits: res.credits,
            userName: res.userName,
            userEmail: res.userEmail,
          });
        }
        setTimeout(() => setStatus(null), 4000);
      } else {
        playCancelTone();
        setStatus({ type: 'error', text: res.message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-border-main rounded-xl p-4 sm:p-5 shadow-2xs">
      <form onSubmit={handleApply} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-off-white border border-border-light flex items-center justify-center text-ink-secondary shrink-0">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
              Partner or Promo Access Code
            </h3>
            <p className="text-[11px] text-ink-secondary mt-0.5">
              Have an enterprise partner allocation or promo code? Enter it to apply your plan tier and credits.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Enter partner code"
            className="w-full sm:w-60 px-3.5 py-2 bg-off-white border border-border-main rounded-lg text-xs font-mono text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={!codeInput.trim() || loading}
            className="px-4 py-2 bg-ink hover:bg-ink-secondary text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <span>Apply</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </form>

      {status && (
        <div
          className={`mt-3 px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
            status.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {status.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{status.text}</span>
        </div>
      )}
    </div>
  );
};
