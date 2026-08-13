// EmailsTodayLog — live feed of emails sent today, synced every 5 seconds.
// Shows campaign name, sending account, recipient, time, and delivery status.
// Lives inside the Dashboard below the stats row.
//
// Brand-consistent:
//   • only existing accent / ink / surface tokens
//   • the existing audio palette from src/utils/audio.ts
//   • mobile-first responsive (rows reflow cleanly on phones, touch
//     targets stay ≥ 32px)
//   • loading states use the shimmer ring defined in index.css

import React, { useEffect, useState } from 'react';
import { Mail, Send, CheckCircle, XCircle, Clock, RefreshCw, ExternalLink, Globe, Inbox } from 'lucide-react';
import { fetchEmailLogsToday, EmailLogEntry } from '../lib/pipelineClient';
import { playSoftTap } from '../utils/audio';

const STATUS_META: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string; label: string }> = {
  delivered: { icon: <CheckCircle className="w-3 h-3" />, color: 'text-success',          bg: 'bg-success-soft',    border: 'border-success/25',    label: 'Delivered' },
  sent:      { icon: <Send className="w-3 h-3" />,       color: 'text-accent',           bg: 'bg-accent-soft',     border: 'border-accent/25',     label: 'Sent'      },
  bounced:   { icon: <XCircle className="w-3 h-3" />,     color: 'text-danger',           bg: 'bg-danger/10',       border: 'border-danger/25',     label: 'Bounced'   },
  failed:    { icon: <XCircle className="w-3 h-3" />,     color: 'text-danger',           bg: 'bg-danger/10',       border: 'border-danger/25',     label: 'Failed'    },
  pending:   { icon: <Clock className="w-3 h-3" />,       color: 'text-ink-secondary',   bg: 'bg-surface',         border: 'border-border-light',  label: 'Pending'   },
};

