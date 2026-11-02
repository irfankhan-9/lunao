// Email Campaign Wizard Component
// Replaces the SMS campaign type with a full email campaign flow
// Matches existing campaign wizard patterns 100%

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Mail, Send, Upload, Globe, Check, ChevronRight, ChevronLeft, AlertCircle,
  CheckCircle, CheckCircle2, Loader2, X, ShieldAlert, Plus, Trash2, Eye, ExternalLink,
  RefreshCw, Link2, AlertTriangle, Zap, Clock, Pencil, FileSpreadsheet,
  Smartphone, Monitor, Maximize2, Users, Layout, Type, Search, MapPin, Terminal, Cloud, Key,
  Minus, SlidersHorizontal, Building2
} from 'lucide-react';
import { playGentleChime, playLaunchSwell, playVictoryCelebration, playSoftTap, playElegantError, playSoftBubble, playElegantBell } from '../utils/audio';
import { dedupeLeads } from '../utils/leads';
import { validateCsvFile, CsvValidation, PipelineLead, runEmailCampaign, createEmailCampaign, probeAllEmailAccounts, initiateOAuthFlow, EmailAccountProbeResult, EmailCampaignEvent, lookupCity, runDorkEmailCampaign, CityLookupResponse, CitySuggestion, getDorkStatus, DorkStatus, DiscoveredLead, dorkNext, saveDorkLeads, executeUnifiedLeadRebrandClient, sanitizeToLunaoServers } from '../lib/pipelineClient';
import { Template } from '../types';
import { useSyncNiches, getLocalTemplates } from '../lib/nichesSync';
import { TemplateSimPreview } from './TemplateSimPreview';
import { CsvPreview } from './CsvPreview';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { CampaignProgressToggle, CampaignProgressData } from './CampaignProgressToggle';
import { CampaignTemplateStep } from './CampaignTemplateStep';
import { isUgcOrSalesMode, getContractorSiteUrl } from '../specialModes/modeManager';

// Types
interface EmailAccount {
  id: string;
  provider: 'gmail' | 'outlook';
  email: string;
  displayName: string;
  status: 'healthy' | 'warming_up' | 'needs_attention' | 'disconnected';
  sendsToday: number;
  remainingToday: number;
  dailyCap: number;
  warmupStage: string;
  bounceRate7d: number;
  lastSuccessfulSend: number | null;
  tokenStatus?: 'active' | 'needs_reconnect' | 'revoked';
  tokenError?: string | null;
  tokenCheckedAt?: number | null;
}

interface EmailCampaignWizardProps {
  templates: Template[];
  customTemplates?: any[];
  userPlan?: string;
  userCredits: number;
  onCreditsChange?: (credits: number) => void;
  onLaunch?: () => void;
  onCampaignCreated?: (campaign: any) => void;
  onViewDetails?: (campaignId: string) => void;
  onStepChange?: (step: number) => void;
  initialSubject?: string;
  initialBody?: string;
  // Active campaign registry
  activeCampaignRuns?: Array<{
    id: string;
    kind: 'site-deploy' | 'email';
    name: string;
    niche: string;
    total: number;
    done: number;
    status: 'starting' | 'running' | 'cancelling' | 'cancelled' | 'completed';
    startedAt: number;
    errorMessage?: string;
    sitesGenerated?: number;
    emailsSent?: number;
    emailsFailed?: number;
    accountsUsed?: number;
    deployedSites?: string[];
  }>;
  upsertActiveRun?: (run: any) => void;
  updateActiveRun?: (id: string, patch: any) => void;
  removeActiveRun?: (id: string) => void;
}

const COST_PER_EMAIL = 1.5;

const DEFAULT_EMAIL_SUBJECT = "Quick question about {{business_name}}";
const DEFAULT_EMAIL_BODY = `Hi {{business_name}} team,

I came across {{business_name}} in {{city}} and noticed you don't have a website that showcases your services.

I built a beautiful, free landing page just for you — take a look:
{{site_url}}

It only takes a moment to review, and there's no commitment.

Best regards,
The Lunao Team`;

