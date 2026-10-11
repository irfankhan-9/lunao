// "Generate Owner PWA" drawer for the Site Editor.
//
// v2 — renamed from InviteClientDrawer:
//   - "Generate Owner PWA" action with deep-link into owner.lunao.com
//   - Shows existing codes (active, used, revoked)
//   - "Open in Owner PWA" button that opens owner.lunao.com/?code=...
//   - No QR code, no per-code revoke list.
//   - Mobile and desktop share the exact same layout (single column, centered).

import React, { useEffect, useState, useCallback } from 'react';
import {
  UserPlus, X, Copy, Check, Sparkles, RefreshCw, AlertCircle, Smartphone,
  ExternalLink, Globe,
} from 'lucide-react';
import { CodePill } from './CodePill';
import {
  listInviteCodes, createInviteCode, InviteCode,
} from '../lib/pipelineClient';
import {
  playDialogPop, playSoftTap, playElegantBell, playVictoryCelebration,
  playElegantError, playCancelTone, playTiktokLike,
} from '../utils/audio';

// Owner PWA URL — the deep-link target.
//
// In production (owner.lunao.com):         base URL = window.location.origin
// In development with Vite dev server:    base URL = http://localhost:3001
//
// The backend (server/index.js) also serves the built PWA at /owner/ when
// `npm run owner:build` has been run — useful for quick testing without a
// separate dev server. In that case the PWA is at http://localhost:8787/owner/.
const OWNER_PWA_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OWNER_PWA_URL) || 'http://localhost:3001');

interface OwnerPWADrawerProps {
  slug: string;
  businessName: string;
  siteUrl?: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
}

