// Brand-consistent confirmation modal used for destructive actions
// (deleting a campaign card, etc.).
//
// Same rules as RecentCampaignsBits:
//   • only existing accent / ink / surface tokens (no new colors)
//   • the existing audio palette from src/utils/audio.ts
//   • mobile-first responsive sizing (full-width on < sm, centered card on sm+)
//   • focus management + Esc-to-cancel + click-outside-to-cancel
//   • single source of truth for the confirm / cancel copy + sounds

import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import {
  playSoftTap,
  playCancelTone,
  playConfirmSuccess,
  playElegantError,
} from '../utils/audio';

export type ConfirmDialogTone = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  // Optional name of the thing being destroyed — rendered in bold inside the
  // body copy so the user can be 100% sure they're nuking the right card.
  targetName?: string;
  // Optional small icon shown next to the title.
  icon?: React.ReactNode;
  // Fired when the user confirms (Delete button or Enter key).
  onConfirm: () => void;
  onCancel: () => void;
}

const toneStyles: Record<
  ConfirmDialogTone,
  { ring: string; pill: string; pillText: string; iconBg: string; iconText: string; border: string; button: string }
> = {
  danger: {
    ring: 'ring-danger/15',
    pill: 'bg-danger-soft border-danger/20',
    pillText: 'text-danger',
    iconBg: 'bg-danger-soft',
    iconText: 'text-danger',
    border: 'border-danger/20',
    button: 'bg-danger hover:bg-danger text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]',
  },
  warning: {
    ring: 'ring-warning/20',
    pill: 'bg-warning-soft border-warning/20',
    pillText: 'text-warning',
    iconBg: 'bg-warning-soft',
    iconText: 'text-warning',
    border: 'border-warning/20',
    button: 'bg-warning hover:bg-warning text-white shadow-[0_4px_12px_rgba(217,119,6,0.25)]',
  },
  info: {
    ring: 'ring-accent/20',
    pill: 'bg-accent-soft border-accent/20',
    pillText: 'text-accent',
    iconBg: 'bg-accent-soft',
    iconText: 'text-accent',
    border: 'border-accent/20',
    button: 'bg-accent hover:bg-accent-hover text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)]',
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Delete forever',
  cancelLabel = 'Cancel',
  tone = 'danger',
  targetName,
  icon,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const styles = toneStyles[tone];

  // Focus the destructive button when the dialog opens so keyboard / mobile
  // users can confirm with Enter without hunting for the right button.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      confirmRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open]);

  // Esc to cancel — matches every other modal in the dashboard.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  // Lock body scroll while the modal is open so the page underneath
  // can't drift on mobile (iOS Safari especially).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    // Confirm sound is picked per-tone so the action matches the visual weight.
    if (tone === 'danger') playCancelTone();
    else if (tone === 'warning') playElegantError();
    else playConfirmSuccess();
    onConfirm();
  };

  const handleCancel = () => {
    playSoftTap();
    onCancel();
  };

  const defaultIcon = tone === 'danger' || tone === 'warning'
    ? <AlertTriangle className="w-5 h-5" />
    : <Trash2 className="w-5 h-5" />;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        className={`relative w-full sm:max-w-md bg-white border border-border-main rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden ring-1 ${styles.ring} animate-slide-up`}
      >
        {/* Top tone gradient — pulls the eye toward the action */}
        <div className={`h-1.5 w-full ${
          tone === 'danger'
            ? 'bg-gradient-to-r from-danger/60 via-danger to-danger/60'
            : tone === 'warning'
              ? 'bg-gradient-to-r from-warning/60 via-warning to-warning/60'
              : 'bg-gradient-to-r from-accent/60 via-accent to-accent/60'
        }`} />

        {/* Radial glow behind icon */}
        <div className={`absolute inset-x-0 top-0 h-32 pointer-events-none overflow-hidden rounded-t-3xl sm:rounded-t-3xl ${
          tone === 'danger'
            ? 'bg-[radial-gradient(ellipse_at_top,_rgba(220,38,38,0.06)_0%,_transparent_70%)]'
            : tone === 'warning'
              ? 'bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.06)_0%,_transparent_70%)]'
              : 'bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.06)_0%,_transparent_70%)]'
        }`} />

        {/* Mobile close X */}
        <button
          type="button"
          onClick={handleCancel}
          aria-label="Close dialog"
          className="absolute top-3.5 right-3.5 w-8 h-8 rounded-xl bg-white border border-border-light text-ink-secondary hover:text-ink hover:bg-off-white transition-all flex items-center justify-center cursor-pointer sm:hidden z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-5 sm:p-7 pt-6 sm:pt-8 relative">
          {/* Header row */}
          <div className="flex items-start gap-4 pr-8 sm:pr-0">
            <div className={`shrink-0 w-12 h-12 rounded-2xl ${styles.iconBg} ${styles.iconText} flex items-center justify-center border-2 ${styles.border} shadow-sm`}>
              {icon ?? defaultIcon}
            </div>
            <div className="flex-1 min-w-0">
              <h3
                id="confirm-dialog-title"
                className="text-lg font-serif text-ink tracking-tight font-normal leading-tight"
              >
                {title}
              </h3>
              {targetName && (
                <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-xl border text-sm font-semibold font-mono ${styles.pill} ${styles.pillText} shadow-sm`}>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="max-w-[200px] truncate" title={targetName}>
                    {targetName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Body copy */}
          {(description || targetName) && (
            <p className="mt-4 text-sm text-ink-secondary leading-relaxed">
              {description}
            </p>
          )}

          {/* Footer actions */}
          <div className="mt-7 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={handleCancel}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border-2 border-border-main bg-white text-ink text-xs font-bold uppercase tracking-wider hover:bg-off-white hover:border-ink/30 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={handleConfirm}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl ${styles.button} text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-[0.97] hover:-translate-y-0.5`}
            >
              <Trash2 className="w-4 h-4" />
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
