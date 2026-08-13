// Unified Recent Campaigns grid.
//
// One surface that shows BOTH site-deploy and email campaigns together,
// with a small type badge on every card so the user always knows which
// engine the row came from. Each card is one-click openable — clicking
// anywhere on the card opens the rich detail modal (re-used from the
// existing site-deploy modal). A small checkbox sits at the top-left of
// every card so the user can select multiple rows and bulk-delete them
// in one tap.
//
// Brand-consistent:
//   • only existing accent / ink / surface tokens
//   • the same audio palette (RecentCampaignsBits already imports these)
//   • loading states use the same shimmer ring as the rest of the table
//   • mobile-first: cards stack on mobile, the select-all toolbar is
//     sticky on the top of the section, and the row checkboxes remain
//     easy to tap (≥ 32px touch target)
//
// Props are intentionally minimal — the parent owns campaigns + setters
// so we never duplicate state. The component is purely a view + a few
// UI-only local states (selection set, modal target, pending delete).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe,
  Mail,
  CheckCircle,
  X,
  Trash2,
  Copy,
  ExternalLink,
  Link2,
  ChevronRight,
  Activity,
  Check,
  AlertTriangle,
  Filter,
  Layers,
} from 'lucide-react';
import { Campaign, CampaignDeployedSite, CampaignEmailLead } from '../types';
import { RunningBadge, SiteUrlRow, DeployedUrlChips, CampaignDetailButton, EditOutreachButton } from './RecentCampaignsBits';
import { TemplateSimPreview } from './TemplateSimPreview';
import { ConfirmDialog } from './ConfirmDialog';
import {
  playCancelTone,
  playConfirmSuccess,
  playSoftTap,
} from '../utils/audio';
import { Template } from '../types';

type FilterTab = 'all' | 'site-deploy' | 'email';

interface UnifiedRecentCampaignsProps {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  templates: Template[];
  customTemplates?: any[];
  // Scroll target id used by App.tsx to land on a specific card after a
  // cross-tab jump. When set, the matching card is briefly highlighted.
  initialScrollToId?: string | null;
  onConsumedScrollTarget?: () => void;
  // Hook for opening a card directly (used when the dashboard's "Open"
  // button jumps the user into the Launch tab). When this id matches a
  // campaign row, we pop the detail modal automatically on mount.
  initialOpenId?: string | null;
  onConsumedInitialOpen?: () => void;
  // Compact mode is used by the Dashboard so the section doesn't blow up
  // and stays as a quick-glance list with the same look-and-feel.
  compact?: boolean;
  // Cross-tab "View details" — fires when the user clicks the View details
  // button on any card. App.tsx uses this to scroll to the
  // `rcard-section` target on the Campaigns page.
  onViewDetails?: (campaignId: string) => void;
  // One-click outreach edit — opens a fresh email wizard with the source
  // campaign's subject/body pre-filled. Only meaningful for email campaigns.
  onEditOutreach?: (campaign: Campaign) => void;
}

const formatDate = (iso: string) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

const getStatusStyle = (status: Campaign['status']) => {
  switch (status) {
    case 'Active':
      return 'bg-accent-soft text-accent border-accent/20';
    case 'Completed':
      return 'bg-success-soft text-success border-success/20';
    case 'Queued':
      return 'bg-warning-soft text-warning border-warning/20';
    case 'Crashed':
      return 'bg-danger-soft text-danger border-danger/20';
    default:
      return 'bg-surface text-ink-secondary border-border-light';
  }
};

