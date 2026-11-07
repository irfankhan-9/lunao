// "Generate Owner PWA & QR Code" modal for the Site Editor & Sites Dashboard.
// Professional, brand-consistent (Lunao Blue #2563EB), minimalist layout
// with instant Supabase active PWA counter synchronization.

import React, { useEffect, useState, useCallback } from 'react';
import {
  Key, X, Copy, Check, Smartphone, ExternalLink, Globe, Loader2,
  RefreshCw, QrCode as QrIcon, CheckCircle2, Ban
} from 'lucide-react';
import { CodePill } from './CodePill';
import { QrCode } from './QrCode';
import {
  createInviteCode,
  revokeInviteCode,
  getSiteInviteCodesDetails,
  InviteCode,
  PwaQuotaInfo,
} from '../lib/pipelineClient';
import { supabaseClient } from '../lib/supabaseClient';
import {
  playDialogPop, playSoftTap, playElegantBell, playVictoryCelebration,
  playElegantError, playCancelTone, playTiktokLike,
} from '../utils/audio';

interface OwnerPWADrawerProps {
  slug: string;
  businessName: string;
  siteUrl?: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
}

export const OwnerPWADrawer: React.FC<OwnerPWADrawerProps> = ({
  slug, businessName, siteUrl, open, onClose, refreshKey,
}) => {
  const [codes, setCodes] = useState<InviteCode[] | null>(null);
  const [pwaActive, setPwaActive] = useState(false);
  const [quota, setQuota] = useState<PwaQuotaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingNew, setGeneratingNew] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [displayCode, setDisplayCode] = useState<string | null>(null);

  const sfx = {
    open: playDialogPop,
    tap: playSoftTap,
    copy: playElegantBell,
    primary: playTiktokLike,
    success: () => playVictoryCelebration(),
    error: playElegantError,
    close: playCancelTone,
  };

  const flashToast = (t: typeof toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast((cur) => (cur?.text === t.text ? null : cur)), 3200);
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const details = await getSiteInviteCodesDetails(slug);
      setCodes(details.codes);
      setPwaActive(details.pwaActive);
      if (details.quota) setQuota(details.quota);

      const active = (details.codes || []).filter((c) => !c.revokedAt);
      if (active.length > 0) {
        const redeemed = active.find((c) => c.usedAt);
        setDisplayCode((redeemed || active[0]).code);
      } else {
        setDisplayCode(null);
      }
    } catch (err: any) {
      if (!silent) {
        setError(err?.message || 'Could not load PWA access status.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [slug]);

  const handleGenerateQrCode = async () => {
    sfx.tap();
    setGeneratingNew(true);
    setError(null);

    // INSTANT OPTIMISTIC UI INCREMENT (0ms latency for the user)
    setQuota((prev) => {
      const cur = prev ? prev.activeCount : 0;
      const max = prev ? prev.maxAllowed : 8;
      const next = cur + 1;
      const ownerKey = prev?.ownerKey || localStorage.getItem('lunao_owner_key') || 'current';
      try {
        localStorage.setItem(`lunao_u_${ownerKey}_pwa_count`, String(next));
      } catch {}
      return {
        ownerKey,
        plan: prev?.plan || localStorage.getItem('lunao_user_plan') || 'Starter Plan',
        maxAllowed: max,
        activeCount: next,
        activeSlugs: prev ? Array.from(new Set([...prev.activeSlugs, String(slug).toLowerCase()])) : [String(slug).toLowerCase()],
        remaining: Math.max(0, max - next),
        quotaExceeded: next >= max,
      };
    });

    try {
      const cleanSlug = String(slug || '').trim().toLowerCase();
      const codeResult = await createInviteCode(cleanSlug, `Owner PWA Access - ${businessName}`);
      setDisplayCode(codeResult.code);

      if (codeResult.quota) {
        setQuota(codeResult.quota);
        const ownerKey = codeResult.quota.ownerKey || localStorage.getItem('lunao_owner_key') || 'current';
        try {
          localStorage.setItem(`lunao_u_${ownerKey}_pwa_count`, String(codeResult.quota.activeCount));
        } catch {}
      }

      sfx.success();
      flashToast({ type: 'success', text: 'PWA code generated & saved to Supabase!' });
      await load(true);
    } catch (err: any) {
      sfx.error();
      setError(err?.message || 'Failed to generate access code.');
      await load(true);
    } finally {
      setGeneratingNew(false);
    }
  };

  const handleDeactivatePwa = async () => {
    if (!displayCode || !codes) return;
    const target = codes.find((c) => c.code === displayCode);
    if (!target) return;
    sfx.tap();
    setRevoking(true);

    // INSTANT OPTIMISTIC UI DECREMENT
    setQuota((prev) => {
      if (!prev) return null;
      const next = Math.max(0, prev.activeCount - 1);
      const ownerKey = prev.ownerKey || localStorage.getItem('lunao_owner_key') || 'current';
      try {
        localStorage.setItem(`lunao_u_${ownerKey}_pwa_count`, String(next));
      } catch {}
      return {
        ...prev,
        activeCount: next,
        remaining: Math.max(0, prev.maxAllowed - next),
        quotaExceeded: next >= prev.maxAllowed,
      };
    });

    try {
      await revokeInviteCode(target.id);
      setPwaActive(false);
      setDisplayCode(null);
      flashToast({ type: 'success', text: 'PWA disconnected.' });
      await load(true);
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Failed to disconnect PWA.' });
      await load(true);
    } finally {
      setRevoking(false);
    }
  };

  useEffect(() => {
    if (open) {
      sfx.open();
      load(false);
      const timer = setInterval(() => load(true), 4000);
      return () => clearInterval(timer);
    }
  }, [open, refreshKey, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { sfx.close(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleCopy = () => {
    if (!displayCode) return;
    try {
      navigator.clipboard?.writeText(displayCode);
    } catch {
      /* ignore */
    }
    sfx.copy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    flashToast({ type: 'success', text: 'Code copied to clipboard!' });
  };

  const handleOpenPWA = () => {
    sfx.tap();
    try {
      const raw = localStorage.getItem('lunao_owner_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!pwaActive || parsed?.slug !== slug || String(parsed?.token || '').startsWith('lunao.preview.')) {
          localStorage.removeItem('lunao_owner_session');
        }
      }
    } catch {
      /* ignore */
    }
    const targetUrl = pwaActive && displayCode
      ? `/owner/?code=${encodeURIComponent(displayCode)}&slug=${encodeURIComponent(slug)}`
      : `/owner/?slug=${encodeURIComponent(slug)}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://lunao.org';
  const qrValue = displayCode
    ? `${origin}/owner/?code=${encodeURIComponent(displayCode)}&slug=${encodeURIComponent(slug)}`
    : '';

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={() => { sfx.close(); onClose(); }}
    >
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOAST NOTIFICATION */}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-60 pointer-events-none w-[90%] max-w-xs animate-in fade-in slide-in-from-top-2 duration-150">
            <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-md text-xs font-medium ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}>
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>{toast.text}</span>
            </div>
          </div>
        )}

        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <QrIcon className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Owner PWA Access
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {businessName}
              </p>
            </div>
          </div>
          <button
            onClick={() => { sfx.close(); onClose(); }}
            className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QUOTA & STATUS PILL BAR */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
              pwaActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : displayCode
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pwaActive ? 'bg-emerald-500' : displayCode ? 'bg-blue-500' : 'bg-slate-400'}`} />
              {pwaActive ? 'Connected & Active' : displayCode ? 'Code Ready' : 'Not Connected'}
            </span>
          </div>

          {quota && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <Smartphone className="w-3 h-3 text-blue-600" />
              <span>
                <strong className="text-slate-800">{quota.activeCount}</strong> of {quota.maxAllowed} PWAs
              </span>
            </div>
          )}
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-xs text-slate-500">Fetching PWA access status...</p>
            </div>
          ) : displayCode ? (
            <div className="flex flex-col items-center text-center space-y-4">
              {/* QR CODE CARD */}
              <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs inline-flex flex-col items-center">
                <QrCode value={qrValue} size={156} />
                <span className="text-[11px] text-slate-400 font-medium mt-2">
                  Scan to connect on mobile
                </span>
              </div>

              {/* MONOSPACE CODE DISPLAY */}
              <div className="w-full">
                <div className="flex items-center justify-center py-1">
                  <CodePill code={displayCode} size="lg" onCopy={handleCopy} />
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="w-full space-y-2 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                  <button
                    onClick={handleCopy}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                  </button>

                  <button
                    onClick={handleOpenPWA}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    <Globe className="w-4 h-4" />
                    <span>Open PWA</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 px-1 text-[11px] text-slate-400">
                  <button
                    onClick={handleGenerateQrCode}
                    disabled={generatingNew || loading}
                    className="inline-flex items-center gap-1.5 hover:text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${generatingNew ? 'animate-spin' : ''}`} />
                    <span>Regenerate Code</span>
                  </button>

                  {pwaActive && (
                    <button
                      onClick={handleDeactivatePwa}
                      disabled={revoking}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Ban className="w-3 h-3" />
                      <span>{revoking ? 'Disconnecting...' : 'Disconnect PWA'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <h3 className="text-sm font-bold text-slate-900">Connect Owner Mobile App</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Generate an access key and QR code for <strong>{businessName}</strong> to view live appointments and customer notifications.
                </p>
              </div>
              <button
                onClick={handleGenerateQrCode}
                disabled={generatingNew}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs sm:text-sm font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {generatingNew ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Code...</span>
                  </>
                ) : (
                  <>
                    <QrIcon className="w-4 h-4" />
                    <span>Generate Access Code</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerPWADrawer;
