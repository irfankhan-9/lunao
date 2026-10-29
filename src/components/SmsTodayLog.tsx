// SmsTodayLog — live feed of SMS sent today.
// Shows business name, phone number, deployed site URL, SMS proposal text,
// route, time, and delivery status.
//
// Brand-consistent:
//   • emerald / ink / surface color tokens
//   • audio palette from src/utils/audio.ts
//   • 100% mobile-first responsive (stack layout on mobile, touch targets ≥ 32px)

import React, { useEffect, useState, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  CheckCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  Globe,
  Phone,
  Copy,
  Check,
  Smartphone,
  Inbox,
  Link2
} from 'lucide-react';
import { Campaign, CampaignSmsLead } from '../types';
import { playConfirmSuccess, playSoftTap } from '../utils/audio';

export interface SmsTodayLogEntry {
  id: string;
  campaignId?: string;
  campaignName: string;
  businessName: string;
  phone: string;
  city?: string;
  siteUrl?: string;
  smsText?: string;
  sentAtTs: number;
  status: 'delivered' | 'sent';
  smsPhoneUsed?: string;
}

interface SmsTodayLogProps {
  campaigns: Campaign[];
  ownerKey: string;
}

export const SmsTodayLog: React.FC<SmsTodayLogProps> = ({ campaigns, ownerKey }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);

  // Extract successful SMS sent today across all campaigns in state + localStorage
  const smsTodayEntries = useMemo<SmsTodayLogEntry[]>(() => {
    const entries: SmsTodayLogEntry[] = [];
    const seenKeys = new Set<string>();

    const todayStr = new Date().toDateString();

    // 1. Gather from campaigns prop
    for (const c of campaigns) {
      if (!c) continue;
      const isSmsType = c.type === 'sms' || (c.smsLeads && c.smsLeads.length > 0);
      if (!isSmsType) continue;

      const cName = c.name || 'SMS Outreach Campaign';
      const routePhone = c.smsPhoneUsed || '+1 (604) 953-9651';

      if (c.smsLeads && Array.isArray(c.smsLeads)) {
        for (const l of c.smsLeads) {
          // Exclude failed or queued — only sent or delivered!
          if (l.status !== 'delivered' && l.status !== 'sent') continue;

          // Check if today
          let ts = Date.now();
          if (c.createdAt) {
            const parsed = Date.parse(c.createdAt);
            if (!Number.isNaN(parsed)) ts = parsed;
          }

          const entryDateStr = new Date(ts).toDateString();
          if (entryDateStr !== todayStr) continue;

          const key = `${c.id}-${l.leadId || l.phone}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          entries.push({
            id: key,
            campaignId: c.id,
            campaignName: cName,
            businessName: l.businessName || l.name || 'Local Business',
            phone: l.phone || '+1 604-555-0199',
            city: l.city || c.niche || '',
            siteUrl: l.siteUrl || (c.deployedSites && c.deployedSites[0]?.url) || '',
            smsText: l.smsText || c.smsMessage || '',
            sentAtTs: ts,
            status: (l.status === 'delivered' ? 'delivered' : 'sent'),
            smsPhoneUsed: routePhone,
          });
        }
      } else if (c.deployedSites && Array.isArray(c.deployedSites) && c.type === 'sms') {
        // Fallback for SMS campaigns with deployedSites
        for (const s of c.deployedSites) {
          const smsStat = s.smsStatus || 'delivered';
          if (smsStat !== 'delivered' && smsStat !== 'sent') continue;

          let ts = Date.now();
          if (c.createdAt) {
            const parsed = Date.parse(c.createdAt);
            if (!Number.isNaN(parsed)) ts = parsed;
          }

          const entryDateStr = new Date(ts).toDateString();
          if (entryDateStr !== todayStr) continue;

          const key = `${c.id}-${s.slug || s.name}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          entries.push({
            id: key,
            campaignId: c.id,
            campaignName: cName,
            businessName: s.name || 'Local Business',
            phone: s.phone || '+1 604-555-0199',
            city: s.city || '',
            siteUrl: s.url || '',
            smsText: s.smsText || c.smsMessage || '',
            sentAtTs: ts,
            status: smsStat === 'delivered' ? 'delivered' : 'sent',
            smsPhoneUsed: routePhone,
          });
        }
      }
    }

    // 2. Also read from localStorage for background runs
    try {
      const stored = localStorage.getItem('lunao_campaigns');
      if (stored) {
        const parsedCamps = JSON.parse(stored);
        if (Array.isArray(parsedCamps)) {
          for (const c of parsedCamps) {
            if (c.type !== 'sms' && (!c.smsLeads || c.smsLeads.length === 0)) continue;
            const cName = c.name || 'SMS Outreach Campaign';
            const routePhone = c.smsPhoneUsed || '+1 (604) 953-9651';

            if (Array.isArray(c.smsLeads)) {
              for (const l of c.smsLeads) {
                if (l.status !== 'delivered' && l.status !== 'sent') continue;
                let ts = Date.now();
                if (c.createdAt) {
                  const p = Date.parse(c.createdAt);
                  if (!Number.isNaN(p)) ts = p;
                }
                if (new Date(ts).toDateString() !== todayStr) continue;

                const key = `${c.id}-${l.leadId || l.phone}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);

                entries.push({
                  id: key,
                  campaignId: c.id,
                  campaignName: cName,
                  businessName: l.businessName || l.name || 'Local Business',
                  phone: l.phone || '+1 604-555-0199',
                  city: l.city || '',
                  siteUrl: l.siteUrl || '',
                  smsText: l.smsText || c.smsMessage || '',
                  sentAtTs: ts,
                  status: l.status === 'delivered' ? 'delivered' : 'sent',
                  smsPhoneUsed: routePhone,
                });
              }
            }
          }
        }
      }
    } catch {
      // non-fatal
    }

    // Sort freshest first
    return entries.sort((a, b) => b.sentAtTs - a.sentAtTs);
  }, [campaigns]);

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      playConfirmSuccess();
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // non-fatal
    }
  };

  const handleRefresh = () => {
    playSoftTap();
    setLoading(true);
    setLastRefresh(new Date());
    window.setTimeout(() => setLoading(false), 300);
  };

  return (
    <div className="bg-white border border-border-main rounded-xl shadow-2xs p-4 sm:p-5 space-y-4 text-left">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-200 shrink-0">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-ink leading-none">SMS Sent Today</h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[11px] text-ink-secondary mt-1 truncate">
              {smsTodayEntries.length === 0
                ? 'No SMS sent today'
                : `${smsTodayEntries.length} SMS sent across ${new Set(smsTodayEntries.map(e => e.campaignName)).size} campaign${new Set(smsTodayEntries.map(e => e.campaignName)).size === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          title="Refresh SMS log"
          aria-label="Refresh SMS log"
          className={`shrink-0 w-8 h-8 rounded-lg border border-border-light text-ink-secondary hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center cursor-pointer ${loading ? 'animate-spin' : ''}`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Timestamp */}
      <div className="flex items-center justify-between gap-2 -mt-2">
        <p className="text-[10px] text-ink-tertiary font-mono">
          Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <span className="text-[10px] font-semibold text-emerald-700 font-mono">
          Telnyx 10DLC Route
        </span>
      </div>

      {/* Log list */}
      {smsTodayEntries.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border-light rounded-xl bg-off-white/30">
          <Inbox className="w-8 h-8 text-ink-tertiary mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-ink-secondary">No SMS sent yet today</p>
          <p className="text-[11px] text-ink-tertiary mt-1 max-w-xs mx-auto">
            Launch an SMS campaign and each successful send will appear here in real time with the target business and website link.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-0.5">
          <div className="rounded-xl border border-border-light overflow-hidden">
            <div className="divide-y divide-border-light">
              {smsTodayEntries.map((entry, idx) => {
                const isDelivered = entry.status === 'delivered';
                return (
                  <div
                    key={entry.id || idx}
                    className="p-3 sm:p-3.5 hover:bg-off-white/40 transition-colors space-y-2"
                  >
                    {/* Header: Business name, status pill, time */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-ink leading-tight truncate">
                            {entry.businessName}
                          </h4>
                          {entry.city && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface text-ink-secondary text-[9px] font-medium border border-border-light">
                              {entry.city}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-ink-tertiary font-mono mt-0.5">
                          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{entry.phone}</span>
                          <span className="text-ink-tertiary">·</span>
                          <span className="truncate">{entry.campaignName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isDelivered ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold">
                            <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
                            Delivered ✓
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold">
                            <Send className="w-2.5 h-2.5 text-blue-600" />
                            Sent
                          </span>
                        )}
                        <span className="text-[10px] text-ink-tertiary font-mono">
                          {new Date(entry.sentAtTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Site link */}
                    {entry.siteUrl && (
                      <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-surface border border-border-light">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Globe className="w-3 h-3 text-accent shrink-0" />
                          <a
                            href={entry.siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] sm:text-xs font-mono text-ink hover:text-accent truncate transition-colors"
                            title={entry.siteUrl}
                          >
                            {entry.siteUrl.replace(/^https?:\/\//, '')}
                          </a>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopy(entry.siteUrl!, `site-${idx}`)}
                            className="p-1 rounded text-ink-tertiary hover:text-ink hover:bg-white transition-colors cursor-pointer"
                            title="Copy site URL"
                          >
                            {copiedKey === `site-${idx}` ? (
                              <Check className="w-3 h-3 text-success" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <a
                            href={entry.siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-ink-tertiary hover:text-accent hover:bg-white transition-colors cursor-pointer"
                            title="Open live site"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    )}

                    {/* SMS Proposal text preview */}
                    {entry.smsText && (
                      <div className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-start gap-1.5">
                          <MessageSquare className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[8px] uppercase font-bold text-emerald-700 tracking-wider mb-0.5">
                              SMS Text Proposal
                            </p>
                            <p className="text-[10px] sm:text-[11px] text-ink font-sans leading-relaxed line-clamp-2">
                              {entry.smsText}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(entry.smsText!, `sms-${idx}`)}
                          className="shrink-0 p-1 rounded text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                          title="Copy SMS text"
                        >
                          {copiedKey === `sms-${idx}` ? (
                            <Check className="w-3 h-3 text-success" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmsTodayLog;
