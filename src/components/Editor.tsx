import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Code2, ArrowLeft, Save, UploadCloud, Image as ImageIcon,
  Send, Monitor, Smartphone, Wand2, Loader2, ExternalLink, X,
  Rocket, AlertCircle, Pencil, CheckCircle2, Link2,
  Globe, Copy, Eye, Search, RefreshCw, Clock,
  Puzzle, MessageCircle, UserPlus, Sparkles,
  Download, Trash2, Layout, Key, ChevronDown,
  History, FolderOpen, Eraser, Shuffle, FlaskConical, BookmarkPlus,
  FileCode, RotateCcw, Check, ChevronRight, PanelLeftOpen, PanelRightOpen,
} from 'lucide-react';
import {
  listSites, getSiteHtml, saveSiteHtml, deploySite, streamAiEdit,
  getAddons, setAddons, SiteAddons,
  EditorSite, AiChatMessage,
  listInviteCodes, InviteCode,
  listSiteHistory, createSiteHistory, convertHistoryToTemplate,
  SiteHistoryEntry, processUploadedHtml,
} from '../lib/pipelineClient';
import {
  playSoftTap, playTiktokLike, playSlideTick, playDialogPop, playSoftBubble,
  playElegantBell, playConfirmSuccess, playVictoryCelebration, playGentleChime,
  playElegantError, playCancelTone, playMagicWhoosh,
} from '../utils/audio';
import { InviteClientDrawer } from './InviteClientDrawer';
import { TemplateLabPage } from './TemplateLabPage';

interface EditorProps {
  active: boolean;
}

type Toast = { type: 'success' | 'error' | 'info'; text: string } | null;