export const UnifiedRecentCampaigns: React.FC<UnifiedRecentCampaignsProps> = ({
  campaigns,
  setCampaigns,
  templates,
  customTemplates = [],
  initialScrollToId,
  onConsumedScrollTarget,
  initialOpenId,
  onConsumedInitialOpen,
  compact = false,
  onViewDetails,
  onEditOutreach,
}) => {
  // ── Filter tab (All / Site Deploy / Email) ──
  const [filter, setFilter] = useState<FilterTab>('all');

  // ── Multi-select state ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  // ── Detail modal state ──
  const [openCampaign, setOpenCampaign] = useState<Campaign | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // ── Per-card delete confirmation ──
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  // Track ids mid-collapse so the row fades out before state catches up.
  const [leavingIds, setLeavingIds] = useState<Set<string>>(() => new Set());
  const collapseTimers = useRef<Record<string, number>>({});

  // Track whether the section has entered the viewport for the first time.
  // When it does, the IntersectionObserver adds the `section-animate-in`
  // class so the whole section slides up with a spring bounce.
  const [sectionVisible, setSectionVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sectionVisible) return;
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSectionVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sectionVisible]);

  // Resolve the filtered list — sorted with most-recent first so the user
  // always sees the freshest campaign on top of the grid.
  const visibleCampaigns = useMemo(() => {
    const filtered = campaigns.filter((c) => {
      if (filter === 'all') return true;
      if (filter === 'site-deploy') return c.type === 'site-deploy';
      if (filter === 'email') return c.type === 'email';
      return true;
    });
    return [...filtered].sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
      return bt - at;
    });
  }, [campaigns, filter]);

  const sdCount = useMemo(() => campaigns.filter((c) => c.type === 'site-deploy').length, [campaigns]);
  const emailCount = useMemo(() => campaigns.filter((c) => c.type === 'email').length, [campaigns]);

  // Clear selection when the underlying list changes (so we never try to
  // bulk-delete rows that have already been removed).
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (campaigns.some((c) => c.id === id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [campaigns]);

  // Scroll-to-card when the dashboard sends a target via sessionStorage.
  useEffect(() => {
    if (!initialScrollToId) return;
    const id = initialScrollToId;
    // Defer one frame so the card has time to mount.
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(`rcard-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('scroll-target-pulse');
        window.setTimeout(() => el.classList.remove('scroll-target-pulse'), 1400);
      }
      onConsumedScrollTarget?.();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [initialScrollToId, onConsumedScrollTarget]);

  // Auto-open the detail modal when the dashboard asks us to.
  useEffect(() => {
    if (!initialOpenId) return;
    const target = campaigns.find((c) => c.id === initialOpenId);
    if (target) {
      setOpenCampaign(target);
    }
    onConsumedInitialOpen?.();
  }, [initialOpenId, campaigns, onConsumedInitialOpen]);

  // Cleanup any pending collapse timers on unmount so we don't leak.
  useEffect(() => {
    const timers = collapseTimers.current;
    return () => {
      Object.values(timers).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // ── Helpers ──
  const isAllSelected = visibleCampaigns.length > 0 && visibleCampaigns.every((c) => selectedIds.has(c.id));
  const isSomeSelected = visibleCampaigns.some((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    playSoftTap();
    if (isAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of visibleCampaigns) next.delete(c.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of visibleCampaigns) next.add(c.id);
        return next;
      });
    }
  };

  const toggleSelected = (id: string) => {
    playSoftTap();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCardOpen = (camp: Campaign) => {
    if (camp.status === 'Active') return; // can't open mid-flight
    playSoftTap();
    setOpenCampaign(camp);
  };

  const handleSingleDelete = (id: string) => {
    const camp = campaigns.find((c) => c.id === id);
    if (!camp) return;
    playSoftTap();
    setPendingDelete({ id, name: camp.name });
  };

  const handleDeleteConfirm = () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    // Immediately remove from state — no collapse animation delay.
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    // Also drop any locally-cached SD results.
    try {
      const stored = JSON.parse(localStorage.getItem('lunao_sd_results') || '{}');
      if (stored && id in stored) {
        delete stored[id];
        localStorage.setItem('lunao_sd_results', JSON.stringify(stored));
      }
    } catch { /* ignore */ }
    playCancelTone();
  };

  const handleBatchDeleteConfirm = () => {
    playCancelTone();
    setConfirmBatchDelete(false);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSelectedIds(new Set());
    beginCollapse(ids);
  };

  // Mark rows as leaving so the collapse animation plays, then drop them
  // from state. Shared by single + batch delete so the visual stays in
  // sync with what the user just did.
  const beginCollapse = (ids: string[]) => {
    setLeavingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    for (const id of ids) {
      const existing = collapseTimers.current[id];
      if (existing) window.clearTimeout(existing);
      collapseTimers.current[id] = window.setTimeout(() => {
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        setLeavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // Also drop any locally-cached SD results so the modal can't
        // resurrect this campaign from a stale localStorage entry.
        try {
          const stored = JSON.parse(localStorage.getItem('lunao_sd_results') || '{}');
          if (stored && id in stored) {
            delete stored[id];
            localStorage.setItem('lunao_sd_results', JSON.stringify(stored));
          }
        } catch { /* ignore */ }
        delete collapseTimers.current[id];
      }, 420);
    }
  };

  // ── Render ──
  return (
    <section
      id="rcard-section"
      ref={sectionRef as React.RefObject<HTMLElement>}
      className={`bg-white border border-border-main rounded-xl shadow-sm p-5 sm:p-6 space-y-4 ${sectionVisible ? 'section-animate-in' : ''}`}
      style={compact ? { maxHeight: '520px', overflowY: 'auto' } : undefined}
    >
      {/* Header row — title + filter tabs + bulk-action button */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-xl font-serif text-ink tracking-tight font-normal flex items-center gap-2">
            Recent Campaigns
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-ink-secondary bg-surface border border-border-light px-1.5 py-0.5 rounded-full">
              <Layers className="w-3 h-3" />
              {visibleCampaigns.length}
            </span>
          </h2>
          <p className="text-xs text-ink-secondary">Audit and manage every campaign — site deploys and email sends in one place.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter tabs */}
          <div className="flex bg-off-white border border-border-light p-1 rounded-md shrink-0">
            {([
              { id: 'all', label: 'All', count: campaigns.length },
              { id: 'site-deploy', label: 'Site Deploy', count: sdCount, color: 'text-accent' },
              { id: 'email', label: 'Email', count: emailCount, color: 'text-blue-600' },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { playSoftTap(); setFilter(t.id); }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded inline-flex items-center gap-1 transition-colors ${
                  filter === t.id ? 'bg-white shadow-2xs text-ink' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <span>{t.label}</span>
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold ${
                  filter === t.id ? 'bg-surface text-ink-secondary' : 'bg-white text-ink-tertiary border border-border-light'
                }`}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Bulk delete trigger — only shown when ≥ 1 card is selected */}
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => { playSoftTap(); setConfirmBatchDelete(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-danger text-white text-[11px] font-bold uppercase tracking-wider shadow-sm hover:-translate-y-0.5 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {selectedIds.size}
            </button>
          )}
        </div>
      </header>

      {/* Bulk-select toolbar — sticky to the top of the section so it's
          always reachable when the user scrolls through a long list. */}
      {visibleCampaigns.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-off-white border border-border-light rounded-lg">
          <button
            type="button"
            onClick={toggleSelectAll}
            aria-label={isAllSelected ? 'Deselect all visible campaigns' : 'Select all visible campaigns'}
            className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md border transition-all cursor-pointer ${
              isAllSelected
                ? 'bg-accent border-accent text-white'
                : isSomeSelected
                  ? 'bg-accent-soft border-accent/40 text-accent'
                  : 'bg-white border-border-main text-ink-tertiary hover:border-accent/40'
            }`}
          >
            {isAllSelected ? (
              <Check className="w-3.5 h-3.5" />
            ) : isSomeSelected ? (
              <span className="w-2 h-2 rounded-sm bg-accent" />
            ) : null}
          </button>
          <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
            {selectedIds.size === 0
              ? `${visibleCampaigns.length} campaign${visibleCampaigns.length === 1 ? '' : 's'} — tap the checkboxes to select multiple for bulk delete`
              : `${selectedIds.size} selected`}
          </span>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-[10px] font-semibold text-ink-secondary hover:text-ink uppercase tracking-wider"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* The grid */}
      {visibleCampaigns.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border-light rounded-xl bg-off-white/30">
          <div className="w-12 h-12 rounded-full bg-surface border border-border-light flex items-center justify-center mx-auto mb-2 text-ink-tertiary">
            <Filter className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-ink">No campaigns yet</p>
          <p className="text-xs text-ink-secondary mt-1">Launch a site-deploy or email campaign and it will appear here.</p>
        </div>
      ) : (
        <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
          {visibleCampaigns.map((camp) => (
            <CampaignCard
              key={camp.id}
              camp={camp}
              templates={templates}
              customTemplates={customTemplates}
              isSelected={selectedIds.has(camp.id)}
              isLeaving={leavingIds.has(camp.id)}
              onToggleSelect={() => toggleSelected(camp.id)}
              onOpen={() => handleCardOpen(camp)}
              onDelete={() => handleSingleDelete(camp.id)}
              onViewDetails={() => onViewDetails?.(camp.id)}
              onEditOutreach={onEditOutreach ? () => onEditOutreach(camp) : undefined}
            />
          ))}
        </div>
      )}

      {/* Detail modal — opens when a card is clicked. Re-uses the rich
          layout (stats strip + per-lead log + per-account breakdown +
          deployed site URLs) so the user gets the same info as before
          but now from a single surface. */}
      {openCampaign && (
        <CampaignDetailModal
          camp={openCampaign}
          templates={templates}
          customTemplates={customTemplates}
          copiedUrl={copiedUrl}
          onCopyUrl={() => setCopiedUrl(true)}
          onClose={() => setOpenCampaign(null)}
        />
      )}

      {/* Per-card delete confirmation — brand-consistent, plays playCancelTone
          on confirm, deletes the card from state instantly without animation delay. */}
      <ConfirmDialog
        open={!!pendingDelete}
        tone="danger"
        title={`Delete campaign?`}
        description="This permanently removes the campaign from Recent Campaigns. Any deployed sites and sent emails are not affected."
        confirmLabel="Delete forever"
        targetName={pendingDelete?.name ?? ''}
        icon={<Trash2 className="w-5 h-5" />}
        onConfirm={handleDeleteConfirm}
        onCancel={() => { playSoftTap(); setPendingDelete(null); }}
      />

      {/* Bulk delete confirm — fires the actual collapse + state removal */}
      <ConfirmDialog
        open={confirmBatchDelete}
        tone="danger"
        title={`Delete ${selectedIds.size} campaign${selectedIds.size === 1 ? '' : 's'}?`}
        description="This removes the selected rows from your Recent Campaigns list. Any deployed sites and emails that already went out will not be affected."
        confirmLabel={`Delete ${selectedIds.size}`}
        onConfirm={handleBatchDeleteConfirm}
        onCancel={() => setConfirmBatchDelete(false)}
        icon={<AlertTriangle className="w-5 h-5" />}
      />
    </section>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Shared mini stat pill used inside CampaignCard
// ──────────────────────────────────────────────────────────────────────────
const StatPill: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="flex-1 flex flex-col items-center justify-center py-2.5 px-2 gap-0.5 min-w-0">
    <span className={`text-base font-bold leading-none ${color}`}>{value}</span>
    <span className="text-[9px] text-ink-tertiary uppercase tracking-widest font-semibold leading-none">{label}</span>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Individual card — redesigned for visual clarity:
//   • 20-char stat labels with larger serif numbers
//   • Brand-only color tokens (accent / success / danger)
//   • 2-col mobile grid for more breathing room
//   • Action icons sit cleanly above the banner edge
//   • Deployed site URLs expand inline below the stats row
// ──────────────────────────────────────────────────────────────────────────
interface CampaignCardProps {
  camp: Campaign;
  templates: Template[];
  customTemplates: any[];
  isSelected: boolean;
  isLeaving: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onViewDetails?: () => void;
  onEditOutreach?: () => void;
}

const CampaignCard: React.FC<CampaignCardProps> = ({
  camp,
  templates,
  customTemplates,
  isSelected,
  isLeaving,
  onToggleSelect,
  onOpen,
  onDelete,
  onViewDetails,
  onEditOutreach,
}) => {
  const isRunning = camp.status === 'Active';
  const isSiteDeploy = camp.type === 'site-deploy';
  const isEmail = camp.type === 'email';

  const liveSites = (camp.deployedSites || []).filter((s: CampaignDeployedSite) => s.status === 'live' && s.url);
  const liveCount = liveSites.length;
  const sent = camp.emailsSent ?? 0;
  const failed = camp.emailsFailed ?? 0;
  const sites = camp.sitesGenerated ?? camp.sites ?? 0;
  const leads = camp.leadsFound ?? ((sent + failed) || liveCount || 0);
  const tpl = useMemo(
    () => [...templates, ...customTemplates.map((t) => ({ ...t, preview: '' }))].find((t) => t.id === camp.templateId),
    [templates, customTemplates, camp.templateId],
  );

  const statusColor = isRunning
    ? 'bg-accent-soft text-accent border-accent/20'
    : camp.status === 'Completed'
      ? 'bg-success-soft text-success border-success/20'
      : camp.status === 'Crashed'
        ? 'bg-danger-soft text-danger border-danger/20'
        : 'bg-warning-soft text-warning border-warning/20';

  const typeBadge = isEmail ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 text-[9px] font-bold uppercase tracking-wider shrink-0">
      <Mail className="w-3 h-3" /> Email Campaign
    </span>
  ) : isSiteDeploy ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20 text-[9px] font-bold uppercase tracking-wider shrink-0">
      <Globe className="w-3 h-3" /> Site Deploy
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface text-ink-secondary border border-border-light text-[9px] font-bold uppercase tracking-wider shrink-0">
      SMS
    </span>
  );

  return (
    <div
      id={`rcard-${camp.id}`}
      className={`relative bg-white border rounded-2xl overflow-hidden transition-all group ${
        isLeaving ? 'animate-campaign-row-collapse' : ''
      } ${
        isSelected
          ? 'border-accent ring-2 ring-accent/20 shadow-md'
          : 'border-border-light hover:border-accent/30 hover:shadow-lg hover:-translate-y-1'
      } ${isRunning ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-card-control="true"]')) return;
        onOpen();
      }}
    >
      {/* ── Floating action strip — sits on top of banner so the icons never
          obscure the template thumb or title. ── */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between pointer-events-none">
        {/* Selection checkbox */}
        <button
          type="button"
          data-card-control="true"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          aria-label={isSelected ? `Deselect ${camp.name}` : `Select ${camp.name}`}
          aria-pressed={isSelected}
          className={`pointer-events-auto inline-flex items-center justify-center w-7 h-7 rounded-xl border-2 transition-all cursor-pointer shadow-sm ${
            isSelected
              ? 'bg-accent border-accent text-white'
              : 'bg-white/95 border-white/60 text-ink-tertiary hover:border-accent/60 hover:text-accent'
          }`}
        >
          {isSelected && <Check className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Status pill */}
          {isRunning ? (
            <RunningBadge label="Running" />
          ) : (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusColor}`}>
              {camp.status}
            </span>
          )}
          {/* Delete */}
          <button
            type="button"
            data-card-control="true"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label={`Delete ${camp.name}`}
            title="Delete campaign"
            className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-white/95 border border-white/60 text-ink-tertiary hover:text-danger hover:border-danger/40 hover:bg-danger-soft transition-all cursor-pointer shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Banner: template thumb fills the card top ── */}
      <div className="h-24 bg-gradient-to-br from-accent/8 via-accent/4 to-white relative overflow-hidden">
        {tpl ? (
          <div className="absolute inset-0 opacity-50">
            <TemplateSimPreview id={tpl.id} name={tpl.name} niche={tpl.niche} badge="" isMostUsed={tpl.isMostUsed} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {isEmail ? (
              <Mail className="w-10 h-10 text-accent/30" />
            ) : (
              <Globe className="w-10 h-10 text-accent/30" />
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border-light to-transparent" />
      </div>

      {/* ── Card body ── */}
      <div className="p-4 space-y-3">
        {/* Title + type row */}
        <div className="space-y-1.5">
          <h3
            className="text-sm font-semibold text-ink leading-tight line-clamp-2 pr-2"
            title={camp.name}
          >
            {camp.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {typeBadge}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface text-ink-secondary border border-border-light text-[9px] font-bold uppercase tracking-wider">
              {camp.niche}
            </span>
          </div>
        </div>

        {/* ── Stats row — large numbers, brand tokens ── */}
        <div className="flex items-stretch gap-0 rounded-xl overflow-hidden border border-border-light bg-off-white">
          {isEmail ? (
            <>
              <StatPill label="Sites" value={sites} color="text-accent" />
              <div className="w-px bg-border-light" />
              <StatPill label="Sent" value={sent} color="text-success" />
              {failed > 0 && (
                <>
                  <div className="w-px bg-border-light" />
                  <StatPill label="Failed" value={failed} color="text-danger" />
                </>
              )}
            </>
          ) : (
            <>
              <StatPill label="Sites" value={liveCount || camp.sites || 0} color="text-accent" />
              <div className="w-px bg-border-light" />
              <StatPill label="Leads" value={leads} color="text-ink" />
            </>
          )}
        </div>

        {/* ── Date stamp ── */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-ink-tertiary font-mono">
            {formatDate(camp.createdAt)}
          </span>
          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
            camp.status === 'Active'
              ? 'bg-accent-soft text-accent border-accent/20'
              : camp.status === 'Completed'
                ? 'bg-success-soft text-success border-success/20'
                : camp.status === 'Crashed'
                  ? 'bg-danger-soft text-danger border-danger/20'
                  : 'bg-warning-soft text-warning border-warning/20'
          }`}>
            {camp.status}
          </span>
        </div>

        {/* ── Deployed site URLs — inline, scrollable on mobile ── */}
        {isEmail && liveSites.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border-light">
            <p className="text-[9px] text-ink-tertiary font-bold uppercase tracking-widest">
              Deployed Sites
            </p>
            <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
              {liveSites.slice(0, 4).map((site: CampaignDeployedSite, idx: number) => (
                <div key={`${site.slug}-${idx}`} className="flex items-center gap-1.5 min-w-0">
                  <Link2 className="w-3 h-3 text-accent shrink-0" />
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={site.url}
                    className="flex-1 min-w-0 text-[10px] text-ink-secondary hover:text-accent font-mono truncate transition-colors"
                  >
                    {site.url.replace(/^https?:\/\//, '')}
                  </a>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open site"
                    className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md text-ink-tertiary hover:text-accent hover:bg-accent-soft transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
              {liveSites.length > 4 && (
                <p className="text-[9px] text-accent font-semibold">+{liveSites.length - 4} more sites</p>
              )}
            </div>
          </div>
        )}

        {/* ── Footer actions ── */}
        <div className="flex items-center justify-between pt-2 border-t border-border-light gap-2">
          <span className="text-[10px] text-ink-secondary truncate flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-ink-tertiary group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
            <span className="group-hover:text-accent transition-colors">
              {isRunning ? 'Live — wait to finish' : 'Click for full details'}
            </span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isRunning && onEditOutreach && isEmail && (
              <EditOutreachButton onClick={onEditOutreach} />
            )}
            {!isRunning && onViewDetails && (
              <CampaignDetailButton onClick={onViewDetails} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Detail modal — used for BOTH campaign types
// ──────────────────────────────────────────────────────────────────────────
interface CampaignDetailModalProps {
  camp: Campaign;
  templates: Template[];
  customTemplates: any[];
  copiedUrl: boolean;
  onCopyUrl: () => void;
  onClose: () => void;
}

const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({
  camp,
  templates,
  customTemplates,
  copiedUrl,
  onCopyUrl,
  onClose,
}) => {
  const isEmail = camp.type === 'email';
  const isSiteDeploy = camp.type === 'site-deploy';
  const tpl = useMemo(
    () => [...templates, ...customTemplates.map((t) => ({ ...t, preview: '' }))].find((t) => t.id === camp.templateId),
    [templates, customTemplates, camp.templateId],
  );

  const deployedSites: CampaignDeployedSite[] = camp.deployedSites || [];
  const emailLeads: CampaignEmailLead[] = camp.emailLeads || [];

  const liveSites = deployedSites.filter((s) => s.status === 'live' && s.url);
  const sent = camp.emailsSent ?? 0;
  const failed = camp.emailsFailed ?? 0;
  const sites = camp.sitesGenerated ?? camp.sites ?? 0;

  const statusMeta: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    Completed: { bg: 'bg-success-soft', text: 'text-success', border: 'border-success/20', dot: 'bg-success' },
    Active: { bg: 'bg-accent-soft', text: 'text-accent', border: 'border-accent/20', dot: 'bg-accent' },
    Crashed: { bg: 'bg-danger-soft', text: 'text-danger', border: 'border-danger/20', dot: 'bg-danger' },
    Queued: { bg: 'bg-warning-soft', text: 'text-warning', border: 'border-warning/20', dot: 'bg-warning' },
  };
  const meta = statusMeta[camp.status] ?? { bg: 'bg-surface', text: 'text-ink', border: 'border-border-main', dot: 'bg-ink-tertiary' };

  // Per-account stats — prefer the persisted breakdown, fall back to
  // counting distinct from-emails on the per-lead log.
  const accountStats: { accountEmail: string; sent: number; failed: number }[] = useMemo(() => {
    if (camp.emailAccountsUsed && camp.emailAccountsUsed.length > 0) {
      return camp.emailAccountsUsed.map((a) => ({ accountEmail: a.accountEmail, sent: a.sent, failed: a.failed }));
    }
    const byAcc: Record<string, { sent: number; failed: number }> = {};
    for (const l of emailLeads) {
      const key = l.accountEmail || 'unknown';
      if (!byAcc[key]) byAcc[key] = { sent: 0, failed: 0 };
      if (l.status === 'sent') byAcc[key].sent += 1;
      else if (l.status === 'failed') byAcc[key].failed += 1;
    }
    return Object.entries(byAcc).map(([accountEmail, v]) => ({ accountEmail, ...v }));
  }, [camp.emailAccountsUsed, emailLeads]);

  return (
    <div
      className="fixed inset-0 bg-ink/45 z-[80] flex items-start justify-center p-4 overflow-y-auto backdrop-blur-xs animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white border border-border-main rounded-2xl shadow-2xl w-full max-w-2xl my-6 flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-accent-soft/60 to-white border-b border-border-light">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute top-4 right-4">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white border border-border-light flex items-center justify-center text-ink-secondary hover:text-ink hover:bg-off-white transition-all shadow-sm cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-start gap-4 pr-10">
            <div className="w-20 h-14 rounded-xl overflow-hidden border-2 border-accent/20 shadow-sm shrink-0 bg-surface flex items-center justify-center">
              {tpl ? (
                <TemplateSimPreview id={tpl.id} name={tpl.name} niche={tpl.niche} badge="" isMostUsed={tpl.isMostUsed} />
              ) : isEmail ? (
                <Mail className="w-8 h-8 text-blue-500/60" />
              ) : (
                <Globe className="w-8 h-8 text-accent/30" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-lg font-serif font-semibold text-ink leading-tight truncate">{camp.name}</h3>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.bg} ${meta.text} ${meta.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {camp.status}
                </span>
                {/* Type badge — keeps the user oriented inside the modal */}
                {isEmail ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-soft text-accent border border-accent/20 text-[11px] font-bold uppercase tracking-wider">
                    <Mail className="w-3.5 h-3.5" /> Email Campaign
                  </span>
                ) : isSiteDeploy ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-soft text-accent border border-accent/20 text-[11px] font-bold uppercase tracking-wider">
                    <Globe className="w-3.5 h-3.5" /> Site Deploy
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-ink-secondary">{camp.niche} · {camp.createdAt}</p>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className={`grid ${isEmail ? 'grid-cols-4' : 'grid-cols-3'} divide-x divide-border-light border-b border-border-light`}>
          {isEmail ? (
            <>
              <StatBlock label="Sites Live" value={sites} icon={<Globe className="w-4 h-4" />} color="text-accent" />
              <StatBlock label="Emails Sent" value={sent} icon={<Mail className="w-4 h-4" />} color="text-success" />
              <StatBlock label="Failed" value={failed} icon={<X className="w-4 h-4" />} color={failed > 0 ? 'text-danger' : 'text-ink-tertiary'} />
              <StatBlock label="Accounts" value={accountStats.length} icon={<Activity className="w-4 h-4" />} color="text-ink" />
            </>
          ) : (
            <>
              <StatBlock label="Sites Deployed" value={liveSites.length || camp.sites || 0} icon={<Globe className="w-4 h-4" />} color="text-accent" />
              <StatBlock label="Leads" value={camp.leadsFound || liveSites.length} icon={<Activity className="w-4 h-4" />} color="text-blue-600" />
              <StatBlock label="Failed" value={deployedSites.length - liveSites.length} icon={<X className="w-4 h-4" />} color={(deployedSites.length - liveSites.length) > 0 ? 'text-danger' : 'text-ink-tertiary'} />
            </>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isSiteDeploy ? (
            <SiteDeployBody liveSites={liveSites} onCopyUrl={onCopyUrl} copiedUrl={copiedUrl} />
          ) : (
            <EmailBody leads={emailLeads} accountStats={accountStats} copiedUrl={copiedUrl} onCopyUrl={onCopyUrl} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-light bg-off-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-ink-secondary min-w-0">
            {isEmail ? <Mail className="w-4 h-4 shrink-0" /> : <Globe className="w-4 h-4 shrink-0" />}
            <span className="truncate">{isEmail ? 'Email Campaign' : 'Site Deploy Campaign'} · {tpl?.name ?? camp.templateId ?? 'Template unknown'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Helper sub-components (kept local — they're only used here) ──
const StatBlock: React.FC<{ label: string; value: number | string; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className="flex flex-col items-center justify-center py-4 gap-1.5">
    <div className={`${color} opacity-70`}>{icon}</div>
    <span className="text-xl font-bold font-mono text-ink">{value}</span>
    <span className="text-[10px] text-ink-tertiary uppercase tracking-wider font-semibold">{label}</span>
  </div>
);

const SiteDeployBody: React.FC<{
  liveSites: CampaignDeployedSite[];
  copiedUrl: boolean;
  onCopyUrl: () => void;
}> = ({ liveSites, copiedUrl, onCopyUrl }) => {
  const handleCopy = async (url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch { /* ignore */ }
    onCopyUrl();
    window.setTimeout(() => onCopyUrl(), 1400);
    playConfirmSuccess();
  };
  if (liveSites.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-ink-secondary">
        <Globe className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No live deployments yet.</p>
        <p className="text-[11px] text-ink-tertiary mt-1">Once the pipeline finishes, every site link appears here.</p>
      </div>
    );
  }
  return (
    <div className="px-6 py-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-4 h-4 text-accent" />
        <h4 className="text-sm font-bold text-ink">Deployed Sites</h4>
      </div>
      <div className="space-y-2">
        {liveSites.map((s, idx) => (
          <div key={s.slug + idx} className="flex items-start gap-3 p-3 rounded-xl border border-border-main hover:border-accent/30 transition-all bg-white">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-accent-soft text-accent">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-bold text-ink leading-tight">{s.name}</p>
                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border bg-success-soft text-success border-success/20">
                  Live
                </span>
              </div>
              {s.city && (
                <p className="text-[10px] text-ink-secondary mt-0.5">{s.city}</p>
              )}
              <div className="mt-1.5 flex items-center gap-1.5 min-w-0">
                <Link2 className="w-3 h-3 text-accent shrink-0" />
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 text-[10px] text-ink hover:text-accent font-mono truncate transition-colors"
                  title={s.url}
                >
                  {s.url.replace(/^https?:\/\//, '')}
                </a>
                <button
                  type="button"
                  onClick={() => handleCopy(s.url)}
                  aria-label="Copy URL"
                  className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-ink-tertiary hover:text-accent hover:bg-accent-soft transition-colors"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                </button>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open in new tab"
                  className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-ink-tertiary hover:text-accent hover:bg-accent-soft transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const EmailBody: React.FC<{
  leads: CampaignEmailLead[];
  accountStats: { accountEmail: string; sent: number; failed: number }[];
  copiedUrl: boolean;
  onCopyUrl: () => void;
}> = ({ leads, accountStats }) => {
  const [copied, setCopied] = useState<{ row: number; which: 'url' | 'email' } | null>(null);
  const handleCopy = async (text: string, row: number, which: 'url' | 'email') => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied({ row, which });
    window.setTimeout(() => setCopied((c) => (c?.row === row && c.which === which ? null : c)), 1400);
    playConfirmSuccess();
  };

  if (leads.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-ink-secondary">
        <Mail className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No per-prospect data yet.</p>
        <p className="text-[11px] text-ink-tertiary mt-1">Once emails go out, the prospect list with status + URLs appears here.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-3">
      {/* Per-account breakdown */}
      {accountStats.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest font-semibold">Sent by account</p>
          <div className="space-y-1.5">
            {accountStats.map((acc, i) => {
              const total = acc.sent + acc.failed;
              const pct = total > 0 ? Math.round((acc.sent / total) * 100) : 0;
              return (
                <div key={acc.accountEmail + i} className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <Mail className="w-3 h-3 text-accent shrink-0" />
                    <span className="font-mono text-ink truncate flex-1 min-w-0">{acc.accountEmail}</span>
                    <span className="text-success font-bold tabular-nums">{acc.sent}</span>
                    {acc.failed > 0 && <span className="text-danger font-bold tabular-nums">/{acc.failed}</span>}
                  </div>
                  <div className="h-1 bg-off-white rounded-full overflow-hidden">
                    <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-prospect log */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-ink-tertiary uppercase tracking-widest font-semibold">Per-prospect log ({leads.length})</p>
        <div className="max-h-72 overflow-y-auto divide-y divide-border-light border border-border-light rounded-lg">
          {leads.map((row, i) => {
            const isSent = row.status === 'sent';
            const isQueued = row.status === 'queued';
            const pill = isSent
              ? 'bg-success-soft text-success border-success/25'
              : isQueued
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-danger/10 text-danger border-danger/25';
            const pillLabel = isSent ? 'Sent' : isQueued ? 'Queued' : 'Failed';
            return (
              <div key={`${row.leadId ?? row.email ?? row.name}-${i}`} className="px-3 py-2.5 space-y-1">
                <div className="flex items-start gap-2 min-w-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    isSent ? 'bg-success-soft text-success' : isQueued ? 'bg-amber-50 text-amber-600' : 'bg-danger/10 text-danger'
                  }`}>
                    {isSent ? <CheckCircle className="w-3.5 h-3.5" /> : isQueued ? <Activity className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink leading-tight truncate" title={row.name}>{row.name || 'Prospect'}</p>

                    {/* Deployed site URL — the primary copy target, shown FIRST
                        (most actionable — user wants to share the live page). */}
                    {row.siteUrl && (
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <Link2 className="w-3 h-3 text-accent shrink-0" />
                        <a
                          href={row.siteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-0 text-[10px] text-ink hover:text-accent font-mono truncate transition-colors"
                          title={row.siteUrl}
                        >
                          {row.siteUrl.replace(/^https?:\/\//, '')}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopy(row.siteUrl!, i, 'url')}
                          aria-label="Copy site URL"
                          className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-ink-tertiary hover:text-accent hover:bg-accent-soft transition-colors"
                        >
                          {copied?.row === i && copied.which === 'url' ? (
                            <Check className="w-3 h-3 text-success" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <a
                          href={row.siteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open site"
                          className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-ink-tertiary hover:text-accent hover:bg-accent-soft transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {/* Business email address — secondary info, shown BELOW the
                        deployed site URL. Slightly smaller and muted. */}
                    <div className="flex items-center gap-1 mt-0.5 min-w-0">
                      <Mail className="w-2.5 h-2.5 text-ink-tertiary shrink-0" />
                      <span className="text-[10px] text-ink-tertiary font-mono truncate flex-1 min-w-0" title={row.email}>{row.email || '—'}</span>
                      {row.email && (
                        <button
                          type="button"
                          onClick={() => handleCopy(row.email!, i, 'email')}
                          aria-label="Copy prospect email"
                          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-ink-tertiary hover:text-accent hover:bg-accent-soft transition-colors"
                        >
                          {copied?.row === i && copied.which === 'email' ? (
                            <Check className="w-3 h-3 text-success" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${pill}`}>
                    {pillLabel}
                  </span>
                </div>
                {row.reason && (
                  <p className="pl-8 text-[10px] text-danger leading-snug">{row.reason}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Avoid a confusing default — we don't want this imported accidentally
// in places that need a single-card surface.
export default UnifiedRecentCampaigns;