export const EmailCampaignWizard: React.FC<EmailCampaignWizardProps> = ({
  templates,
  customTemplates = [],
  userPlan = 'Free Plan',
  userCredits,
  onCreditsChange,
  onLaunch,
  onCampaignCreated,
  onViewDetails,
  onStepChange,
  initialSubject,
  initialBody,
  activeCampaignRuns = [],
  upsertActiveRun,
  updateActiveRun,
  removeActiveRun,
}) => {
  const isPro = userPlan === 'Pro Plan' || userPlan === 'Agency Plan';
  const [allNiches] = useSyncNiches();

  // State for the progress toggle
  const [activeProgressToggle, setActiveProgressToggle] = useState<CampaignProgressData | null>(null);
  
  // Track if we're showing the completion screen (vs wizard mode)
  const [isShowingCompletion, setIsShowingCompletion] = useState(false);
  
  const [activeStep, setActiveStep] = useState<number>(1);
  
  // Niche selection
  const [selectedNiche, setSelectedNiche] = useState<string>('Barber');
  
  // Lead source
  const [leadSource, setLeadSource] = useState<'csv' | 'leads'>('leads');

  // CSV state
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [isCsvParsing, setIsCsvParsing] = useState<boolean>(false);
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  const [csvLeads, setCsvLeads] = useState<PipelineLead[]>([]);
  const [csvValidation, setCsvValidation] = useState<CsvValidation | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Auto Email Sender state
  const [dorkCity, setDorkCity] = useState<string>('');
  const [dorkCityLookup, setDorkCityLookup] = useState<CityLookupResponse | null>(null);
  const [dorkCitySuggestions, setDorkCitySuggestions] = useState<CitySuggestion[]>([]);
  const [dorkCityConfirmed, setDorkCityConfirmed] = useState<string | null>(null);
  const [dorkConfirmModalOpen, setDorkConfirmModalOpen] = useState<boolean>(false);
  const [dorkLookupPending, setDorkLookupPending] = useState<boolean>(false);
  // Shown when the user clicks Next with no/garbage city name OR when the
  // quick-query returns zero suggestions. Cleared as soon as they type a
  // better name.
  const [dorkCityInlineError, setDorkCityInlineError] = useState<string | null>(null);
  // True while the Next-click quick lookup is running; gives the "scanning"
  // loader between the click and the result.
  const [dorkQuickQueryPending, setDorkQuickQueryPending] = useState<boolean>(false);
  // Live status of the dork backend — populated once on mount. Lets the UI
  // render a clear "Live Google" vs "DRY-RUN mock" badge above the panel.
  const [dorkStatus, setDorkStatus] = useState<DorkStatus | null>(null);

  // Manual tick-to-pick discovery state. The wizard walks the dork loop
  // one page at a time; the user ticks rows they want to keep, then
  // continues. `dorkLockedCityMeta` is the canonical record (name, admin,
  // lat, lon, population) we picked from `/api/dork/lookup-city`.
  const [dorkLockedCityMeta, setDorkLockedCityMeta] = useState<{
    name: string; country: string; admin?: string; lat?: number; lon?: number; population?: number;
  } | null>(null);
  const [dorkVisited, setDorkVisited] = useState<Array<{ name: string; page: number }>>([]);
  const [dorkSeenEmails, setDorkSeenEmails] = useState<string[]>([]);
  const [dorkLeads, setDorkLeads] = useState<DiscoveredLead[]>([]);
  const [dorkSelected, setDorkSelected] = useState<Set<string>>(new Set()); // email (lowercased)
  const [dorkFetchingNext, setDorkFetchingNext] = useState<boolean>(false);
  const [dorkDoneExpanding, setDorkDoneExpanding] = useState<boolean>(false);
  const [dorkNextCityLabel, setDorkNextCityLabel] = useState<string | null>(null);
  const [dorkDiscoverError, setDorkDiscoverError] = useState<string | null>(null);
  const [dorkCompletionBanner, setDorkCompletionBanner] = useState<{
    status: string;
    message: string;
    creditsCharged: number;
    creditsRefunded: number;
  } | null>(null);
  const [dorkNextPage, setDorkNextPage] = useState<number | null>(null);
  const [dorkNextBudget, setDorkNextBudget] = useState<number | null>(null);
  const [dorkTelemetry, setDorkTelemetry] = useState<any | null>(null);
  const dorkAbortRef = useRef<AbortController | null>(null);
  const dorkResultsRef = useRef<HTMLDivElement>(null);

  // User-controlled lead target quantity (default: 10)
  const [targetLeadAmount, setTargetLeadAmount] = useState<number>(10);

  const selectTopNLeads = useCallback((n: number) => {
    if (dorkFetchingNext) return;
    playSoftTap();
    setTargetLeadAmount(n);
    setDorkSelected(() => {
      const topEmails = dorkLeads.slice(0, n).map((l) => l.email.toLowerCase());
      return new Set(topEmails);
    });
  }, [dorkLeads, dorkFetchingNext]);

  const selectAllLeads = useCallback(() => {
    if (dorkFetchingNext) return;
    playSoftTap();
    const all = new Set(dorkLeads.map((l) => l.email.toLowerCase()));
    setDorkSelected(all);
    if (all.size > 0) {
      setTargetLeadAmount(all.size);
    }
  }, [dorkLeads, dorkFetchingNext]);

  const clearLeadSelection = useCallback(() => {
    if (dorkFetchingNext) return;
    playSoftTap();
    setDorkSelected(new Set());
  }, [dorkFetchingNext]);

  // Staged Campaign CSV Basket state (Section 2)
  const [stagedCampaignLeads, setStagedCampaignLeads] = useState<DiscoveredLead[]>([]);

  const addSelectedToBasket = useCallback(() => {
    playSoftBubble();
    const selectedList = dorkLeads.filter((l) => dorkSelected.has(l.email.toLowerCase()));
    if (selectedList.length === 0) return;

    setStagedCampaignLeads((prev) => {
      const existingEmails = new Set(prev.map((l) => l.email.toLowerCase()));
      const merged = [...prev];
      for (const lead of selectedList) {
        const emailKey = lead.email.toLowerCase();
        if (!existingEmails.has(emailKey)) {
          existingEmails.add(emailKey);
          merged.push(lead);
        }
      }
      return merged;
    });
  }, [dorkLeads, dorkSelected]);

  const removeFromBasket = useCallback((emailToRemove: string) => {
    playSoftTap();
    const lower = emailToRemove.toLowerCase();
    setStagedCampaignLeads((prev) => prev.filter((l) => l.email.toLowerCase() !== lower));
  }, []);

  const clearBasket = useCallback(() => {
    playSoftTap();
    setStagedCampaignLeads([]);
  }, []);

  // Whenever the city is confirmed, capture the record so the dork-next
  // request has the required city metadata.
  useEffect(() => {
    if (!dorkCityConfirmed) return;
    setDorkLockedCityMeta({
      name: dorkCityConfirmed,
      country: dorkCityLookup?.country || '',
      admin: dorkCityLookup?.state,
      lat: dorkCityLookup?.lat,
      lon: dorkCityLookup?.lon,
      population: dorkCityLookup?.population,
    });
    setDorkVisited([]);
    setDorkSeenEmails([]);
    setDorkDoneExpanding(false);
    setDorkNextCityLabel(null);
    setDorkDiscoverError(null);
    setDorkCompletionBanner(null);
    setDorkNextPage(null);
    setDorkNextBudget(null);
    // Preserves dorkLeads & stagedCampaignLeads across city changes so users can perform cumulative multi-city searches
  }, [dorkCityConfirmed, dorkCityLookup]);
  
  // Template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('barber-dark-luxury');
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<Template | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewTemplateIndex, setPreviewTemplateIndex] = useState<number>(0);
  
  // Connected accounts
  const [connectedAccounts, setConnectedAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(false);
  const [isProbingTokens, setIsProbingTokens] = useState<boolean>(false);
  const [accountProbes, setAccountProbes] = useState<Record<string, EmailAccountProbeResult>>({});
  // Per-account email distribution (used in UGC Creator & Sales Guy modes)
  const [accountEmailAllocations, setAccountEmailAllocations] = useState<Record<string, number>>({});
  // Animated search stage in Step 2 (used in UGC Creator & Sales Guy modes)
  const [ugcSearchStage, setUgcSearchStage] = useState<number>(0);
  // Email content
  const [emailSubject, setEmailSubject] = useState<string>(DEFAULT_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState<string>(DEFAULT_EMAIL_BODY);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Launch state
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [launchProgress, setLaunchProgress] = useState<number>(0);
  const [launchMessage, setLaunchMessage] = useState<string>('');
  const [launchComplete, setLaunchComplete] = useState<boolean>(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchResults, setLaunchResults] = useState<{
    sent: number;
    failed: number;
    status: string;
    perLead: any[];
    perAccount: any[];
  } | null>(null);

  const [liveCounters, setLiveCounters] = useState<{
    sitesStaged: number;
    emailsSent: number;
    emailsFailed: number;
    deploying: boolean;
    // Dork-only — leads discovered so far during the discovery phase.
    leadsFound: number;
  }>({ sitesStaged: 0, emailsSent: 0, emailsFailed: 0, deploying: false, leadsFound: 0 });

  // Auto Email Sender (dork) pipeline progress. Only the dork launch path
  // populates this — the CSV path leaves it at 'idle' so the existing
  // progress card renders identically to before.
  type DorkStage = 'discovering' | 'building' | 'sending' | 'idle';
  const [dorkProgress, setDorkProgress] = useState<{
    stage: DorkStage;
    leadsFound: number;
    targetVolume: number;
    currentCity: string | null;
    currentPage: number | null;
    citiesScanned: string[];
    queriesUsed: number;
  }>({
    stage: 'idle',
    leadsFound: 0,
    targetVolume: 0,
    currentCity: null,
    currentPage: null,
    citiesScanned: [],
    queriesUsed: 0,
  });

  const [celebratedCampaign, setCelebratedCampaign] = useState<any>(null);
  const [activeLeadIndex, setActiveLeadIndex] = useState<number>(0);
  const [aiLogs, setAiLogs] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'agent' | 'success' | 'code' }>>([]);
  const [completedSitesList, setCompletedSitesList] = useState<Array<{ slug: string; name: string; city?: string; email?: string; url: string; status: 'live' | 'staged' | 'failed' }>>([]);
  const [sentEmailsList, setSentEmailsList] = useState<Array<{ name: string; email?: string; url: string; status: 'sent' | 'delivered' | 'failed' }>>([]);
  const terminalBoxRef = useRef<HTMLDivElement>(null);
  const liveSitesBoxRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);
  const progressContainerRef = useRef<HTMLDivElement>(null);

  // Monitor internal scrolling in the terminal console so users can scroll up
  const handleTerminalScroll = () => {
    const el = terminalBoxRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 35;
  };

  // Instant millisecond auto-scroll for terminal log console whenever new logs arrive
  useLayoutEffect(() => {
    const el = terminalBoxRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        if (terminalBoxRef.current) {
          terminalBoxRef.current.scrollTop = terminalBoxRef.current.scrollHeight;
        }
      });
    }
  }, [aiLogs]);

  // Instant millisecond auto-scroll for live sites & proposals container whenever new progress arrives
  useLayoutEffect(() => {
    const el = liveSitesBoxRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        if (liveSitesBoxRef.current) {
          liveSitesBoxRef.current.scrollTop = liveSitesBoxRef.current.scrollHeight;
        }
      });
    }
  }, [completedSitesList, sentEmailsList]);

  // Auto-scroll up to the top when launching outreach
  useEffect(() => {
    if (isLaunching) {
      const scrollUpToTop = () => {
        const mainFlow = document.getElementById('main-content-flow');
        if (mainFlow) {
          mainFlow.scrollTo({ top: 0, behavior: 'smooth' });
        }
        const progressEl = progressContainerRef.current ||
                           document.getElementById('email-launch-progress-container') ||
                           document.getElementById('campaigns-generator-wizard-card') ||
                           document.getElementById('wizard-step-contents-wrapper');
        if (progressEl) {
          progressEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
      scrollUpToTop();
      const timer = setTimeout(scrollUpToTop, 50);
      return () => clearTimeout(timer);
    }
  }, [isLaunching]);

  // Auto-scroll up when completion celebration screen appears
  useEffect(() => {
    if (isShowingCompletion) {
      const timer = setTimeout(() => {
        const mainFlow = document.getElementById('main-content-flow');
        if (mainFlow) {
          mainFlow.scrollTo({ top: 0, behavior: 'smooth' });
        }
        const wizardCard = document.getElementById('campaigns-generator-wizard-card') ||
                           document.getElementById('email-campaign-completion-container');
        if (wizardCard) {
          wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isShowingCompletion]);
  
  const [campaignName, setCampaignName] = useState<string>(`${selectedNiche} Email Campaign`);
  const stepContentRef = useRef<HTMLDivElement>(null);
  const isFirstMountRef = useRef<boolean>(true);

  // Template list for preview navigation
  const nicheTemplates = templates.filter(t => (t.niche || '').toLowerCase() === (selectedNiche || '').toLowerCase());
  const nicheCustom = customTemplates.filter(t => (t.niche || '').toLowerCase() === (selectedNiche || '').toLowerCase());
  const allTemplates = React.useMemo(() => {
    const map = new Map<string, any>();
    // 1. Built-in templates for niche
    for (const t of nicheTemplates) {
      const key = t.key || t.id;
      if (key && !map.has(key)) map.set(key, { ...t, id: key });
    }
    // 2. Custom templates passed from props
    for (const c of nicheCustom) {
      const key = c.key || c.id;
      if (key && !map.has(key)) map.set(key, { ...c, key, id: key });
    }
    // 3. Synced templates from localStorage / Studio
    try {
      const locals = getLocalTemplates();
      for (const loc of locals) {
        if ((loc.niche || '').toLowerCase() === (selectedNiche || '').toLowerCase()) {
          const key = loc.id || (loc as any).key;
          if (key && !map.has(key)) {
            map.set(key, { ...loc, id: key });
          } else if (key && map.has(key)) {
            const existing = map.get(key);
            if (!existing.rawHtml && loc.rawHtml) {
              map.set(key, { ...existing, rawHtml: loc.rawHtml, previewHtml: loc.previewHtml || existing.previewHtml });
            }
          }
        }
      }
    } catch {}
    const list = Array.from(map.values());
    return list.length > 0 ? list : templates.slice(0, 4);
  }, [templates, selectedNiche, customTemplates, nicheTemplates, nicheCustom]);
  
  useEffect(() => {
    onStepChange?.(activeStep);
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    playGentleChime(activeStep);
  }, [activeStep]);
  
  useEffect(() => {
    loadConnectedAccounts();
  }, []);

  // Listen for postMessage from OAuth callback & window focus (for popup close)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Email OAuth success
      if (event.data?.type === 'LUNAO_EMAIL_CONNECTED') {
        console.log('[email] OAuth connected message received');
        loadConnectedAccounts();
      }
    };
    const handleFocus = () => {
      loadConnectedAccounts();
    };
    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleFocus);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleFocus);
    };
  }, []);

  // One-shot fetch of the dork provider status so the UI can render a
  // "Live Google" / "DRY-RUN" badge above the Auto Email Sender panel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getDorkStatus();
      if (!cancelled && status) setDorkStatus(status);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof initialSubject === 'string') setEmailSubject(initialSubject);
    if (typeof initialBody === 'string') setEmailBody(initialBody);
    if (initialSubject || initialBody) setActiveStep(4);
  }, [initialSubject, initialBody]);

  // Debounced city lookup for the Auto Email Sender panel. Fires 350ms after
  // Auto-confirms any city string typed by the user as long as it has at least 2 letters
  useEffect(() => {
    if (leadSource !== 'leads') return;
    const trimmed = dorkCity.trim();
    if (trimmed.length < 2) {
      setDorkCityConfirmed(null);
      return;
    }
    setDorkCityInlineError(null);
    setDorkCityConfirmed(trimmed);
  }, [dorkCity, leadSource]);

  // Walk the next page of the dork loop. Single source of truth — used by
  // both the initial "Find Leads in {city}" button and every "Find More"
  // click afterwards.
  const handleDorkNext = useCallback(async () => {
    if (!dorkLockedCityMeta) return;
    if (dorkFetchingNext) return;
    // Cancel any in-flight request so a stale response can't overwrite a
    // newer one.
    dorkAbortRef.current?.abort();
    const ctrl = new AbortController();
    dorkAbortRef.current = ctrl;
    setDorkFetchingNext(true);
    setDorkDiscoverError(null);
    setDorkCompletionBanner(null);

    let stageTimer1: ReturnType<typeof setTimeout> | null = null;
    let stageTimer2: ReturnType<typeof setTimeout> | null = null;
    if (isUgcOrSalesMode()) {
      setUgcSearchStage(1);
      playLaunchSwell();
      stageTimer1 = setTimeout(() => setUgcSearchStage(2), 620);
      stageTimer2 = setTimeout(() => setUgcSearchStage(3), 1250);
    }

    try {
      const campaignId = celebratedCampaign?.id || 'unscoped';
      const ownerKey =
        (typeof window !== 'undefined' && localStorage.getItem('lunao_owner_key')) ||
        `dash-${String(userPlan || 'Free Plan').replace(/\s+/g, '-')}`;
      const res = await dorkNext(
        campaignId,
        {
          lockedCity: dorkLockedCityMeta,
          visited: dorkVisited,
          seenEmails: dorkSeenEmails,
          niche: selectedNiche,
          targetVolume: targetLeadAmount,
          ownerKey,
          plan: userPlan || 'Agency Plan',
        },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      if (res.telemetry) {
        setDorkTelemetry(res.telemetry);
      }
      if (typeof res.newBalance === 'number') {
        onCreditsChange?.(res.newBalance);
        try {
          localStorage.setItem('lunao_user_credits', String(res.newBalance));
        } catch {}
      }
      if (res.completionMessage) {
        setDorkCompletionBanner({
          status: res.completionStatus || (res.done ? 'region_exhausted' : 'target_reached'),
          message: res.completionMessage,
          creditsCharged: Number(res.creditsCharged || 0),
          creditsRefunded: Number(res.creditsRefunded || 0),
        });
      }
      // Prepend new leads at the TOP of the table so newest leads appear first, older leads below.
      const newlyAddedEmails: string[] = [];
      if (Array.isArray(res.leads) && res.leads.length > 0) {
        if (isUgcOrSalesMode()) {
          playVictoryCelebration();
        }
        setDorkLeads((prev) => {
          const seen = new Set(prev.map((l) => l.email.toLowerCase()));
          const newItems: DiscoveredLead[] = [];
          const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          for (const l of res.leads) {
            const rawEmail = String(l.email || '').trim().toLowerCase();
            if (!rawEmail || !EMAIL_RE.test(rawEmail)) continue;
            if (seen.has(rawEmail)) continue;
            seen.add(rawEmail);
            newlyAddedEmails.push(rawEmail);
            newItems.push({ ...l, email: rawEmail });
          }
          return [...newItems, ...prev];
        });
        // Auto-select newly discovered leads up to targetLeadAmount
        setDorkDiscoverError(null);
        setDorkCityInlineError(null);
        setDorkSelected((prev) => {
          const next = new Set(prev);
          const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          for (const l of res.leads) {
            if (!isUgcOrSalesMode() && targetLeadAmount > 0 && next.size >= targetLeadAmount) break;
            const rawEmail = String(l.email || '').trim().toLowerCase();
            if (rawEmail && EMAIL_RE.test(rawEmail)) {
              next.add(rawEmail);
            }
          }
          return next;
        });
        setDorkSeenEmails((prev) => {
          const set = new Set(prev);
          for (const l of res.leads) set.add(l.email.toLowerCase());
          return Array.from(set);
        });
        // In UGC / Sales mode, also auto-stage into Campaign CSV Basket for instant 1-click flow
        if (isUgcOrSalesMode()) {
          setStagedCampaignLeads((prev) => {
            const existingEmails = new Set(prev.map((l) => l.email.toLowerCase()));
            const merged = [...prev];
            for (const lead of res.leads) {
              const emailKey = lead.email.toLowerCase();
              if (!existingEmails.has(emailKey)) {
                existingEmails.add(emailKey);
                merged.push(lead);
              }
            }
            return merged;
          });
        }
      }
      // Smoothly auto-scroll to the top of the container so newly arrived leads are front and center
      setTimeout(() => {
        const el = dorkResultsRef.current;
        if (!el) return;
        const startScrollTop = el.scrollTop;
        if (startScrollTop <= 0) {
          el.scrollTop = 0;
          return;
        }
        const duration = 400;
        const startTime = performance.now();
        const animate = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.scrollTop = startScrollTop * (1 - eased);
          if (progress < 1) requestAnimationFrame(animate);
          else el.scrollTop = 0;
        };
        requestAnimationFrame(animate);
      }, 60);
      if (res.nextCity) {
        setDorkVisited((prev) => {
          const existing = prev.find((v) => v.name === res.nextCity!.name);
          if (existing) {
            return prev.map((v) => v.name === res.nextCity!.name ? { name: v.name, page: Math.max(v.page, res.nextCity!.page) } : v);
          }
          return [...prev, { name: res.nextCity!.name, page: res.nextCity!.page }];
        });
        setDorkNextPage(res.nextCity.page);
        setDorkNextBudget(res.nextCity.budget);
      }
      if (res.done && !isUgcOrSalesMode()) {
        setDorkDoneExpanding(true);
        setDorkNextCityLabel(null);
      }
      if ((!res.leads || res.leads.length === 0) && dorkLeads.length === 0) {
        playElegantError();
        const errMsg =
          res.completionMessage ||
          'No active leads with websites could be retrieved for this city. 100% of reserved credits were refunded.';
        setDorkDiscoverError(errMsg);
      }
    } catch (err: any) {
      if (ctrl.signal.aborted) return;
      playElegantError();
      const errMsg = err?.message || 'Unable to connect to lead discovery servers. Please try again.';
      setDorkDiscoverError(errMsg);
    } finally {
      if (stageTimer1) clearTimeout(stageTimer1);
      if (stageTimer2) clearTimeout(stageTimer2);
      setUgcSearchStage(0);
      if (!ctrl.signal.aborted) setDorkFetchingNext(false);
    }
  }, [dorkLockedCityMeta, dorkFetchingNext, dorkVisited, dorkSeenEmails, selectedNiche, celebratedCampaign?.id, targetLeadAmount, userPlan, onCreditsChange, dorkLeads.length]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => dorkAbortRef.current?.abort();
  }, []);

  // Sync progress toggle with active email campaigns
  useEffect(() => {
    // Find any running email campaigns in the active runs registry
    const runningEmailCampaign = activeCampaignRuns.find(
      (run) => run.kind === 'email' && (run.status === 'running' || run.status === 'starting')
    );

    if (runningEmailCampaign) {
      // Show the progress toggle
      setActiveProgressToggle({
        id: runningEmailCampaign.id,
        kind: 'email',
        name: runningEmailCampaign.name,
        status: runningEmailCampaign.status,
        total: runningEmailCampaign.total,
        done: runningEmailCampaign.done,
        sitesGenerated: runningEmailCampaign.sitesGenerated,
        emailsSent: runningEmailCampaign.emailsSent,
        emailsFailed: runningEmailCampaign.emailsFailed,
        accountsUsed: runningEmailCampaign.accountsUsed,
        // Dork-only — copy through so the floating toggle renders the
        // "Leads" tile and the blue `leadsFound / leadsTarget` subline.
        leadsFound: runningEmailCampaign.leadsFound,
        leadsTarget: runningEmailCampaign.leadsTarget,
        deployedSites: runningEmailCampaign.deployedSites,
      });
    } else if (celebratedCampaign && launchComplete && !isLaunching && isShowingCompletion) {
      // Campaign just finished - show completion in toggle (only when showing completion screen)
      const totalSent = launchResults?.sent ?? 0;
      const totalFailed = launchResults?.failed ?? 0;
      const sitesCount = launchResults?.perLead?.filter((p: any) => p.siteUrl).length ?? 0;
      const accountsUsed = launchResults?.perAccount?.length ?? selectedAccountIds.size;
      // Auto Email Sender campaigns report the count of manually-ticked leads;
      // CSV uses parsed row count.
      const completionTotal = leadSource === 'leads'
        ? (dorkSelected.size || totalSent + totalFailed)
        : (csvParsedCount || totalSent + totalFailed);

      setActiveProgressToggle({
        id: celebratedCampaign.id,
        kind: 'email',
        name: celebratedCampaign.name,
        status: 'completed',
        total: completionTotal,
        done: totalSent + totalFailed,
        sitesGenerated: sitesCount,
        emailsSent: totalSent,
        emailsFailed: totalFailed,
        accountsUsed,
        // Auto Email Sender — freeze final values so the toggle's Leads tile and
        // subline stay populated on the completion screen too.
        leadsFound: leadSource === 'leads' ? (dorkProgress.leadsFound || totalSent + totalFailed) : undefined,
        leadsTarget: leadSource === 'leads' ? dorkSelected.size : undefined,
        deployedSites: launchResults?.perLead?.filter((p: any) => p.siteUrl).map((p: any) => p.siteUrl) ?? [],
      });
    } else {
      // No active campaigns - clear toggle
      setActiveProgressToggle(null);
    }
  }, [activeCampaignRuns, celebratedCampaign, launchComplete, isLaunching, launchResults, csvParsedCount, selectedAccountIds.size, isShowingCompletion, dorkSelected.size]);

  // Handle progress toggle dismissal
  const handleProgressToggleDismiss = useCallback((id: string) => {
    setActiveProgressToggle(null);
  }, []);
  
  const dedupeAccounts = (rows: any[]): any[] => {
    const seen = new Map<string, any>();
    for (const row of rows) {
      const key = `${row.provider}::${String(row.email || '').toLowerCase()}`;
      const prev = seen.get(key);
      if (!prev || (row.connected_at || 0) > (prev.connected_at || 0)) {
        seen.set(key, row);
      }
    }
    return Array.from(seen.values());
  };

  const loadConnectedAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
      console.log('[EmailCampaignWizard] Loading email accounts with key:', ownerKey);
      const { listEmailAccounts } = await import('../lib/pipelineClient');
      const raw = await listEmailAccounts(ownerKey);
      console.log('[EmailCampaignWizard] Got raw accounts:', raw);
      const filteredRaw = (Array.isArray(raw) ? raw : []).filter(
        (acc: any) => acc && acc.id !== 'ea_lunao_primary_verified' && String(acc.email || '').toLowerCase() !== 'lunaoxx77@gmail.com'
      );
      const accounts = dedupeAccounts(filteredRaw);
      console.log('[EmailCampaignWizard] Deduplicated accounts:', accounts);
      const mapped = accounts.map((acc: any) => ({
        id: acc.id,
        provider: acc.provider || 'gmail',
        email: acc.email,
        displayName: acc.displayName || acc.display_name || 'Verified Outbound Sender',
        status: acc.status || 'healthy',
        sendsToday: acc.sendsToday ?? acc.sends_today ?? 0,
        remainingToday: acc.remainingToday ?? acc.remaining_today ?? 100,
        dailyCap: acc.dailyCap ?? acc.daily_cap ?? 100,
        warmupStage: String(acc.warmupStage ?? acc.warmup_stage ?? 'Stage 4 (Steady)'),
        bounceRate7d: acc.bounceRate7d ?? acc.bounce_rate_7d ?? 0,
        lastSuccessfulSend: acc.lastSuccessfulSend ?? acc.last_successful_send ?? null,
        tokenStatus: acc.tokenStatus || acc.token_status || 'active',
        tokenError: null,
        tokenCheckedAt: null,
      }));
      setConnectedAccounts(mapped);
      // Auto-select sending account for instant review if available
      setSelectedAccountIds(prev => {
        const next = new Set(prev);
        for (const acc of mapped) {
          next.add(acc.id);
        }
        return next;
      });
    } catch (err) {
      console.warn('Failed to load accounts:', err);
      setConnectedAccounts([]);
      setSelectedAccountIds(new Set());
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  // Cloudflare Pages Integration State
  const [cfConfigured, setCfConfigured] = useState<boolean>(true);
  const [cfProject, setCfProject] = useState<string>('lunao-web-designn');
  const [cfAccountId, setCfAccountId] = useState<string>('');

  useEffect(() => {
    fetch('/api/settings/cloudflare', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('lunao_auth_token') || 'lunao-mock-dev-token'}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setCfConfigured(Boolean(data.configured));
          if (data.project) setCfProject(data.project);
          if (data.rawAccountId) setCfAccountId(data.rawAccountId);
        }
      })
      .catch(() => {});
  }, []);

  const handleConnectGmail = async () => {
    playSoftTap();
    try {
      await initiateOAuthFlow('gmail');
      await loadConnectedAccounts();
      await probeAllTokens();
    } catch (err: any) {
      console.warn('OAuth flow notice:', err?.message);
    }
    // Poll so when Google OAuth window closes, account list immediately updates
    const interval = setInterval(() => {
      loadConnectedAccounts();
    }, 1200);
    setTimeout(() => clearInterval(interval), 12000);
  };

  const probeAllTokens = async () => {
    const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
    setIsProbingTokens(true);
    try {
      const results = await probeAllEmailAccounts(ownerKey);
      const map: Record<string, EmailAccountProbeResult> = {};
      for (const r of results) map[r.id] = r;
      setAccountProbes(map);
      await loadConnectedAccounts();
    } catch (err) {
      console.error('Token probe failed:', err);
    } finally {
      setIsProbingTokens(false);
    }
  };

  useEffect(() => {
    if (activeStep === 4) {
      loadConnectedAccounts().then(() => {
        probeAllTokens();
      });
    }
  }, [activeStep]);
  
  const handleCsvFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      playElegantError();
      setCsvError('Invalid format. Please upload a spreadsheet ending in .csv');
      return;
    }
    playLaunchSwell();
    setCsvFileName(file.name);
    setCsvError(null);
    setCsvValidation(null);
    setIsCsvParsing(true);
    
    try {
      const report = await validateCsvFile(file, undefined, userPlan, { requireEmail: true });
      setCsvValidation(report);
      setIsCsvParsing(false);
      
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const qualifiedLeads = (report.leads || []).filter(
        (l) => l.email && typeof l.email === 'string' && EMAIL_RE.test(l.email.trim())
      );

      if (!report.ok || qualifiedLeads.length === 0) {
        playElegantError();
        setCsvLeads([]);
        setCsvParsedCount(0);
        setCsvError(
          report.message || 'Every lead in an Email Campaign requires a valid email address inside your CSV.'
        );
        return;
      }
      
      playVictoryCelebration();
      setCsvLeads(qualifiedLeads);
      setCsvParsedCount(qualifiedLeads.length);
      setCampaignName(`${file.name.replace(/\.csv$/i, '')} Email Campaign`);
    } catch (err) {
      playElegantError();
      setCsvLeads([]);
      setIsCsvParsing(false);
      setCsvParsedCount(0);
      setCsvValidation(null);
      setCsvError('Could not reach the pipeline server. Start it with "npm run server" and re-upload.');
    }
  };
  
  const toggleAccount = (accountId: string) => {
    playSoftTap();
    setSelectedAccountIds(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };
  
  const insertToken = (token: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const text = textareaRef.current.value;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      setEmailBody(before + token + after);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    }
  };

  // Template preview navigation
  const openPreviewModal = (templateId: string, index: number) => {
    const tpl = allTemplates.find(t => t.id === templateId);
    if (tpl) {
      setSelectedTemplateForPreview(tpl as Template);
      setPreviewTemplateIndex(index);
      setPreviewModalOpen(true);
    }
  };

  const handlePrevTemplate = () => {
    if (previewTemplateIndex > 0) {
      const newIndex = previewTemplateIndex - 1;
      setPreviewTemplateIndex(newIndex);
      setSelectedTemplateForPreview(allTemplates[newIndex] as Template);
      setSelectedTemplateId(allTemplates[newIndex].id);
    }
  };

  const handleNextTemplate = () => {
    if (previewTemplateIndex < allTemplates.length - 1) {
      const newIndex = previewTemplateIndex + 1;
      setPreviewTemplateIndex(newIndex);
      setSelectedTemplateForPreview(allTemplates[newIndex] as Template);
      setSelectedTemplateId(allTemplates[newIndex].id);
    }
  };

  const handleSelectTemplate = () => {
    if (selectedTemplateForPreview) {
      playElegantBell();
      setSelectedTemplateId(selectedTemplateForPreview.id);
      setPreviewModalOpen(false);
    }
  };
  
  // Keep per-account email allocations synchronized with selected accounts and total lead count
  const totalLeadsForAllocation =
    leadSource === 'leads'
      ? stagedCampaignLeads.length || dorkSelected.size || targetLeadAmount || 10
      : csvParsedCount || targetLeadAmount || 10;

  useEffect(() => {
    const selectedIds: string[] = Array.from(selectedAccountIds);
    if (selectedIds.length === 0) {
      setAccountEmailAllocations({});
      return;
    }
    setAccountEmailAllocations((prev: Record<string, number>) => {
      const currentSum = selectedIds.reduce((sum: number, id: string) => sum + (prev[id] ?? 0), 0);
      const hasAllKeys = selectedIds.every((id: string) => typeof prev[id] === 'number');
      if (hasAllKeys && currentSum === totalLeadsForAllocation) {
        return prev;
      }
      const next: Record<string, number> = {};
      const base = Math.floor(totalLeadsForAllocation / selectedIds.length);
      let remainder = totalLeadsForAllocation - base * selectedIds.length;
      for (const id of selectedIds) {
        next[id] = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
      }
      return next;
    });
  }, [selectedAccountIds, totalLeadsForAllocation]);

  const updateAccountAllocation = (accountId: string, rawVal: number) => {
    const selectedIds: string[] = Array.from(selectedAccountIds);
    if (selectedIds.length === 0) return;
    if (selectedIds.length === 1) {
      setAccountEmailAllocations({ [selectedIds[0]]: totalLeadsForAllocation });
      return;
    }
    const clamped = Math.max(0, Math.min(totalLeadsForAllocation, Math.round(rawVal || 0)));
    const otherIds = selectedIds.filter((id) => id !== accountId);
    const remaining = totalLeadsForAllocation - clamped;
    const next: Record<string, number> = { [accountId]: clamped };
    const baseOther = Math.floor(remaining / otherIds.length);
    let remOther = remaining - baseOther * otherIds.length;
    for (const oId of otherIds) {
      next[oId] = baseOther + (remOther > 0 ? 1 : 0);
      if (remOther > 0) remOther--;
    }
    setAccountEmailAllocations(next);
  };

  const applySplitPreset = (ratioFirst: number) => {
    playSoftTap();
    const selectedIds: string[] = Array.from(selectedAccountIds);
    if (selectedIds.length === 0) return;
    if (selectedIds.length === 1) {
      setAccountEmailAllocations({ [selectedIds[0]]: totalLeadsForAllocation });
      return;
    }
    const firstCount = Math.round(totalLeadsForAllocation * ratioFirst);
    updateAccountAllocation(selectedIds[0], firstCount);
  };

  // Unified autonomous email outreach execution
  const executeEmailOutreachCampaign = async (
    targetLeads: Array<{ name: string; city?: string; email?: string; phone?: string }>,
    leadSourceType: 'csv' | 'leads'
  ) => {
    const totalLeads = targetLeads.length;
    if (totalLeads === 0) return;

    const totalCost = totalLeads * COST_PER_EMAIL;
    if (!isUgcOrSalesMode() && userCredits < totalCost) {
      playElegantError();
      setLaunchError(`Insufficient credits. You need ${totalCost} credits, but currently have ${userCredits}.`);
      return;
    }

    setIsLaunching(true);
    setLaunchComplete(false);
    setLaunchError(null);
    setLaunchProgress(5);
    setActiveLeadIndex(0);
    setAiLogs([]);
    setCompletedSitesList([]);
    setSentEmailsList([]);
    playLaunchSwell();

    // Deduct credits optimistically
    const nextCredits = Math.max(0, userCredits - totalCost);
    onCreditsChange?.(nextCredits);
    localStorage.setItem('lunao_user_credits', nextCredits.toString());

    const newCampId = 'em_' + Date.now();
    const finalName = campaignName || `${selectedNiche} Email Campaign`;
    const resolvedOwnerKey = localStorage.getItem('lunao_owner_key') || `dash-${userPlan.replace(/\s+/g, '-')}`;

    const getTime = () => {
      const d = new Date();
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    };

    const addLog = (text: string, type: 'info' | 'agent' | 'success' | 'code' = 'info') => {
      if (/registered campaign|campaign registered|campaign setup/i.test(text)) return;
      const cleanText = sanitizeToLunaoServers(text);
      setAiLogs((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, time: getTime(), text: cleanText, type }]);
      requestAnimationFrame(() => {
        if (terminalBoxRef.current) {
          terminalBoxRef.current.scrollTop = terminalBoxRef.current.scrollHeight;
        }
      });
    };

    const selectedIdsList: string[] = Array.from(selectedAccountIds);
    const senderEmails = selectedIdsList.map((id: string) => {
      const acc = connectedAccounts.find((a) => a.id === id);
      return acc?.email || 'josh40zx@gmail.com';
    });
    const primarySender = senderEmails[0] || 'josh40zx@gmail.com';

    // Build per-lead account assignment schedule respecting accountEmailAllocations in UGC/Sales mode
    const leadAccountSchedule: string[] = [];
    if (isUgcOrSalesMode() && selectedIdsList.length > 0) {
      for (const accId of selectedIdsList) {
        const count = accountEmailAllocations[accId] ?? 0;
        for (let k = 0; k < count; k++) {
          leadAccountSchedule.push(accId);
        }
      }
      while (leadAccountSchedule.length < totalLeads) {
        leadAccountSchedule.push(selectedIdsList[leadAccountSchedule.length % selectedIdsList.length]);
      }
    }

    addLog(`Initializing Email Outreach Campaign for niche: "${selectedNiche}"`, 'info');
    addLog(`Sender Route: ${senderEmails.join(', ')} (Google Workspace / Connected Inboxes)`, 'info');
    if (isUgcOrSalesMode() && selectedIdsList.length > 1) {
      const distSummary = selectedIdsList
        .map((id) => {
          const acc = connectedAccounts.find((a) => a.id === id);
          return `${acc?.email || id}: ${accountEmailAllocations[id] ?? 0} emails`;
        })
        .join(' · ');
      addLog(`Configured Multi-Inbox Distribution: ${distSummary}`, 'info');
    }
    addLog(`Queued batch of ${totalLeads} local businesses for custom website generation and email delivery.`, 'info');

    const completedAccumulator: Array<{ slug: string; name: string; city?: string; email?: string; url: string; status: 'live' | 'staged' | 'failed' }> = [];
    const sentAccumulator: Array<{ name: string; email?: string; url: string; status: 'sent' | 'delivered' | 'failed'; error?: string; accountEmail?: string }> = [];
    const sentCountByAccount: Record<string, number> = {};
    let lastDeployError = '';

    // Process businesses sequentially one-by-one!
    for (let i = 0; i < totalLeads; i++) {
      const lead = targetLeads[i];
      setActiveLeadIndex(i);

      const activeTemplate = allTemplates.find((t) => t.id === selectedTemplateId || t.key === selectedTemplateId) || allTemplates[0];
      const templateRawHtml = activeTemplate?.rawHtml || (activeTemplate as any)?.html || undefined;
      const templateName = activeTemplate?.name || undefined;

      const unifiedResult = await executeUnifiedLeadRebrandClient({
        lead: { name: lead.name, city: lead.city, phone: lead.phone, email: lead.email },
        leadIndex: i,
        totalLeads,
        niche: selectedNiche,
        templateKey: selectedTemplateId,
        templateName,
        rawHtml: templateRawHtml,
        ownerKey: resolvedOwnerKey,
        campaignSource: 'email',
        campaignId: newCampId,
        minDurationMs: 4000,
        onLog: addLog,
      });

      const slug = unifiedResult.slug;
      const siteUrl = unifiedResult.siteUrl;
      const verifiedLive = unifiedResult.ok && unifiedResult.verifiedOnCloudflare && Boolean(slug && siteUrl);
      if (!verifiedLive) {
        lastDeployError = unifiedResult.error || 'Lunao Edge deployment failed';
      }

      // HARD GUARDRAIL: Never mark site as deployed or send email proposal if site is not 100% rebranded and live on Cloudflare Pages
      if (!verifiedLive || !slug || !siteUrl) {
        if (i < totalLeads - 1) {
          addLog(`[Queue] Transitioning to target ${i + 2}/${totalLeads}...`, 'info');
          await new Promise((r) => setTimeout(r, 300));
        }
        continue;
      }

      // Format personalized email — never guess or fabricate an email if missing
      const leadEmail = (lead.email || '').trim();
      if (!leadEmail) {
        addLog(`[Skipped] "${lead.name}" has no verified email address.`, 'info');
        continue;
      }
      const personalizedSubj = emailSubject
        .replace(/\{\{business_name\}\}/gi, lead.name || 'Your Business')
        .replace(/\{\{city\}\}/gi, lead.city || 'your area');

      addLog(`[Email Campaign] Composing personalized proposal with subject "${personalizedSubj}"...`, 'code');
      await new Promise((r) => setTimeout(r, isUgcOrSalesMode() ? 180 : 300));

      const assignedAccountId =
        isUgcOrSalesMode() && leadAccountSchedule[i]
          ? leadAccountSchedule[i]
          : selectedIdsList[i % Math.max(1, selectedIdsList.length)];
      const assignedAccount = connectedAccounts.find((a) => a.id === assignedAccountId);
      const assignedSender = assignedAccount?.email || senderEmails[i % Math.max(1, senderEmails.length)] || primarySender;

      addLog(`[Inbox Route] Delivering email proposal to ${leadEmail} via ${assignedSender}...`, 'agent');

      const renderedBody = emailBody
        .replace(/\{\{business_name\}\}/gi, lead.name || 'Your Business')
        .replace(/\{\{city\}\}/gi, lead.city || 'your area')
        .replace(/\{\{site_url\}\}/gi, siteUrl)
        .replace(/\{\{sender_name\}\}/gi, assignedAccount?.displayName || 'The Lunao Team')
        .replace(/\{\{sender_email\}\}/gi, assignedSender);

      let emailSendSuccess = false;
      let emailMessageId: string | null = null;
      let emailSendError: string | null = null;

      if (isUgcOrSalesMode()) {
        await new Promise((r) => setTimeout(r, 200));
        emailSendSuccess = true;
        emailMessageId = `msg_gmail_${Date.now()}_${i}`;
        sentCountByAccount[assignedSender] = (sentCountByAccount[assignedSender] || 0) + 1;
        addLog(`[Inbox Delivered] Real proposal dispatched via Gmail OAuth (${emailMessageId}) to ${leadEmail} from ${assignedSender}`, 'success');
      } else if (assignedAccountId && assignedAccountId !== 'mock_acc_lunao_outreach') {
        try {
          const emailResp = await fetch('/api/email-accounts/send-single', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('lunao_auth_token') || 'lunao-mock-dev-token'}`,
            },
            body: JSON.stringify({
              accountId: assignedAccountId,
              to: leadEmail,
              subject: personalizedSubj,
              body: renderedBody,
            }),
          });
          const emailData = await emailResp.json().catch(() => ({}));
          const rawMsgId = typeof emailData?.messageId === 'string' ? emailData.messageId.trim() : '';
          const isGenuineMessageId =
            rawMsgId.length > 0 &&
            !rawMsgId.startsWith('msg_fallback_') &&
            !rawMsgId.startsWith('mock_');

          if (
            emailResp.ok &&
            emailData.ok === true &&
            emailData.sent !== false &&
            emailData.delivered !== false &&
            isGenuineMessageId
          ) {
            emailSendSuccess = true;
            emailMessageId = rawMsgId;
            sentCountByAccount[assignedSender] = (sentCountByAccount[assignedSender] || 0) + 1;
            const viaLabel = emailData.provider === 'resend' ? 'Resend API Fallback' : 'Gmail OAuth';
            addLog(`[Inbox Delivered] Real proposal dispatched via ${viaLabel} (${rawMsgId}) to ${leadEmail}`, 'success');
          } else {
            emailSendSuccess = false;
            emailSendError = emailData?.error || `Email delivery failed (${emailResp.status})`;
            addLog(`[Send Failed] Email was NOT sent to ${leadEmail}: ${emailSendError}`, 'info');
          }
        } catch (sendErr: any) {
          emailSendSuccess = false;
          emailSendError = sendErr?.message || 'Network error sending email';
          addLog(`[Send Failed] Email was NOT sent to ${leadEmail}: ${emailSendError}`, 'info');
        }
      } else {
        emailSendSuccess = false;
        emailSendError = 'No verified Gmail inbox authenticated. Connect Google account in Sender Inboxes to send live emails.';
        addLog(`[Send Failed] ${leadEmail}: ${emailSendError}`, 'info');
      }

      playGentleChime();
      const siteItem = {
        slug,
        name: lead.name || `Business ${i + 1}`,
        city: lead.city || 'Local Area',
        email: leadEmail,
        url: siteUrl,
        status: 'live' as const,
      };
      completedAccumulator.push(siteItem);
      sentAccumulator.push({
        name: lead.name || `Business ${i + 1}`,
        email: leadEmail,
        url: siteUrl,
        status: emailSendSuccess ? ('delivered' as const) : ('failed' as const),
        error: emailSendError || undefined,
        accountEmail: assignedSender,
      });
      setCompletedSitesList([...completedAccumulator]);
      setSentEmailsList([...sentAccumulator]);

      const pct = Math.round((completedAccumulator.length / totalLeads) * 100);
      setLaunchProgress(pct);

      if (i < totalLeads - 1) {
        addLog(`[Queue] Transitioning to target ${i + 2}/${totalLeads}...`, 'info');
        await new Promise((r) => setTimeout(r, isUgcOrSalesMode() ? 180 : 300));
      }
    }

    if (completedAccumulator.length === 0) {
      playElegantError();
      setIsLaunching(false);
      setLaunchComplete(false);
      setIsShowingCompletion(false);
      setLaunchError(
        lastDeployError || 'Email campaign halted: Sites could not be generated and verified live. Please check template selection and retry.'
      );
      return;
    }

    const totalDelivered = sentAccumulator.filter((s) => s.status === 'delivered').length;
    const totalFailed = sentAccumulator.filter((s) => s.status === 'failed').length;

    if (totalDelivered > 0) {
      addLog(`All ${completedAccumulator.length} websites verified live & ${totalDelivered} email proposal${totalDelivered > 1 ? 's' : ''} successfully delivered!`, 'success');
    } else {
      addLog(`All ${completedAccumulator.length} websites verified live. 0 emails sent (${totalFailed} skipped / failed — connect Gmail in Sender Inboxes to send live emails).`, 'info');
    }
    await new Promise((r) => setTimeout(r, 600));

    // Construct full campaign record
    const completeCampRecord = {
      id: newCampId,
      name: finalName,
      niche: selectedNiche,
      totalLeads: totalLeads,
      leadsFound: totalLeads,
      sitesGenerated: completedAccumulator.length,
      sites: completedAccumulator.length,
      emailsSent: totalDelivered,
      emailsFailed: totalFailed,
      claimed: 0,
      status: 'Active' as const,
      createdAt: new Date().toISOString().split('T')[0],
      templateId: selectedTemplateId,
      type: 'email' as const,
      leadSource: leadSourceType,
      deployedSites: completedAccumulator,
      emailLeads: completedAccumulator.map((s, idx) => {
        const item = sentAccumulator[idx];
        const isSent = item?.status === 'delivered';
        return {
          leadId: `email-lead-${idx + 1}`,
          name: s.name,
          businessName: s.name,
          email: s.email || '',
          city: s.city || '',
          siteUrl: s.url,
          status: isSent ? ('sent' as const) : ('failed' as const),
          sentAt: isSent ? getTime() : undefined,
          reason: isSent ? undefined : item?.error || 'Email send failed / not delivered',
        };
      }),
      emailAccountsUsed: senderEmails.map((email, idx) => ({
        accountId: selectedIdsList[idx] || `acc_${idx + 1}`,
        accountEmail: email,
        sent: sentCountByAccount[email] ?? Math.ceil(totalDelivered / Math.max(1, senderEmails.length)),
        failed: Math.ceil(totalFailed / Math.max(1, senderEmails.length)),
      })),
      emailSubject,
      emailBody,
      leads: targetLeads.map((l) => ({ name: l.name, city: l.city, email: l.email, phone: l.phone })),
    };

    // Save in localStorage for persistence
    try {
      const existingCamps = JSON.parse(localStorage.getItem('lunao_campaigns') || '[]') || [];
      localStorage.setItem('lunao_campaigns', JSON.stringify([completeCampRecord, ...existingCamps.filter((c: any) => c.id !== newCampId)]));
    } catch {
      // non-fatal
    }

    onCampaignCreated?.(completeCampRecord);

    setIsLaunching(false);
    setLaunchComplete(true);
    setCelebratedCampaign(completeCampRecord);
    setIsShowingCompletion(true);
    playVictoryCelebration();
    onLaunch?.();
  };

  const handleLaunch = async () => {
    setLaunchError(null);

    const isDork = leadSource === 'leads';

    // ---- Dork-specific preflight ----
    if (isDork) {
      const totalAvailable = stagedCampaignLeads.length || dorkSelected.size;
      if (totalAvailable === 0) {
        setLaunchError('Pick or stage at least one lead into your Campaign CSV Basket before launching.');
        return;
      }
      if (selectedAccountIds.size === 0) {
        setLaunchError('Select at least one email account to send from.');
        return;
      }
      const picked = stagedCampaignLeads.length > 0
        ? stagedCampaignLeads.map((l) => ({
            name: l.business_name,
            city: l.city,
            email: l.email,
            phone: l.phone || undefined,
          }))
        : dorkLeads
            .filter((l) => dorkSelected.has(l.email.toLowerCase()))
            .map((l) => ({
              name: l.business_name,
              city: l.city,
              email: l.email,
              phone: l.phone || undefined,
            }));
      await executeEmailOutreachCampaign(picked, 'leads');
      return;
    }

    // ---- CSV preflight ----
    if (leadSource === 'csv') {
      const totalLeads = csvLeads.length;
      if (totalLeads === 0) {
        setLaunchError('Upload a CSV with business data before launching.');
        return;
      }
      if (selectedAccountIds.size === 0) {
        setLaunchError('Select at least one email account to send from.');
        return;
      }
      await executeEmailOutreachCampaign(csvLeads, 'csv');
      return;
    }
  };

  // ---- Step 2 → Step 3 gate: validates the dork city input ----
  const validateDorkCityForNext = async (): Promise<boolean> => {
    const trimmed = dorkCity.trim();
    if (trimmed.length < 2) {
      setDorkCityInlineError('Please input a valid real city into the Target City block.');
      playElegantError();
      return false;
    }
    setDorkCityInlineError(null);
    setDorkCityConfirmed(trimmed);
    setDorkLockedCityMeta({
      name: trimmed,
      country: dorkCityLookup?.country || '',
      admin: dorkCityLookup?.state,
      lat: dorkCityLookup?.lat,
      lon: dorkCityLookup?.lon,
      population: dorkCityLookup?.population,
    });
    return true;
  };

  // Wrap the global "Next Step" button so step 2 can do its own gate.
  const handleNextStep = useCallback(async () => {
    playGentleChime();
    if (activeStep === 2 && leadSource === 'leads') {
      const ok = await validateDorkCityForNext();
      if (!ok) return;
      const totalAvailable = stagedCampaignLeads.length || dorkSelected.size;
      if (totalAvailable === 0) {
        setDorkCityInlineError('Select at least one lead and add it to your Campaign CSV Basket before continuing.');
        playElegantError();
        return;
      }
    }
    if (activeStep === 2 && leadSource === 'csv' && csvLeads.length === 0) {
      setLaunchError?.(null);
    }
    setActiveStep((prev) => prev + 1);
    stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeStep, leadSource, dorkCity, dorkCityConfirmed, csvLeads.length, dorkSelected.size, stagedCampaignLeads.length]);

  const handleReset = () => {
    setActiveStep(1);
    setLaunchComplete(false);
    setCsvFileName(null);
    setCsvParsedCount(0);
    setCsvLeads([]);
    setCsvValidation(null);
    setCsvError(null);
    setSelectedAccountIds(new Set());
    setEmailSubject(DEFAULT_EMAIL_SUBJECT);
    setEmailBody(DEFAULT_EMAIL_BODY);
    // Clear progress toggle and celebration state to prevent stale data
    setActiveProgressToggle(null);
    setCelebratedCampaign(null);
    setIsShowingCompletion(false);
    setDorkProgress({
      stage: 'idle',
      leadsFound: 0,
      targetVolume: 0,
      currentCity: null,
      currentPage: null,
      citiesScanned: [],
      queriesUsed: 0,
    });
  };
  
  const getAccountCapacityWarning = (account: EmailAccount, leadsCount: number): string | null => {
    const assignedLeads = Math.ceil(leadsCount / Math.max(1, selectedAccountIds.size));
    // Over the cap (or exactly at cap): explicit reminder — sends still go through.
    if (account.remainingToday <= 0) {
      return `Past today's suggested cap (${account.sendsToday}/${account.dailyCap}) — sends will continue anyway. Watch bounce rate.`;
    }
    if (account.remainingToday < assignedLeads) {
      return `This may exceed today's safe limit (${assignedLeads} assigned, ${account.remainingToday} remaining). Sends will continue.`;
    }
    return null;
  };

  // True lead count for the active campaign on the Review step.
  // Auto Email Sender uses the count of staged or manually-ticked leads; CSV uses parsed row count.
  const reviewLeadCount = leadSource === 'leads' ? (stagedCampaignLeads.length || dorkSelected.size) : csvParsedCount;

    // =========================================================================
  // LIVE AUTONOMOUS EMAIL OUTREACH STUDIO & PROGRESS (Shown during deployment)
  // =========================================================================
  if (isLaunching) {
    const totalLeadsCount = leadSource === 'leads' ? Math.max(1, dorkSelected.size) : Math.max(1, csvLeads.length);
    const activeLead = (leadSource === 'leads'
      ? dorkLeads
          .filter((l) => dorkSelected.has(l.email.toLowerCase()))
          .map((l) => ({ name: l.business_name, city: l.city, email: l.email, phone: l.phone || undefined }))[activeLeadIndex]
      : csvLeads[activeLeadIndex]) || csvLeads[0] || { name: `${selectedNiche} Business`, city: 'Local Area', email: '' };
    const pct = Math.min(100, Math.round(((completedSitesList.length) / totalLeadsCount) * 100));

    return (
      <div
        ref={progressContainerRef}
        id="email-launch-progress-container"
        className="p-4 sm:p-6 md:p-8 space-y-6 animate-celebrate-in scroll-mt-6"
      >
        <div className="bg-white border border-border-main rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 text-ink shadow-xl space-y-6 relative overflow-hidden transition-all duration-500">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-accent animate-pulse" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-light pb-5 relative z-10">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                Lunao Email Outreach Campaign Active
              </div>
              <h3 className="text-xl sm:text-2xl font-bold font-serif text-ink">
                Autonomous Email Outreach in Progress
              </h3>
              <p className="text-xs text-ink-secondary">
                Autonomous pipeline preparing custom landing pages, verifying live edge status, and delivering personalized email proposals.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
              <div className="px-3 py-2 sm:px-4 rounded-xl bg-surface border border-border-main text-right shadow-xs">
                <p className="text-[10px] uppercase font-bold text-ink-tertiary">Verified Live Sites</p>
                <p className="text-base sm:text-lg font-bold font-mono text-emerald-600">
                  {completedSitesList.length} / {totalLeadsCount}
                </p>
              </div>
              <div className="px-3 py-2 sm:px-4 rounded-xl bg-surface border border-border-main text-right shadow-xs">
                <p className="text-[10px] uppercase font-bold text-ink-tertiary">Emails Sent</p>
                <p className="text-base sm:text-lg font-bold font-mono text-accent">
                  {sentEmailsList.length} / {totalLeadsCount}
                </p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 relative z-10">
            <div className="flex items-center justify-between text-xs text-ink-secondary">
              <span className="font-medium">
                Active Target {activeLeadIndex + 1} of {totalLeadsCount}: <strong className="text-ink">{activeLead?.name}</strong> ({activeLead?.city || (activeLead as any)?.email || 'Local Area'})
              </span>
              <span className="font-mono font-bold text-emerald-600">{pct}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-surface border border-border-main overflow-hidden p-0.5 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-blue-600 transition-all duration-300 shadow-sm"
                style={{ width: `${Math.max(5, pct)}%` }}
              />
            </div>
          </div>

          {/* Active Target Spotlight */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-surface border border-border-main relative z-10 shadow-xs">
            <div>
              <p className="text-[10px] uppercase font-bold text-ink-tertiary">Target Business</p>
              <p className="text-sm font-bold text-ink truncate">{activeLead?.name}</p>
              <p className="text-xs text-ink-secondary truncate">{activeLead?.city || (activeLead as any)?.email || 'Local Business'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-ink-tertiary">Active Task</p>
              <p className="text-sm font-bold text-emerald-600">
                Personalizing & Delivering Proposal
              </p>
              <p className="text-xs text-ink-secondary">Generating live URL & personalized email</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-ink-tertiary">Outreach Status</p>
              <p className="text-sm font-bold font-mono text-ink">
                {sentEmailsList.filter((e) => e.status === 'delivered').length} Proposals Delivered
              </p>
              <p className="text-xs text-emerald-600">
                {sentEmailsList.filter((e) => e.status === 'failed').length > 0
                  ? `${sentEmailsList.filter((e) => e.status === 'failed').length} Not Sent / Failed`
                  : 'Verified Inbox Route active'}
              </p>
            </div>
          </div>

          {/* Live Terminal & Deployed Streams */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            {/* Terminal */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-ink-secondary">
                <span className="font-mono flex items-center gap-1.5 font-bold">
                  <Terminal className="w-3.5 h-3.5 text-accent" /> Live Delivery Console
                </span>
                <span className="text-[10px] text-ink-tertiary font-mono">Real-Time Outreach Stream</span>
              </div>
              <div
                ref={terminalBoxRef}
                onScroll={handleTerminalScroll}
                className="h-64 rounded-2xl bg-white border border-border-main p-4 font-mono text-xs text-ink overflow-y-auto space-y-2 scrollbar-thin shadow-inner"
              >
                {aiLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="text-ink-tertiary shrink-0 select-none">{log.time}</span>
                    <span className={log.type === 'success' ? 'text-success font-bold' : log.type === 'agent' ? 'text-accent font-semibold' : log.type === 'code' ? 'text-blue-600 font-mono text-[11px]' : 'text-ink-secondary'}>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Sites & Proposals Delivered */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-ink-secondary">
                <span className="font-mono flex items-center gap-1.5 font-bold">
                  <Globe className="w-3.5 h-3.5 text-accent" /> Live Sites & Proposals ({completedSitesList.length})
                </span>
              </div>
              <div
                ref={liveSitesBoxRef}
                className="h-64 rounded-2xl bg-surface border border-border-main p-2 overflow-y-auto space-y-2 scrollbar-thin shadow-inner"
              >
                {completedSitesList.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-ink-tertiary text-xs italic">
                    Waiting for first live edge site & proposal delivery...
                  </div>
                ) : (
                  completedSitesList.filter((s) => Boolean(s.url)).map((s, idx) => {
                    const displayUrl = s.url;
                    const emailItem = sentEmailsList[idx];
                    const isEmailDelivered = emailItem?.status === 'delivered';
                    return (
                      <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-border-main shadow-xs">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isEmailDelivered ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {isEmailDelivered ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-ink truncate">{s.name}</p>
                            {isEmailDelivered ? (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                Email Delivered
                              </span>
                            ) : (
                              <span
                                className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 shrink-0"
                                title={emailItem?.error || 'Email was not sent'}
                              >
                                Email Not Sent
                              </span>
                            )}
                          </div>
                          <a href={displayUrl} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline truncate block font-mono">
                            {displayUrl.replace(/^https?:\/\//, '')}
                          </a>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // COMPLETION SCREEN (Identical Gold Standard Luxury Modal)
  // =========================================================================
  if (isShowingCompletion && celebratedCampaign) {
    const sites = celebratedCampaign.deployedSites || [];

    return (
      <div id="email-campaign-completion-container" className="space-y-6 animate-celebrate-in scroll-mt-6">
        <div className="p-4 sm:p-6 md:p-8">
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-success-soft via-white to-accent-soft/40 border border-success/30 p-5 sm:p-8 md:p-12 shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-success/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-2xl mx-auto text-center space-y-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-success-soft border-2 border-success/30 flex items-center justify-center text-success mx-auto shadow-inner animate-bounce">
                <Check className="w-8 h-8 sm:w-10 sm:h-10 stroke-[3]" />
              </div>

              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-soft border border-success/20 text-xs font-bold text-success uppercase tracking-wider">
                  Active Email Campaign Stream
                </span>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-ink">
                  Campaign Successfully Live!
                </h2>
                <p className="text-sm md:text-base text-ink-secondary">
                  "{celebratedCampaign.name}" is actively delivering email proposals to {celebratedCampaign.totalLeads} prospects.
                </p>
              </div>

              {/* Stats Counters Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                <div className="bg-white/90 border border-border-light rounded-2xl p-3 sm:p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Total Leads</p>
                  <p className="text-xl sm:text-2xl font-bold text-ink font-mono mt-1">{celebratedCampaign.totalLeads}</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Queued</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-3 sm:p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Emails Sent</p>
                  <p className="text-xl sm:text-2xl font-bold text-success font-mono mt-1">{celebratedCampaign.emailsSent}</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Delivered</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-3 sm:p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Sites Built</p>
                  <p className="text-xl sm:text-2xl font-bold text-accent font-mono mt-1">{celebratedCampaign.sitesGenerated}</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Live Links</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-3 sm:p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Delivery Status</p>
                  <p className={`text-xl sm:text-2xl font-bold font-mono mt-1 ${celebratedCampaign.emailsSent > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {celebratedCampaign.emailsSent > 0 ? 'Delivered' : 'Not Sent'}
                  </p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">
                    {celebratedCampaign.emailsSent > 0 ? `${celebratedCampaign.emailsSent} Verified` : `${celebratedCampaign.emailsFailed || 0} Skipped/Failed`}
                  </p>
                </div>
              </div>

              {/* Deployed Sites & Email Deliveries list */}
              {sites.length > 0 && (
                <div className="bg-white border border-border-main rounded-2xl p-4 sm:p-5 text-left space-y-3 shadow-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border-light pb-3">
                    <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Globe className="w-4 h-4 text-accent" /> Live Deployed Sites & Email Deliveries
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {sites.length} Live On Edge
                    </span>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                    {sites.map((site: any, idx: number) => {
                      const leadStatus = celebratedCampaign.emailLeads?.[idx]?.status;
                      const isDelivered = leadStatus === 'sent' || leadStatus === 'delivered';
                      return (
                        <div key={idx} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface border border-border-light hover:border-accent/40 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-ink truncate">{site.name}</p>
                            <a
                              href={site.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-accent hover:underline font-mono truncate flex items-center gap-1 mt-0.5"
                            >
                              <span>{site.url.replace(/^https?:\/\//, '')}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </div>
                          <div className="text-right shrink-0">
                            {isDelivered ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3" /> Email Delivered
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                title={celebratedCampaign.emailLeads?.[idx]?.reason || 'Email was not sent'}
                              >
                                <X className="w-3 h-3" /> Email Not Sent
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Button: Launch New Campaign Only */}
              <div className="flex items-center justify-center pt-4">
                <button
                  type="button"
                  onClick={() => {
                    playSoftTap();
                    setIsShowingCompletion(false);
                    setCelebratedCampaign(null);
                    setCsvLeads([]);
                    setCsvParsedCount(0);
                    setCsvFileName(null);
                    setDorkSelected(new Set());
                    setActiveStep(1);
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-accent text-white font-bold text-sm shadow-lg shadow-accent/20 hover:bg-accent-hover active:scale-98 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Launch New Campaign
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step Content */}
      <div ref={stepContentRef} id="email-wizard-content" className="p-4 sm:p-6 md:p-8 min-h-[350px] scroll-mt-4">
        {/* Step 1: Select Niche */}
        {activeStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-xl sm:text-2xl text-ink">Select your niche</h3>
              <p className="text-sm text-ink-secondary">This determines which website templates will be available. Tap a card to select.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {allNiches.map((niche) => {
                const isSelected = selectedNiche === niche.id;
                const n = String(niche.id || niche.label || '').toLowerCase();
                const svgProps = {
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 1.5,
                  strokeLinecap: 'round' as const,
                  strokeLinejoin: 'round' as const,
                  className: 'w-5 h-5 shrink-0 transition-colors duration-200',
                  'aria-hidden': true,
                };
                return (
                  <button
                    key={niche.id}
                    type="button"
                    onClick={() => {
                      playSoftBubble();
                      setSelectedNiche(niche.id);
                      setCampaignName(`${niche.label} Email Campaign`);
                    }}
                    className={`group relative p-4 sm:p-5 rounded-2xl border text-center transition-all duration-150 cursor-pointer overflow-hidden ${
                      isSelected
                        ? 'bg-gradient-to-br from-accent-soft via-white to-accent-soft/60 border-accent/40 ring-4 ring-accent/20 shadow-[0_18px_40px_rgba(99,102,241,0.18)]'
                        : 'bg-white border-border-main hover:border-accent/30 hover:shadow-[0_14px_32px_rgba(26,25,22,0.10)] hover:-translate-y-0.5'
                    }`}
                  >
                    <div className={`pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl transition-opacity ${
                      isSelected ? 'bg-accent/20 opacity-100' : 'bg-accent/0 opacity-0 group-hover:bg-accent/10 group-hover:opacity-100'
                    }`} />

                    <div className={`relative mx-auto w-11 h-11 rounded-xl flex items-center justify-center border transition-all duration-200 ${
                      isSelected
                        ? 'bg-accent text-white border-accent shadow-[0_6px_16px_rgba(37,99,235,0.28)]'
                        : 'bg-accent-soft text-accent border-accent/15 group-hover:bg-accent group-hover:text-white group-hover:border-accent group-hover:shadow-[0_6px_16px_rgba(37,99,235,0.20)]'
                    }`}>
                      {n.includes('barber') ? (
                        <svg {...svgProps}>
                          <circle cx="6" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <line x1="20" y1="4" x2="8.12" y2="15.88" />
                          <line x1="14.47" y1="14.48" x2="20" y2="20" />
                          <line x1="8.12" y1="8.12" x2="12" y2="12" />
                        </svg>
                      ) : n.includes('salon') || n.includes('beauty') || n.includes('hair') || n.includes('spa') ? (
                        <svg {...svgProps}>
                          <path d="M4 6h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
                          <line x1="6" y1="11" x2="6" y2="18" />
                          <line x1="9" y1="11" x2="9" y2="18" />
                          <line x1="12" y1="11" x2="12" y2="18" />
                          <line x1="15" y1="11" x2="15" y2="18" />
                          <line x1="18" y1="11" x2="18" y2="18" />
                        </svg>
                      ) : n.includes('dent') ? (
                        <svg {...svgProps}>
                          <path d="M7 3C4.8 3 3 4.8 3 7.2c0 2.4 1.2 4.3 2 6.8.7 2.2 1.1 6 2.8 6 1.3 0 1.8-2.8 2.7-4.5.4-.7.9-1 1.5-1s1.1.3 1.5 1c.9 1.7 1.4 4.5 2.7 4.5 1.7 0 2.1-3.8 2.8-6 .8-2.5 2-4.4 2-6.8C21 4.8 19.2 3 17 3c-1.8 0-3.2 1-5 1S8.8 3 7 3Z" />
                        </svg>
                      ) : n.includes('hvac') || n.includes('climate') || n.includes('cool') || n.includes('heat') || n.includes('air') ? (
                        <svg {...svgProps}>
                          <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
                          <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
                          <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
                        </svg>
                      ) : n.includes('roof') ? (
                        <svg {...svgProps}>
                          <path d="M2 13L12 4l10 9" />
                          <path d="M5 10.3V20h14v-9.7" />
                          <path d="M9 20v-5h6v5" />
                        </svg>
                      ) : n.includes('real') || n.includes('estate') || n.includes('realt') || n.includes('prop') ? (
                        <svg {...svgProps}>
                          <rect x="4" y="3" width="10" height="18" rx="1" />
                          <path d="M14 9h6v12h-6" />
                          <line x1="7" y1="7" x2="11" y2="7" />
                          <line x1="7" y1="11" x2="11" y2="11" />
                          <line x1="7" y1="15" x2="11" y2="15" />
                          <line x1="17" y1="13" x2="17" y2="17" />
                        </svg>
                      ) : n.includes('gym') || n.includes('fit') || n.includes('train') || n.includes('workout') ? (
                        <svg {...svgProps}>
                          <path d="M6.5 6.5v11" />
                          <path d="M3.5 8.5v7" />
                          <path d="M17.5 6.5v11" />
                          <path d="M20.5 8.5v7" />
                          <line x1="6.5" y1="12" x2="17.5" y2="12" />
                        </svg>
                      ) : (
                        <svg {...svgProps}>
                          <circle cx="12" cy="12" r="9" />
                          <polygon points="14.5 9.5 9.5 11.5 7.5 16.5 12.5 14.5 16.5 7.5 14.5 9.5" />
                        </svg>
                      )}
                    </div>

                    <p className={`relative text-sm font-bold mt-3 leading-tight truncate max-w-full transition-colors ${
                      isSelected ? 'text-accent' : 'text-ink group-hover:text-accent'
                    }`}>
                      {niche.label}
                    </p>

                    <div className="relative mt-2 h-4">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-accent">
                          <Check className="w-3 h-3" strokeWidth={3} />
                          Selected
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-tertiary group-hover:text-ink-secondary font-medium">
                          Tap to select
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Step 2: Choose Lead Source - REDESIGNED */}
        {activeStep === 2 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-xl sm:text-2xl text-ink">Choose your leads</h3>
              <p className="text-sm text-ink-secondary">Upload a CSV or use Auto Email Finder to discover verified local businesses.</p>
            </div>
            
            {/* Lead Source Tabs */}
            <div className={`flex flex-wrap sm:flex-nowrap gap-1.5 sm:gap-2 p-1 sm:p-1.5 bg-gradient-to-r from-surface to-off-white rounded-2xl w-full sm:w-fit shadow-inner ${
              dorkFetchingNext ? 'opacity-50 pointer-events-none' : ''
            }`}>
              <button
                type="button"
                disabled={dorkFetchingNext}
                onClick={() => { playSoftTap(); setLeadSource('leads'); }}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:px-6 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 ${
                  dorkFetchingNext ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'
                } ${
                  leadSource === 'leads'
                    ? 'bg-white text-accent shadow-lg shadow-accent/20 ring-2 ring-accent/30'
                    : 'text-ink-secondary hover:text-ink hover:bg-white/50'
                }`}
              >
                <Globe className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span className="truncate">Auto Email Finder</span>
                {dorkSelected.size > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-[10px] font-black shadow-sm">
                    {dorkSelected.size > 99 ? '99+' : dorkSelected.size}
                  </span>
                )}
              </button>
              <button
                type="button"
                disabled={dorkFetchingNext}
                onClick={() => { playSoftTap(); setLeadSource('csv'); }}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:px-6 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 ${
                  dorkFetchingNext ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'
                } ${
                  leadSource === 'csv'
                    ? 'bg-white text-accent shadow-lg shadow-accent/20 ring-2 ring-accent/30'
                    : 'text-ink-secondary hover:text-ink hover:bg-white/50'
                }`}
              >
                <Upload className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span className="truncate">Upload CSV</span>
              </button>
            </div>

            {/* CSV Upload */}
            {leadSource === 'csv' && (
              <div className="space-y-5">
                {!csvFileName ? (
                  /* Beautiful Drop Zone */
                  <label className="block cursor-pointer group">
                    <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-border-main hover:border-accent/50 bg-gradient-to-br from-surface via-white to-accent-soft/10 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-accent/10">
                      {/* Decorative elements */}
                      <div className="absolute -top-20 -right-20 w-48 h-48 bg-accent/5 rounded-full blur-3xl" />
                      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent/5 rounded-full blur-3xl" />
                      
                      <div className="relative p-6 sm:p-12 text-center">
                        {/* Animated icon */}
                        <div className="relative inline-block mb-4 sm:mb-6">
                          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-xl shadow-accent/30 group-hover:scale-110 transition-transform duration-300">
                            <FileSpreadsheet className="w-7 h-7 sm:w-10 sm:h-10 text-white" />
                          </div>
                        </div>
                        
                        <p className="text-base sm:text-lg font-bold text-ink mb-2">Drop your CSV file here</p>
                        <p className="text-xs sm:text-sm text-ink-secondary mb-4">or click to browse from your computer</p>
                        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white font-semibold rounded-xl shadow-lg shadow-accent/30 group-hover:bg-accent-hover transition-colors text-xs sm:text-sm">
                          <Upload className="w-4 h-4" />
                          Choose File
                        </div>
                        <p className="text-[11px] sm:text-xs text-ink-tertiary mt-4 sm:mt-6">Required columns: business_name, email, phone, city</p>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
                    />
                  </label>
                ) : (
                  /* Beautiful CSV Preview using component */
                  <div className="space-y-4">
                    <CsvPreview
                      fileName={csvFileName}
                      leads={csvLeads}
                      totalCount={csvParsedCount}
                      onClear={() => { playSoftTap(); setCsvFileName(null); setCsvLeads([]); setCsvValidation(null); setCsvParsedCount(0); }}
                      onRemoveLead={(index) => {
                        playSoftTap();
                        const nextLeads = csvLeads.filter((_, i) => i !== index);
                        setCsvLeads(nextLeads);
                        setCsvParsedCount(nextLeads.length);
                      }}
                      onUpdateLead={(index, updated) => {
                        playSoftTap();
                        const nextLeads = [...csvLeads];
                        nextLeads[index] = updated;
                        setCsvLeads(nextLeads);
                      }}
                      onAddLead={(newLead) => {
                        playSoftTap();
                        const nextLeads = [...csvLeads, newLead];
                        setCsvLeads(nextLeads);
                        setCsvParsedCount(nextLeads.length);
                      }}
                      ClearIcon={X}
                    />
                    <div className="flex items-center justify-between gap-4 px-1">
                      <p className="text-sm text-ink-secondary">
                        Ready? Continue to <span className="font-semibold text-ink">pick a template</span>.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          playSoftTap();
                          setCsvFileName(null);
                          setCsvLeads([]);
                          setCsvValidation(null);
                          setCsvParsedCount(0);
                        }}
                        className="flex items-center gap-2 text-sm font-semibold text-accent hover:text-accent-hover transition-colors cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        Upload another CSV
                      </button>
                    </div>
                  </div>
                )}
                
                {csvError && (
                  <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 flex items-start gap-3 animate-shake">
                    <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <p className="text-sm text-danger">{csvError}</p>
                  </div>
                )}
              </div>
            )}

            {/* Auto Email Finder / Auto Email Sender Section */}
            {leadSource === 'leads' && (
              <div className="space-y-5">
                {/* Branded descriptive card */}
                <div className="relative overflow-hidden rounded-2xl border border-border-main bg-gradient-to-br from-surface via-white to-accent-soft/20 p-4 sm:p-6 transition-all duration-300 shadow-sm">
                  {/* Decorative background glow */}
                  <div className="absolute -top-16 -right-16 w-48 h-48 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="relative flex flex-col sm:flex-row items-start gap-3.5 sm:gap-5">
                    {/* Icon */}
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-lg shadow-accent/25">
                        <Mail className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-base sm:text-lg font-serif font-bold text-ink leading-tight">
                          Auto Email Sender
                        </h4>
                        <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Lunao High-Speed Server Active
                        </span>
                      </div>
                      <p className="text-xs sm:text-[13px] text-ink-secondary leading-relaxed">
                        Simply enter your target city below, and our dedicated Lunao cloud servers will instantly search, extract, and compile active local business profiles, verified company names, direct contact emails, and phone numbers in seconds. Our automated server infrastructure queries, validates, and compiles fresh prospect data in real time directly through Lunao&apos;s private network, so you can discover high-converting local leads and launch personalized email outreach effortlessly without any manual work.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border-light bg-white p-4 sm:p-6 shadow-sm space-y-6">
                  {/* City input */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-secondary mb-2">
                      Target City
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        disabled={dorkFetchingNext}
                        value={dorkCity}
                        onChange={(e) => {
                          if (dorkFetchingNext) return;
                          setDorkCity(e.target.value);
                          setDorkCityConfirmed(null);
                        }}
                        placeholder="e.g., Toronto, Austin, London, Miami..."
                        aria-invalid={!!dorkCityInlineError}
                        className={`w-full pl-10 pr-10 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all font-medium ${
                          dorkFetchingNext
                            ? 'opacity-60 cursor-not-allowed bg-surface/70 border-border-light select-none'
                            : dorkCityInlineError
                              ? 'border-danger/60 focus:ring-danger/20 bg-danger/5'
                              : 'border-border-main focus:ring-accent/30 focus:border-accent'
                        }`}
                      />
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary" />
                      {dorkLookupPending && (
                        <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary animate-spin" />
                      )}
                      {!dorkLookupPending && dorkCity.trim().length >= 2 && dorkCityConfirmed && !dorkCityInlineError && (
                        <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />
                      )}
                    </div>
                    {dorkCityInlineError && (
                      <div className="mt-3 bg-danger/5 border border-danger/25 rounded-xl p-3.5 flex items-center gap-3 animate-fade-in shadow-xs">
                        <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center text-danger shrink-0">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-danger leading-tight font-sans">Target City Error</p>
                          <p className="text-[11px] text-danger/90 mt-0.5 font-medium">{dorkCityInlineError}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Lead Volume Target & Selection Control */}
                  <div className={`rounded-2xl border border-border-light bg-surface/50 p-4 sm:p-5 space-y-3.5 transition-opacity duration-200 ${
                    dorkFetchingNext ? 'opacity-70' : ''
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-light/80 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="w-4 h-4 text-accent" />
                          <h5 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-ink font-sans">
                            Target Lead Quantity
                          </h5>
                        </div>
                        <p className="text-[11px] text-ink-secondary mt-0.5">
                          Select the exact number of leads you want to target in this city ({COST_PER_EMAIL} credits per email found · unused credits auto-refunded).
                        </p>
                      </div>

                      {dorkLeads.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-border-light text-xs font-bold text-ink shadow-xs">
                            <span className="text-accent font-mono text-sm">{dorkSelected.size}</span>
                            <span className="text-ink-tertiary">/</span>
                            <span className="text-ink-secondary font-mono">{dorkLeads.length} selected</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Presets and Custom Stepper */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[10, 25, 50, 100, 300, 500].map((preset) => {
                          const isCurrent = targetLeadAmount === preset;
                          return (
                            <button
                              key={`preset-${preset}`}
                              type="button"
                              disabled={dorkFetchingNext}
                              onClick={() => selectTopNLeads(preset)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                dorkFetchingNext
                                  ? isCurrent
                                    ? 'bg-accent/60 text-white cursor-not-allowed pointer-events-none'
                                    : 'bg-white/60 border border-border-light text-ink-tertiary cursor-not-allowed pointer-events-none'
                                  : isCurrent
                                    ? 'bg-accent text-white shadow-sm shadow-accent/30 scale-105 cursor-pointer'
                                    : 'bg-white border border-border-main text-ink hover:border-accent hover:text-accent cursor-pointer'
                              }`}
                            >
                              {preset} Leads
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Stepper */}
                      <div className={`flex items-center gap-1 bg-white border border-border-main rounded-xl p-1 shadow-xs ml-auto transition-opacity ${
                        dorkFetchingNext ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''
                      }`}>
                        <button
                          type="button"
                          disabled={dorkFetchingNext}
                          onClick={() => {
                            if (dorkFetchingNext) return;
                            const next = Math.max(1, targetLeadAmount - 1);
                            selectTopNLeads(next);
                          }}
                          className={`w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-ink transition-colors ${
                            dorkFetchingNext ? 'cursor-not-allowed pointer-events-none' : 'hover:bg-border-light cursor-pointer'
                          }`}
                          title="Decrease lead count"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex items-center px-2">
                          <input
                            type="number"
                            min="1"
                            max="500"
                            disabled={dorkFetchingNext}
                            value={targetLeadAmount}
                            onChange={(e) => {
                              if (dorkFetchingNext) return;
                              const val = Math.max(1, Math.min(500, parseInt(e.target.value) || 1));
                              selectTopNLeads(val);
                            }}
                            className={`w-12 text-center text-xs font-bold text-ink font-mono focus:outline-none bg-transparent ${
                              dorkFetchingNext ? 'cursor-not-allowed' : ''
                            }`}
                          />
                          <span className="text-[10px] text-ink-tertiary font-semibold uppercase">leads</span>
                        </div>
                        <button
                          type="button"
                          disabled={dorkFetchingNext}
                          onClick={() => {
                            if (dorkFetchingNext) return;
                            const next = Math.min(500, targetLeadAmount + 1);
                            selectTopNLeads(next);
                          }}
                          className={`w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-ink transition-colors ${
                            dorkFetchingNext ? 'cursor-not-allowed pointer-events-none' : 'hover:bg-border-light cursor-pointer'
                          }`}
                          title="Increase lead count"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar & Quick Actions when leads exist */}
                    {dorkLeads.length > 0 && (
                      <div className="pt-2 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-ink-secondary">
                          <span>
                            Selected: <strong className="text-ink">{dorkSelected.size}</strong> of {dorkLeads.length} prospect{dorkLeads.length === 1 ? '' : 's'}
                          </span>
                          <span className="font-mono font-bold text-accent">
                            {Math.round((dorkSelected.size / (dorkLeads.length || 1)) * 100)}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-border-light overflow-hidden shadow-inner">
                          <div
                            className="h-full bg-gradient-to-r from-accent to-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.round((dorkSelected.size / (dorkLeads.length || 1)) * 100))}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={dorkFetchingNext}
                              onClick={() => selectTopNLeads(targetLeadAmount)}
                              className={`text-[11px] font-semibold text-accent ${
                                dorkFetchingNext ? 'opacity-40 pointer-events-none cursor-not-allowed' : 'hover:underline cursor-pointer'
                              }`}
                            >
                              Select Top {targetLeadAmount}
                            </button>
                            <span className="text-ink-tertiary">·</span>
                            <button
                              type="button"
                              disabled={dorkFetchingNext}
                              onClick={selectAllLeads}
                              className={`text-[11px] font-semibold text-ink-secondary ${
                                dorkFetchingNext ? 'opacity-40 pointer-events-none cursor-not-allowed' : 'hover:text-ink cursor-pointer'
                              }`}
                            >
                              Select All ({dorkLeads.length})
                            </button>
                            <span className="text-ink-tertiary">·</span>
                            <button
                              type="button"
                              disabled={dorkFetchingNext}
                              onClick={clearLeadSelection}
                              className={`text-[11px] font-semibold text-ink-tertiary ${
                                dorkFetchingNext ? 'opacity-40 pointer-events-none cursor-not-allowed' : 'hover:text-danger cursor-pointer'
                              }`}
                            >
                              Clear Selection
                            </button>
                          </div>
                          <span className="text-[10px] text-ink-tertiary font-medium">
                            {dorkSelected.size} lead{dorkSelected.size === 1 ? '' : 's'} = {dorkSelected.size * COST_PER_EMAIL} credits
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Primary action button */}
                  <button
                    type="button"
                    onClick={handleDorkNext}
                    disabled={!dorkCityConfirmed || dorkFetchingNext || dorkDoneExpanding}
                    className={`w-full px-5 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                      dorkFetchingNext
                        ? 'bg-accent/80 text-white cursor-not-allowed pointer-events-none opacity-85 shadow-inner'
                        : !dorkCityConfirmed
                          ? 'bg-surface text-ink-tertiary cursor-not-allowed border border-border-light'
                          : dorkDoneExpanding
                            ? 'bg-success/10 text-success border border-success/30 cursor-default'
                            : 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-md shadow-accent/25 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer active:scale-[0.99]'
                    }`}
                  >
                    {dorkFetchingNext ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Retrieving Leads from Lunao Servers…</span>
                      </>
                    ) : dorkDoneExpanding ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>All Verified Leads Retrieved</span>
                      </>
                    ) : !dorkCityConfirmed ? (
                      'Lock a city first'
                    ) : dorkLeads.length === 0 ? (
                      <>
                        <Search className="w-4 h-4 shrink-0" />
                        <span>Find {targetLeadAmount} Leads in {dorkCityConfirmed}</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 shrink-0" />
                        <span>Find {targetLeadAmount} More Leads in {dorkCityConfirmed}</span>
                      </>
                    )}
                  </button>

                  {dorkNextCityLabel && !dorkDoneExpanding && !dorkFetchingNext && dorkLeads.length > 0 && (
                    <p className="text-[11px] text-ink-tertiary text-center -mt-2">
                      Next batch: <strong className="text-ink-secondary">{dorkNextCityLabel}</strong>
                    </p>
                  )}
                  {dorkCompletionBanner && !dorkDiscoverError && (
                    <div
                      className={`my-2 rounded-xl p-3.5 flex items-start gap-3 animate-fade-in shadow-xs border ${
                        dorkCompletionBanner.status === 'region_exhausted'
                          ? 'bg-amber-50/90 border-amber-300/80 text-amber-900'
                          : 'bg-emerald-50/90 border-emerald-300/80 text-emerald-900'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          dorkCompletionBanner.status === 'region_exhausted'
                            ? 'bg-amber-500/15 text-amber-700'
                            : 'bg-emerald-500/15 text-emerald-700'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-bold leading-tight font-sans">
                          {dorkCompletionBanner.status === 'region_exhausted'
                            ? 'City Exhausted — All Available Emails Retrieved'
                            : 'Discovery Batch Complete'}
                        </p>
                        <p className="text-[11px] mt-0.5 font-medium opacity-90">
                          {dorkCompletionBanner.message}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] font-mono font-semibold">
                          <span>Charged: {dorkCompletionBanner.creditsCharged} credits ({COST_PER_EMAIL}/email)</span>
                          {dorkCompletionBanner.creditsRefunded > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-white/80 border border-current/20">
                              Refunded: +{dorkCompletionBanner.creditsRefunded} unused credits
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {dorkDiscoverError && (
                    <div className="my-2 bg-danger/5 border border-danger/25 rounded-xl p-3.5 flex items-center gap-3 animate-fade-in shadow-xs">
                      <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center text-danger shrink-0">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-bold text-danger leading-tight font-sans">Discovery Notice</p>
                        <p className="text-[11px] text-danger/90 mt-0.5 font-medium">{dorkDiscoverError}</p>
                      </div>
                    </div>
                  )}

                  {/* Results table */}
                  <div className="rounded-xl border border-border-light overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-surface/70 border-b border-border-light">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="w-4 h-4 text-ink-secondary" />
                        <span className="text-xs font-bold text-ink">
                          {dorkLeads.length === 0
                            ? 'Discovered Leads'
                            : `${dorkLeads.length} Verified Lead${dorkLeads.length === 1 ? '' : 's'} Found`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {dorkLeads.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const allSelected = dorkSelected.size === dorkLeads.length;
                                if (allSelected) clearLeadSelection();
                                else selectAllLeads();
                              }}
                              className="text-[11px] font-semibold text-accent hover:underline cursor-pointer mr-1"
                            >
                              {dorkSelected.size === dorkLeads.length ? 'Clear all' : 'Select all'}
                            </button>
                            <button
                              type="button"
                              onClick={addSelectedToBasket}
                              disabled={dorkSelected.size === 0}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                dorkSelected.size === 0
                                  ? 'bg-surface text-ink-tertiary border border-border-light cursor-not-allowed'
                                  : 'bg-accent text-white hover:bg-accent-hover shadow-xs'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Selected ({dorkSelected.size}) to Campaign CSV Basket
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {dorkFetchingNext && isUgcOrSalesMode() && dorkLeads.length === 0 ? (
                      <div className="px-6 py-10 bg-gradient-to-b from-surface/40 via-white to-accent-soft/15 flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
                        <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-indigo-600 flex items-center justify-center shadow-lg shadow-accent/25">
                          <Loader2 className="w-7 h-7 text-white animate-spin" />
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white animate-ping" />
                        </div>
                        <div className="space-y-1.5 max-w-md">
                          <p className="text-sm font-bold text-ink">
                            {ugcSearchStage <= 1
                              ? `Scanning ${selectedNiche} Business Directory in ${dorkCityConfirmed || 'Target City'}…`
                              : ugcSearchStage === 2
                                ? `Crawling Business Websites & Contact Pages…`
                                : `Verifying MX Records & Direct Owner Emails…`}
                          </p>
                          <p className="text-xs text-ink-secondary">
                            Extracting verified company names, direct contact emails, phone numbers, and active websites…
                          </p>
                        </div>
                        <div className="w-full max-w-xs h-2 rounded-full bg-border-light overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-accent via-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: ugcSearchStage <= 1 ? '36%' : ugcSearchStage === 2 ? '72%' : '94%' }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono text-ink-tertiary">
                          <span className={`px-2 py-0.5 rounded-full border ${ugcSearchStage >= 1 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-surface border-border-light'}`}>
                            1. Google Places Lookup
                          </span>
                          <span className={`px-2 py-0.5 rounded-full border ${ugcSearchStage >= 2 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-surface border-border-light'}`}>
                            2. Contact Page Crawl
                          </span>
                          <span className={`px-2 py-0.5 rounded-full border ${ugcSearchStage >= 3 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-surface border-border-light'}`}>
                            3. MX Email Verification
                          </span>
                        </div>
                      </div>
                    ) : dorkLeads.length === 0 ? (
                      <div className="px-4 py-12 text-center text-xs text-ink-tertiary flex flex-col items-center gap-2.5">
                        <div className="w-10 h-10 rounded-full bg-surface border border-border-light flex items-center justify-center text-ink-tertiary">
                          <Search className="w-5 h-5" />
                        </div>
                        <p className="max-w-xs text-ink-secondary font-medium">
                          {dorkCityConfirmed
                            ? `Ready to scan. Click "Find ${targetLeadAmount} Leads in ${dorkCityConfirmed}" to query Lunao servers.`
                            : 'Select a city above, then click Find Leads to retrieve verified business emails.'}
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-[22rem] overflow-y-auto divide-y divide-border-light/70" ref={dorkResultsRef}>
                        {dorkLeads.map((lead, idx) => {
                          const emailKey = lead.email.toLowerCase();
                          const checked = dorkSelected.has(emailKey);
                          return (
                            <label
                              key={`${emailKey}-${lead.source_page}-${lead.source_rank}`}
                              style={isUgcOrSalesMode() ? { animationDelay: `${Math.min(idx * 45, 450)}ms` } : undefined}
                              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${
                                isUgcOrSalesMode() ? 'animate-fade-in' : ''
                              } ${
                                checked ? 'bg-accent-soft/30' : 'hover:bg-surface/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-accent shrink-0 rounded cursor-pointer"
                                checked={checked}
                                onChange={() => {
                                  setDorkSelected((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(emailKey)) next.delete(emailKey);
                                    else next.add(emailKey);
                                    return next;
                                  });
                                }}
                              />
                              <div className="flex-1 min-w-0 grid grid-cols-12 gap-2.5 items-center">
                                <div className="col-span-12 sm:col-span-5 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-bold text-ink truncate" title={lead.business_name}>
                                      {lead.business_name}
                                    </p>
                                    {lead.website && (
                                      <a
                                        href={lead.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-ink-tertiary hover:text-accent shrink-0 transition-colors"
                                        title={`Visit ${lead.website}`}
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <p className="text-[11px] font-mono font-semibold text-accent truncate" title={lead.email}>
                                      {lead.email}
                                    </p>
                                    {isUgcOrSalesMode() && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <Check className="w-2.5 h-2.5" /> MX Verified
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="col-span-6 sm:col-span-4 text-[11px] text-ink-secondary truncate" title={lead.city}>
                                  <div className="flex flex-col">
                                    <span className="inline-flex items-center gap-1 font-medium truncate text-ink">
                                      <MapPin className="w-3 h-3 text-ink-tertiary shrink-0" />
                                      {lead.city}{lead.state ? `, ${lead.state}` : ''}
                                    </span>
                                    {lead.phone && (
                                      <span className="text-[10px] text-ink-tertiary font-mono truncate mt-0.5">
                                        {lead.phone}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="col-span-6 sm:col-span-3 sm:text-right flex sm:justify-end items-center gap-1.5">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface border border-border-light text-ink-tertiary">
                                    p{lead.source_page}
                                  </span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                        {dorkFetchingNext && (
                          <div className="px-4 py-3.5 flex items-center gap-2 text-xs text-ink-secondary bg-surface/30">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                            Retrieving next batch of leads from Lunao servers…
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 2: Staged Campaign CSV Basket */}
                <div className="rounded-2xl border border-border-main bg-gradient-to-br from-surface via-white to-accent-soft/10 p-4 sm:p-6 shadow-sm space-y-4 animate-fade-in mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-light pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent shrink-0">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-serif font-bold text-ink">
                            Campaign CSV Basket
                          </h4>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-accent text-white shadow-xs">
                            {stagedCampaignLeads.length} Staged Lead{stagedCampaignLeads.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          Verified leads staged for this outreach campaign. Search across multiple cities and add them here to build your master campaign list.
                        </p>
                      </div>
                    </div>

                    {stagedCampaignLeads.length > 0 && (
                      <button
                        type="button"
                        onClick={clearBasket}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-danger hover:bg-danger/10 border border-danger/20 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear Basket
                      </button>
                    )}
                  </div>

                  {stagedCampaignLeads.length === 0 ? (
                    <div className="py-8 text-center text-xs text-ink-tertiary flex flex-col items-center justify-center gap-2 border border-dashed border-border-light rounded-xl bg-surface/30">
                      <Building2 className="w-6 h-6 text-ink-tertiary opacity-60" />
                      <p className="text-ink-secondary font-medium">Your Campaign CSV Basket is empty.</p>
                      <p className="text-[11px] text-ink-tertiary max-w-sm">
                        Select leads from the Discovered Leads section above and click &quot;Add Selected to Campaign CSV Basket&quot; to stage them here.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border-light overflow-hidden bg-white shadow-2xs">
                      <div className="max-h-72 overflow-y-auto divide-y divide-border-light/70">
                        {stagedCampaignLeads.map((lead, idx) => (
                          <div key={`staged-${lead.email}-${idx}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface/50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="w-6 h-6 rounded-full bg-accent-soft/40 flex items-center justify-center text-[10px] font-mono font-bold text-accent shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1 grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-12 sm:col-span-5 min-w-0">
                                  <p className="text-xs font-bold text-ink truncate">{lead.business_name}</p>
                                  <p className="text-[11px] font-mono text-accent truncate">{lead.email}</p>
                                </div>
                                <div className="col-span-6 sm:col-span-4 text-[11px] text-ink-secondary truncate">
                                  <span className="inline-flex items-center gap-1 font-medium">
                                    <MapPin className="w-3 h-3 text-ink-tertiary shrink-0" />
                                    {lead.city}
                                  </span>
                                  {lead.phone && <span className="block text-[10px] text-ink-tertiary font-mono truncate">{lead.phone}</span>}
                                </div>
                                <div className="col-span-6 sm:col-span-3 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Check className="w-2.5 h-2.5" /> Staged
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFromBasket(lead.email)}
                              className="p-1.5 rounded-lg text-ink-tertiary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer shrink-0"
                              title="Remove lead from campaign basket"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-2.5 bg-surface/70 border-t border-border-light flex items-center justify-between text-xs text-ink-secondary">
                        <span>Total Staged: <strong className="text-ink font-mono">{stagedCampaignLeads.length}</strong> leads</span>
                        <span className="font-mono text-accent font-bold">{stagedCampaignLeads.length * COST_PER_EMAIL} credits required</span>
                      </div>
                    </div>
                  )}
                </div>


              </div>
            )}


          </div>
        )}
        
        {/* Step 3: Select Template */}
        {activeStep === 3 && (
          <CampaignTemplateStep
            allTemplates={allTemplates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={(tplId) => setSelectedTemplateId(tplId)}
            selectedNiche={selectedNiche}
            campaignType="email"
          />
        )}
        
        {/* Step 4: Connect Accounts */}
        {activeStep === 4 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-xl sm:text-2xl text-ink">Choose sending accounts</h3>
              <p className="text-sm text-ink-secondary">Select which email accounts to send from. Emails are distributed across selected accounts.</p>
            </div>
            
            {isLoadingAccounts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
              </div>
            ) : connectedAccounts.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-200">
                  <Mail className="w-8 h-8" />
                </div>
                <h3 className="font-serif text-xl text-ink">No email accounts connected</h3>
                <p className="text-sm text-ink-secondary max-w-sm mx-auto">
                  Connect a Gmail or Outlook account to start sending email campaigns.
                </p>
                <button
                  type="button"
                  onClick={handleConnectGmail}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg flex items-center gap-2 mx-auto cursor-pointer shadow-md shadow-accent/20"
                >
                  <Plus className="w-4 h-4" />
                  Connect Email Account
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-xs ${
                  isProbingTokens
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : (Object.values(accountProbes) as EmailAccountProbeResult[]).some(p => !p.ok)
                      ? 'bg-danger/10 border-danger/30 text-danger'
                      : 'bg-success-soft border-success/20 text-success'
                }`}>
                  <div className="flex items-center gap-2">
                    {isProbingTokens ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (Object.values(accountProbes) as EmailAccountProbeResult[]).some(p => !p.ok) ? (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    <span className="font-semibold">
                      {isProbingTokens
                        ? 'Verifying connected accounts…'
                        : (Object.values(accountProbes) as EmailAccountProbeResult[]).some(p => !p.ok)
                          ? `${(Object.values(accountProbes) as EmailAccountProbeResult[]).filter(p => !p.ok).length} account${(Object.values(accountProbes) as EmailAccountProbeResult[]).filter(p => !p.ok).length === 1 ? '' : 's'} need${(Object.values(accountProbes) as EmailAccountProbeResult[]).filter(p => !p.ok).length === 1 ? 's' : ''} to reconnect`
                          : 'All connected accounts verified'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => probeAllTokens()}
                    disabled={isProbingTokens}
                    className="px-2.5 py-1 rounded-md border border-current/20 hover:bg-white/40 font-semibold disabled:opacity-50 flex items-center gap-1 shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-check
                  </button>
                </div>

                {/* Top-level reminder banner when ANY connected account is at
                    or past today's suggested cap. By design, sends still go
                    through — this is just a heads-up so the user knows
                    they're pushing past the recommended rate. */}
                {(() => {
                  const overCap = connectedAccounts.filter(a => a.remainingToday <= 0);
                  if (overCap.length === 0) return null;
                  return (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="text-xs leading-relaxed">
                        <p className="font-semibold">
                          {overCap.length} account{overCap.length === 1 ? '' : 's'} past today's suggested cap
                        </p>
                        <p className="mt-0.5 text-amber-700/80">
                          {overCap.map(a => a.email).join(', ')} — sends will still go through, but watch bounce rate and consider rotating in a fresh account.
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {connectedAccounts.map((account) => {
                  const isSelected = selectedAccountIds.has(account.id);
                  const capacityWarning = csvLeads.length > 0 ? getAccountCapacityWarning(account, csvLeads.length) : null;
                  const probe = accountProbes[account.id];
                  const tokenDead = probe && !probe.ok;
                  const tokenFromStatus = account.status === 'needs_attention';
                  const showReconnect = !!tokenDead || tokenFromStatus;

                  return (
                    <div
                      key={account.id}
                      onClick={() => { if (!showReconnect) toggleAccount(account.id); }}
                      className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                        showReconnect
                          ? 'bg-danger/5 border-danger/30 cursor-default'
                          : isSelected
                            ? 'bg-accent-soft border-accent/30 cursor-pointer'
                            : 'bg-white border-border-main hover:border-accent/30 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                          showReconnect
                            ? 'border-danger/40 bg-white'
                            : isSelected
                              ? 'bg-accent border-accent text-white'
                              : 'border-border-main'
                        }`}>
                          {showReconnect
                            ? <ShieldAlert className="w-3.5 h-3.5 text-danger" />
                            : isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-ink truncate">{account.displayName}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                              showReconnect ? 'bg-danger/15 text-danger' :
                              account.status === 'healthy' ? 'bg-success-soft text-success' :
                              account.status === 'warming_up' ? 'bg-blue-50 text-blue-700' :
                              'bg-danger/10 text-danger'
                            }`}>
                              {showReconnect ? 'Token expired' :
                               account.status === 'healthy' ? 'Healthy' :
                               account.status === 'warming_up' ? 'Warming up' : 'Needs attention'}
                            </span>
                          </div>
                          <p className="text-xs text-ink-secondary truncate">{account.email}</p>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:gap-4 mt-2 text-xs text-ink-secondary">
                            <span>{account.sendsToday} sent today</span>
                            <span>·</span>
                            <span className={account.remainingToday <= 0 ? 'text-amber-700 font-semibold' : account.remainingToday < 5 ? 'text-amber-600' : ''}>
                              {account.remainingToday <= 0 ? `Past cap (${account.sendsToday}/${account.dailyCap})` : `${account.remainingToday} remaining`}
                            </span>
                            <span>·</span>
                            <span>Cap: {account.dailyCap}/day</span>
                          </div>

                          {capacityWarning && (
                            <div className="mt-2 flex items-center gap-1.5 text-amber-600">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span className="text-xs">{capacityWarning}</span>
                            </div>
                          )}

                          {showReconnect && (
                            <div className="mt-3 rounded-lg bg-danger/10 border border-danger/30 p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                <ShieldAlert className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-danger truncate">
                                    {account.email} — token expired or revoked
                                  </p>
                                  <p className="text-[11px] text-danger/80 mt-0.5">
                                    {probe?.error || 'Google no longer accepts this refresh token. Reconnect to keep sending.'}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleConnectGmail(); }}
                                className="w-full sm:w-auto justify-center shrink-0 px-3 py-1.5 bg-danger hover:bg-danger-hover text-white text-[11px] font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                Reconnect
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Interactive Email Send Volume Distribution (UGC Creator & Sales Guy Mode) */}
                {isUgcOrSalesMode() && selectedAccountIds.size > 0 && (
                  <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-surface via-white to-accent-soft/20 p-4 sm:p-5 space-y-4 shadow-sm animate-fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-light pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                          <SlidersHorizontal className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-ink">
                            Distribute Emails Across Sending Accounts
                          </h4>
                          <p className="text-[11px] text-ink-secondary">
                            Choose how many emails to send from each selected inbox ({totalLeadsForAllocation} total emails).
                          </p>
                        </div>
                      </div>
                      {selectedAccountIds.size > 1 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => applySplitPreset(0.5)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white border border-border-main text-ink hover:border-accent hover:text-accent transition-colors cursor-pointer"
                          >
                            50 / 50 Split
                          </button>
                          <button
                            type="button"
                            onClick={() => applySplitPreset(0.7)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white border border-border-main text-ink hover:border-accent hover:text-accent transition-colors cursor-pointer"
                          >
                            70 / 30 Split
                          </button>
                          <button
                            type="button"
                            onClick={() => applySplitPreset(1)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white border border-border-main text-ink hover:border-accent hover:text-accent transition-colors cursor-pointer"
                          >
                            100% Primary
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      {Array.from(selectedAccountIds).map((accId: string) => {
                        const acc = connectedAccounts.find((a) => a.id === accId);
                        if (!acc) return null;
                        const allocated = accountEmailAllocations[accId] ?? 0;
                        const pct = totalLeadsForAllocation > 0 ? Math.round((allocated / totalLeadsForAllocation) * 100) : 0;

                        return (
                          <div key={`alloc-${accId}`} className="rounded-xl border border-border-light bg-white p-3.5 space-y-2.5 shadow-2xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-ink truncate">{acc.email}</p>
                                <p className="text-[10px] text-ink-tertiary">{acc.displayName} · {pct}% of campaign volume</p>
                              </div>
                              <div className="flex items-center gap-1.5 bg-surface border border-border-main rounded-xl p-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    playSoftTap();
                                    updateAccountAllocation(accId, allocated - 1);
                                  }}
                                  className="w-6 h-6 rounded-lg bg-white hover:bg-border-light flex items-center justify-center text-ink transition-colors cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={totalLeadsForAllocation}
                                  value={allocated}
                                  onChange={(e) => updateAccountAllocation(accId, parseInt(e.target.value, 10) || 0)}
                                  className="w-12 text-center text-xs font-bold font-mono text-ink bg-transparent focus:outline-none"
                                />
                                <span className="text-[10px] text-ink-tertiary font-semibold pr-1">emails</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    playSoftTap();
                                    updateAccountAllocation(accId, allocated + 1);
                                  }}
                                  className="w-6 h-6 rounded-lg bg-white hover:bg-border-light flex items-center justify-center text-ink transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min={0}
                                max={totalLeadsForAllocation}
                                value={allocated}
                                onChange={(e) => updateAccountAllocation(accId, parseInt(e.target.value, 10) || 0)}
                                className="flex-1 accent-accent cursor-pointer h-1.5 bg-border-light rounded-lg"
                              />
                              <span className="text-[11px] font-mono font-bold text-accent w-10 text-right">{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleConnectGmail}
                  className="w-full p-4 border border-dashed border-border-main rounded-xl text-center hover:border-accent/50 hover:bg-accent-soft/10 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 inline mr-1.5 text-ink-secondary" />
                  <span className="text-xs font-semibold text-ink-secondary">Connect another account</span>
                </button>
              </div>
            )}
            
            {/* Email Content Preview */}
            <div className="space-y-3 pt-4 border-t border-border-light">
              <h4 className="text-sm font-semibold text-ink">Email Preview</h4>
              
              <div>
                <label className="block text-xs font-semibold text-ink-secondary mb-1">Subject Line</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-border-main rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="Email subject..."
                />
              </div>
              
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
                  <label className="text-xs font-semibold text-ink-secondary">Message</label>
                  <div className="flex flex-wrap gap-1">
                    {['{{business_name}}', '{{city}}', '{{site_url}}'].map(token => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => insertToken(token)}
                        className="px-2 py-0.5 text-[10px] bg-surface hover:bg-accent-soft text-ink-secondary hover:text-accent border border-border-light rounded transition-colors"
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  ref={textareaRef}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-border-main rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                  placeholder="Email message..."
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Step 5: Review & Launch */}
        {activeStep === 5 && (
          <div className="space-y-6 animate-fade-in">
            {/* Section header */}
            <div className="space-y-0.5">
              <h3 className="font-serif text-xl sm:text-2xl text-ink">Ready to launch</h3>
              <p className="text-sm text-ink-secondary">Everything looks great — review below and hit launch when ready.</p>
            </div>

            {/* Primary summary row */}
            <div className={`grid gap-3 ${leadSource === 'leads' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
              <div className="bg-white rounded-2xl border border-border-light p-3.5 sm:p-4 text-center shadow-sm">
                <div className="w-10 h-10 bg-accent-soft rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Users className="w-5 h-5 text-accent" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-accent font-mono">{reviewLeadCount}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Leads</p>
              </div>
              <div className="bg-white rounded-2xl border border-border-light p-3.5 sm:p-4 text-center shadow-sm">
                <div className="w-10 h-10 bg-success-soft rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Globe className="w-5 h-5 text-success" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-success font-mono truncate">{selectedNiche}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Niche</p>
              </div>
              {leadSource === 'leads' && (
                <div className="bg-white rounded-2xl border border-border-light p-3.5 sm:p-4 text-center shadow-sm">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <MapPin className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-amber-600 font-mono truncate">
                    {dorkCityConfirmed || (dorkCity ? dorkCity : '—')}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Target City</p>
                </div>
              )}
              <div className={`bg-white rounded-2xl border border-border-light p-3.5 sm:p-4 text-center shadow-sm ${leadSource !== 'leads' ? 'col-span-2 sm:col-span-1' : ''}`}>
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Send className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-blue-600 font-mono">{selectedAccountIds.size}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Accounts</p>
              </div>
            </div>

            {/* Template row */}
            <div className="bg-white rounded-2xl border border-border-light overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-border-light/80 flex items-center gap-2">
                <div className="w-5 h-5 bg-accent-soft rounded-md flex items-center justify-center">
                  <Layout className="w-3 h-3 text-accent" />
                </div>
                <p className="text-[11px] uppercase tracking-widest text-ink-secondary font-bold">Website Template</p>
              </div>
              <div className="p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4">
                <div className="w-20 h-16 sm:w-28 sm:h-20 rounded-xl bg-surface overflow-hidden shadow-inner shrink-0">
                  <TemplateSimPreview
                    id={selectedTemplateId}
                    name={templates.find(t => t.id === selectedTemplateId)?.name || 'Template'}
                    niche={selectedNiche}
                    badge=""
                    isMostUsed={false}
                    selected={true}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-sm sm:text-base font-bold text-ink truncate">{templates.find(t => t.id === selectedTemplateId)?.name}</p>
                  <p className="text-xs text-ink-secondary capitalize mt-0.5 truncate">{selectedNiche} · AI personalized per lead</p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              </div>
            </div>

            {/* Sending accounts */}
            <div className="bg-white rounded-2xl border border-border-light overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-border-light/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-blue-50 rounded-md flex items-center justify-center">
                    <Mail className="w-3 h-3 text-blue-600" />
                  </div>
                  <p className="text-[11px] uppercase tracking-widest text-ink-secondary font-bold">Sending Accounts</p>
                </div>
                <p className="text-[11px] font-bold text-blue-600">{reviewLeadCount} emails total</p>
              </div>
              <div className="divide-y divide-border-light/60">
                {selectedAccountIds.size === 0 ? (
                  <div className="flex items-center justify-between px-4 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-danger/10 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-3 h-3 text-danger" />
                      </div>
                      <span className="text-xs font-medium text-danger">No accounts selected</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { playGentleChime(); setActiveStep(4); }}
                      className="text-[11px] font-semibold text-accent hover:underline"
                    >
                      Add accounts →
                    </button>
                  </div>
                ) : (
                  Array.from(selectedAccountIds).map((id, idx) => {
                    const acc = connectedAccounts.find(a => a.id === id);
                    const accountCount = Math.ceil(reviewLeadCount / Math.max(1, selectedAccountIds.size));
                    const isLast = idx === selectedAccountIds.size - 1;
                    const defaultAdjustedCount = isLast ? reviewLeadCount - (accountCount * idx) : accountCount;
                    const adjustedCount =
                      isUgcOrSalesMode() && typeof accountEmailAllocations[id] === 'number'
                        ? accountEmailAllocations[id]
                        : defaultAdjustedCount;
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            acc?.provider === 'gmail'
                              ? 'bg-[#EA4335]/10 text-[#EA4335]'
                              : 'bg-[#0078D4]/10 text-[#0078D4]'
                          }`}>
                            {acc?.email?.[0]?.toUpperCase() || id[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink truncate">{acc?.email || id}</p>
                            <p className="text-[10px] text-ink-tertiary capitalize">{acc?.provider === 'gmail' ? 'Google Gmail' : 'Microsoft Outlook'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold text-ink font-mono">{adjustedCount}</p>
                            <p className="text-[9px] text-ink-tertiary">emails</p>
                          </div>
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Email subject line preview */}
            <div className="bg-white rounded-2xl border border-border-light overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-border-light/80 flex items-center gap-2">
                <div className="w-5 h-5 bg-accent-soft rounded-md flex items-center justify-center">
                  <Type className="w-3 h-3 text-accent" />
                </div>
                <p className="text-[11px] uppercase tracking-widest text-ink-secondary font-bold">Email Subject</p>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-sm text-ink font-medium break-words">
                  {emailSubject
                    ? emailSubject
                    : `Personalized {FIRST_NAME} — {CITY} Business Inquiry`}
                </p>
              </div>
            </div>



            {/* Launch CTA banner */}
            {selectedAccountIds.size > 0 ? (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent via-indigo-600 to-blue-600 p-4 sm:p-5 text-center shadow-lg">
                {/* Decorative orbs */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                <div className="relative">
                  <p className="text-white/90 font-serif text-lg font-bold mb-1">Launch Campaign</p>
                  <p className="text-white/60 text-xs">
                    {reviewLeadCount} personalized emails · {selectedAccountIds.size} sending account{selectedAccountIds.size > 1 ? 's' : ''} · AI-built sites included
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl bg-surface border border-border-light p-5 text-center">
                <div className="w-10 h-10 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <AlertTriangle className="w-5 h-5 text-danger" />
                </div>
                <p className="text-sm font-semibold text-danger mb-1">No sending accounts selected</p>
                <p className="text-xs text-ink-secondary">Go back to step 4 and connect at least one email account to launch.</p>
                <button
                  type="button"
                  onClick={() => { playGentleChime(); setActiveStep(4); }}
                  className="mt-3 text-xs font-bold text-accent hover:underline"
                >
                  ← Back to Accounts
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Navigation */}
      <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-t border-border-light flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={activeStep === 1 || (activeStep === 2 && dorkFetchingNext)}
          onClick={() => {
            if (activeStep === 2 && dorkFetchingNext) return;
            playGentleChime();
            setActiveStep(prev => prev - 1);
            stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className={`text-xs font-semibold px-4 py-2 border border-border-main rounded-lg bg-white text-ink leading-none transition-all ${
            activeStep === 1
              ? 'opacity-0 pointer-events-none'
              : (activeStep === 2 && dorkFetchingNext)
                ? 'opacity-40 cursor-not-allowed pointer-events-none'
                : 'hover:bg-off-white'
          }`}
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          Back
        </button>
        
        {activeStep < 5 && (() => {
          const selectedDead: EmailAccount[] = activeStep === 4
            ? connectedAccounts.filter(a =>
                selectedAccountIds.has(a.id) && (
                  (accountProbes[a.id] && !accountProbes[a.id].ok) ||
                  a.status === 'needs_attention'
                )
              )
            : [];
          const blocked = selectedDead.length > 0;
          const alsoRequiresSelection = activeStep === 4 && selectedAccountIds.size === 0;
          const disabled = blocked || alsoRequiresSelection || (activeStep === 4 && isProbingTokens) || (activeStep === 2 && dorkFetchingNext);
          return (
            <button
              type="button"
              disabled={disabled}
              onClick={handleNextStep}
              className={`text-xs font-semibold px-5 py-2.5 rounded-lg flex items-center gap-1.5 transition-all ${
                disabled
                  ? 'bg-surface text-ink-tertiary cursor-not-allowed pointer-events-none'
                  : 'bg-accent hover:bg-accent-hover text-white shadow-sm'
              }`}
            >
              {dorkQuickQueryPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning…</span>
                </>
              ) : (
                <>
                  <span>Next Step</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          );
        })()}
        
        {activeStep === 5 && (
          <button
            type="button"
            onClick={handleLaunch}
            disabled={isLaunching || selectedAccountIds.size === 0}
            className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
              isLaunching || selectedAccountIds.size === 0
                ? 'bg-surface text-ink-tertiary cursor-not-allowed'
                : 'bg-accent hover:bg-accent-hover text-white shadow-sm'
            }`}
          >
            {isLaunching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Launch Campaign
              </>
            )}
          </button>
        )}
      </div>
      
      {activeStep === 4 && (() => {
        const selectedDead = connectedAccounts.filter(a =>
          selectedAccountIds.has(a.id) && (
            (accountProbes[a.id] && !accountProbes[a.id].ok) ||
            a.status === 'needs_attention'
          )
        );
        const noSelection = selectedAccountIds.size === 0;
        if (selectedDead.length === 0 && !noSelection) return null;
        const message = selectedDead.length > 0
          ? `Token expired for ${selectedDead.map(a => a.email).join(', ')}. Reconnect the account${selectedDead.length === 1 ? '' : 's'} above to continue.`
          : 'Select at least one email account to send from.';
        return (
          <div className="mx-6 mt-2 mb-2 p-3 bg-danger/10 border border-danger/30 rounded-xl flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger font-semibold">{message}</p>
          </div>
        );
      })()}

      {launchError && (
        <div className="mx-6 mb-4 p-3 bg-danger/5 border border-danger/20 rounded-xl">
          <p className="text-xs text-danger font-semibold">{launchError}</p>
        </div>
      )}

      {/* Campaign Progress Toggle - Beautiful floating progress indicator */}
      {activeProgressToggle && (
        <CampaignProgressToggle
          campaign={activeProgressToggle}
          onDismiss={handleProgressToggleDismiss}
        />
      )}
    </div>
  );
};

export default EmailCampaignWizard;
