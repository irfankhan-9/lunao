import React, { useState, useEffect, useRef } from 'react';
import { Campaign, SidebarTab, Business } from '../types';
import {
  Play, Pause, ExternalLink, Calendar, Plus,
  ChevronRight, ChevronLeft, Search, Copy, Check, Globe, Phone, Mail
} from 'lucide-react';
import { playTiktokLike, playSoftTap } from '../utils/audio';
import { RunningBadge, SiteUrlRow, DeployedUrlChips } from './RecentCampaignsBits';
import { UnifiedRecentCampaigns } from './UnifiedRecentCampaigns';
import { EmailsTodayLog } from './EmailsTodayLog';
import { SitesSection } from './SitesSection';
import { fetchDashboardStats, DashboardStats } from '../lib/pipelineClient';


interface DashboardProps {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  setActiveTab: (tab: SidebarTab) => void;
  setCampToEdit?: (camp: Campaign | null) => void;
  setSelectedTemplate?: (templateId: string) => void;
  setPreviewTemplateId?: (id: string | null) => void;
  businesses: Business[];
  // One-shot scroll-into-view target. Dashboard sets this right before
  // navigating to a different tab (e.g. "Manage all campaigns" → land
  // on the Site Deploy card strip in the Campaigns page). App.tsx's
  // useEffect consumes it and clears it after the scroll.
  setScrollTarget?: (targetId: string | null) => void;
  // "View details" handler — fires when a user clicks the eye button on
  // a Recent Campaign card. App.tsx navigates to the Campaigns tab and
  // scrolls to the matching card.
  onViewDetails?: (campaignId: string) => void;
  // "Edit outreach" handler — fires when a user clicks the pencil button
  // on an email campaign row. App.tsx navigates to the Campaigns tab and
  // pre-fills the email wizard with the source campaign's subject/body.
  onEditOutreach?: (campaign: Campaign) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  campaigns,
  setCampaigns,
  setActiveTab,
  businesses,
  setCampToEdit,
  setSelectedTemplate,
  setPreviewTemplateId,
  setScrollTarget,
  onViewDetails,
  onEditOutreach,
}) => {
  const [viewMode, setViewMode] = useState<'summary' | 'deployed-sites'>('summary');
  const [animatingBtn, setAnimatingBtn] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const handleNavClick = (btnId: string, action: () => void) => {
    playTiktokLike();
    setAnimatingBtn(btnId);
    // 150ms after button click starts, trigger the whole page exit animation
    setTimeout(() => {
      setIsExiting(true);
    }, 150);

    // Switch the tab after the exit animation is almost finished
    setTimeout(() => {
      action();
      setIsExiting(false);
      setAnimatingBtn(null);
    }, 450);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Cross-tab jump state. When the user clicks "Manage all campaigns" or
  // "Open" on a row, we stash the intent in `pendingJumpToCardId` and the
  // UnifiedRecentCampaigns on the Campaigns tab reads it on mount, scrolls
  // to the right card, and pops the detail modal automatically.
  const [pendingJumpToCardId, setPendingJumpToCardId] = useState<string | null>(null);

  // Real stats — counted only from actual campaigns you've run.
  const totalSites = campaigns.reduce((acc, c) => acc + (c.sites || 0), 0);
  const totalSms = campaigns.reduce((acc, c) => acc + (c.smsSent || 0), 0);

  // Dashboard "today" counters — sites deployed since 00:00 and emails sent
  // since 00:00. Polled every 5s so the cards stay live while a campaign
  // runs in the background. Each delta change triggers an animate-counter-pop
  // on the new digit, and a brief +N flash chip beneath the number.
  //
  // ownerKey MUST match what the rest of the app uses when creating email
  // campaigns, otherwise the `email_logs` JOIN in /api/email-logs/today
  // returns zero rows and the live feed looks empty even though campaigns
  // ran. `localStorage.lunao_owner_key` is the single source of truth — set
  // the moment the user lands on the EmailCampaignWizard / OAuth flow.
  const DASHBOARD_OWNER_KEY = React.useMemo(() => {
    try {
      return localStorage.getItem('lunao_owner_key') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  }, []);
  // Re-read ownerKey if it ever changes mid-session (plan upgrade, OAuth
  // callback, etc.) so the dashboard starts polling under the new id.
  const [ownerKey, setOwnerKey] = React.useState<string>(DASHBOARD_OWNER_KEY);
  useEffect(() => {
    const refresh = () => {
      try {
        setOwnerKey(localStorage.getItem('lunao_owner_key') || 'dashboard');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('lunao_owner_key_changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('lunao_owner_key_changed', refresh);
    };
  }, []);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsPulse, setStatsPulse] = useState<{ sites: number; emails: number }>({ sites: 0, emails: 0 });
  const prevStatsRef = useRef<DashboardStats | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await fetchDashboardStats(ownerKey);
      if (cancelled || !next) return;
      const prev = prevStatsRef.current;
      if (prev) {
        const sitesDelta = Math.max(0, next.sitesDeployedToday - prev.sitesDeployedToday);
        const emailsDelta = Math.max(0, next.emailsSentToday - prev.emailsSentToday);
        if (sitesDelta > 0 || emailsDelta > 0) {
          setStatsPulse({ sites: sitesDelta, emails: emailsDelta });
          if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
          pulseTimerRef.current = setTimeout(() => {
            setStatsPulse({ sites: 0, emails: 0 });
          }, 6000);
        }
      }
      prevStatsRef.current = next;
      setStats(next);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [ownerKey]);

  // Toggle status of campaign
  const toggleCampaignStatus = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id === id) {
        const nextStatus = c.status === 'Active' ? 'Paused' : 'Active';
        return { ...c, status: nextStatus };
      }
      return c;
    }));
  };

  // Card pending deletion moved into UnifiedRecentCampaigns — every row's
  // delete button opens the brand-consistent ConfirmDialog there, and the
  // single-card + bulk-delete flows share the exact same handler.

  const isWaitingForLast = (campId: string) => {
    const idx = campaigns.findIndex(c => c.id === campId);
    if (idx === -1) return false;
    return campaigns.slice(idx + 1).some(c => c.status === 'Active');
  };

  // Helper to map business to its corresponding campaign name dynamically
  const getCampaignForBusiness = (biz: Business) => {
    const matchedCamp = campaigns.find(c => c.niche.toLowerCase() === biz.niche.toLowerCase());
    return matchedCamp ? matchedCamp.name : `${biz.city.split(',')[0]} Local Campaign`;
  };

  // Copy site preview URL to Clipboard
  const handleCopyUrl = (e: React.MouseEvent, id: string, url: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Businesses that have active deployed sites (status exists as deployed / sms sent / claimed)
  const deployedBusinesses = businesses.filter(biz => biz.siteStatus !== 'Not started');

  // Build the unified deployed-sites directory used by the "Deployed
  // Sites Directory" view. We flatten EVERY live deployment from
  // EVERY site-deploy campaign in `campaigns` (not just the static
  // businesses stub) so the dashboard reflects real work the user did.
  // The flattened rows are shaped like `Business` so the table below
  // doesn't need a fork in its render path.
  const campaignDeployedSites: Array<Business & { _campaignName: string; _campaignId: string; _campaignStatus: string }> = [];
  for (const camp of campaigns) {
    if (camp.type !== 'site-deploy') continue;
    for (const site of camp.deployedSites || []) {
      if (site.status !== 'live' || !site.url) continue;
      campaignDeployedSites.push({
        // Use campaign+slug as the row id so React keys stay stable
        // and copy/click handlers can address the right row.
        id: `${camp.id}::${site.slug}`,
        _campaignId: camp.id,
        _campaignName: camp.name,
        _campaignStatus: camp.status,
        name: site.name,
        owner: '',
        phone: '',
        city: site.city || '',
        niche: camp.niche,
        webStatus: 'live' as const,
        siteStatus: 'Converted' as const,
        slug: site.slug,
        smsHistory: [],
        siteUrl: site.url,
      });
    }
  }

  // Merge campaign-derived rows (the freshest signal — these came from
  // the actual pipeline the user ran) with the static demo rows from
  // the businesses array. Campaign rows come first so they always
  // appear at the top of the directory.
  const allDeployedSites = [...campaignDeployedSites, ...deployedBusinesses];

  // Filter deployed businesses by search query
  const filteredDeployed = allDeployedSites.filter(biz => {
    const campaignName = (biz as any)._campaignName || getCampaignForBusiness(biz);
    const textQuery = searchQuery.toLowerCase();
    return (
      biz.name.toLowerCase().includes(textQuery) ||
      biz.owner.toLowerCase().includes(textQuery) ||
      biz.phone.includes(searchQuery) ||
      biz.niche.toLowerCase().includes(textQuery) ||
      campaignName.toLowerCase().includes(textQuery) ||
      biz.siteUrl.toLowerCase().includes(textQuery)
    );
  });

  return (
    <div
      id="dashboard-tab-content-root"
      className={`space-y-6 sm:space-y-8 font-sans transition-all duration-300 ease-in-out ${
        isExiting
          ? 'opacity-0 scale-[0.97] blur-[2px] translate-y-2'
          : 'animate-fade-in opacity-100 scale-100 blur-0 translate-y-0'
      }`}
    >
      
      {/* Dynamic View Mode Router: Summary Dashboard or Deployed Sites List */}
      {viewMode === 'summary' ? (
        <>
          {/* Main Summary Header */}
          <header id="dashboard-view-header" className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border-main gap-4">
            <div id="dashboard-title-and-lead" className="space-y-1 text-left">
              <h1 id="dashboard-top-heading" className="text-4xl font-serif text-ink tracking-tight font-normal">Dashboard</h1>
              <p id="dashboard-sub-heading" className="text-sm text-ink-secondary">Welcome back to your Lunao command center.</p>
            </div>
            <div id="dashboard-actions-header" className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded border border-border-main text-xs text-ink-secondary font-medium font-sans shadow-3xs">
                <Calendar className="w-4 h-4 text-ink-secondary" />
                <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <button
                type="button"
                id="header-create-campaign-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleNavClick('create-campaign', () => setActiveTab('campaigns'));
                }}
                className={`group flex items-center gap-2 bg-white px-3 py-2 rounded border border-border-main text-xs text-ink hover:text-accent hover:border-accent font-sans font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-3xs ${
                  animatingBtn === 'create-campaign' ? 'scale-95' : ''
                }`}
              >
                <Plus className="w-4 h-4 text-accent transition-transform duration-300 group-hover:rotate-90" />
                <span>Launch</span>
              </button>
            </div>
          </header>

          {/* Metrics Row — 2 brand-consistent cards:
              1. Sites Generated (lifetime)
              2. Emails Sent Today — counts up live while email sends complete.
              Both share the same `group relative bg-white rounded-[16px] p-6`
              template so the visual rhythm is identical. */}
          <div id="metrics-card-row-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl">

            {/* Card 1 — Sites Generated. Clicking the card scrolls the user
                down to the live Sites Section (which now renders directly
                on the dashboard, fed by `/api/sites/all` so BOTH site-deploy
                and email-campaign sites show up under one roof). */}
            <button
              type="button"
              id="metric-card-sites"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playSoftTap();
                const el = document.getElementById('dashboard-sites-generated');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`group relative bg-white rounded-[16px] p-6 text-left border shadow-[0_4px_16px_rgba(37,99,235,0.02)] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent overflow-hidden isolate hover:-translate-y-1.5 hover:shadow-[0_16px_32px_rgba(37,99,235,0.06)] border-border-light hover:border-accent/30 active:scale-[0.96] active:translate-y-[2px] active:shadow-[0_4px_12px_rgba(37,99,235,0.1),0_0_0_5px_rgba(37,99,235,0.08)] active:border-accent active:duration-[100ms]`}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 group-active:duration-100 transition-opacity duration-500 ease-out -z-10 rounded-[16px]"></div>
              <div className="flex items-center justify-between text-ink-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> Sites Generated
                </span>
                <ChevronRight className="w-4 h-4 text-ink-tertiary group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-4xl sm:text-5xl font-serif text-ink tracking-tight leading-none mt-3 animate-counter-pop">
                {totalSites.toLocaleString()}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-light">
                <span className="text-[11px] text-ink-secondary">Lifetime real deployments</span>
                <span className="text-[11px] text-accent font-bold uppercase tracking-wider group-hover:underline">Directory →</span>
              </div>
            </button>

            {/* Card 2 — Emails Sent Today. Polled live and springs up whenever
                `emailsSentToday` increases. Clicking scrolls the user up to
                the live `Emails Today Log` so they can audit per-send
                details (campaign name, recipient, deployed site link). */}
            <button
              type="button"
              id="metric-card-emails"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playSoftTap();
                const el = document.getElementById('dashboard-emails-today-log');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`group relative bg-white rounded-[16px] p-6 text-left border shadow-[0_4px_16px_rgba(37,99,235,0.02)] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent overflow-hidden isolate hover:-translate-y-1.5 hover:shadow-[0_16px_32px_rgba(37,99,235,0.06)] border-border-light hover:border-accent/30 active:scale-[0.96] active:translate-y-[2px] active:shadow-[0_4px_12px_rgba(37,99,235,0.1),0_0_0_5px_rgba(37,99,235,0.08)] active:border-accent active:duration-[100ms]`}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 group-active:duration-100 transition-opacity duration-500 ease-out -z-10 rounded-[16px]"></div>
              <div className="flex items-center justify-between text-ink-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Emails Today
                </span>
                <ChevronRight className="w-4 h-4 text-ink-tertiary group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-4xl sm:text-5xl font-serif text-success tracking-tight leading-none mt-3 animate-counter-pop">
                {(stats?.emailsSentToday ?? 0).toLocaleString()}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-light gap-2">
                <span className="text-[11px] text-ink-secondary">Since midnight</span>
                {statsPulse.emails > 0 ? (
                  <span
                    key={`emails-pulse-${statsPulse.emails}-${stats?.emailsSentToday ?? 0}`}
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-success-soft text-success border border-success/25 animate-ribbon-stamp"
                  >
                    <span aria-hidden>▲</span>
                    +{statsPulse.emails} just now
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
                    {(stats?.emailsSentTotal ?? 0).toLocaleString()} lifetime
                  </span>
                )}
              </div>
            </button>

          </div>

          {/* Live email send log — synced every 5 seconds, shows per-send
              campaign name, account, recipient, time, delivery status and
              a one-click link to the deployed site for the prospect. The
              wrapping `id` is the scroll target the "Emails Today" metric
              tile jumps to. */}
          <div id="dashboard-emails-today-log" className="scroll-mt-24">
            <EmailsTodayLog ownerKey={ownerKey} />
          </div>

          {/* Live sites directory — every site ever generated for this owner
              across BOTH the Site Deploy pipeline AND the Email Campaign
              pipeline. Filterable by source, searchable by name / city /
              niche, and shows campaign attribution + deployed URL with one-
              click copy / visit. Synced every 5 seconds. */}
          <div id="dashboard-sites-generated" className="scroll-mt-24">
            <SitesSection ownerKey={ownerKey} />
          </div>

          {/* Main Grid Content: Recent Campaigns — unified surface */}
          <div id="dashboard-one-column-layout" className="space-y-6">

            <div id="dashboard-campaigns-table-container" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 id="recent-campaigns-section-title" className="text-xl font-serif text-ink tracking-tight">Recent Campaigns</h2>
                <button
                  type="button"
                  id="view-all-campaigns-link"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (setScrollTarget) setScrollTarget('rcard-section');
                    setActiveTab('campaigns');
                  }}
                  className="text-xs font-bold uppercase tracking-wide text-accent hover:text-accent-hover flex items-center gap-1 cursor-pointer"
                >
                  <span>Manage all campaigns</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <UnifiedRecentCampaigns
                campaigns={campaigns}
                setCampaigns={setCampaigns}
                templates={[]}
                customTemplates={[]}
                compact
                onViewDetails={onViewDetails}
                onEditOutreach={onEditOutreach}
              />
            </div>

          </div>
        </>
      ) : (
        /* DEPLOYED SITES SUB-VIEW / DIRECTORY */
        <div id="deployed-sites-section-wrapper" className="space-y-6 animate-fade-in text-left">
          
          {/* Header Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border-main gap-4">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewMode('summary'); }}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-secondary hover:text-ink transition-colors pb-1 group cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span>Back to Dashboard</span>
              </button>
              <h1 className="text-3xl font-serif text-ink tracking-tight font-normal">Deployed Sites Directory</h1>
              <p className="text-xs text-ink-secondary">Review live layout previews, source marketing campaigns, and business contact phone numbers.</p>
            </div>

            {/* Searching form */}
            <div className="relative w-full sm:max-w-xs shrink-0">
              <Search className="w-3.5 h-3.5 text-ink-tertiary absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search name, phone, niche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-border-main rounded text-xs text-ink placeholder:text-ink-tertiary focus:ring-1 focus:ring-accent focus:outline-none shadow-3xs font-sans"
              />
            </div>
          </div>

          {/* Table list - Desktop Layout */}
          <div className="bg-white rounded-lg border border-border-main overflow-hidden shadow-sm hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-off-white border-b border-border-main text-ink-secondary text-[10px] font-sans font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Business / Barber Name</th>
                    <th className="py-3 px-4">Source Marketing Campaign</th>
                    <th className="py-3 px-4">Contact Phone</th>
                    <th className="py-3 px-4">Deployed Site Preview Link</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light text-xs text-ink font-sans">
                  {filteredDeployed.map((biz) => {
                    const campaignName = (biz as any)._campaignName || getCampaignForBusiness(biz);
                    const fromCampaign = Boolean((biz as any)._campaignName);
                    const campaignId = (biz as any)._campaignId as string | undefined;
                    return (
                      <tr key={biz.id} className={`hover:bg-off-white/50 transition-colors group ${fromCampaign ? 'bg-accent-soft/[0.04]' : ''}`}>
                        {/* Barber Title & Owner */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-ink text-sm flex items-center gap-1.5">
                            {biz.name}
                            {fromCampaign && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-accent-soft text-accent border border-accent/20">
                                Live
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-ink-secondary">
                            {biz.owner ? `Owner: ${biz.owner}` : fromCampaign ? 'From recent campaign' : 'Owner: Representative'}
                          </div>
                        </td>

                        {/* Deployment Campaign */}
                        <td className="py-3.5 px-4">
                          {fromCampaign && campaignId ? (
                            <button
                              type="button"
                              onClick={() => {
                                // Land the user on the matching card in
                                // the Site Deploy card strip and open
                                // its detail modal in one motion.
                                try { sessionStorage.setItem('lunao_pending_open_campaign', campaignId); } catch { /* ignore */ }
                                if (setScrollTarget) setScrollTarget(`sd-card-${campaignId}`);
                                setActiveTab('campaigns');
                              }}
                              className="font-medium text-accent hover:text-accent-hover hover:underline text-left cursor-pointer"
                              title="Open this campaign in the Launch section"
                            >
                              {campaignName}
                            </button>
                          ) : (
                            <div className="font-medium text-ink">{campaignName}</div>
                          )}
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-accent-soft text-accent text-[9px] font-bold uppercase mt-0.5">
                            {biz.niche}
                          </span>
                        </td>

                        {/* Representative phone */}
                        <td className="py-3.5 px-4">
                          {biz.phone ? (
                            <>
                              <div className="font-mono text-xs text-ink-secondary flex items-center gap-1.5">
                                <Phone className="w-3 h-3 text-ink-tertiary" />
                                <span>{biz.phone}</span>
                              </div>
                              <span className="text-[9px] text-ink-tertiary font-sans block mt-0.5">{biz.city}</span>
                            </>
                          ) : (
                            <span className="text-[10px] text-ink-tertiary">{biz.city || '—'}</span>
                          )}
                        </td>

                        {/* Live Site Preview URL */}
                        <td className="py-3.5 px-4 font-mono text-[11px] max-w-[260px] truncate">
                          <div className="flex items-center gap-2">
                            <a 
                              href={biz.siteUrl} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-accent underline hover:text-accent-hover truncate flex items-center gap-1 font-medium"
                            >
                              <Globe className="w-3.5 h-3.5 inline text-accent/70 shrink-0" />
                              <span>{biz.siteUrl ? biz.siteUrl.replace(/^https?:\/\//, '') : `${biz.slug}.lunao.io`}</span>
                            </a>
                            
                            <button
                              onClick={(e) => handleCopyUrl(e, biz.id, biz.siteUrl)}
                              title="Copy layout link to clipboard"
                              className="p-1 rounded bg-off-white hover:bg-surface border border-border-main transition-colors cursor-pointer inline-flex items-center shrink-0"
                            >
                              {copiedId === biz.id ? (
                                <Check className="w-3 h-3 text-success" />
                              ) : (
                                <Copy className="w-3 h-3 text-ink-secondary" />
                              )}
                            </button>
                            {copiedId === biz.id && (
                              <span className="text-[10px] text-success font-semibold shrink-0">Copied!</span>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            biz.siteStatus === 'Converted' ? 'bg-success-soft text-success border border-success/20' :
                            biz.siteStatus === 'SMS sent' ? 'bg-accent-soft text-accent border border-accent/20' :
                            'bg-warning-soft text-warning border border-warning/10'
                          }`}>
                            ✓ {biz.siteStatus}
                          </span>
                        </td>

                        {/* Open Website Button */}
                        <td className="py-3.5 px-4 text-right">
                          <a
                            href={biz.siteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-off-white hover:bg-surface border border-border-main text-[11px] font-bold text-ink rounded shadow-3xs cursor-pointer"
                          >
                            <span>Visit Site</span>
                            <ExternalLink className="w-3 h-3 text-ink-secondary" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredDeployed.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-ink-secondary text-sm font-sans">
                        No deployed sites fit your searching filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards list - Mobile Layout Grid */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredDeployed.map(biz => {
              const campaignName = (biz as any)._campaignName || getCampaignForBusiness(biz);
              const fromCampaign = Boolean((biz as any)._campaignName);
              const campaignId = (biz as any)._campaignId as string | undefined;
              return (
                <div key={biz.id} className={`bg-white rounded-lg p-5 border shadow-2xs space-y-4 ${fromCampaign ? 'border-accent/30' : 'border-border-main'}`}>

                  {/* Top Name Block */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5 flex-wrap">
                        <span>{biz.name}</span>
                        {fromCampaign && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-accent-soft text-accent border border-accent/20">
                            Live
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-ink-secondary mt-0.5">
                        {biz.owner ? `Owner: ${biz.owner}` : fromCampaign ? 'From recent campaign' : 'Owner: Representative'}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      biz.siteStatus === 'Converted' ? 'bg-success-soft text-success border border-success/20' :
                      biz.siteStatus === 'SMS sent' ? 'bg-accent-soft text-accent border border-accent/20' :
                      'bg-warning-soft text-warning border border-warning/10'
                    }`}>
                      {biz.siteStatus}
                    </span>
                  </div>

                  {/* Metadata information block */}
                  <div className="bg-off-white p-3 rounded space-y-2 text-xs">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-ink-secondary shrink-0">Campaign:</span>
                      {fromCampaign && campaignId ? (
                        <button
                          type="button"
                          onClick={() => {
                            try { sessionStorage.setItem('lunao_pending_open_campaign', campaignId); } catch { /* ignore */ }
                            if (setScrollTarget) setScrollTarget(`sd-card-${campaignId}`);
                            setActiveTab('campaigns');
                          }}
                          className="font-semibold text-accent hover:text-accent-hover hover:underline text-right truncate cursor-pointer"
                          title="Open this campaign in the Launch section"
                        >
                          {campaignName}
                        </button>
                      ) : (
                        <span className="font-semibold text-ink text-right truncate">{campaignName}</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">Niche:</span>
                      <span className="font-semibold text-accent uppercase text-[10px] tracking-wider">{biz.niche}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">Phone:</span>
                      <span className="font-mono text-ink font-medium">{biz.phone || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">City:</span>
                      <span className="text-ink">{biz.city || '—'}</span>
                    </div>
                  </div>

                  {/* Links and URL with Copy action code */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-border-light">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <a 
                        href={biz.siteUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-accent underline truncate font-medium flex items-center gap-1"
                      >
                        <Globe className="w-3.5 h-3.5 text-accent/70 shrink-0" />
                        <span className="truncate">{biz.siteUrl ? biz.siteUrl.replace(/^https?:\/\//, '') : `${biz.slug}.lunao.io`}</span>
                      </a>
                      
                      <button
                        onClick={(e) => handleCopyUrl(e, biz.id, biz.siteUrl)}
                        className="flex items-center gap-1 px-2 py-1 bg-off-white hover:bg-surface border border-border-main rounded text-xs cursor-pointer shrink-0"
                      >
                        {copiedId === biz.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-success" />
                            <span className="text-[10px] text-success font-semibold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-ink-secondary" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    <a
                      href={biz.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full text-center py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded shadow-3xs cursor-pointer flex items-center justify-center gap-1 mt-1"
                    >
                      <span>Visit Site Preview</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                </div>
              );
            })}
            {filteredDeployed.length === 0 && (
              <div className="text-center py-8 text-ink-secondary text-xs">
                No matching deployed sites.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};