// Human-friendly "updated" label for site cards.
function relTime(ms: number | null): string {
  if (!ms) return 'recently';
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

function monogram(title: string): string {
  const clean = title.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return (clean.charAt(0) || 'S').toUpperCase();
}

// Curated, intentional sound design for the Site Editor so every interaction
// feels distinctly "Lunao". Each semantic event maps to one consistent tone:
//   tap     — light navigation/secondary press (soft tactile)
//   toggle  — switching a view/mode (mechanical tick)
//   open    — a panel/modal/screen opens (upward pop)
//   engage  — entering edit mode (satisfying bubble)
//   primary — energetic primary action (TikTok-like double pop)
//   copy    — something copied (crystalline bell)
//   swap    — an image is replaced (organic bubble)
//   saved   — save succeeded (bright confirm chord)
//   deployed— site went live (cascading celebration)
//   aiDone  — AI finished writing (gentle chime)
//   error   — something failed (warm double low pulse)
//   close   — dismiss/cancel (downward tone)
const sfx = {
  tap: playSoftTap,
  toggle: playSlideTick,
  open: playDialogPop,
  engage: playSoftBubble,
  primary: playTiktokLike,
  copy: playElegantBell,
  swap: playSoftBubble,
  saved: playConfirmSuccess,
  deployed: playVictoryCelebration,
  aiDone: () => playGentleChime(3),
  magic: playMagicWhoosh,     // AI starts generating a template
  error: playElegantError,
  close: playCancelTone,
};

export const Editor: React.FC<EditorProps> = ({ active }) => {
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [sites, setSites] = useState<EditorSite[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<EditorSite | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loadingSite, setLoadingSite] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [editMode, setEditMode] = useState(false);
  // On mobile only one panel is visible at a time (segmented switch).
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('preview');
  const [saving, setSaving] = useState(false);

  // First-page filtering (real, runs over the loaded sites).
  const [search, setSearch] = useState('');
  const [filterNiche, setFilterNiche] = useState('All');
  const [deploying, setDeploying] = useState(false);
  const [deployInfo, setDeployInfo] = useState<{ url: string; deployUrl: string | null; dryRun: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Image edit panel
  const [imgPanel, setImgPanel] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const selectedImgRef = useRef<HTMLImageElement | null>(null);

  // Add-ons (booking chatbot)
  const [addonsPanel, setAddonsPanel] = useState(false);
  const [addons, setAddonsState] = useState<SiteAddons>({ booking: false, chatbot: false });
  const [addonBusy, setAddonBusy] = useState<null | 'chatbot'>(null);

  // Invite client (per-site LUNAO-XXXX-XXXX codes)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0);

  // Template Lab — unified AI site builder
  const [labOpen, setLabOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false); // reserved for future
  const [browseOpen, setBrowseOpen] = useState(false);

  // AI chat
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlRef = useRef('');
  const lastPreviewPush = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const flashToast = (t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3500);
  };

  // ---- list loading --------------------------------------------------------
  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const { sites: s, aiEnabled: ai } = await listSites();
      setSites(s);
      setAiEnabled(ai);
      setListLoaded(true);
    } catch (err: any) {
      setListError(err?.message || 'Could not load your deployed sites.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && !listLoaded && !listLoading) loadList();
  }, [active, listLoaded, listLoading, loadList]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // ---- invite codes loading ----------------------------------------------
  const loadInviteCodes = useCallback(async (s: string) => {
    try {
      const list = await listInviteCodes(s);
      setInviteCodes(list);
    } catch {
      setInviteCodes([]);
    }
  }, []);

  useEffect(() => {
    if (selected) loadInviteCodes(selected.slug);
  }, [selected, inviteRefreshKey, loadInviteCodes]);

  // Refresh the active-count badge whenever the drawer closes
  // (it may have created/revoked codes inside).
  const activeInviteCount = inviteCodes.filter((c) => !c.revokedAt).length;

  // ---- open / load a single site ------------------------------------------
  const openSite = async (site: EditorSite) => {
    sfx.open();
    setSelected(site);
    setView('edit');
    setLoadingSite(true);
    setMessages([]);
    setEditMode(false);
    setMobileTab('preview');
    setImgPanel(false);
    setAddonsPanel(false);
    setDeployInfo(null);
    setDirty(false);
    try {
      const html = await getSiteHtml(site.slug);
      htmlRef.current = html;
      setPreviewHtml(html);
      getAddons(site.slug)
        .then((a) => setAddonsState(a))
        .catch(() => setAddonsState({ booking: false, chatbot: false }));
    } catch (err: any) {
      flashToast({ type: 'error', text: err?.message || 'Failed to load site HTML.' });
      setView('list');
    } finally {
      setLoadingSite(false);
    }
  };

  const backToList = () => {
    sfx.close();
    setView('list');
    setSelected(null);
    setPreviewHtml('');
    htmlRef.current = '';
    setImgPanel(false);
    selectedImgRef.current = null;
  };

  // ---- iframe wiring -------------------------------------------------------
  // Read the live DOM (with inline edits) back into our canonical html string.
  const syncFromIframe = useCallback((): string => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !doc.documentElement) return htmlRef.current;
    const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    htmlRef.current = html;
    return html;
  }, []);

  const applyEditModeToDoc = useCallback((on: boolean) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    try {
      doc.designMode = on ? 'on' : 'off';
    } catch { /* ignore */ }

    const imgs = Array.from(doc.images || []);
    imgs.forEach((img) => {
      (img as HTMLImageElement).style.outline = on ? '2px dashed rgba(37,99,235,0.6)' : '';
      (img as HTMLImageElement).style.cursor = on ? 'pointer' : '';
    });
  }, []);

  const handleImgClick = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'IMG') {
      e.preventDefault();
      e.stopPropagation();
      selectedImgRef.current = target as HTMLImageElement;
      setImgUrl((target as HTMLImageElement).getAttribute('src') || '');
      setImgPanel(true);
      sfx.open();
    }
  }, []);

  const onIframeLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    // Track edits to mark the site dirty.
    doc.addEventListener('input', () => setDirty(true));
    doc.addEventListener('click', handleImgClick, true);
    applyEditModeToDoc(editMode);
  };

  useEffect(() => {
    applyEditModeToDoc(editMode);
    if (!editMode) setImgPanel(false);
  }, [editMode, previewHtml, applyEditModeToDoc]);

  const toggleEditMode = () => {
    // Editing only makes sense over the live preview.
    setMobileTab('preview');
    setEditMode((v) => {
      if (v) sfx.tap(); else sfx.engage();
      return !v;
    });
  };

  // ---- image replace -------------------------------------------------------
  const applyImageUrl = () => {
    if (selectedImgRef.current && imgUrl.trim()) {
      selectedImgRef.current.src = imgUrl.trim();
      setDirty(true);
      sfx.swap();
      flashToast({ type: 'success', text: 'Image updated from URL.' });
      setImgPanel(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedImgRef.current) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (selectedImgRef.current && typeof reader.result === 'string') {
        selectedImgRef.current.src = reader.result; // data URI embeds the image
        setDirty(true);
        sfx.swap();
        flashToast({ type: 'success', text: 'Image uploaded & embedded.' });
        setImgPanel(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ---- save / deploy -------------------------------------------------------
  const handleSave = async () => {
    if (!selected) return;
    sfx.tap();
    const html = syncFromIframe();
    setSaving(true);
    try {
      await saveSiteHtml(selected.slug, html);
      setDirty(false);
      sfx.saved();
      flashToast({ type: 'success', text: 'Changes saved.' });
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!selected) return;
    sfx.primary();
    const html = syncFromIframe();
    setDeploying(true);
    try {
      const { url } = await deploySite(selected.slug, html);
      setDirty(false);
      // The clean, stable public URL is where the edited site now lives.
      setDeployInfo({ url: selected.url, deployUrl: url, dryRun: !url });
      sfx.deployed();
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Deploy failed.' });
    } finally {
      setDeploying(false);
    }
  };

  const copyDeployUrl = () => {
    if (!deployInfo) return;
    navigator.clipboard.writeText(deployInfo.url);
    sfx.copy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---- Add-ons (booking + chatbot) -----------------------------------------
  const toggleAddon = async (kind: 'chatbot') => {
    if (!selected || addonBusy) return;
    sfx.toggle();
    const next: SiteAddons = { ...addons, [kind]: !addons[kind] };
    setAddonBusy(kind);
    try {
      // Persist any in-progress inline edits first so the widget injects on top
      // of the latest version, then re-inject/remove the widget block.
      const current = syncFromIframe();
      await saveSiteHtml(selected.slug, current);
      const { addons: applied, html: newHtml } = await setAddons(selected.slug, next);
      setAddonsState(applied);
      htmlRef.current = newHtml;
      setPreviewHtml(newHtml);
      setDirty(true);
      sfx.saved();
      flashToast({
        type: 'success',
        text: `Booking chatbot ${next[kind] ? 'enabled' : 'removed'} — Redeploy to push live.`,
      });
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Could not update add-ons.' });
    } finally {
      setAddonBusy(null);
    }
  };

  // ---- AI chat -------------------------------------------------------------
  const sendAi = async () => {
    const instruction = chatInput.trim();
    if (!instruction || streaming) return;
    if (!aiEnabled) {
      sfx.error();
      flashToast({ type: 'error', text: 'AI editor needs an Anthropic key on the server.' });
      return;
    }
    sfx.tap();
    const baseHtml = syncFromIframe();
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: 'user', content: instruction }, { role: 'assistant', content: '' }]);
    setChatInput('');
    setStreaming(true);

    try {
      const finalHtml = await streamAiEdit(
        { html: baseHtml, instruction, history },
        (fullSoFar) => {
          const now = Date.now();
          if (now - lastPreviewPush.current > 350) {
            lastPreviewPush.current = now;
            setPreviewHtml(fullSoFar);
          }
        },
      );
      htmlRef.current = finalHtml;
      setPreviewHtml(finalHtml);
      setDirty(true);
      sfx.aiDone();
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: 'Done — preview updated. Review it, then Save or Redeploy.' };
        return next;
      });
    } catch (err: any) {
      sfx.error();
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: `⚠ ${err?.message || 'AI edit failed.'}` };
        return next;
      });
      // Restore the pre-edit preview.
      setPreviewHtml(htmlRef.current);
    } finally {
      setStreaming(false);
    }
  };

  // ===========================================================================
  // TemplateLabPage component imported below
  // LAB OPEN — full-page Template Lab
  // ===========================================================================

  if (labOpen) {
    return (
      <TemplateLabPage
        aiEnabled={aiEnabled}
        onClose={() => { sfx.close(); setLabOpen(false); }}
        onBrowseTemplates={() => { sfx.open(); setBrowseOpen(true); }}
        flashToast={flashToast}
      />
    );
  }

  // ===========================================================================
  // LIST VIEW
  // ===========================================================================
  if (view === 'list') {
    const niches = ['All', ...Array.from(new Set(sites.map((s) => s.niche)))];
    const q = search.trim().toLowerCase();
    const filteredSites = sites.filter(
      (s) =>
        (filterNiche === 'All' || s.niche === filterNiche) &&
        (q === '' || s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)),
    );

    return (
      <div key="editor-list" className="max-w-[1400px] mx-auto animate-editor-rise">
        {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

        {/* Error */}
        {listError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-danger-soft border border-danger/20 text-danger mb-6">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm font-sans">{listError}</div>
          </div>
        )}

        {/* Hero header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-sm shrink-0">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-sans tracking-tight text-ink leading-tight">Site Editor</h1>
              <p className="text-sm text-ink-secondary font-sans max-w-xl mt-1">
                Pick a deployed client site to edit its text, swap images, or let AI rewrite sections — then redeploy live in one click.
              </p>
            </div>
          </div>
          <button
            onClick={() => { sfx.primary(); loadList(); }}
            disabled={listLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-border-main text-ink text-sm font-semibold font-sans hover:bg-off-white active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${listLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Template Lab — AI-powered custom template creator */}
        <TemplateLabBanner
          aiEnabled={aiEnabled}
          onBrowseTemplates={() => {
            sfx.open();
            setBrowseOpen(true);
          }}
          onOpenStudio={() => {
            sfx.primary();
            setLabOpen(true);
          }}
        />

        {/* Browse My Templates sheet */}
        <BrowseTemplatesSheet
          open={browseOpen}
          onClose={() => { sfx.close(); setBrowseOpen(false); }}
          onUseTemplate={(t) => {
            sfx.engage();
            flashToast({ type: 'info', text: `Template "${t.name}" selected. Use it in a campaign wizard.` });
            setBrowseOpen(false);
          }}
        />

        {/* Loading skeleton */}
        {listLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-white border border-border-main animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty (no deployed sites at all) */}
        {!listLoading && listLoaded && sites.length === 0 && (
          <div className="text-center py-20 px-6 bg-white rounded-2xl border border-dashed border-border-main">
            <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-4">
              <Code2 className="w-7 h-7 text-accent" />
            </div>
            <h3 className="text-lg font-bold font-sans text-ink mb-1.5">No deployed sites yet</h3>
            <p className="text-sm text-ink-secondary font-sans max-w-sm mx-auto">
              Launch a campaign first. Every site you deploy will appear here, ready to edit and redeploy.
            </p>
          </div>
        )}

        {/* Filter toolbar + grid */}
        {!listLoading && sites.length > 0 && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              {/* search */}
              <div className="relative sm:w-64 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your sites…"
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border-main bg-white text-sm font-sans text-ink placeholder:text-ink-secondary/70 focus:outline-none focus:border-accent transition-all"
                />
                {search && (
                  <button
                    onClick={() => { sfx.tap(); setSearch(''); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* niche filter toggle */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {niches.map((n) => {
                  const isActive = filterNiche === n;
                  const count = n === 'All' ? sites.length : sites.filter((s) => s.niche === n).length;
                  return (
                    <button
                      key={n}
                      onClick={() => { sfx.toggle(); setFilterNiche(n); }}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.97] ${
                        isActive
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'bg-white text-ink-secondary border-border-main hover:text-ink hover:border-accent/40'
                      }`}
                    >
                      {n}
                      <span className={`text-[10px] tabular-nums ${isActive ? 'text-white/80' : 'text-ink-tertiary'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* count line */}
            <p className="text-xs text-ink-secondary font-sans mb-4">
              {filteredSites.length} {filteredSites.length === 1 ? 'site' : 'sites'}
              {filterNiche !== 'All' ? ` in ${filterNiche}` : ''}
              {q ? ` matching "${search.trim()}"` : ''}
            </p>

            {filteredSites.length === 0 ? (
              <div className="text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-border-main">
                <div className="w-12 h-12 rounded-2xl bg-off-white flex items-center justify-center mx-auto mb-3">
                  <Search className="w-6 h-6 text-ink-tertiary" />
                </div>
                <h3 className="text-base font-bold font-sans text-ink mb-1">No matching sites</h3>
                <p className="text-sm text-ink-secondary font-sans mb-4">Try a different filter or search term.</p>
                <button
                  onClick={() => { sfx.tap(); setSearch(''); setFilterNiche('All'); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-soft text-accent text-sm font-semibold font-sans hover:bg-accent hover:text-white transition-all"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div key={`${filterNiche}|${q}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-editor-fade">
                {filteredSites.map((site) => (
                  <div
                    key={site.slug}
                    className="group bg-white rounded-2xl border border-border-main p-5 hover:border-accent/40 hover:shadow-[0_12px_36px_rgba(26,25,22,0.10)] transition-all flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-accent-soft text-accent flex items-center justify-center font-bold font-sans text-lg shrink-0">
                        {monogram(site.title)}
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-sans bg-off-white text-ink-secondary uppercase tracking-wide border border-border-light">
                        {site.niche}
                      </span>
                    </div>
                    <h3 className="text-base font-bold font-sans text-ink leading-snug mb-1 line-clamp-2">
                      {site.title}
                    </h3>
                    <p className="text-[11px] text-ink-secondary font-sans truncate mb-4">/{site.slug}/</p>

                    <div className="mt-auto">
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary font-sans mb-3">
                        <Clock className="w-3 h-3" /> Updated {relTime(site.updatedAt)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openSite(site)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-ink text-white text-sm font-semibold font-sans hover:bg-ink/90 active:scale-[0.98] transition-all"
                        >
                          <Pencil className="w-4 h-4" /> Open Editor
                        </button>
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => sfx.tap()}
                          className="inline-flex items-center justify-center w-11 rounded-lg bg-white border border-border-main text-ink-secondary hover:text-accent hover:border-accent/40 transition-all active:scale-[0.96]"
                          title="Open live site"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ===========================================================================
  // EDIT VIEW
  // ===========================================================================
  return (
    <div key="editor-edit" className="max-w-[1600px] mx-auto animate-editor-rise">
      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={backToList}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-border-main text-ink-secondary hover:text-ink text-sm font-medium font-sans active:scale-[0.98] transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Sites</span>
        </button>

        <div className="flex flex-col min-w-0 mr-auto">
          <span className="text-sm font-bold font-sans text-ink truncate max-w-[40vw] sm:max-w-xs">{selected?.title}</span>
          <span className="text-[11px] text-ink-secondary font-sans truncate">/{selected?.slug}/{dirty ? ' · unsaved' : ''}</span>
        </div>

        {/* device toggle */}
        <div className="hidden sm:flex items-center bg-white border border-border-main rounded-lg p-0.5">
          <button
            onClick={() => { sfx.toggle(); setDevice('desktop'); }}
            className={`p-1.5 rounded-md transition-all ${device === 'desktop' ? 'bg-accent-soft text-accent' : 'text-ink-secondary hover:text-ink'}`}
            title="Desktop preview"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => { sfx.toggle(); setDevice('mobile'); }}
            className={`p-1.5 rounded-md transition-all ${device === 'mobile' ? 'bg-accent-soft text-accent' : 'text-ink-secondary hover:text-ink'}`}
            title="Mobile preview"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={toggleEditMode}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium font-sans active:scale-[0.98] transition-all border ${
            editMode ? 'bg-accent text-white border-accent' : 'bg-white text-ink-secondary border-border-main hover:text-ink'
          }`}
          title="Click text to edit it, click images to replace them"
        >
          <Pencil className="w-4 h-4" /> <span className="hidden sm:inline">{editMode ? 'Editing' : 'Edit'}</span>
        </button>

        <button
          onClick={() => { sfx.open(); setAddonsPanel(true); }}
          className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium font-sans active:scale-[0.98] transition-all border ${
            addons.chatbot ? 'bg-accent-soft text-accent border-accent/30' : 'bg-white text-ink-secondary border-border-main hover:text-ink'
          }`}
          title="Add a booking chatbot to this site"
        >
          <Puzzle className="w-4 h-4" /> <span className="hidden sm:inline">Add-ons</span>
          {addons.chatbot && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold tabular-nums">
              1
            </span>
          )}
        </button>

        <button
          onClick={() => { sfx.open(); setInviteOpen(true); }}
          className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium font-sans active:scale-[0.98] transition-all border ${
            activeInviteCount > 0 ? 'bg-accent-soft text-accent border-accent/30' : 'bg-white text-ink-secondary border-border-main hover:text-ink'
          }`}
          title="Generate an invite code your client can use in the Lunao Owner app"
        >
          <UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">Invite Client</span>
          {activeInviteCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold tabular-nums">
              {activeInviteCount}
            </span>
          )}
        </button>

        <button
          onClick={handleSave}
          disabled={saving || deploying}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-border-main text-ink hover:bg-off-white text-sm font-semibold font-sans active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} <span className="hidden sm:inline">Save</span>
        </button>

        <button
          onClick={handleDeploy}
          disabled={deploying || saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Redeploy
        </button>
      </div>

      {/* Mobile panel switch — one panel at a time so scrolling stays clean */}
      <div className="flex lg:hidden items-center gap-1 p-1 bg-white border border-border-main rounded-xl mb-3">
        <button
          onClick={() => { sfx.toggle(); setMobileTab('chat'); }}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold font-sans transition-all ${
            mobileTab === 'chat' ? 'bg-accent-soft text-accent' : 'text-ink-secondary'
          }`}
        >
          <Wand2 className="w-4 h-4" /> AI Editor
        </button>
        <button
          onClick={() => { sfx.toggle(); setMobileTab('preview'); }}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold font-sans transition-all ${
            mobileTab === 'preview' ? 'bg-accent-soft text-accent' : 'text-ink-secondary'
          }`}
        >
          <Eye className="w-4 h-4" /> Preview
        </button>
      </div>

      {/* Workspace: chat (left) + preview (right) — desktop height fits the
          viewport so the whole editor (incl. chat) is visible without scrolling */}
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100dvh-250px)] min-h-[440px] lg:h-[calc(100vh-170px)] lg:min-h-[440px] lg:max-h-[760px]">
        {/* AI chat panel */}
        <div className={`lg:w-[340px] shrink-0 bg-white rounded-xl border border-border-main flex-col h-full overflow-hidden lg:flex ${mobileTab === 'chat' ? 'flex' : 'hidden'}`}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-light">
            <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-accent" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold font-sans text-ink leading-none">AI Code Chat</span>
              <span className="text-[10px] text-ink-secondary font-sans">
                {aiEnabled ? 'Powered by Claude' : 'Disabled — add server key'}
              </span>
            </div>
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center pt-8 px-2">
                <div className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-3">
                  <Wand2 className="w-6 h-6 text-accent" />
                </div>
                <p className="text-sm font-semibold font-sans text-ink mb-1">Describe a change</p>
                <p className="text-xs text-ink-secondary font-sans mb-4">
                  AI writes real code and the preview refreshes as it types.
                </p>
                <div className="space-y-1.5 text-left">
                  {['Make the hero background darker and more luxurious',
                    'Change the headline to be more bold and confident',
                    'Add a limited-time offer banner at the top'].map((s) => (
                    <button
                      key={s}
                      onClick={() => { sfx.tap(); setChatInput(s); }}
                      className="w-full text-left text-xs font-sans text-ink-secondary bg-off-white hover:bg-accent-soft hover:text-accent rounded-lg px-3 py-2 transition-all"
                    >
                      "{s}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm font-sans leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-accent text-white rounded-br-sm'
                      : 'bg-off-white text-ink rounded-bl-sm border border-border-light'
                  }`}
                >
                  {m.content || (
                    <span className="inline-flex items-center gap-2 text-ink-secondary">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing code…
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-border-light">
            <div className="flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAi(); }
                }}
                placeholder={aiEnabled ? 'e.g. make the buttons gold…' : 'AI editor is disabled'}
                disabled={!aiEnabled || streaming}
                rows={2}
                className="flex-1 resize-none rounded-lg border border-border-main bg-off-white px-3 py-2 text-sm font-sans text-ink placeholder:text-ink-secondary/70 focus:outline-none focus:border-accent focus:bg-white transition-all disabled:opacity-60"
              />
              <button
                onClick={sendAi}
                disabled={!aiEnabled || streaming || !chatInput.trim()}
                className="w-10 h-10 shrink-0 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <div className={`flex-1 bg-white rounded-xl border border-border-main overflow-hidden flex-col h-full relative lg:flex ${mobileTab === 'preview' ? 'flex' : 'hidden'}`}>
          {editMode && (
            <div className="flex items-center gap-2 px-4 py-2 bg-accent-soft/60 border-b border-accent/15 text-[11px] font-sans text-accent font-medium">
              <Pencil className="w-3.5 h-3.5" />
              Edit mode on — click any text to type, click any image to replace it.
            </div>
          )}

          {/* Live preview — kept mounted so inline edits are never lost */}
          <div className="flex-1 overflow-hidden bg-[#f4f2ee] flex justify-center items-stretch">
            {loadingSite ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-accent" />
              </div>
            ) : (
              <div className={`h-full bg-white transition-[width] duration-300 ${device === 'mobile' ? 'w-[390px] max-w-full border-x border-border-main shadow-[0_0_40px_rgba(26,25,22,0.12)]' : 'w-full'}`}>
                <iframe
                  ref={iframeRef}
                  title="Site preview"
                  srcDoc={previewHtml}
                  onLoad={onIframeLoad}
                  className="w-full h-full border-0 bg-white block"
                />
              </div>
            )}
          </div>

          {/* streaming overlay */}
          {streaming && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink text-white text-xs font-sans font-medium shadow-lg">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI is writing your changes…
            </div>
          )}

          {/* Image edit panel — centered floating card inside the preview area */}
          {imgPanel && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-editor-fade"
              onClick={() => { sfx.close(); setImgPanel(false); }}
            >
              <div
                className="w-full max-w-sm bg-white rounded-2xl border border-border-main shadow-[0_24px_60px_rgba(26,25,22,0.25)] p-5 animate-editor-rise"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-sm font-bold font-sans text-ink">Replace image</span>
                  </div>
                  <button onClick={() => { sfx.close(); setImgPanel(false); }} className="text-ink-secondary hover:text-ink">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* current image preview */}
                <div className="mb-4 rounded-xl border border-border-light bg-off-white overflow-hidden flex items-center justify-center h-32">
                  {imgUrl ? (
                    <img src={imgUrl} alt="Selected" className="max-h-32 max-w-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-ink-tertiary" />
                  )}
                </div>

                <button
                  onClick={() => { sfx.tap(); fileInputRef.current?.click(); }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold font-sans hover:bg-accent/90 active:scale-[0.98] transition-all mb-3"
                >
                  <UploadCloud className="w-4 h-4" /> Upload from your PC
                </button>

                <div className="flex items-center gap-2 mb-3">
                  <span className="h-px flex-1 bg-border-light" />
                  <span className="text-[10px] uppercase tracking-wide font-bold text-ink-tertiary font-sans">or paste a URL</span>
                  <span className="h-px flex-1 bg-border-light" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-off-white border border-border-main rounded-lg px-3 focus-within:border-accent transition-all">
                    <Link2 className="w-4 h-4 text-ink-secondary shrink-0" />
                    <input
                      value={imgUrl}
                      onChange={(e) => setImgUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') applyImageUrl(); }}
                      placeholder="https://…"
                      className="flex-1 bg-transparent py-2.5 text-sm font-sans text-ink placeholder:text-ink-secondary/70 focus:outline-none min-w-0"
                    />
                  </div>
                  <button
                    onClick={applyImageUrl}
                    disabled={!imgUrl.trim()}
                    className="px-4 py-2.5 rounded-lg bg-ink text-white text-sm font-semibold font-sans hover:bg-ink/90 active:scale-[0.98] transition-all disabled:opacity-50 shrink-0"
                  >
                    Apply
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              </div>
            </div>
          )}

          {/* Add-ons panel — booking system + booking chatbot toggles */}
          {addonsPanel && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-editor-fade"
              onClick={() => { sfx.close(); setAddonsPanel(false); }}
            >
              <div
                className="w-full max-w-md bg-white rounded-2xl border border-border-main shadow-[0_24px_60px_rgba(26,25,22,0.25)] p-5 animate-editor-rise"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
                      <Puzzle className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-sm font-bold font-sans text-ink">Site Add-ons</span>
                  </div>
                  <button onClick={() => { sfx.close(); setAddonsPanel(false); }} className="text-ink-secondary hover:text-ink">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-ink-secondary font-sans mb-4 pl-9">
                  One-click upgrades that live on Lunao. Toggle on, then Redeploy to push them live.
                </p>

                <AddonToggle
                  icon={<MessageCircle className="w-5 h-5" />}
                  title="Booking Chatbot"
                  desc="A friendly assistant that chats with visitors and books them in."
                  enabled={addons.chatbot}
                  busy={addonBusy === 'chatbot'}
                  onToggle={() => toggleAddon('chatbot')}
                />

                <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-secondary font-sans bg-off-white border border-border-light rounded-lg px-3 py-2">
                  <Rocket className="w-3.5 h-3.5 shrink-0 text-accent" />
                  Changes preview instantly. Hit <span className="font-semibold text-ink">Redeploy</span> to publish to the live site.
                </div>
              </div>
            </div>
          )}

          {/* Deploy success — beautiful animated URL reveal in the preview area */}
          {deployInfo && (            <div
              className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-ink/45 backdrop-blur-sm animate-editor-fade"
              onClick={() => { sfx.close(); setDeployInfo(null); }}
            >
              <div
                className="relative w-full max-w-md bg-white rounded-2xl border border-border-main shadow-[0_24px_70px_rgba(26,25,22,0.3)] p-6 text-center overflow-hidden animate-editor-rise"
                onClick={(e) => e.stopPropagation()}
              >
                {/* ambient glow */}
                <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-accent/15 blur-3xl rounded-full" />

                <button onClick={() => { sfx.close(); setDeployInfo(null); }} className="absolute top-3 right-3 text-ink-secondary hover:text-ink z-10">
                  <X className="w-4 h-4" />
                </button>

                {/* animated success check */}
                <div className="relative mx-auto mb-5 w-16 h-16">
                  <span className="absolute inset-0 rounded-full bg-success/15 animate-editor-ring" />
                  <div className="relative w-16 h-16 rounded-full bg-success-soft flex items-center justify-center animate-editor-pop">
                    <CheckCircle2 className="w-9 h-9 text-success" />
                  </div>
                </div>

                <h3 className="text-xl font-bold font-sans text-ink mb-1">
                  {deployInfo.dryRun ? 'Saved & staged!' : 'Your site is live!'}
                </h3>
                <p className="text-sm text-ink-secondary font-sans mb-5 px-2">
                  {deployInfo.dryRun
                    ? 'Changes were written locally (dry-run). Add Cloudflare keys to push live.'
                    : 'Your edits are deploying to Cloudflare now — live in a few seconds.'}
                </p>

                {/* URL pill */}
                <div className="flex items-center gap-2 bg-off-white border border-border-main rounded-xl pl-3 pr-1.5 py-1.5 mb-4">
                  <Globe className="w-4 h-4 text-accent shrink-0" />
                  <span className="flex-1 text-sm font-mono text-ink truncate text-left">{deployInfo.url}</span>
                  <button
                    onClick={copyDeployUrl}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all shrink-0 ${
                      copied ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent hover:bg-accent hover:text-white'
                    }`}
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="flex gap-2">
                  <a
                    href={deployInfo.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => sfx.primary()}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
                  >
                    Open Live Site <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => { sfx.close(); setDeployInfo(null); }}
                    className="px-4 py-2.5 rounded-lg bg-white border border-border-main text-ink text-sm font-semibold font-sans hover:bg-off-white active:scale-[0.98] transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invite Client drawer — full-screen overlay, mounted at the editor
          root so its backdrop covers the entire workspace. */}
      <InviteClientDrawer
        slug={selected.slug}
        businessName={selected.title}
        siteUrl={selected.url}
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteRefreshKey((k) => k + 1); // re-pull active count for the badge
        }}
        refreshKey={inviteRefreshKey}
      />

    </div>
  );
};

// A single brand-consistent add-on row with an animated toggle switch.
const AddonToggle: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}> = ({ icon, title, desc, enabled, busy, onToggle }) => (
  <div
    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
      enabled ? 'bg-accent-soft/50 border-accent/30' : 'bg-white border-border-main'
    }`}
  >
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
      enabled ? 'bg-accent text-white' : 'bg-off-white text-ink-secondary'
    }`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold font-sans text-ink">{title}</span>
        {enabled && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold font-sans bg-success-soft text-success uppercase tracking-wide">
            Live
          </span>
        )}
      </div>
      <p className="text-[11px] text-ink-secondary font-sans leading-snug mt-0.5">{desc}</p>
    </div>
    <button
      onClick={onToggle}
      disabled={busy}
      role="switch"
      aria-checked={enabled}
      aria-label={`Toggle ${title}`}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 disabled:opacity-60 ${
        enabled ? 'bg-accent' : 'bg-border-main'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-200 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      >
        {busy && <Loader2 className="w-3 h-3 animate-spin text-accent" />}
      </span>
    </button>
  </div>
);

// Brand-consistent toast
const ToastBanner: React.FC<{ toast: NonNullable<Toast>; onClose: () => void }> = ({ toast, onClose }) => {
  const styles = {
    success: 'bg-success-soft text-success border-success/20',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-accent-soft text-accent border-accent/20',
  }[toast.type];
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Loader2;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-editor-rise">
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium font-sans ${styles}`}>
        <Icon className={`w-4 h-4 shrink-0 ${toast.type === 'info' ? 'animate-spin' : ''}`} />
        <span>{toast.text}</span>
        <button onClick={() => { sfx.close(); onClose(); }} className="ml-1 opacity-60 hover:opacity-100">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ===========================================================================
// TEMPLATE LAB — AI-powered custom template creator
// ===========================================================================

const SAMPLE_PROMPTS = [
  'Modern dental clinic with warm amber tones, hero with booking CTA, services grid, patient testimonials, before/after gallery',
  'Bold HVAC company website with navy and orange, emergency 24/7 banner, services checklist, service area map section',
  'Luxury barber shop with dark wood tones, vintage aesthetic, services menu with prices, about the barbers section',
];

// Template Lab hero section — shown above the site grid in the Editor list view.
const TemplateLabBanner: React.FC<{
  aiEnabled: boolean;
  onBrowseTemplates: () => void;
  onOpenStudio: () => void;
}> = ({ aiEnabled, onBrowseTemplates, onOpenStudio }) => (
  <div className="relative mb-8 rounded-2xl overflow-hidden bg-gradient-to-br from-[#1A1916] via-[#252320] to-[#1A1916] border border-white/10 animate-sparkle-in">
    {/* Ambient glow */}
    <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 bg-accent/15 rounded-full blur-3xl" />
    <div className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 bg-violet-500/8 rounded-full blur-2xl" />

    <div className="relative px-6 py-7 sm:px-8 sm:py-8 flex flex-col sm:flex-row sm:items-center gap-5">
      {/* Left — icon + copy */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <span className="text-xs font-bold font-sans text-white/60 uppercase tracking-widest">Template Lab</span>
        </div>
        <h2 className="text-lg sm:text-xl font-bold font-sans text-white mb-1 leading-snug">
          Design any website with AI
        </h2>
        <p className="text-sm font-sans text-white/50 max-w-md">
          Describe a business type and style in plain English. AI generates a complete template — no code required.
        </p>
        {!aiEnabled && (
          <div className="flex items-start gap-1.5 mt-2 text-[11px] text-amber-400/80 font-sans">
            <Key className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>No server key configured — bring your own Anthropic key to generate templates.</span>
          </div>
        )}
      </div>

      {/* Right — CTAs */}
      <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
        <button
          onClick={onBrowseTemplates}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-semibold font-sans hover:bg-white/20 active:scale-[0.98] transition-all"
        >
          <Layout className="w-4 h-4" />
          Browse Templates
        </button>
        <button
          onClick={onOpenStudio}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
        >
          <FlaskConical className="w-4 h-4" />
          AI Studio
        </button>
      </div>
    </div>
  </div>
);

// ===========================================================================
// CREATE TEMPLATE MODAL — full-screen slide-up sheet
// =========================================================================== — full-screen slide-up sheet
// ===========================================================================

const NICHE_OPTIONS = [
  'Barber', 'Salon', 'Dentist', 'HVAC', 'Gym', 'Roofing', 'Real Estate', 'Restaurant', 'Photography', 'Auto Repair', 'Custom',
];

const PRESET_COLORS = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626',
  '#D97706', '#16A34A', '#0891B2', '#4F46E5',
];

const CreateTemplateModal: React.FC<{
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  onGenerated: (t: { id: string; name: string; slug: string; niche: string }) => void;
}> = ({ open, onClose, aiEnabled, onGenerated }) => {
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('Barber');
  const [customNiche, setCustomNiche] = useState('');
  const [prompt, setPrompt] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#2563EB');
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [generatedTemplate, setGeneratedTemplate] = useState<{ id: string; name: string; slug: string; niche: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);

  const activeNiche = niche === 'Custom' ? customNiche.trim() : niche;

  // Load categories on open
  useEffect(() => {
    if (!open) return;
    setLoadingCats(true);
    import('../lib/pipelineClient').then(async ({ listTemplateCategories }) => {
      try {
        const cats = await listTemplateCategories();
        setCategories(cats.map((c) => ({ id: c.id, name: c.name, color: c.color })));
      } catch {
        setCategories([]);
      } finally {
        setLoadingCats(false);
      }
    });
  }, [open]);

  const reset = () => {
    setStep('form');
    setName('');
    setNiche('Barber');
    setCustomNiche('');
    setPrompt('');
    setCategoryId(null);
    setNewCategoryName('');
    setNewCategoryColor('#2563EB');
    setPreviewHtml('');
    setGeneratedTemplate(null);
    setError(null);
    setSaving(false);
    setShowNewCat(false);
    setAnthropicApiKey('');
    setShowApiKey(false);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim() || prompt.trim().length < 20) {
      setError('Please write at least 20 characters describing your template.');
      return;
    }
    if (!activeNiche) {
      setError('Please select or type a business niche.');
      return;
    }

    setError(null);
    setGenerating(true);
    playMagicWhoosh();

    try {
      const { generateTemplate, listTemplateCategories } = await import('../lib/pipelineClient');

      // Create category if user typed a new one
      let catId = categoryId;
      if (showNewCat && newCategoryName.trim()) {
        const { createTemplateCategory } = await import('../lib/pipelineClient');
        const cat = await createTemplateCategory({ name: newCategoryName.trim(), color: newCategoryColor });
        catId = cat.id;
        setCategories((prev) => [...prev, { id: cat.id, name: cat.name, color: cat.color }]);
      }

      const result = await generateTemplate({
        prompt: prompt.trim(),
        niche: activeNiche,
        categoryId: catId,
        name: name.trim() || undefined,
        anthropicApiKey: anthropicApiKey.trim() || undefined,
      });

      setGeneratedTemplate(result);
      setStep('preview');
      // Fetch preview HTML
      const { getTemplatePreview } = await import('../lib/pipelineClient');
      const { html } = await getTemplatePreview(result.id);
      setPreviewHtml(html);
      playGentleChime(3);
    } catch (err: any) {
      playElegantError();
      const msg = err?.message || 'Generation failed. Please try again.';
      if (err?.status === 402) {
        setError(`Insufficient credits. ${msg}`);
      } else if (err?.status === 401) {
        setError('Your Anthropic key is invalid. Please check it and try again. Get your key at console.anthropic.com');
      } else {
        setError(msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/50 backdrop-blur-sm animate-editor-fade"
      onClick={(e) => { if (e.target === e.currentTarget) { sfx.close(); onClose(); } }}
    >
      <div
        className="w-full bg-white rounded-t-2xl sm:rounded-2xl border border-border-main shadow-[0_24px_70px_rgba(26,25,22,0.28)] overflow-hidden animate-editor-rise max-h-[94dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold font-sans text-ink leading-none">Create Template</h2>
              <p className="text-[11px] text-ink-secondary font-sans mt-0.5">
                {step === 'form' ? 'Describe your website in plain English' : 'Preview your generated template'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step === 'preview' && (
              <button
                onClick={() => setStep('form')}
                className="text-xs font-medium text-accent font-sans hover:text-accent/80 transition-colors"
              >
                Edit prompt
              </button>
            )}
            <button
              onClick={() => { sfx.close(); onClose(); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink hover:bg-off-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-border-light bg-off-white/60 shrink-0">
          {['form', 'preview'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 ${step === s ? 'text-accent' : 'text-ink-tertiary'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${step === s ? 'bg-accent text-white' : 'bg-border-main text-ink-secondary'}`}>
                  {i + 1}
                </div>
                <span className="text-xs font-medium font-sans capitalize">{s === 'form' ? 'Describe' : 'Preview & Save'}</span>
              </div>
              {i < 1 && <div className="flex-1 h-px bg-border-light mx-1" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* FORM STEP */}
          {step === 'form' && (
            <div className="px-5 py-5 space-y-5">
              {/* Template name */}
              <div>
                <label className="block text-xs font-semibold font-sans text-ink-secondary mb-1.5">Template Name <span className="text-ink-tertiary font-normal">(optional)</span></label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Modern Dental Clinic"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border-main bg-white text-sm font-sans text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-accent transition-all"
                />
              </div>

              {/* Business niche */}
              <div>
                <label className="block text-xs font-semibold font-sans text-ink-secondary mb-1.5">Business Niche</label>
                <div className="flex flex-wrap gap-2">
                  {NICHE_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => { sfx.toggle(); setNiche(n); }}
                      className={`shrink-0 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.96] ${
                        niche === n
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'bg-white text-ink-secondary border-border-main hover:text-ink hover:border-accent/40'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {niche === 'Custom' && (
                  <input
                    value={customNiche}
                    onChange={(e) => setCustomNiche(e.target.value)}
                    placeholder="Type a custom niche…"
                    className="mt-2 w-full px-3.5 py-2.5 rounded-xl border border-border-main bg-white text-sm font-sans text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-accent transition-all"
                    autoFocus
                  />
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold font-sans text-ink-secondary mb-1.5">Category</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {loadingCats ? (
                    <Loader2 className="w-4 h-4 animate-spin text-ink-tertiary" />
                  ) : (
                    <>
                      <button
                        onClick={() => { sfx.toggle(); setCategoryId(null); setShowNewCat(false); }}
                        className={`shrink-0 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.96] ${
                          categoryId === null && !showNewCat
                            ? 'bg-ink text-white border-ink'
                            : 'bg-white text-ink-secondary border-border-main hover:text-ink'
                        }`}
                      >
                        Uncategorized
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { sfx.toggle(); setCategoryId(c.id); setShowNewCat(false); }}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.96] ${
                            categoryId === c.id
                              ? 'border-current'
                              : 'bg-white border-border-main hover:border-border-main'
                          }`}
                          style={categoryId === c.id ? { color: c.color, backgroundColor: `${c.color}15`, borderColor: c.color } : {}}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </button>
                      ))}
                      <button
                        onClick={() => { sfx.tap(); setShowNewCat(!showNewCat); setCategoryId(null); }}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold font-sans border border-dashed border-border-main text-ink-secondary hover:text-accent hover:border-accent/40 transition-all"
                      >
                        <span className="text-sm">+</span> New
                      </button>
                    </>
                  )}
                </div>
                {showNewCat && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => { sfx.tap(); setNewCategoryColor(c); }}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${newCategoryColor === c ? 'border-ink scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name…"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-border-main bg-white text-xs font-sans text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-accent"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* Anthropic API Key — collapsible */}
              <div>
                <button
                  type="button"
                  onClick={() => { sfx.tap(); setShowApiKey((v) => !v); }}
                  className="flex items-center gap-1.5 text-[11px] font-semibold font-sans text-ink-secondary hover:text-ink transition-colors"
                >
                  <Key className="w-3.5 h-3.5" />
                  {showApiKey ? 'Hide' : 'Add'} your Anthropic API key
                  <span className="text-ink-tertiary font-normal ml-0.5">
                    {anthropicApiKey.trim() ? '(key saved)' : aiEnabled ? '(optional — server key available)' : '(required — server has no key)'}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ml-0.5 ${showApiKey ? 'rotate-180' : ''}`} />
                </button>
                {showApiKey && (
                  <div className="mt-2">
                    <div className="relative">
                      <input
                        type="password"
                        value={anthropicApiKey}
                        onChange={(e) => setAnthropicApiKey(e.target.value)}
                        placeholder="sk-ant-api03-…"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border-main bg-white text-sm font-mono text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-accent transition-all pr-20"
                      />
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-sans text-accent hover:text-accent/80 font-medium"
                        title="Get your key at console.anthropic.com"
                      >
                        Get key
                      </a>
                    </div>
                    <p className="mt-1.5 text-[10px] text-ink-tertiary font-sans leading-relaxed">
                      Your key is sent directly to the server, never stored, and only used for this template generation. Cost: ~2,000–4,000 tokens (~1–3 cents per template) using Claude Sonnet 4.
                    </p>
                  </div>
                )}
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-xs font-semibold font-sans text-ink-secondary mb-1.5">Describe your template</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. A modern dental clinic website with warm amber tones, hero section with a booking CTA, services grid, patient testimonials, before/after gallery, and a contact form…"
                  rows={5}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border-main bg-white text-sm font-sans text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-accent transition-all resize-none"
                />
                <div className="flex items-start gap-1.5 mt-2 text-[11px] text-warning font-sans bg-warning-soft rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                  <span>
                    <strong>3 rules:</strong> (1) Use <strong>only business name</strong>, <strong>city</strong>, and <strong>phone</strong> in your description. (2) If you mention Instagram, Facebook, email, etc. — AI auto-adds those placeholders too. (3) Never describe specific fake brands. Example: "dental clinic" not "Radiant Smiles Dental". All branding is personalized automatically during campaigns.
                  </span>
                </div>
                {/* Sample prompts */}
                <div className="mt-3 space-y-1.5">
                  <span className="text-[11px] text-ink-tertiary font-sans">Try one of these:</span>
                  {SAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => { sfx.tap(); setPrompt(p); }}
                      className="w-full text-left text-xs font-sans text-ink-secondary bg-off-white hover:bg-accent-soft hover:text-accent rounded-lg px-3 py-2 transition-all"
                    >
                      "{p}"
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3.5 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm font-sans">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* PREVIEW STEP */}
          {step === 'preview' && (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-5 py-3 bg-success-soft border-b border-success/20 shrink-0">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-sm font-semibold font-sans text-success">Template generated!</span>
                <span className="text-xs text-success/70 font-sans">Preview below with demo data.</span>
              </div>

              {/* Preview iframe */}
              <div className="flex-1 bg-[#f4f2ee]">
                {previewHtml ? (
                  <div className="h-full flex justify-center py-4 px-4">
                    <div className="w-full max-w-[900px] bg-white rounded-xl border border-border-main shadow-md overflow-hidden" style={{ height: '65vh' }}>
                      <iframe
                        srcDoc={previewHtml}
                        title="Template preview"
                        className="w-full h-full border-0"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                )}
              </div>

              {/* Save bar */}
              <div className="px-5 py-4 border-t border-border-light bg-white shrink-0 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold font-sans text-ink truncate">{generatedTemplate?.name}</p>
                  <p className="text-[11px] text-ink-secondary font-sans">
                    Template is saved with AI placeholders — ready for campaigns.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => {
                      const blob = new Blob([previewHtml], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${generatedTemplate?.slug || 'template'}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                      sfx.copy();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-border-main text-ink text-sm font-semibold font-sans hover:bg-off-white active:scale-[0.98] transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download HTML
                  </button>
                  <button
                    onClick={() => {
                      sfx.confirmSuccess();
                      onGenerated(generatedTemplate!);
                    }}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-accent text-white text-sm font-semibold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Save Template
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — Generate button (form step only) */}
        {step === 'form' && (
          <div className="px-5 py-4 border-t border-border-light bg-white shrink-0">
            <button
              onClick={handleGenerate}
              disabled={generating || !aiEnabled}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating with AI…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Template (2 credits)
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-ink-tertiary font-sans mt-1.5">
              Uses 2 credits. Prompt generates a full HTML template with proper placeholders.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ===========================================================================
// BROWSE TEMPLATES SHEET — full-screen slide-up, category list + template grid
// ===========================================================================

const BrowseTemplatesSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onUseTemplate: (t: { id: string; name: string; slug: string; niche: string }) => void;
}> = ({ open, onClose, onUseTemplate }) => {
  const [categories, setCategories] = useState<{ id: string; name: string; color: string; templateCount: number }[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string; slug: string; niche: string; categoryId: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { listTemplateCategories, listCustomTemplates } = await import('../lib/pipelineClient');
      const [cats, tmpls] = await Promise.all([listTemplateCategories(), listCustomTemplates()]);
      setCategories(cats.map((c) => ({ id: c.id, name: c.name, color: c.color, templateCount: c.templateCount })));
      setTemplates(tmpls.map((t) => ({ id: t.id, name: t.name, slug: t.slug, niche: t.niche, categoryId: t.categoryId })));
    } catch {
      setCategories([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  const loadPreview = async (id: string) => {
    setPreviewLoading(true);
    setPreviewId(id);
    setPreviewHtml('');
    try {
      const { getTemplatePreview } = await import('../lib/pipelineClient');
      const { html } = await getTemplatePreview(id);
      setPreviewHtml(html);
    } catch {
      setPreviewHtml('');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const { deleteCustomTemplate } = await import('../lib/pipelineClient');
      await deleteCustomTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setDeleteConfirmId(null);
      if (previewId === id) { setPreviewId(null); setPreviewHtml(''); }
      sfx.confirmSuccess();
    } catch {
      sfx.error();
    } finally {
      setDeleting(false);
    }
  };

  const filteredTemplates = activeCategoryId === null
    ? templates
    : templates.filter((t) => t.categoryId === activeCategoryId);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/50 backdrop-blur-sm animate-editor-fade"
      onClick={(e) => { if (e.target === e.currentTarget) { sfx.close(); onClose(); } }}
    >
      <div
        className="w-full bg-white rounded-t-2xl sm:rounded-2xl border border-border-main shadow-[0_24px_70px_rgba(26,25,22,0.28)] overflow-hidden animate-editor-rise max-h-[94dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center">
              <Layout className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold font-sans text-ink leading-none">My Templates</h2>
              <p className="text-[11px] text-ink-secondary font-sans mt-0.5">{templates.length} custom template{templates.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={() => { sfx.close(); onClose(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink hover:bg-off-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — category sidebar (desktop only) */}
          <div className="hidden sm:flex w-52 flex-col border-r border-border-light shrink-0 overflow-y-auto">
            <div className="p-3 space-y-1">
              <button
                onClick={() => { sfx.toggle(); setActiveCategoryId(null); setSelectedId(null); setPreviewId(null); setPreviewHtml(''); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium font-sans transition-all ${
                  activeCategoryId === null ? 'bg-accent text-white' : 'text-ink-secondary hover:bg-off-white hover:text-ink'
                }`}
              >
                <span>All Templates</span>
                <span className="text-[11px] opacity-70">{templates.length}</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { sfx.toggle(); setActiveCategoryId(cat.id); setSelectedId(null); setPreviewId(null); setPreviewHtml(''); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium font-sans transition-all ${
                    activeCategoryId === cat.id
                      ? 'bg-off-white text-ink'
                      : 'text-ink-secondary hover:bg-off-white hover:text-ink'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </span>
                  <span className="text-[11px] opacity-70">{cat.templateCount}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right panel — templates grid + preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile category pills */}
            <div className="flex sm:hidden items-center gap-1.5 px-4 py-2.5 border-b border-border-light overflow-x-auto scrollbar-none shrink-0">
              <button
                onClick={() => { sfx.toggle(); setActiveCategoryId(null); setSelectedId(null); }}
                className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all ${
                  activeCategoryId === null ? 'bg-accent text-white border-accent' : 'bg-white text-ink-secondary border-border-main'
                }`}
              >
                All <span className="text-[10px] opacity-70">{templates.length}</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { sfx.toggle(); setActiveCategoryId(cat.id); setSelectedId(null); }}
                  className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all ${
                    activeCategoryId === cat.id ? 'border-current text-white' : 'bg-white text-ink-secondary border-border-main'
                  }`}
                  style={activeCategoryId === cat.id ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
                <div className="w-14 h-14 rounded-2xl bg-off-white flex items-center justify-center mx-auto mb-4">
                  <Layout className="w-7 h-7 text-ink-tertiary" />
                </div>
                <h3 className="text-base font-bold font-sans text-ink mb-1">No templates yet</h3>
                <p className="text-sm text-ink-secondary font-sans max-w-xs">
                  Create your first AI-powered template with Template Lab above.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredTemplates.map((t, i) => (
                    <div
                      key={t.id}
                      className={`animate-sparkle-in rounded-xl border bg-white overflow-hidden flex flex-col transition-all group ${
                        selectedId === t.id
                          ? 'border-accent shadow-[0_8px_24px_rgba(37,99,235,0.15)]'
                          : 'border-border-main hover:border-accent/40 hover:shadow-[0_8px_24px_rgba(26,25,22,0.08)]'
                      }`}
                      style={{ animationDelay: `${i * 60}ms` }}
                      onClick={() => { sfx.tap(); setSelectedId(t.id); loadPreview(t.id); }}
                    >
                      {/* Thumbnail */}
                      <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden relative">
                        {previewId === t.id && previewLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin text-ink-tertiary" />
                        ) : previewId === t.id && previewHtml ? (
                          <iframe
                            srcDoc={previewHtml}
                            className="w-full h-full border-0 scale-50 origin-top-left"
                            style={{ width: '200%', height: '200%' }}
                            title="preview"
                          />
                        ) : (
                          <Layout className="w-8 h-8 text-slate-400" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      {/* Card body */}
                      <div className="p-3 flex flex-col gap-2 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold font-sans text-ink truncate">{t.name}</p>
                            <p className="text-[11px] text-ink-secondary font-sans">{t.niche}</p>
                          </div>
                          {deleteConfirmId === t.id ? (
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                                disabled={deleting}
                                className="w-7 h-7 rounded-full bg-danger text-white flex items-center justify-center text-[10px] font-bold"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); sfx.close(); setDeleteConfirmId(null); }}
                                className="w-7 h-7 rounded-full bg-border-main text-ink-secondary flex items-center justify-center"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); sfx.tap(); setDeleteConfirmId(t.id); }}
                              className="w-7 h-7 rounded-full opacity-0 group-hover:opacity-100 bg-danger/10 text-danger flex items-center justify-center transition-all hover:bg-danger/20"
                              title="Delete template"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); sfx.engage(); onUseTemplate(t); }}
                          className="w-full mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-xs font-semibold font-sans hover:bg-accent/90 active:scale-[0.98] transition-all"
                        >
                          Use Template
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Add Download and Trash2 to the main lucide import at the top of this file