function formatTime(ts: number) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Display host for a generated site URL ("sms-bulk-pages.pages.dev/the-foo/").
function shortHost(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    // Drop the trailing slash so the badge stays compact on mobile.
    return u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

export const EmailsTodayLog: React.FC<{ ownerKey: string }> = ({ ownerKey }) => {
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchEmailLogsToday(ownerKey);
      setLogs(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (err: any) {
      // Don't blank the previous list on a transient network blip.
      setError(err?.message || 'Could not reach the email log endpoint.');
    } finally {
      setLastRefresh(new Date());
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
    // ownerKey changes when the dashboard rebinds to a different
    // workspace, so re-mount the polling loop accordingly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey]);

  const meta = (status: string) =>
    STATUS_META[status?.toLowerCase()] || STATUS_META['pending'];

  // Surface only the top N rows in the always-visible feed so the card
  // never scrolls past the fold on mobile. Full history lives on the
  // campaign detail modal if the user wants more.
  const VISIBLE_LIMIT = 25;
  const visible = logs.slice(0, VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, logs.length - VISIBLE_LIMIT);

  return (
    <div className="bg-white border border-border-main rounded-xl shadow-2xs p-4 sm:p-5 space-y-4">
      {/* Header — title + live count badge + manual refresh */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-success-soft flex items-center justify-center border border-success/20 shrink-0">
            <Mail className="w-4 h-4 text-success" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-ink leading-none">Emails Sent Today</h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success-soft text-success border border-success/20">
                <span className="w-1.5 h-1.5 rounded-full bg-success mr-1 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[11px] text-ink-secondary mt-1 truncate">
              {logs.length === 0
                ? 'No emails sent today'
                : `${logs.length} send${logs.length === 1 ? '' : 's'} across ${countDistinctCampaigns(logs)} campaign${countDistinctCampaigns(logs) === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { playSoftTap(); load(); }}
          title="Refresh"
          aria-label="Refresh email log"
          className={`shrink-0 w-8 h-8 rounded-lg border border-border-light text-ink-secondary hover:text-accent hover:bg-accent-soft transition-colors flex items-center justify-center cursor-pointer ${loading ? 'animate-spin' : ''}`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Last refreshed timestamp + error chip — silent on success */}
      {(lastRefresh || error) && (
        <div className="flex items-center justify-between gap-2 -mt-2">
          {lastRefresh && !error && (
            <p className="text-[10px] text-ink-tertiary font-mono">
              Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
          {error && (
            <p className="text-[10px] text-danger font-mono truncate">
              {error}
            </p>
          )}
          {lastRefresh && error && (
            <p className="text-[10px] text-ink-tertiary font-mono shrink-0">
              {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}

      {/* Log rows */}
      {logs.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border-light rounded-xl bg-off-white/30">
          <Inbox className="w-8 h-8 text-ink-tertiary mx-auto mb-2" />
          <p className="text-sm font-semibold text-ink-secondary">No emails sent yet today</p>
          <p className="text-[11px] text-ink-tertiary mt-1 max-w-xs mx-auto">
            Launch an email campaign and each send will appear here in real time with the campaign name and deployed site.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1 -mr-1">
            {visible.map((log) => {
              const m = meta(log.delivery_status);
              const siteUrl = log.generated_site_url || '';
              return (
                <li
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 rounded-lg border border-border-light bg-white hover:border-accent/30 hover:bg-accent-soft/[0.12] transition-all"
                >
                  {/* Status pill — first column on all breakpoints */}
                  <div className={`shrink-0 inline-flex items-center gap-1 self-start px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${m.bg} ${m.color} ${m.border}`}>
                    {m.icon}
                    <span>{m.label}</span>
                  </div>

                  {/* Main content block */}
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Campaign name — the user explicitly wants this to be the
                        primary anchor for every row so it works as a quick
                        "which campaign did I just send?" filter. */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-ink-tertiary shrink-0">
                        Campaign
                      </span>
                      <span
                        className="text-[12px] font-semibold text-ink truncate"
                        title={log.campaign_name || 'Untitled campaign'}
                      >
                        {log.campaign_name || 'Untitled campaign'}
                      </span>
                    </div>

                    {/* From → To (single line, mono font, truncates cleanly) */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span className="text-ink-secondary font-mono truncate max-w-[140px]" title={log.account_email || 'Unknown account'}>
                        {log.account_email || 'Unknown account'}
                      </span>
                      <span className="text-ink-tertiary text-[10px] shrink-0">→</span>
                      <span className="text-ink font-mono truncate max-w-[180px]" title={log.recipient_email}>
                        {log.recipient_email}
                      </span>
                      {log.recipient_name && (
                        <>
                          <span className="text-ink-tertiary text-[10px] shrink-0">·</span>
                          <span className="text-ink-secondary truncate max-w-[140px]" title={log.recipient_name}>
                            {log.recipient_name}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Deployed site — primary quick action. Stays visible on
                        mobile (full row) and stacks below the recipient on
                        narrow screens for thumb-tap. */}
                    {siteUrl ? (
                      <a
                        href={siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={siteUrl}
                        className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 mt-0.5 rounded-md bg-accent-soft text-accent border border-accent/20 hover:bg-accent hover:text-white hover:border-accent transition-colors text-[10px] font-semibold"
                      >
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="font-mono truncate min-w-0">
                          {shortHost(siteUrl)}
                        </span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-ink-tertiary mt-0.5">
                        <Globe className="w-3 h-3" />
                        Site pending
                      </span>
                    )}
                  </div>

                  {/* Time — right-aligned, never wraps awkwardly */}
                  <div className="shrink-0 sm:text-right text-[10px] text-ink-tertiary font-mono space-y-0.5 self-start sm:self-start">
                    <span className="block">{formatTime(log.sent_at)}</span>
                    <span className="block text-[9px] uppercase tracking-wider">{formatDate(log.sent_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {hiddenCount > 0 && (
            <p className="text-[10px] text-ink-tertiary text-center pt-1">
              Showing the {VISIBLE_LIMIT} most recent · {hiddenCount} more in the campaign detail
            </p>
          )}
        </>
      )}
    </div>
  );
};

// Distinct campaign count for the subtitle ("4 sends across 2 campaigns").
// Pure function so it can run inside the render without an extra hook.
function countDistinctCampaigns(logs: EmailLogEntry[]): number {
  const ids = new Set<string>();
  for (const l of logs) {
    const id = l.campaign_id || l.campaign_name || '';
    if (id) ids.add(id);
  }
  return ids.size;
}

export default EmailsTodayLog;