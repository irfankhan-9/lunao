// SitesSection — live, brand-consistent "Sites Generated" panel for the
// Dashboard. Powers the user's request to see sites generated through both
// the Site Deploy flow AND the Email Campaign flow in a single surface, with
// separate badges so they can tell which campaign type produced each site.
//
// Design notes (must stay consistent with EmailsTodayLog and the rest of the
// Dashboard):
//   • Only existing accent / ink / surface / success tokens — no new palette.
//   • Mobile-first responsive (1-column card layout on phones, table layout on
//     md+; both share the same data shape).
//   • Polls the backend every 5s while visible so freshly-deployed sites
//     appear in near-real-time when a campaign finishes.
//   • Copy-to-clipboard per row, with a brief ✓ confirmation chip.
//   • Filter pills ("All" / "Site Deploy" / "Email Campaign") let the user
//     narrow the directory without leaving the dashboard.
//   • Two stat pills in the header show the total counts split by source, so
//     the user can see at a glance how many sites each pipeline produced.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Globe, ExternalLink, Copy, Check, RefreshCw, Search,
  Mail, Sparkles, Layers, Phone, MapPin, Inbox, Filter,
} from 'lucide-react';
import { fetchAllSites, SiteRow, SitesCounts, SiteSource } from '../lib/pipelineClient';
import { playSoftTap } from '../utils/audio';

type SourceFilter = 'all' | SiteSource;