function relTime(ms: number | null): string {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

export const OwnerPWADrawer: React.FC<OwnerPWADrawerProps> = ({
  slug, businessName, open, onClose, refreshKey,
}) => {
  const [codes, setCodes] = useState<InviteCode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [displayCode, setDisplayCode] = useState<string | null>(null);
  const [pulseKey, setPulseKey] = useState(0);

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
    if (t) setTimeout(() => setToast((cur) => (cur?.text === t.text ? null : cur)), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listInviteCodes(slug);
      setCodes(list);
    } catch (err: any) {
      setError(err?.message || 'Could not load codes.');
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (open) { sfx.open(); load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { sfx.close(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleGenerate = async () => {
    sfx.primary();
    setBusy(true);
    try {
      const code = await createInviteCode(slug);
      sfx.success();
      flashToast({ type: 'success', text: `New code generated.` });
      setDisplayCode(code.code);
      setPulseKey((k) => k + 1);
      await load();
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Could not generate code.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => {
    sfx.copy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    flashToast({ type: 'success', text: 'Code copied to clipboard.' });
  };

  const handleOpenPWA = () => {
    if (!displayCode) return;
    sfx.tap();
    window.open(`${OWNER_PWA_URL}/?code=${displayCode}`, '_blank', 'noopener,noreferrer');
  };

  // Derive
  const activeCodes = (codes || []).filter((c) => !c.revokedAt);
  const latest = activeCodes[0];

  useEffect(() => {
    if (latest) setDisplayCode(latest.code);
  }, [latest?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/45 backdrop-blur-sm animate-editor-fade"
      onClick={() => { sfx.close(); onClose(); }}
    >
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-border-main shadow-[0_24px_70px_rgba(26,25,22,0.3)] overflow-hidden animate-editor-rise max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

        {/* HEADER */}
        <div className="relative flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-border-light bg-off-white">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-accent text-white flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold font-sans text-ink leading-tight">Owner PWA Access</h2>
            <p className="text-xs sm:text-sm text-ink-secondary font-sans mt-0.5 truncate">
              Generate access for <span className="font-semibold text-ink">{businessName}</span>
            </p>
          </div>
          <button
            onClick={() => { sfx.close(); onClose(); }}
            className="-mr-1 -mt-1 p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto">
          <div className="relative px-5 sm:px-6 py-6 sm:py-7">
            <div className="pointer-events-none absolute inset-0 animate-invite-aurora" aria-hidden="true" />
            <div className="relative">
              {/* HERO CODE CARD */}
              <div className="animate-invite-hero-in">
                {error ? (
                  <div className="flex items-start gap-2.5 p-4 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm font-sans">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                ) : displayCode ? (
                  <div className="relative">
                    {pulseKey > 0 && (
                      <div
                        key={pulseKey}
                        className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <span className="absolute w-32 h-32 rounded-full bg-accent/20 animate-invite-ring" />
                      </div>
                    )}
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] font-bold text-ink-tertiary font-sans text-center mb-3">
                      Share this code
                    </p>
                    <div className="flex items-center justify-center">
                      <CodePill code={displayCode} size="lg" floating onCopy={handleCopy} />
                    </div>
                    <div className="mt-4 h-5 flex items-center justify-center">
                      {copied ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold font-sans text-success animate-invite-check-pop">
                          <Check className="w-3.5 h-3.5" /> Copied!
                        </span>
                      ) : latest ? (
                        <span className="text-[11px] text-ink-secondary font-sans">
                          Created {relTime(latest.createdAt)}
                          {latest.redeemedCount > 0 && <> · {latest.redeemedCount} {latest.redeemedCount === 1 ? 'use' : 'uses'}</>}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : loading ? (
                  <div className="space-y-3">
                    <div className="h-3 w-24 rounded bg-off-white mx-auto animate-pulse" />
                    <div className="h-12 w-56 rounded-2xl bg-off-white mx-auto animate-pulse" />
                    <div className="h-3 w-32 rounded bg-off-white mx-auto animate-pulse" />
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="inline-flex w-12 h-12 rounded-2xl bg-accent-soft text-accent items-center justify-center mb-3">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold font-sans text-ink mb-1">No code yet</p>
                    <p className="text-xs text-ink-secondary font-sans max-w-[260px] mx-auto">
                      Tap the button below to generate an access code for this business.
                    </p>
                  </div>
                )}
              </div>

              {/* CTA buttons */}
              <div className="mt-7 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={busy}
                  className="group relative flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-white text-sm font-semibold font-sans shadow-[0_8px_20px_-6px_rgba(37,99,235,0.55)] hover:bg-accent-hover hover:shadow-[0_10px_26px_-6px_rgba(37,99,235,0.65)] active:scale-[0.98] transition-all disabled:opacity-60 overflow-hidden"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  {busy ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 transition-transform group-hover:rotate-12" />
                  )}
                  {displayCode ? 'Generate new code' : 'Generate code'}
                </button>
                <button
                  onClick={() => displayCode && handleCopy()}
                  disabled={!displayCode}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-border-main text-ink text-sm font-semibold font-sans hover:bg-off-white active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy code'}
                </button>
              </div>

              {/* Deep-link to open in Owner PWA */}
              {displayCode && (
                <div className="mt-3">
                  <button
                    onClick={handleOpenPWA}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-accent/30 text-accent text-sm font-semibold font-sans hover:bg-accent-soft active:scale-[0.98] transition-all"
                  >
                    <Globe className="w-4 h-4" />
                    Open in Owner PWA
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-5 sm:px-6 py-3 border-t border-border-light bg-white flex items-center gap-2 text-[11px] text-ink-secondary font-sans">
          <Smartphone className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>
            Business owners enter this code at owner.lunao.com to access their mobile dashboard.
          </span>
        </div>
      </div>
    </div>
  );
};

const ToastBanner: React.FC<{ toast: { type: 'success' | 'error' | 'info'; text: string }; onClose: () => void }> = ({ toast, onClose }) => {
  const styles = {
    success: 'bg-success-soft text-success border-success/20',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-accent-soft text-accent border-accent/20',
  }[toast.type];
  const Icon = toast.type === 'success' ? Check : toast.type === 'error' ? AlertCircle : Sparkles;
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-editor-rise pointer-events-none">
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium font-sans ${styles}`}>
        <Icon className="w-4 h-4 shrink-0" />
        <span>{toast.text}</span>
        <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100 pointer-events-auto">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default OwnerPWADrawer;
