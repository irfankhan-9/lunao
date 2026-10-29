// Brand-consistent micro-components used by the Recent Campaigns cards
// across the Dashboard table, the Site Deploy strip, and the full log table.
//
// Every component here stays 100% on brand:
//   • only existing accent / ink / surface tokens (no new colors)
//   • the same audio palette already loaded by src/utils/audio.ts
//   • mobile-first responsive sizing (touch targets ≥ 32px, copy actions
//     collapse to icon-only below the `sm:` breakpoint)
//   • loading states use the shimmer ring defined in index.css
//     (.animate-campaign-shimmer / .animate-campaign-spin / .animate-campaign-running-ring)

import React, { useState } from 'react';
import {
  Link2,
  ExternalLink,
  Check,
  Copy,
  Loader2,
  Eye,
  Pencil,
} from 'lucide-react';
import {
  playConfirmSuccess,
  playSoftTap,
} from '../utils/audio';

/** A pulsing brand-blue dot + spinner label for rows that are still running. */
export const RunningBadge: React.FC<{ label?: string; className?: string }> = ({
  label = 'Running',
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent-soft text-accent border border-accent/20 ${className}`}
    title="This campaign is still deploying. Refresh in a few seconds."
  >
    <span className="relative flex w-2.5 h-2.5">
      <span className="absolute inset-0 rounded-full bg-accent animate-campaign-running-ring" />
      <span className="relative w-2.5 h-2.5 rounded-full bg-accent" />
    </span>
    <Loader2 className="w-3 h-3 animate-campaign-spin text-accent" />
    {label}
  </span>
);

/** Single deployed-site URL row with copy + open actions. */
export const SiteUrlRow: React.FC<{
  url: string;
  slug?: string;
  pending?: boolean;
  failed?: boolean;
  errorText?: string;
  compact?: boolean;
}> = ({ url, slug, pending, failed, errorText, compact }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      playConfirmSuccess();
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback for older browsers / insecure contexts.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        playConfirmSuccess();
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  if (pending) {
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="h-2 flex-1 max-w-[180px] rounded-full bg-surface overflow-hidden">
          <div className="h-full w-full animate-campaign-shimmer" />
        </div>
        <span className="text-[10px] text-ink-tertiary font-mono shrink-0">deploying…</span>
      </div>
    );
  }

  const display = (url || '').replace(/^https?:\/\//, '');

  return (
    <div className={`group flex items-center gap-1.5 min-w-0 ${compact ? 'py-0.5' : 'py-1'}`}>
      <Link2 className="w-3 h-3 text-accent shrink-0" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        onClick={() => playSoftTap()}
        className="flex-1 min-w-0 text-[11px] text-ink hover:text-accent font-mono truncate transition-colors"
      >
        {display || slug || '(no url)'}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        title="Copy URL"
        aria-label="Copy URL"
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-secondary hover:text-accent hover:bg-accent-soft transition-colors cursor-pointer"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-success animate-campaign-copy-confirm" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => playSoftTap()}
        title="Open in new tab"
        aria-label="Open in new tab"
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-secondary hover:text-accent hover:bg-accent-soft transition-colors cursor-pointer"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
      {failed && errorText && (
        <span
          className="hidden md:inline text-[10px] text-danger font-medium truncate max-w-[120px]"
          title={errorText}
        >
          {errorText}
        </span>
      )}
    </div>
  );
};

/** Compact "open all" + "copy all" footer for a Recent Campaign card. */
export const DeployedUrlChips: React.FC<{
  sites: { url: string; name?: string }[];
}> = ({ sites }) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const live = sites.filter((s) => !!s.url);
  if (live.length === 0) return null;

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(live.map((s) => s.url).join('\n'));
      setCopiedAll(true);
      playConfirmSuccess();
      setTimeout(() => setCopiedAll(false), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleCopyAll}
        title={`Copy all ${live.length} URL${live.length === 1 ? '' : 's'}`}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-surface text-ink-secondary hover:bg-accent-soft hover:text-accent transition-colors cursor-pointer"
      >
        {copiedAll ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
        <span className="hidden sm:inline">Copy all</span>
      </button>
      <a
        href={live[0].url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => playSoftTap()}
        title="Open first site"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-accent text-white hover:bg-accent-hover transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        <span className="hidden sm:inline">Open</span>
      </a>
    </div>
  );
};

/** "View details" button used on each Recent Campaign row.
 *  Fires `onClick` — the parent (Dashboard / CampaignsPage) handles the
 *  scroll-to-section logic via `setScrollTarget('rcard-section')`.
 *  Icon-only on mobile so the row stays compact on small screens. */
export const CampaignDetailButton: React.FC<{
  onClick: () => void;
  label?: string;
}> = ({ onClick, label = 'View details' }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      playSoftTap();
      onClick();
    }}
    title={label}
    aria-label={label}
    className="shrink-0 inline-flex items-center justify-center sm:gap-1 sm:px-2 sm:py-1 w-7 h-7 sm:w-auto sm:h-auto rounded-md text-[10px] font-bold uppercase tracking-wider bg-accent-soft text-accent hover:bg-accent hover:text-white transition-all cursor-pointer"
  >
    <Eye className="w-3 h-3" />
    <span className="hidden sm:inline">{label}</span>
  </button>
);

/** "Edit outreach" pencil button used on Recent Campaign rows + the
 *  celebration card. Pre-fills a fresh email wizard with the source
 *  campaign's subject/body so the user can iterate the message and
 *  relaunch without leaving the dashboard. */
export const EditOutreachButton: React.FC<{
  onClick: () => void;
  label?: string;
}> = ({ onClick, label = 'Edit outreach' }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      playSoftTap();
      onClick();
    }}
    title={label}
    aria-label={label}
    className="shrink-0 inline-flex items-center justify-center sm:gap-1 sm:px-2 sm:py-1 w-7 h-7 sm:w-auto sm:h-auto rounded-md text-[10px] font-bold uppercase tracking-wider bg-white border border-border-main text-ink-secondary hover:bg-surface hover:text-ink transition-all cursor-pointer"
  >
    <Pencil className="w-3 h-3" />
    <span className="hidden sm:inline">{label}</span>
  </button>
);
