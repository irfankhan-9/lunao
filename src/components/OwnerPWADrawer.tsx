// "Generate Owner PWA" drawer for the Site Editor.
// Displays one persistent access code per business site with clean copy & launch PWA buttons.

import React, { useEffect, useState, useCallback } from 'react';
import {
  Key, X, Copy, Check, ShieldCheck, AlertCircle, Smartphone,
  ExternalLink, Globe, Lock, Loader2,
} from 'lucide-react';
import { CodePill } from './CodePill';
import {
  listInviteCodes, createInviteCode, InviteCode,
} from '../lib/pipelineClient';
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
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
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
    if (t) setTimeout(() => setToast((cur) => (cur?.text === t.text ? null : cur)), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listInviteCodes(slug);
      setCodes(list);
      const active = (list || []).filter((c) => !c.revokedAt);
      if (active.length > 0) {
        setDisplayCode(active[0].code);
      } else {
        // Auto-generate one persistent code if none exists
        const newCode = await createInviteCode(slug);
        setDisplayCode(newCode.code);
        const updatedList = await listInviteCodes(slug);
        setCodes(updatedList);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load access code.');
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (open) {
      sfx.open();
      load();
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
      // fallback
    }
    sfx.copy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    flashToast({ type: 'success', text: 'Access code copied to clipboard.' });
  };

  const handleOpenPWA = () => {
    if (!displayCode) return;
    sfx.tap();
    window.open(`/owner/?code=${encodeURIComponent(displayCode)}`, '_blank', 'noopener,noreferrer');
  };

  const activeCodes = (codes || []).filter((c) => !c.revokedAt);
  const latest = activeCodes[0];

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
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-accent text-white flex items-center justify-center shrink-0 shadow-sm">
            <Key className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold font-sans text-ink leading-tight">Owner PWA Access Code</h2>
            <p className="text-xs sm:text-sm text-ink-secondary font-sans mt-0.5 truncate">
              Client Portal for <span className="font-bold text-ink">{businessName}</span>
            </p>
          </div>
          <button
            onClick={() => { sfx.close(); onClose(); }}
            className="-mr-1 -mt-1 p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto">
          <div className="relative px-5 sm:px-6 py-6 sm:py-7">
            <div className="relative">
              {/* HERO CODE CARD */}
              <div className="animate-invite-hero-in">
                {error ? (
                  <div className="flex items-start gap-2.5 p-4 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm font-sans">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                ) : displayCode ? (
                  <div className="relative bg-surface/80 border border-border-main rounded-2xl p-5 sm:p-6 shadow-inner text-center">
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] font-bold text-ink-secondary font-sans text-center mb-3 flex items-center justify-center gap-1.5">
                      <Lock className="w-3 h-3 text-accent" />
                      Secure Access Passcode
                    </p>
                    <div className="flex items-center justify-center w-full overflow-x-auto py-1">
                      <CodePill code={displayCode} size="lg" floating onCopy={handleCopy} />
                    </div>
                    <div className="mt-3.5 h-5 flex items-center justify-center">
                      {copied ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold font-sans text-emerald-600 animate-invite-check-pop">
                          <Check className="w-3.5 h-3.5" /> Copied to Clipboard
                        </span>
                      ) : latest ? (
                        <span className="text-[11px] text-ink-secondary font-sans font-medium">
                          Active Passcode · Generated {relTime(latest.createdAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : loading ? (
                  <div className="space-y-3 p-6 rounded-2xl bg-surface border border-border-light text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mb-2" />
                    <p className="text-xs text-ink-secondary">Generating secure passcode...</p>
                  </div>
                ) : (
                  <div className="text-center p-6 rounded-2xl bg-surface/80 border border-border-main">
                    <div className="inline-flex w-12 h-12 rounded-2xl bg-accent-soft text-accent items-center justify-center mb-3">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold font-sans text-ink mb-1">No Active Code</p>
                  </div>
                )}
              </div>

              {/* CTA buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={handleCopy}
                  disabled={!displayCode}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-md hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied to Clipboard' : 'Copy Code'}
                </button>
              </div>

              {/* Deep-link to open in Owner PWA */}
              {displayCode && (
                <div className="mt-3">
                  <button
                    onClick={handleOpenPWA}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white border border-accent/30 text-accent text-sm font-bold font-sans hover:bg-accent-soft active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
                  >
                    <Globe className="w-4 h-4" />
                    Open Owner PWA
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
            Business owners enter this passcode to access their mobile PWA dashboard.
          </span>
        </div>
      </div>
    </div>
  );
};

const ToastBanner: React.FC<{ toast: { type: 'success' | 'error' | 'info'; text: string }; onClose: () => void }> = ({ toast, onClose }) => {
  const styles = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-accent-soft text-accent border-accent/20',
  }[toast.type];
  const Icon = toast.type === 'success' ? Check : toast.type === 'error' ? AlertCircle : Key;
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-editor-rise pointer-events-none">
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium font-sans ${styles}`}>
        <Icon className="w-4 h-4 shrink-0" />
        <span>{toast.text}</span>
        <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100 pointer-events-auto cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default OwnerPWADrawer;