// Per-source visual config — keeps the badge colors tied to a single token
// palette so they harmonize with the rest of the dashboard.
const SOURCE_META: Record<SiteSource, {
  label: string; icon: React.ReactNode; pill: string; rowAccent: string;
}> = {
  email: {
    label: 'Email Campaign',
    icon: <Mail className="w-3 h-3" />,
    pill: 'bg-success-soft text-success border-success/25',
    rowAccent: 'border-l-success/40',
  },
  'site-deploy': {
    label: 'Site Deploy',
    icon: <Sparkles className="w-3 h-3" />,
    pill: 'bg-accent-soft text-accent border-accent/25',
    rowAccent: 'border-l-accent/40',
  },
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
    return u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

// Distinct campaign count for the subtitle ("12 sites across 5 campaigns").
function countDistinctCampaigns(rows: SiteRow[]): number {
  const ids = new Set<string>();
  for (const r of rows) {
    const id = r.campaign_id || r.campaign_name || '';
    if (id) ids.add(id);
  }
  return ids.size;
}

export const SitesSection: React.FC<{ ownerKey: string }> = ({ ownerKey }) => {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [counts, setCounts] = useState<SitesCounts>({ total: 0, siteDeploy: 0, email: 0 });
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async (src: SourceFilter) => {
    setLoading(true);
    try {
      const data = await fetchAllSites(ownerKey, src === 'all' ? { limit: 200 } : { source: src, limit: 200 });
      setRows(Array.isArray(data.sites) ? data.sites : []);
      // counts from server already reflect the filter, so only merge if "all"
      setCounts(data.counts || { total: 0, siteDeploy: 0, email: 0 });
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not reach the sites endpoint.');
    } finally {
      setLastRefresh(new Date());
      setLoading(false);
    }
  };

  useEffect(() => {
    load(filter);
    const id = setInterval(() => load(filter), 5000);
    return () => clearInterval(id);
    // filter changes re-mount the polling loop so we re-query under the new
    // ownerKey + source combination promptly. ESLint can't see `load` reading
    // from `filter`, so the disable is intentional here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, filter]);

  const copyUrl = async (e: React.MouseEvent, id: string, url: string) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard may be blocked — silently skip */
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.business_name || '').toLowerCase().includes(q) ||
      (r.campaign_name || '').toLowerCase().includes(q) ||
      (r.niche || '').toLowerCase().includes(q) ||
      (r.city || '').toLowerCase().includes(q) ||
      (r.phone || '').toLowerCase().includes(q) ||
      (r.site_url || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Total counts across both sources (the full directory size — independent
  // of the active filter, so the user always knows how many sites exist).
  const [globalCounts, setGlobalCounts] = useState<SitesCounts>({ total: 0, siteDeploy: 0, email: 0 });
  useEffect(() => {
    if (filter !== 'all') {
      // Pull the all-source totals once so the header pills remain accurate
      // even when the user has filtered the table to a single source.
      fetchAllSites(ownerKey, { limit: 200 }).then((d) => {
        if (d.counts) setGlobalCounts(d.counts);
      });
    } else {
      setGlobalCounts(counts);
    }
  }, [filter, counts, ownerKey]);

  return (
    <div className="bg-white border border-border-main rounded-xl shadow-2xs p-4 sm:p-5 space-y-4">
      {/* Header — title + live badge + global counts + refresh */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-accent-soft flex items-center justify-center border border-accent/20 shrink-0">
            <Globe className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-ink leading-none">Sites Generated</h3>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent-soft text-accent border border-accent/20">
                <span className="w-1.5 h-1.5 rounded-full bg-accent mr-1 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[11px] text-ink-secondary mt-1 truncate">
              {rows.length === 0
                ? 'No sites generated yet'
                : `${globalCounts.total} site${globalCounts.total === 1 ? '' : 's'} across ${countDistinctCampaigns(rows)} campaign${countDistinctCampaigns(rows) === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { playSoftTap(); load(filter); }}
          title="Refresh"
          aria-label="Refresh sites"
          className={`shrink-0 w-8 h-8 rounded-lg border border-border-light text-ink-secondary hover:text-accent hover:bg-accent-soft transition-colors flex items-center justify-center cursor-pointer ${loading ? 'animate-spin' : ''}`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Two stat pills split by source — always shows the FULL directory
          count regardless of the active table filter. */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <SourcePill
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label="Site Deploy"
          count={globalCounts.siteDeploy}
          color="accent"
          active={filter === 'site-deploy'}
          onClick={() => { playSoftTap(); setFilter(filter === 'site-deploy' ? 'all' : 'site-deploy'); }}
        />
        <SourcePill
          icon={<Mail className="w-3.5 h-3.5" />}
          label="Email Campaign"
          count={globalCounts.email}
          color="success"
          active={filter === 'email'}
          onClick={() => { playSoftTap(); setFilter(filter === 'email' ? 'all' : 'email'); }}
        />
      </div>

      {/* Filter row — segmented control + search (mobile-friendly) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="inline-flex p-0.5 bg-off-white rounded-lg border border-border-light shrink-0 self-start">
          {([
            { id: 'all', label: 'All', icon: <Layers className="w-3 h-3" /> },
            { id: 'site-deploy', label: 'Site Deploy', icon: <Sparkles className="w-3 h-3" /> },
            { id: 'email', label: 'Email Campaign', icon: <Mail className="w-3 h-3" /> },
          ] as { id: SourceFilter; label: string; icon: React.ReactNode }[]).map((opt) => {
            const active = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => { playSoftTap(); setFilter(opt.id); }}
                className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-ink shadow-3xs border border-border-light'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {opt.icon}
                <span className="hidden sm:inline">{opt.label}</span>
                <span className="sm:hidden">{opt.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-ink-tertiary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, campaign, niche, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-off-white border border-border-light rounded-md text-[11px] text-ink placeholder:text-ink-tertiary focus:bg-white focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none font-sans"
          />
        </div>
      </div>

      {/* Last refreshed / error chip — silent on success */}
      {(lastRefresh || error) && (
        <div className="flex items-center justify-between gap-2 -mt-2">
          {lastRefresh && !error && (
            <p className="text-[10px] text-ink-tertiary font-mono">
              Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
          {error && (
            <p className="text-[10px] text-danger font-mono truncate" title={error}>
              {error}
            </p>
          )}
          {filter !== 'all' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-ink-secondary font-mono shrink-0">
              <Filter className="w-3 h-3" />
              Showing {filteredRows.length} of {rows.length}
            </span>
          )}
        </div>
      )}

      {/* Site rows — desktop table (md+) and mobile cards (sm-) */}
      {filteredRows.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border-light rounded-xl bg-off-white/30">
          <Inbox className="w-8 h-8 text-ink-tertiary mx-auto mb-2" />
          <p className="text-sm font-semibold text-ink-secondary">
            {search ? 'No sites match your search' : 'No sites generated yet'}
          </p>
          <p className="text-[11px] text-ink-tertiary mt-1 max-w-xs mx-auto">
            {search
              ? 'Try a different name, campaign, or niche.'
              : 'Launch a Site Deploy or Email campaign and each deployed mockup will appear here in real time.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table layout */}
          <div className="hidden md:block bg-white border border-border-light rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-off-white border-b border-border-light text-ink-secondary text-[10px] font-sans font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Business</th>
                    <th className="py-2.5 px-3">Source</th>
                    <th className="py-2.5 px-3">Campaign</th>
                    <th className="py-2.5 px-3">Deployed Site</th>
                    <th className="py-2.5 px-3">When</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light text-xs text-ink font-sans">
                  {filteredRows.slice(0, 25).map((r) => {
                    const meta = SOURCE_META[r.source];
                    const id = `${r.source}::${r.campaign_id}::${r.lead_id}`;
                    return (
                      <tr key={id} className="hover:bg-off-white/50 transition-colors">
                        <td className="py-3 px-3 align-top">
                          <div className="font-semibold text-ink leading-tight truncate max-w-[200px]" title={r.business_name}>
                            {r.business_name}
                          </div>
                          <div className="text-[10px] text-ink-secondary truncate max-w-[200px] flex items-center gap-1.5 mt-0.5">
                            {r.city && (
                              <>
                                <MapPin className="w-2.5 h-2.5 text-ink-tertiary shrink-0" />
                                <span className="truncate">{r.city}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${meta.pill}`}>
                            {meta.icon}
                            <span>{meta.label}</span>
                          </span>
                          {r.niche && (
                            <div className="text-[9px] text-ink-tertiary uppercase tracking-wider mt-1">
                              {r.niche}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 align-top max-w-[180px]">
                          <div className="font-medium text-ink truncate" title={r.campaign_name || 'Untitled'}>
                            {r.campaign_name || 'Untitled'}
                          </div>
                          <div className="text-[10px] text-ink-tertiary font-mono truncate" title={r.campaign_id}>
                            {r.campaign_id}
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top max-w-[240px]">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={r.site_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={r.site_url}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent-soft text-accent border border-accent/20 hover:bg-accent hover:text-white hover:border-accent transition-colors text-[10px] font-semibold min-w-0"
                            >
                              <Globe className="w-3 h-3 shrink-0" />
                              <span className="font-mono truncate min-w-0">{shortHost(r.site_url)}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                            <button
                              type="button"
                              onClick={(e) => copyUrl(e, id, r.site_url)}
                              title="Copy URL"
                              className="p-1 rounded bg-off-white hover:bg-surface border border-border-main transition-colors cursor-pointer inline-flex items-center shrink-0"
                            >
                              {copiedId === id ? (
                                <Check className="w-3 h-3 text-success" />
                              ) : (
                                <Copy className="w-3 h-3 text-ink-secondary" />
                              )}
                            </button>
                            {copiedId === id && (
                              <span className="text-[10px] text-success font-semibold shrink-0">Copied!</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="text-[11px] font-mono text-ink">{formatTime(r.created_at)}</div>
                          <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{formatDate(r.created_at)}</div>
                        </td>
                        <td className="py-3 px-3 align-top text-right">
                          <a
                            href={r.site_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 bg-off-white hover:bg-surface border border-border-main text-[10px] font-bold text-ink rounded cursor-pointer"
                          >
                            <span>Visit</span>
                            <ExternalLink className="w-3 h-3 text-ink-secondary" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <ul className="space-y-2 md:hidden max-h-[320px] overflow-y-auto pr-1 -mr-1">
            {filteredRows.slice(0, 25).map((r) => {
              const meta = SOURCE_META[r.source];
              const id = `${r.source}::${r.campaign_id}::${r.lead_id}`;
              return (
                <li
                  key={id}
                  className={`flex flex-col gap-2.5 p-3 rounded-lg border border-border-light bg-white border-l-4 ${meta.rowAccent} hover:border-accent/30 transition-all`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-[12px] font-bold text-ink leading-tight truncate" title={r.business_name}>
                        {r.business_name}
                      </h4>
                      {r.city && (
                        <p className="text-[10px] text-ink-secondary mt-0.5 flex items-center gap-1 truncate">
                          <MapPin className="w-2.5 h-2.5 text-ink-tertiary shrink-0" />
                          <span className="truncate">{r.city}</span>
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${meta.pill}`}>
                      {meta.icon}
                      <span>{meta.label}</span>
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-ink-tertiary shrink-0">Campaign</span>
                      <span className="text-[11px] font-semibold text-ink truncate" title={r.campaign_name || 'Untitled'}>
                        {r.campaign_name || 'Untitled'}
                      </span>
                    </div>
                    {r.phone && (
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <Phone className="w-3 h-3 text-ink-tertiary shrink-0" />
                        <span className="font-mono text-ink-secondary truncate">{r.phone}</span>
                      </div>
                    )}
                  </div>

                  <a
                    href={r.site_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 max-w-full px-2 py-1.5 rounded-md bg-accent-soft text-accent border border-accent/20 hover:bg-accent hover:text-white hover:border-accent transition-colors text-[11px] font-semibold"
                  >
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="font-mono truncate min-w-0">{shortHost(r.site_url)}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-light">
                    <div className="text-[10px] text-ink-tertiary font-mono shrink-0">
                      {formatTime(r.created_at)} · {formatDate(r.created_at)}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => copyUrl(e, id, r.site_url)}
                      title="Copy URL"
                      className="inline-flex items-center gap-1 px-2 py-1 bg-off-white hover:bg-surface border border-border-main rounded text-[10px] cursor-pointer shrink-0"
                    >
                      {copiedId === id ? (
                        <>
                          <Check className="w-3 h-3 text-success" />
                          <span className="text-success font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-ink-secondary" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {filteredRows.length > 25 && (
            <p className="text-[10px] text-ink-tertiary text-center pt-1">
              Showing the 25 most recent · {filteredRows.length - 25} more available in the Sites tab.
            </p>
          )}
        </>
      )}
    </div>
  );
};

// ----- SourcePill -----------------------------------------------------------
// A clickable stat pill that doubles as a filter toggle. Tap once to filter
// the table to that source; tap again (or tap the active "All" pill) to clear.
const SourcePill: React.FC<{
  icon: React.ReactNode;
  label: string;
  count: number;
  color: 'accent' | 'success';
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, count, color, active, onClick }) => {
  const palette = color === 'accent'
    ? {
      base: 'border-accent/20 bg-accent-soft text-accent',
      active: 'border-accent bg-accent text-white shadow-3xs',
    }
    : {
      base: 'border-success/20 bg-success-soft text-success',
      active: 'border-success bg-success text-white shadow-3xs',
    };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left cursor-pointer transition-all hover:-translate-y-0.5 ${
        active ? palette.active : palette.base
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-white' : ''}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[9px] font-bold uppercase tracking-wider ${active ? 'text-white/80' : 'opacity-80'}`}>
          {label}
        </div>
        <div className="text-lg font-serif leading-none mt-0.5">
          {count.toLocaleString()}
        </div>
      </div>
    </button>
  );
};

export default SitesSection;