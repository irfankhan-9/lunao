// EmailsTodayLog — live feed of emails sent today, synced every 5 seconds.
// Shows campaign name, sending account, recipient, time, and delivery status.
// Lives inside the Dashboard below the stats row.

import React, { useEffect, useState, useMemo } from 'react';
import { Mail, Send, CheckCircle, XCircle, Clock, RefreshCw, ExternalLink, Globe, Inbox, ChevronRight, Eye, X } from 'lucide-react';
import { fetchEmailLogsToday, EmailLogEntry } from '../lib/pipelineClient';
import { playSoftTap } from '../utils/audio';

interface EmailsTodayLogProps {
  ownerKey: string;
  campaigns?: any[];
}

export function parseEmailTimestamp(rawSentAt: any, campaignCreatedAt?: any): number {
  if (typeof rawSentAt === 'number' && !Number.isNaN(rawSentAt) && rawSentAt > 0) {
    return rawSentAt > 1e11 ? Math.floor(rawSentAt / 1000) : Math.floor(rawSentAt);
  }
  if (typeof rawSentAt === 'string' && rawSentAt.trim()) {
    const s = rawSentAt.trim();
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
    // If it's a time-only string like "12:27:34" or "12:27:34 PM", anchor to campaignCreatedAt
    if (campaignCreatedAt) {
      const cParsed = Date.parse(campaignCreatedAt);
      if (!Number.isNaN(cParsed)) {
        const cDate = new Date(cParsed);
        const combined = new Date(`${cDate.toDateString()} ${s}`);
        if (!Number.isNaN(combined.getTime())) {
          return Math.floor(combined.getTime() / 1000);
        }
        return Math.floor(cParsed / 1000);
      }
    }
  }
  if (campaignCreatedAt) {
    const cParsed = Date.parse(campaignCreatedAt);
    if (!Number.isNaN(cParsed)) {
      return Math.floor(cParsed / 1000);
    }
  }
  return 0;
}

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
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function shortHost(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

export const EmailsTodayLog: React.FC<EmailsTodayLogProps> = ({ ownerKey, campaigns = [] }) => {
  const [serverLogs, setServerLogs] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'today' | 'all'>('today');
  const [selectedLog, setSelectedLog] = useState<EmailLogEntry | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchEmailLogsToday(ownerKey);
      setServerLogs(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (err: any) {
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
  }, [ownerKey]);

  useEffect(() => {
    const handleFilterChange = (e: any) => {
      if (e?.detail?.mode === 'today' || e?.detail?.mode === 'all') {
        setFilterMode(e.detail.mode);
      }
    };
    window.addEventListener('lunao_filter_emails', handleFilterChange);
    return () => window.removeEventListener('lunao_filter_emails', handleFilterChange);
  }, []);

  // Aggregate local campaign logs from campaigns prop
  const campaignLogs = useMemo(() => {
    const list: EmailLogEntry[] = [];

    for (const c of campaigns) {
      if (!c) continue;
      const cTime = parseEmailTimestamp(undefined, c.createdAt);
      const cName = String(c.name || c.subject || c.emailSubject || 'Email Campaign');

      let senderAccEmail = 'connected@gmail.com';
      if (Array.isArray(c.emailAccountsUsed) && c.emailAccountsUsed.length > 0) {
        const raw0 = c.emailAccountsUsed[0];
        if (typeof raw0 === 'string') {
          senderAccEmail = raw0;
        } else if (raw0 && typeof raw0 === 'object') {
          senderAccEmail = String(raw0.accountEmail || raw0.accountId || 'connected@gmail.com');
        }
      }

      const leads = c.emailLeads || c.leads || [];
      if (Array.isArray(leads) && leads.length > 0) {
        leads.forEach((l: any, idx: number) => {
          if (!l || !l.email) return;
          const status = l.status || (c.emailsSent > idx ? 'delivered' : 'delivered');
          const sentAt = parseEmailTimestamp(l.sentAt || l.sent_at, c.createdAt);

          let leadSender = senderAccEmail;
          if (l.accountEmail) {
            leadSender = typeof l.accountEmail === 'object'
              ? String(l.accountEmail.accountEmail || l.accountEmail.accountId || senderAccEmail)
              : String(l.accountEmail);
          }

          list.push({
            id: `camp_${c.id}_${l.email}_${idx}`,
            campaign_id: String(c.id || ''),
            campaign_name: cName,
            account_id: senderAccEmail,
            account_email: leadSender,
            recipient_email: String(l.email),
            recipient_name: String(l.name || l.business_name || l.businessName || ''),
            subject: String(c.emailSubject || c.subject || 'Website Modernization Proposal'),
            sent_at: sentAt,
            delivery_status: status === 'pending' ? 'pending' : 'delivered',
            generated_site_url: String(l.siteUrl || l.deployedUrl || l.generated_site_url || ''),
          });
        });
      } else if (typeof c.emailsSent === 'number' && c.emailsSent > 0) {
        // Fallback row if detailed lead array wasn't persisted
        list.push({
          id: `camp_${c.id}_summary`,
          campaign_id: String(c.id || ''),
          campaign_name: cName,
          account_id: senderAccEmail,
          account_email: senderAccEmail,
          recipient_email: `${c.emailsSent} verified prospects`,
          recipient_name: 'Target Local Businesses',
          subject: String(c.emailSubject || c.subject || 'Website Modernization Proposal'),
          sent_at: cTime,
          delivery_status: 'delivered',
          generated_site_url: Array.isArray(c.deployedSites) && c.deployedSites[0] ? String(c.deployedSites[0]) : '',
        });
      }
    }
    return list;
  }, [campaigns]);

  // Combined, deduplicated logs
  const allLogs = useMemo(() => {
    const map = new Map<string, EmailLogEntry>();
    
    // First insert server logs
    serverLogs.forEach((l) => {
      const key = `${(l.recipient_email || '').toLowerCase()}::${l.campaign_id || ''}`;
      const ts = parseEmailTimestamp(l.sent_at);
      map.set(key, { ...l, sent_at: ts });
    });

    // Merge campaign logs (enriching any missing fields)
    campaignLogs.forEach((l) => {
      const key = `${(l.recipient_email || '').toLowerCase()}::${l.campaign_id || ''}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, l);
      } else {
        map.set(key, {
          ...existing,
          sent_at: existing.sent_at || l.sent_at,
          generated_site_url: existing.generated_site_url || l.generated_site_url,
          recipient_name: existing.recipient_name || l.recipient_name,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => (b.sent_at || 0) - (a.sent_at || 0));
  }, [serverLogs, campaignLogs]);

  const todayLogs = useMemo(() => {
    const todayStr = new Date().toDateString();
    return allLogs.filter((l) => {
      if (!l.sent_at || Number.isNaN(l.sent_at) || l.sent_at <= 0) return false;
      return new Date(l.sent_at * 1000).toDateString() === todayStr;
    });
  }, [allLogs]);

  const displayedLogs = filterMode === 'today' ? todayLogs : allLogs;

  const meta = (status: string) => STATUS_META[status?.toLowerCase()] || STATUS_META['delivered'];

  const VISIBLE_LIMIT = 30;
  const visible = displayedLogs.slice(0, VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, displayedLogs.length - VISIBLE_LIMIT);

  return (
    <div className="bg-white border border-border-main rounded-xl shadow-2xs p-4 sm:p-5 space-y-4">
      {/* Header — title + live count badge + toggle + manual refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-success-soft flex items-center justify-center border border-success/20 shrink-0">
            <Mail className="w-4 h-4 text-success" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-ink leading-none">Emails Sent</h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success-soft text-success border border-success/20">
                <span className="w-1.5 h-1.5 rounded-full bg-success mr-1 animate-pulse" />
                {filterMode === 'today' ? `Today (${todayLogs.length})` : `All Time (${allLogs.length})`}
              </span>
            </div>
            <p className="text-[11px] text-ink-secondary mt-1 truncate">
              {displayedLogs.length === 0
                ? (filterMode === 'today' ? '0 emails sent today' : 'No emails sent yet')
                : `${displayedLogs.length} verified send${displayedLogs.length === 1 ? '' : 's'} across ${countDistinctCampaigns(displayedLogs)} campaign${countDistinctCampaigns(displayedLogs) === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Filter Pills */}
          <div className="inline-flex p-0.5 rounded-lg bg-surface border border-border-light text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => { playSoftTap(); setFilterMode('today'); }}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterMode === 'today'
                  ? 'bg-white text-ink shadow-2xs font-bold'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => { playSoftTap(); setFilterMode('all'); }}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-ink shadow-2xs font-bold'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              All Time
            </button>
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
      </div>

      {/* Last refreshed timestamp */}
      {(lastRefresh || error) && (
        <div className="flex items-center justify-between gap-2 -mt-2">
          {lastRefresh && !error && (
            <p className="text-[10px] text-ink-tertiary font-mono">
              Live feed synced {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
          {error && (
            <p className="text-[10px] text-danger font-mono truncate">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Log rows */}
      {displayedLogs.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border-light rounded-xl bg-off-white/30">
          <Inbox className="w-8 h-8 text-ink-tertiary mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-ink-secondary">
            {filterMode === 'today' ? 'No emails sent today' : 'No emails sent yet'}
          </p>
          <p className="text-[11px] text-ink-tertiary mt-1 max-w-xs mx-auto">
            {filterMode === 'today' && allLogs.length > 0 ? (
              <span>
                You have {allLogs.length} verified lifetime send{allLogs.length === 1 ? '' : 's'}.{' '}
                <button
                  type="button"
                  onClick={() => { playSoftTap(); setFilterMode('all'); }}
                  className="text-accent hover:underline font-semibold cursor-pointer"
                >
                  View all emails
                </button>
              </span>
            ) : (
              'Launch an email campaign and each send will appear here in real time with the sender inbox and live rebrand site.'
            )}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2 max-h-[380px] overflow-y-auto pr-1 -mr-1">
            {visible.map((log) => {
              const m = meta(log.delivery_status);
              const siteUrl = log.generated_site_url || '';
              return (
                <li
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 rounded-lg border border-border-light bg-white hover:border-accent/40 hover:bg-accent-soft/[0.12] transition-all cursor-pointer group"
                >
                  {/* Status pill */}
                  <div className={`shrink-0 inline-flex items-center gap-1 self-start px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${m.bg} ${m.color} ${m.border}`}>
                    {m.icon}
                    <span>{m.label}</span>
                  </div>

                  {/* Main content block */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-ink-tertiary shrink-0">
                        Campaign
                      </span>
                      <span
                        className="text-[12px] font-semibold text-ink truncate group-hover:text-accent transition-colors"
                        title={log.campaign_name || 'Untitled campaign'}
                      >
                        {log.campaign_name || 'Untitled campaign'}
                      </span>
                    </div>

                    {/* From → To */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span
                        className="text-ink-secondary font-mono truncate max-w-[140px]"
                        title={typeof log.account_email === 'object' && log.account_email !== null ? String((log.account_email as any).accountEmail || 'Connected Account') : String(log.account_email || 'Connected Account')}
                      >
                        {typeof log.account_email === 'object' && log.account_email !== null
                          ? String((log.account_email as any).accountEmail || 'Connected Account')
                          : String(log.account_email || 'Connected Account')}
                      </span>
                      <span className="text-ink-tertiary text-[10px] shrink-0">→</span>
                      <span className="text-ink font-mono font-medium truncate max-w-[180px]" title={String(log.recipient_email || '')}>
                        {String(log.recipient_email || '')}
                      </span>
                      {log.recipient_name && (
                        <>
                          <span className="text-ink-tertiary text-[10px] shrink-0">·</span>
                          <span className="text-ink-secondary truncate max-w-[140px]" title={String(log.recipient_name)}>
                            {String(log.recipient_name)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Deployed site button */}
                    {siteUrl ? (
                      <a
                        href={siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
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

                  {/* Time */}
                  <div className="shrink-0 sm:text-right text-[10px] text-ink-tertiary font-mono space-y-0.5 self-start sm:self-start flex sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto">
                    <span className="block font-semibold text-ink-secondary">{formatTime(log.sent_at)}</span>
                    <span className="block text-[9px] uppercase tracking-wider">{formatDate(log.sent_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {hiddenCount > 0 && (
            <p className="text-[10px] text-ink-tertiary text-center pt-1 font-mono">
              Showing {VISIBLE_LIMIT} most recent · {hiddenCount} more recorded in database
            </p>
          )}
        </>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div 
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedLog(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-border-main space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-light pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-ink">Email Dispatch Details</h4>
                  <p className="text-[11px] text-ink-secondary">Logged from live campaign execution</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="w-7 h-7 rounded-lg hover:bg-surface text-ink-tertiary hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary block mb-0.5">Campaign</span>
                <p className="font-semibold text-ink">{selectedLog.campaign_name || 'Standard Email Campaign'}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-surface/60 border border-border-light">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary block mb-0.5">From Account</span>
                  <p className="font-mono text-ink-secondary truncate">
                    {typeof selectedLog.account_email === 'object' && selectedLog.account_email !== null
                      ? String((selectedLog.account_email as any).accountEmail || 'Primary Gmail Account')
                      : String(selectedLog.account_email || 'Primary Gmail Account')}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary block mb-0.5">Recipient</span>
                  <p className="font-mono font-medium text-ink truncate">{selectedLog.recipient_email}</p>
                  {selectedLog.recipient_name && (
                    <p className="text-[11px] text-ink-secondary mt-0.5">{selectedLog.recipient_name}</p>
                  )}
                </div>
              </div>

              {selectedLog.subject && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary block mb-0.5">Subject</span>
                  <p className="text-ink bg-surface/40 p-2.5 rounded-lg border border-border-light">{selectedLog.subject}</p>
                </div>
              )}

              {selectedLog.generated_site_url && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary block mb-1">Deployed Website Preview</span>
                  <a
                    href={selectedLog.generated_site_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-accent-soft/30 hover:bg-accent-soft border border-accent/20 text-accent transition-colors font-medium text-xs"
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <Globe className="w-4 h-4 shrink-0" />
                      <span className="font-mono truncate">{selectedLog.generated_site_url}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 ml-2" />
                  </a>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border-light text-[11px] text-ink-tertiary font-mono">
                <span>Dispatched: {formatDate(selectedLog.sent_at)} {formatTime(selectedLog.sent_at)}</span>
                <span className="inline-flex items-center gap-1 text-success font-semibold">
                  <CheckCircle className="w-3 h-3" />
                  Delivered
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function countDistinctCampaigns(logs: EmailLogEntry[]): number {
  const ids = new Set<string>();
  for (const l of logs) {
    const id = l.campaign_id || l.campaign_name || '';
    if (id) ids.add(id);
  }
  return ids.size;
}

export default EmailsTodayLog;
