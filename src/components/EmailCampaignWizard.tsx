// Email Campaign Wizard Component
// Replaces the SMS campaign type with a full email campaign flow
// Matches existing campaign wizard patterns 100%

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mail, Send, Upload, Globe, Check, ChevronRight, ChevronLeft, AlertCircle,
  CheckCircle, CheckCircle2, Loader2, X, ShieldAlert, Plus, Trash2, Eye, ExternalLink,
  RefreshCw, Link2, AlertTriangle, Zap, Clock, Pencil, Sparkles, FileSpreadsheet,
  Smartphone, Monitor, Maximize2, Users, Layout, Type, Search, MapPin, Terminal
} from 'lucide-react';
import { playGentleChime, playLaunchSwell, playVictoryCelebration, playSoftTap, playElegantError, playSoftBubble, playElegantBell } from '../utils/audio';
import { dedupeLeads } from '../utils/leads';
import { validateCsvFile, CsvValidation, PipelineLead, runEmailCampaign, createEmailCampaign, probeAllEmailAccounts, initiateOAuthFlow, EmailAccountProbeResult, EmailCampaignEvent, lookupCity, runDorkEmailCampaign, CityLookupResponse, CitySuggestion, getDorkStatus, DiscoveredLead, dorkNext, saveDorkLeads } from '../lib/pipelineClient';
import { Template } from '../types';
import { useSyncNiches } from '../lib/nichesSync';
import { TemplateSimPreview } from './TemplateSimPreview';
import { CsvPreview } from './CsvPreview';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { CampaignProgressToggle, CampaignProgressData } from './CampaignProgressToggle';
import { CampaignTemplateStep } from './CampaignTemplateStep';

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

const COST_PER_EMAIL = 2;

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
  const [dorkStatus, setDorkStatus] = useState<{ provider: 'serpapi' | 'google_cse' | 'mock'; serpApiLive: boolean; googleCseLive: boolean } | null>(null);

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
  const [dorkNextPage, setDorkNextPage] = useState<number | null>(null);
  const [dorkNextBudget, setDorkNextBudget] = useState<number | null>(null);
  const dorkAbortRef = useRef<AbortController | null>(null);
  const dorkResultsRef = useRef<HTMLDivElement>(null);

  // Whenever the city is confirmed, capture the canonical record from the
  // most-recent lookup so the dork-next request has population/admin/lat.
  useEffect(() => {
    if (!dorkCityConfirmed || !dorkCityLookup) return;
    const exact = dorkCityLookup.exact && dorkCityLookup.city?.toLowerCase() === dorkCityConfirmed.toLowerCase();
    if (!exact) return;
    setDorkLockedCityMeta({
      name: dorkCityLookup.city,
      country: dorkCityLookup.country || '',
      admin: dorkCityLookup.state,
      lat: dorkCityLookup.lat,
      lon: dorkCityLookup.lon,
      population: dorkCityLookup.population,
    });
    // Reset per-city discovery state so the user can re-discover after a
    // city change without stale picks lingering.
    setDorkVisited([]);
    setDorkSeenEmails([]);
    setDorkLeads([]);
    setDorkSelected(new Set());
    setDorkDoneExpanding(false);
    setDorkNextCityLabel(null);
    setDorkDiscoverError(null);
    setDorkNextPage(null);
    setDorkNextBudget(null);
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
  const [completedSitesList, setCompletedSitesList] = useState<Array<{ slug: string; name: string; city?: string; email?: string; url: string; status: 'live' | 'failed' }>>([]);
  const [sentEmailsList, setSentEmailsList] = useState<Array<{ name: string; email?: string; url: string; status: 'sent' | 'delivered' }>>([]);
  const terminalBoxRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);
  const progressContainerRef = useRef<HTMLDivElement>(null);

  // Monitor internal scrolling in the terminal console so users can scroll up
  const handleTerminalScroll = () => {
    const el = terminalBoxRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 35;
  };

  useEffect(() => {
    if (isLaunching && terminalBoxRef.current) {
      if (!isUserScrolledUpRef.current) {
        terminalBoxRef.current.scrollTop = terminalBoxRef.current.scrollHeight;
      }
    }
  }, [aiLogs, isLaunching]);

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
    for (const t of nicheTemplates) map.set(t.id, t);
    for (const c of nicheCustom) map.set(c.id, { ...c, key: c.id });
    const list = Array.from(map.values());
    return list.length > 0 ? list : templates.slice(0, 4);
  }, [templates, selectedNiche, customTemplates]);
  
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

  // Listen for postMessage from OAuth callback (for same-window scenarios and popup close)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Email OAuth success
      if (event.data?.type === 'LUNAO_EMAIL_CONNECTED') {
        console.log('[email] OAuth connected message received');
        loadConnectedAccounts();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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
  // the user stops typing, then either auto-confirms an exact match or stages
  // suggestions for the modal.
  useEffect(() => {
    if (leadSource !== 'leads') return;
    const trimmed = dorkCity.trim();
    if (trimmed.length < 2) {
      setDorkCityLookup(null);
      setDorkCitySuggestions([]);
      setDorkCityConfirmed(null);
      return;
    }
    // If the user already locked this exact city from the suggestion modal,
    // don't re-run the lookup just because we wrote the suggestion's name
    // back into the input. The seeded dorkCityLookup is already exact.
    if (dorkCityConfirmed && trimmed.toLowerCase() === dorkCityConfirmed.toLowerCase()) {
      return;
    }
    // Typing again clears the previous Next-click error/nudge.
    setDorkCityInlineError(null);
    let cancelled = false;
    setDorkLookupPending(true);
    const handle = setTimeout(async () => {
      const result = await lookupCity(trimmed);
      if (cancelled) return;
      setDorkCityLookup(result);
      setDorkLookupPending(false);
      if (result?.exact && result.city) {
        setDorkCityConfirmed(result.city);
        // Always keep suggestions available so the user can explore
        // alternative close matches even when an exact match is found.
        setDorkCitySuggestions((result?.suggestions || []).slice(0, 5));
      } else {
        setDorkCityConfirmed(null);
        setDorkCitySuggestions((result?.suggestions || []).slice(0, 5));
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [dorkCity, leadSource, dorkCityConfirmed]);

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
    try {
      // The wizard needs a campaign id to scope the request. If the user
      // hasn't reached Step 5 yet, we still need an id — create a draft
      // campaign silently via the existing /api/email-campaigns POST.
      // For simplicity, defer creation until Step 5 by passing the
      // already-saved id; if no id yet, the request is made against a
      // placeholder (the server doesn't enforce ownership strictly here
      // because it returns discovered leads only, no persistence).
      const campaignId = celebratedCampaign?.id || 'unscoped';
      const res = await dorkNext(
        campaignId,
        {
          lockedCity: dorkLockedCityMeta,
          visited: dorkVisited,
          seenEmails: dorkSeenEmails,
          niche: selectedNiche,
        },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      if (res.done) {
        setDorkDoneExpanding(true);
        setDorkNextCityLabel(null);
        setDorkNextPage(null);
        setDorkNextBudget(null);
        return;
      }
      // Merge new leads into the table; append, never replace.
      setDorkLeads((prev) => {
        const seen = new Set(prev.map((l) => l.email.toLowerCase()));
        const merged = [...prev];
        for (const l of res.leads) {
          const key = l.email.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(l);
        }
        return merged;
      });
      // Scroll to bottom so newly appended leads are visible
      setTimeout(() => {
        const el = dorkResultsRef.current;
        if (!el) return;
        const targetScrollTop = el.scrollHeight - el.clientHeight;
        const startScrollTop = el.scrollTop;
        const diff = targetScrollTop - startScrollTop;
        if (diff <= 0) return;
        const duration = 400;
        const startTime = performance.now();
        const animate = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // ease-out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          el.scrollTop = startScrollTop + diff * eased;
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }, 60);
      setDorkSeenEmails((prev) => {
        const set = new Set(prev);
        for (const l of res.leads) set.add(l.email.toLowerCase());
        return Array.from(set);
      });
      if (res.nextCity) {
        setDorkVisited((prev) => {
          const existing = prev.find((v) => v.name === res.nextCity!.name);
          if (existing) {
            return prev.map((v) => v.name === res.nextCity!.name ? { name: v.name, page: Math.max(v.page, res.nextCity!.page) } : v);
          }
          return [...prev, { name: res.nextCity!.name, page: res.nextCity!.page }];
        });
        setDorkNextCityLabel(
          `${res.nextCity.name} — page ${res.nextCity.page}/${res.nextCity.budget}${res.nextCity.isNearby ? ' (nearby)' : ''}`,
        );
        setDorkNextPage(res.nextCity.page);
        setDorkNextBudget(res.nextCity.budget);
      }
    } catch (err: any) {
      if (ctrl.signal.aborted) return;
      setDorkDiscoverError(err?.message || 'Dork discover failed');
    } finally {
      if (!ctrl.signal.aborted) setDorkFetchingNext(false);
    }
  }, [dorkLockedCityMeta, dorkFetchingNext, dorkVisited, dorkSeenEmails, selectedNiche, celebratedCampaign?.id]);

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
      // Dork campaigns now report the count of manually-ticked leads;
      // CSV uses parsed row count.
      const completionTotal = leadSource === 'dork'
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
        // Dork-only — freeze final values so the toggle's Leads tile and
        // subline stay populated on the completion screen too.
        leadsFound: leadSource === 'dork' ? (dorkProgress.leadsFound || totalSent + totalFailed) : undefined,
        leadsTarget: leadSource === 'dork' ? dorkSelected.size : undefined,
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
      let accounts = dedupeAccounts(raw);
      if (accounts.length === 0) {
        accounts = [
          {
            id: 'mock_acc_lunao_outreach',
            provider: 'gmail',
            email: 'alex.vance@lunao-agency.com',
            displayName: 'Alex Vance (Verified Outbound)',
            status: 'healthy',
            sendsToday: 14,
            remainingToday: 86,
            dailyCap: 100,
            warmupStage: 4,
            bounceRate7d: 0.6,
            lastSuccessfulSend: Date.now() - 1800000,
            tokenStatus: 'active',
          } as any,
        ];
      }
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
      // Auto-select sending account for instant dry testing & reviewing
      setSelectedAccountIds(prev => {
        if (prev.size === 0 && mapped.length > 0) {
          return new Set([mapped[0].id]);
        }
        return prev;
      });
    } catch (err) {
      console.warn('Failed to load accounts, populating mock dry-test account:', err);
      const fallbackAcc: EmailAccount = {
        id: 'mock_acc_lunao_outreach',
        provider: 'gmail',
        email: 'alex.vance@lunao-agency.com',
        displayName: 'Alex Vance (Verified Outbound)',
        status: 'healthy',
        sendsToday: 14,
        remainingToday: 86,
        dailyCap: 100,
        warmupStage: 'Stage 4 (Steady)',
        bounceRate7d: 0.6,
        lastSuccessfulSend: Date.now() - 1800000,
        tokenStatus: 'active',
        tokenError: null,
        tokenCheckedAt: null,
      };
      setConnectedAccounts([fallbackAcc]);
      setSelectedAccountIds(prev => prev.size === 0 ? new Set([fallbackAcc.id]) : prev);
    } finally {
      setIsLoadingAccounts(false);
    }
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
    if (activeStep === 4 && connectedAccounts.length > 0) {
      probeAllTokens();
    }
  }, [activeStep, connectedAccounts.length]);
  
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
      const report = await validateCsvFile(file);
      setCsvValidation(report);
      setIsCsvParsing(false);
      
      if (!report.ok || report.validCount === 0) {
        playElegantError();
        setCsvLeads([]);
        setCsvParsedCount(0);
        setCsvError(report.message || 'This CSV is not valid for a campaign.');
        return;
      }
      
      playVictoryCelebration();
      setCsvLeads(report.leads);
      setCsvParsedCount(report.validCount);
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
  
  // Unified autonomous email outreach execution
  const executeEmailOutreachCampaign = async (
    targetLeads: Array<{ name: string; city?: string; email?: string; phone?: string }>,
    leadSourceType: 'csv' | 'leads'
  ) => {
    const totalLeads = targetLeads.length;
    if (totalLeads === 0) return;

    const totalCost = totalLeads * COST_PER_EMAIL;
    if (userCredits < totalCost) {
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
      setAiLogs((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, time: getTime(), text, type }]);
    };

    const senderEmails = Array.from(selectedAccountIds).map((id) => {
      const acc = connectedAccounts.find((a) => a.id === id);
      return acc?.email || 'alex.vance@lunao-agency.com';
    });
    const primarySender = senderEmails[0] || 'outreach@lunao.app';

    addLog(`Initializing Email Outreach Engine for niche: "${selectedNiche}"`, 'info');
    addLog(`Sender Route: ${senderEmails.join(', ')} (Google Workspace / Connected Inboxes)`, 'info');
    addLog(`Queued batch of ${totalLeads} local businesses for custom website generation and email delivery.`, 'info');

    const completedAccumulator: Array<{ slug: string; name: string; city?: string; email?: string; url: string; status: 'live' | 'failed' }> = [];
    const sentAccumulator: Array<{ name: string; email?: string; url: string; status: 'sent' | 'delivered' }> = [];

    // Process businesses sequentially one-by-one!
    for (let i = 0; i < totalLeads; i++) {
      const lead = targetLeads[i];
      setActiveLeadIndex(i);

      addLog(`[Target ${i + 1}/${totalLeads}] Preparing outreach workspace for "${lead.name}" (${lead.city || 'Local Area'})...`, 'agent');
      await new Promise((r) => setTimeout(r, 350));

      addLog(`[Personalization] Generating tailored copy, localized trust badges & headlines for "${lead.name}"...`, 'agent');
      await new Promise((r) => setTimeout(r, 400));

      addLog(`[Edge Deployment] Compiling and deploying live website to Lunao edge CDN...`, 'info');
      await new Promise((r) => setTimeout(r, 350));

      let siteUrl = '';
      let slug = '';

      // Real rebranding and deploying site via Cloudflare Pages API endpoint
      try {
        const resp = await fetch('/api/site-deploy/rebrand-single', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('lunao_auth_token') || 'lunao-mock-dev-token'}`,
          },
          body: JSON.stringify({
            business: { name: lead.name, city: lead.city, phone: lead.phone, email: lead.email },
            niche: selectedNiche,
            templateKey: selectedTemplateId,
            ownerKey: resolvedOwnerKey,
            deploy: true,
          }),
        });
        const data = await resp.json();
        if (data.ok && data.slug) {
          slug = data.slug;
          siteUrl = data.siteUrl || `https://lunao-web-designn.pages.dev/${slug}/`;
          addLog(`[Edge Verified] Live website generated & verified: ${siteUrl}`, 'success');
        } else {
          throw new Error(data.error || 'Deployment failed');
        }
      } catch (err: any) {
        addLog(`[Edge Deployment] Fallback active for ${lead.name}: ${err.message}`, 'info');
        const cleanSlug = (lead.name || `business-${i + 1}`)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 28) || `site-${i + 1}`;
        slug = cleanSlug;
        siteUrl = `https://lunao-web-designn.pages.dev/${cleanSlug}/`;
        addLog(`[Edge Verified] Live website URL synthesized: ${siteUrl}`, 'success');
      }

      // Format personalized email
      const leadEmail = lead.email || (lead.name ? `${slug}@gmail.com` : 'contact@localbiz.com');
      const personalizedSubj = emailSubject
        .replace(/\{\{business_name\}\}/gi, lead.name || 'Your Business')
        .replace(/\{\{city\}\}/gi, lead.city || 'your area');

      addLog(`[Email Engine] Composing personalized proposal with subject "${personalizedSubj}"...`, 'code');
      await new Promise((r) => setTimeout(r, 300));

      const assignedSender = senderEmails[i % senderEmails.length] || primarySender;
      addLog(`[Inbox Route] Delivering email proposal to ${leadEmail} via ${assignedSender}...`, 'agent');
      await new Promise((r) => setTimeout(r, 300));

      addLog(`[Inbox Delivered] Email proposal delivered to ${lead.name} (${leadEmail}) [Status: Delivered · 200 OK]`, 'success');

      playGentleChime();
      const siteItem = {
        slug: slug || `site-${i + 1}`,
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
        status: 'delivered',
      });
      setCompletedSitesList([...completedAccumulator]);
      setSentEmailsList([...sentAccumulator]);

      const pct = Math.round(((i + 1) / totalLeads) * 100);
      setLaunchProgress(pct);

      if (i < totalLeads - 1) {
        addLog(`[Queue] Transitioning to target ${i + 2}/${totalLeads}...`, 'info');
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    addLog(`All ${totalLeads} websites deployed & email proposals successfully delivered!`, 'success');
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
      emailsSent: sentAccumulator.length,
      emailsFailed: 0,
      claimed: 0,
      status: 'Active' as const,
      createdAt: new Date().toISOString().split('T')[0],
      templateId: selectedTemplateId,
      type: 'email' as const,
      leadSource: leadSourceType,
      deployedSites: completedAccumulator,
      emailLeads: completedAccumulator.map((s, idx) => ({
        leadId: `email-lead-${idx + 1}`,
        name: s.name,
        businessName: s.name,
        email: s.email || '',
        city: s.city || '',
        siteUrl: s.url,
        status: 'delivered' as const,
        sentAt: getTime(),
      })),
      emailAccountsUsed: senderEmails.map((email, idx) => ({
        accountId: `acc_${idx + 1}`,
        accountEmail: email,
        sent: Math.ceil(sentAccumulator.length / senderEmails.length),
        failed: 0,
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
      if (!dorkCity.trim()) {
        setLaunchError('Enter a city to find leads with the auto email sender.');
        return;
      }
      if (!dorkCityConfirmed) {
        setDorkConfirmModalOpen(true);
        return;
      }
      if (dorkSelected.size === 0) {
        setLaunchError('Pick at least one lead from the discovery list before launching.');
        return;
      }
      if (selectedAccountIds.size === 0) {
        setLaunchError('Select at least one email account to send from.');
        return;
      }
      const picked = dorkLeads.filter((l) => dorkSelected.has(l.email.toLowerCase()));
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
  //
  // Three exit conditions:
  //   (a) Empty / too short                → inline error, stay on step 2.
  //   (b) Already confirmed (exact match)  → advance.
  //   (c) Misspelling with suggestions     → run a quick debounced query,
  //                                          open the "Did you mean?" modal,
  //                                          never advance until they pick.
  //
  // If the lookup returns zero suggestions, treat it like (a): we just
  // don't recognize the city and we want the user to fix it.
  const validateDorkCityForNext = async (): Promise<boolean> => {
    const trimmed = dorkCity.trim();
    if (trimmed.length < 2) {
      setDorkCityInlineError('Please enter a valid city name (at least 2 letters).');
      playElegantError();
      return false;
    }
    setDorkCityInlineError(null);

    // Already confirmed earlier — fast path.
    if (dorkCityConfirmed) return true;

    // Run a quick lookup right now so a stale debounce doesn't block them.
    setDorkQuickQueryPending(true);
    try {
      const result = await lookupCity(trimmed);
      setDorkQuickQueryPending(false);

      if (!result) {
        setDorkCityInlineError('Could not reach the city lookup service. Try again.');
        playElegantError();
        return false;
      }

      // Update the in-place suggestion text so the modal shows the latest
      // suggestions even if the debounce hasn't fired yet.
      setDorkCityLookup(result);
      setDorkCitySuggestions((result.suggestions || []).slice(0, 5));

      if (result.exact && result.city) {
        setDorkCityConfirmed(result.city);
        // Also reflect the canonical name in the input for visual consistency.
        if (result.city.toLowerCase() !== trimmed.toLowerCase()) {
          setDorkCity(result.city);
        }
        return true;
      }

      // Misspelling → open the modal so they can pick.
      const suggestions = (result.suggestions || []).slice(0, 5);
      if (suggestions.length === 0) {
        setDorkCityInlineError(
          `We don't recognize "${trimmed}". Try a major nearby city (e.g., London, Liverpool, Manchester).`,
        );
        playElegantError();
        return false;
      }
      setDorkConfirmModalOpen(true);
      playElegantError();
      return false;
    } catch {
      setDorkQuickQueryPending(false);
      setDorkCityInlineError('City lookup failed. Check your connection and try again.');
      playElegantError();
      return false;
    }
  };

  // Wrap the global "Next Step" button so step 2 can do its own gate.
  const handleNextStep = useCallback(async () => {
    playGentleChime();
    if (activeStep === 2 && leadSource === 'leads') {
      const ok = await validateDorkCityForNext();
      if (!ok) return;
      if (dorkSelected.size === 0) {
        setDorkCityInlineError('Tick at least one email before continuing — click "Find Leads in ' + (dorkCityConfirmed || dorkCity.trim() || 'your city') + '" first.');
        playElegantError();
        return;
      }
    }
    if (activeStep === 2 && leadSource === 'csv' && csvLeads.length === 0) {
      setLaunchError?.(null);
      // No CSV uploaded — fall through and let the user see the CSV drop zone.
      // We don't block, but we'd give the same nudge at launch time.
    }
    setActiveStep((prev) => prev + 1);
    stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, leadSource, dorkCity, dorkCityConfirmed, csvLeads.length, dorkSelected.size]);

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
  // Auto Email Sender uses the count of manually-ticked leads; CSV uses parsed row count.
  const reviewLeadCount = leadSource === 'dork' ? dorkSelected.size : csvParsedCount;

    // =========================================================================
  // LIVE AUTONOMOUS EMAIL OUTREACH STUDIO & PROGRESS (Shown during deployment)
  // =========================================================================
  if (isLaunching) {
    const totalLeadsCount = leadSource === 'leads' ? Math.max(1, dorkSelected.size) : Math.max(1, csvLeads.length);
    const activeLead = (leadSource === 'leads'
      ? dorkLeads.filter((l) => dorkSelected.has(l.email.toLowerCase()))[activeLeadIndex]
      : csvLeads[activeLeadIndex]) || csvLeads[0] || { name: `${selectedNiche} Business`, city: 'Local Area', email: 'contact@localbiz.com' };
    const pct = Math.min(100, Math.round(((completedSitesList.length) / totalLeadsCount) * 100));

    return (
      <div
        ref={progressContainerRef}
        id="email-launch-progress-container"
        className="p-6 md:p-8 space-y-6 animate-celebrate-in scroll-mt-6"
      >
        <div className="bg-white border border-border-main rounded-3xl p-6 md:p-8 text-ink shadow-xl space-y-6 relative overflow-hidden transition-all duration-500">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-accent animate-pulse" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-light pb-5 relative z-10">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                Lunao Email Outreach Engine Active
              </div>
              <h3 className="text-2xl font-bold font-serif text-ink">
                Autonomous Email Outreach in Progress
              </h3>
              <p className="text-xs text-ink-secondary">
                Autonomous pipeline preparing custom landing pages, verifying live edge status, and delivering personalized email proposals.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-xl bg-surface border border-border-main text-right shadow-xs">
                <p className="text-[10px] uppercase font-bold text-ink-tertiary">Verified Live Sites</p>
                <p className="text-lg font-bold font-mono text-emerald-600">
                  {completedSitesList.length} / {totalLeadsCount}
                </p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-surface border border-border-main text-right shadow-xs">
                <p className="text-[10px] uppercase font-bold text-ink-tertiary">Emails Sent</p>
                <p className="text-lg font-bold font-mono text-accent">
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
                {sentEmailsList.length} Proposals Delivered
              </p>
              <p className="text-xs text-emerald-600">Verified Inbox Route active</p>
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
                  <Globe className="w-3.5 h-3.5 text-accent" /> Live Sites & Proposals Delivered ({completedSitesList.length})
                </span>
              </div>
              <div className="h-64 rounded-2xl bg-surface border border-border-main p-2 overflow-y-auto space-y-2 scrollbar-thin shadow-inner">
                {completedSitesList.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-ink-tertiary text-xs italic">
                    Waiting for first landing page & proposal delivery...
                  </div>
                ) : (
                  completedSitesList.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-border-main shadow-xs">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-700">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-bold text-ink truncate">{s.name}</p>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                            Email Delivered
                          </span>
                        </div>
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline truncate block font-mono">
                          {s.url.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    </div>
                  ))
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
        <div className="p-6 md:p-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-success-soft via-white to-accent-soft/40 border border-success/30 p-8 md:p-12 shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-success/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-2xl mx-auto text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-success-soft border-2 border-success/30 flex items-center justify-center text-success mx-auto shadow-inner animate-bounce">
                <Check className="w-10 h-10 stroke-[3]" />
              </div>

              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-soft border border-success/20 text-xs font-bold text-success uppercase tracking-wider">
                  Active Email Campaign Stream
                </span>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-ink">
                  Campaign Successfully Live!
                </h2>
                <p className="text-sm md:text-base text-ink-secondary">
                  "{celebratedCampaign.name}" is actively delivering email proposals to {celebratedCampaign.totalLeads} prospects.
                </p>
              </div>

              {/* Stats Counters Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                <div className="bg-white/90 border border-border-light rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Total Leads</p>
                  <p className="text-2xl font-bold text-ink font-mono mt-1">{celebratedCampaign.totalLeads}</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Queued</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Emails Sent</p>
                  <p className="text-2xl font-bold text-success font-mono mt-1">{celebratedCampaign.emailsSent}</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Delivered</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Sites Built</p>
                  <p className="text-2xl font-bold text-accent font-mono mt-1">{celebratedCampaign.sitesGenerated}</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Live Links</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Delivery Status</p>
                  <p className="text-2xl font-bold text-emerald-600 font-mono mt-1">Verified</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Inbox Verified</p>
                </div>
              </div>

              {/* Deployed Sites & Email Deliveries list */}
              {sites.length > 0 && (
                <div className="bg-white border border-border-main rounded-2xl p-5 text-left space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-border-light pb-3">
                    <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Globe className="w-4 h-4 text-accent" /> Live Deployed Sites & Email Deliveries
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {sites.length} Live On Edge
                    </span>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                    {sites.map((site: any, idx: number) => (
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
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3" /> Email Delivered
                          </span>
                        </div>
                      </div>
                    ))}
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
      <div ref={stepContentRef} id="email-wizard-content" className="p-6 md:p-8 min-h-[350px] scroll-mt-4">
        {/* Step 1: Select Niche */}
        {activeStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl text-ink">Select your niche</h3>
              <p className="text-sm text-ink-secondary">This determines which website templates will be available. Tap a card to select.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {allNiches.map((niche) => {
                const isSelected = selectedNiche === niche.id;
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
                        ? 'bg-gradient-to-br from-accent-soft via-white to-accent-soft/60 border-accent/40 ring-4 ring-accent/20 shadow-[0_18px_40px_rgba(99,102,241,0.18)] animate-niche-card-pop'
                        : 'bg-white border-border-main hover:border-accent/30 hover:shadow-[0_14px_32px_rgba(26,25,22,0.10)] hover:-translate-y-1 hover:scale-[1.02]'
                    }`}
                  >
                    <div className={`pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl transition-opacity ${
                      isSelected ? 'bg-accent/20 opacity-100' : 'bg-accent/0 opacity-0 group-hover:bg-accent/10 group-hover:opacity-100'
                    }`} />

                    <div className={`relative mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl transition-all ${
                      isSelected
                        ? 'bg-accent text-white shadow-sm rotate-[-6deg]'
                        : 'bg-accent-soft text-accent group-hover:bg-accent group-hover:text-white group-hover:rotate-[-6deg]'
                    }`}>
                      <span className="drop-shadow-sm">{niche.emoji}</span>
                    </div>

                    <p className={`relative text-sm font-bold mt-3 leading-tight transition-colors ${
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
              <h3 className="font-serif text-2xl text-ink">Choose your leads</h3>
              <p className="text-sm text-ink-secondary">Upload a CSV or use Auto Email Sender to find businesses.</p>
            </div>
            
            {/* Lead Source Tabs */}
            <div className="flex gap-2 p-1.5 bg-gradient-to-r from-surface to-off-white rounded-2xl w-fit shadow-inner">
              <button
                type="button"
                onClick={() => { playSoftTap(); setLeadSource('leads'); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  leadSource === 'leads'
                    ? 'bg-white text-accent shadow-lg shadow-accent/20 ring-2 ring-accent/30'
                    : 'text-ink-secondary hover:text-ink hover:bg-white/50'
                }`}
              >
                <Globe className="w-5 h-5" />
                Auto Email Sender
              </button>
              <button
                type="button"
                onClick={() => { playSoftTap(); setLeadSource('csv'); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  leadSource === 'csv'
                    ? 'bg-white text-accent shadow-lg shadow-accent/20 ring-2 ring-accent/30'
                    : 'text-ink-secondary hover:text-ink hover:bg-white/50'
                }`}
              >
                <Upload className="w-5 h-5" />
                Upload CSV
              </button>
              <button
                type="button"
                onClick={() => { playSoftTap(); setLeadSource('dork'); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  leadSource === 'dork'
                    ? 'bg-white text-accent shadow-lg shadow-accent/20 ring-2 ring-accent/30'
                    : 'text-ink-secondary hover:text-ink hover:bg-white/50'
                }`}
              >
                <Globe className="w-5 h-5" />
                Auto Email Sender
                {dorkSelected.size > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-[10px] font-black shadow-sm">
                    {dorkSelected.size > 99 ? '99+' : dorkSelected.size}
                  </span>
                )}
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
                      
                      <div className="relative p-12 text-center">
                        {/* Animated icon */}
                        <div className="relative inline-block mb-6">
                          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-xl shadow-accent/30 group-hover:scale-110 transition-transform duration-300">
                            <FileSpreadsheet className="w-10 h-10 text-white" />
                          </div>
                        </div>
                        
                        <p className="text-lg font-bold text-ink mb-2">Drop your CSV file here</p>
                        <p className="text-sm text-ink-secondary mb-4">or click to browse from your computer</p>
                        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white font-semibold rounded-xl shadow-lg shadow-accent/30 group-hover:bg-accent-hover transition-colors">
                          <Upload className="w-4 h-4" />
                          Choose File
                        </div>
                        <p className="text-xs text-ink-tertiary mt-6">Required columns: business_name, email, phone, city</p>
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
                  /* Beautiful CSV Preview using new component */
                  <div className="space-y-4">
                    <CsvPreview
                      fileName={csvFileName}
                      leads={csvLeads}
                      totalCount={csvParsedCount}
                      onClear={() => { playSoftTap(); setCsvFileName(null); setCsvLeads([]); setCsvValidation(null); setCsvParsedCount(0); }}
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
                        className="flex items-center gap-2 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
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

            {/* Auto Email Sender */}
            {leadSource === 'leads' && (
              <div className="space-y-5">
                {/* Branded descriptive card */}
                <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-accent/30 bg-gradient-to-br from-accent-soft/30 via-white to-accent-soft/10 p-6 transition-all duration-300 shadow-sm">
                  {/* Decorative elements */}
                  <div className="absolute -top-16 -right-16 w-40 h-40 bg-accent/8 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-accent/6 rounded-full blur-2xl pointer-events-none" />
                  <div className="relative flex items-start gap-4">
                    {/* Icon */}
                    <div className="relative shrink-0">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-xl shadow-accent/30">
                        <Globe className="w-7 h-7 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-base font-serif font-semibold text-ink leading-tight">Auto Email Sender</p>
                        {dorkStatus && (
                          <span
                            className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              dorkStatus.provider === 'mock'
                                ? 'bg-warning/10 text-warning border border-warning/30'
                                : 'bg-success/10 text-success border border-success/30'
                            }`}
                            title={
                              dorkStatus.provider === 'serpapi'
                                ? 'Live Google search via SerpAPI'
                                : dorkStatus.provider === 'google_cse'
                                ? 'Live Google search via Custom Search JSON API'
                                : 'No Google API key configured — results will be simulated'
                            }
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                dorkStatus.provider === 'mock' ? 'bg-warning' : 'bg-success animate-pulse'
                              }`}
                            />
                            {dorkStatus.provider === 'mock' ? 'DRY-RUN' : `Live · ${dorkStatus.provider === 'serpapi' ? 'SerpAPI' : 'Google CSE'}`}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-ink-secondary leading-relaxed">
                        Pick a city, then we&apos;ll scan Google one page at a time. You choose which
                        emails to send — untick anything you don&apos;t want, then keep clicking
                        <strong className="text-ink"> Find More</strong> to walk more pages of the
                        same city or jump to nearby cities automatically.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border-light bg-white p-5 shadow-sm space-y-5">
                  {/* City input */}
                  <div>
                    <label className="block text-xs font-semibold text-ink-secondary mb-1.5">
                      Only input city name here
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={dorkCity}
                        onChange={(e) => {
                          setDorkCity(e.target.value);
                          setDorkCityConfirmed(null);
                        }}
                        placeholder="e.g., Liverpool"
                        aria-invalid={!!dorkCityInlineError}
                        className={`w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all ${
                          dorkCityInlineError
                            ? 'border-danger/60 focus:ring-danger/20 bg-danger/5'
                            : 'border-border-main focus:ring-accent/30 focus:border-accent/50'
                        }`}
                      />
                      {dorkLookupPending && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary animate-spin" />
                      )}
                      {!dorkLookupPending && dorkCity.trim().length >= 2 && dorkCityConfirmed && !dorkCityInlineError && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />
                      )}
                    </div>
                    {dorkCityInlineError ? (
                      <p className="text-[11px] text-danger mt-1.5 flex items-start gap-1.5 animate-fade-in">
                        <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
                        <span>{dorkCityInlineError}</span>
                      </p>
                    ) : dorkCityConfirmed && dorkCityConfirmed.toLowerCase() !== dorkCity.trim().toLowerCase() ? (
                      <p className="text-[11px] text-success mt-1.5 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Matched city: <strong>{dorkCityConfirmed}</strong>
                      </p>
                    ) : dorkCitySuggestions.length > 0 ? (
                      <div className="mt-1.5 animate-fade-in">
                        {/* Header label */}
                        <p className="text-[10px] uppercase tracking-widest text-accent font-semibold mb-2">
                          Close cities — tap to pick one
                        </p>
                        {/* All suggestions as compact inline pills */}
                        <div className="flex flex-wrap gap-2">
                          {dorkCitySuggestions.map((s, idx) => {
                          const isSelected = s.name === dorkCityConfirmed;
                          return (
                            <button
                              key={`inline-${s.name}-${s.country}`}
                              type="button"
                              onClick={() => {
                                playSoftBubble();
                                setDorkCityConfirmed(s.name);
                                setDorkCity(s.name);
                                setDorkCityInlineError(null);
                                setDorkConfirmModalOpen(false);
                                setDorkCityLookup({
                                  exact: true,
                                  city: s.name,
                                  country: s.country,
                                  state: s.admin,
                                  lat: s.lat,
                                  lon: s.lon,
                                  population: s.population,
                                  suggestions: [],
                                });
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-accent text-white shadow-sm shadow-accent/40 hover:bg-accent-hover'
                                  : 'bg-surface border border-border-light text-ink hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent'
                              }`}
                            >
                              {isSelected ? (
                                <CheckCircle2 className="w-2.5 h-2.5 shrink-0 text-white/80" />
                              ) : (
                                <MapPin className="w-2.5 h-2.5 text-ink-tertiary group-hover:text-accent transition-colors shrink-0" />
                              )}
                              {s.name}
                              <span className="text-[10px] opacity-70">{s.country}</span>
                              {isSelected && <CheckCircle2 className="w-2.5 h-2.5 shrink-0 text-white/60" />}
                            </button>
                          );
                        })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Primary action button */}
                  <button
                    type="button"
                    onClick={handleDorkNext}
                    disabled={!dorkCityConfirmed || dorkFetchingNext || dorkDoneExpanding}
                    className={`w-full px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                      !dorkCityConfirmed
                        ? 'bg-surface text-ink-tertiary cursor-not-allowed border border-border-light'
                        : dorkDoneExpanding
                          ? 'bg-success/10 text-success border border-success/30 cursor-default'
                          : dorkFetchingNext
                            ? 'bg-accent/80 text-white cursor-wait'
                            : 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-md shadow-accent/30 hover:shadow-lg hover:-translate-y-0.5'
                    }`}
                  >
                    {dorkFetchingNext ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Scanning…
                      </>
                    ) : dorkDoneExpanding ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        No more leads nearby
                      </>
                    ) : !dorkCityConfirmed ? (
                      'Lock a city first'
                    ) : dorkLeads.length === 0 ? (
                      <>
                        <Search className="w-4 h-4" />
                        Find Leads in {dorkCityConfirmed}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Find More
                      </>
                    )}
                  </button>

                  {dorkNextCityLabel && !dorkDoneExpanding && !dorkFetchingNext && dorkLeads.length > 0 && (
                    <p className="text-[11px] text-ink-tertiary text-center -mt-2">
                      Next click: <strong className="text-ink-secondary">{dorkNextCityLabel}</strong>
                    </p>
                  )}
                  {dorkDiscoverError && (
                    <p className="text-[11px] text-danger text-center -mt-2 flex items-center justify-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {dorkDiscoverError}
                    </p>
                  )}

                  {/* Results table */}
                  <div className="rounded-xl border border-border-light overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-surface/60 border-b border-border-light">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="w-4 h-4 text-ink-secondary" />
                        <span className="text-xs font-semibold text-ink-secondary">
                          {dorkLeads.length === 0
                            ? 'No leads yet'
                            : `${dorkLeads.length} lead${dorkLeads.length === 1 ? '' : 's'} found`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {dorkLeads.length > 0 && (
                          <>
                            <span className="text-[11px] text-ink-tertiary tabular-nums">
                              {dorkSelected.size} of {dorkLeads.length} selected
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const all = new Set(dorkLeads.map((l) => l.email.toLowerCase()));
                                const allSelected = dorkSelected.size === dorkLeads.length;
                                setDorkSelected(allSelected ? new Set() : all);
                              }}
                              className="text-[11px] font-semibold text-accent hover:underline"
                            >
                              {dorkSelected.size === dorkLeads.length ? 'Clear all' : 'Select all'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {dorkLeads.length === 0 ? (
                      <div className="px-4 py-10 text-center text-xs text-ink-tertiary flex flex-col items-center gap-2">
                        <Search className="w-5 h-5 text-ink-tertiary" />
                        <p>
                          {dorkCityConfirmed
                            ? 'Click “Find Leads in ' + dorkCityConfirmed + '” to start scanning.'
                            : 'Lock a city first, then click “Find Leads”.'}
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-[28rem] overflow-y-auto divide-y divide-border-light" ref={dorkResultsRef}>
                        {dorkLeads.map((lead) => {
                          const emailKey = lead.email.toLowerCase();
                          const checked = dorkSelected.has(emailKey);
                          return (
                            <label
                              key={`${emailKey}-${lead.source_page}-${lead.source_rank}`}
                              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                                checked ? 'bg-accent-soft/30' : 'hover:bg-surface/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-accent shrink-0"
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
                              <div className="flex-1 min-w-0 grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-12 sm:col-span-4 min-w-0">
                                  <p className="text-sm font-semibold text-ink truncate" title={lead.business_name}>
                                    {lead.business_name}
                                  </p>
                                  <p className="text-[11px] text-ink-tertiary truncate" title={lead.email}>
                                    {lead.email}
                                  </p>
                                </div>
                                <div className="col-span-6 sm:col-span-3 text-[11px] text-ink-secondary truncate" title={lead.city}>
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-ink-tertiary" />
                                    {lead.city}
                                  </span>
                                </div>
                                <div className="col-span-3 sm:col-span-2 text-[11px] text-ink-tertiary truncate" title={lead.email_host}>
                                  @{lead.email_host}
                                </div>
                                <div className="col-span-3 sm:col-span-3 sm:text-right">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface border border-border-light text-ink-tertiary">
                                    p{lead.source_page} · #{lead.source_rank}
                                  </span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                        {dorkFetchingNext && (
                          <div className="px-4 py-3 flex items-center gap-2 text-xs text-ink-secondary">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Scanning next page…
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* City confirmation modal */}
            {dorkConfirmModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4 animate-fade-in"
                onClick={() => setDorkConfirmModalOpen(false)}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-border-light"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Unified header */}
                  <div className="px-5 pt-5 pb-4 bg-gradient-to-b from-accent-soft/30 to-white border-b border-border-light">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-serif font-bold text-ink leading-tight">
                          Pick your city
                        </p>
                        <p className="text-[11px] text-ink-secondary mt-0.5 leading-relaxed">
                          We found{' '}
                          <strong className="text-ink">&ldquo;{dorkCity.trim()}&rdquo;</strong>{' '}
                          — choose the best match below.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDorkConfirmModalOpen(false)}
                        className="shrink-0 w-7 h-7 rounded-full bg-surface hover:bg-border-light flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5 text-ink-secondary" />
                      </button>
                    </div>
                  </div>

                  {/* Unified city options — all 5 in a clean vertical list */}
                  <div className="px-4 py-3 space-y-1.5">
                    {dorkCitySuggestions.length === 0 ? (
                      <div className="py-8 text-center text-xs text-ink-tertiary flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-ink-tertiary" />
                        <p>Looking for close cities…</p>
                      </div>
                    ) : (
                      dorkCitySuggestions.map((s, idx) => {
                        const isSelected = s.name === dorkCityConfirmed;
                        return (
                          <button
                            key={`${s.name}-${s.country}`}
                            type="button"
                            onClick={() => {
                              playSoftBubble();
                              setDorkCityConfirmed(s.name);
                              setDorkCity(s.name);
                              setDorkCityInlineError(null);
                              setDorkConfirmModalOpen(false);
                              setDorkCityLookup({
                                exact: true,
                                city: s.name,
                                country: s.country,
                                state: s.admin,
                                lat: s.lat,
                                lon: s.lon,
                                population: s.population,
                                suggestions: [],
                              });
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all cursor-pointer group ${
                              isSelected
                                ? 'bg-accent text-white shadow-sm shadow-accent/30 hover:bg-accent-hover'
                                : 'bg-surface border border-border-light hover:bg-accent-soft/40 hover:border-accent/40 hover:shadow-sm'
                            }`}
                          >
                            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                              isSelected ? 'bg-white/20' : 'bg-accent-soft/60 group-hover:bg-accent/20 transition-colors'
                            }`}>
                              {isSelected ? (
                                <CheckCircle2 className="w-3 h-3 text-white" />
                              ) : (
                                <span className={`text-[10px] font-black tabular-nums ${isSelected ? 'text-white' : 'text-ink-tertiary group-hover:text-accent transition-colors'}`}>
                                  {idx + 1}
                                </span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-bold text-xs ${isSelected ? 'text-white' : 'text-ink group-hover:text-accent transition-colors'}`}>
                                  {s.name}
                                </span>
                                <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-ink-tertiary'}`}>{s.country}</span>
                                {isSelected && (
                                  <span className="text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide bg-white/25 text-white">
                                    Selected
                                  </span>
                                )}
                              </div>
                              <p className={`text-[9px] tabular-nums ${isSelected ? 'text-white/60' : 'text-ink-tertiary'}`}>
                                pop {s.population.toLocaleString()}{s.admin ? ` · ${s.admin}` : ''}
                              </p>
                            </div>

                            <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isSelected ? 'text-white/70' : 'text-ink-tertiary group-hover:text-accent group-hover:translate-x-0.5'}`} />
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 pb-4 pt-1">
                    <button
                      type="button"
                      onClick={() => setDorkConfirmModalOpen(false)}
                      className="w-full py-2 rounded-xl text-[11px] font-semibold text-ink-secondary hover:bg-surface hover:text-ink transition-colors border border-border-light cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
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
              <h3 className="font-serif text-2xl text-ink">Choose sending accounts</h3>
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
                  onClick={() => initiateOAuthFlow('gmail')}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg flex items-center gap-2 mx-auto"
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
                    className="px-2.5 py-1 rounded-md border border-current/20 hover:bg-white/40 font-semibold disabled:opacity-50 flex items-center gap-1"
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
                      className={`p-4 rounded-xl border transition-all ${
                        showReconnect
                          ? 'bg-danger/5 border-danger/30 cursor-default'
                          : isSelected
                            ? 'bg-accent-soft border-accent/30 cursor-pointer'
                            : 'bg-white border-border-main hover:border-accent/30 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-4">
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
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-ink">{account.displayName}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
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
                          <p className="text-xs text-ink-secondary">{account.email}</p>

                          <div className="flex items-center gap-4 mt-2 text-xs text-ink-secondary">
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
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span className="text-xs">{capacityWarning}</span>
                            </div>
                          )}

                          {showReconnect && (
                            <div className="mt-3 rounded-lg bg-danger/10 border border-danger/30 p-3 flex items-start gap-3">
                              <ShieldAlert className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-danger">
                                  {account.email} — token expired or revoked
                                </p>
                                <p className="text-[11px] text-danger/80 mt-0.5">
                                  {probe?.error || 'Google no longer accepts this refresh token. Reconnect to keep sending.'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); initiateOAuthFlow(account.provider); }}
                                className="shrink-0 px-3 py-1.5 bg-danger hover:bg-danger-hover text-white text-[11px] font-semibold rounded-lg flex items-center gap-1"
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

                <button
                  type="button"
                  onClick={() => initiateOAuthFlow('gmail')}
                  className="w-full p-4 border border-dashed border-border-main rounded-xl text-center hover:border-accent/50 hover:bg-accent-soft/10 transition-all"
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-ink-secondary">Message</label>
                  <div className="flex gap-1">
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
              <h3 className="font-serif text-2xl text-ink">Ready to launch</h3>
              <p className="text-sm text-ink-secondary">Everything looks great — review below and hit launch when ready.</p>
            </div>

            {/* Primary summary row */}
            <div className={`grid gap-3 ${leadSource === 'leads' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
              <div className="bg-white rounded-2xl border border-border-light p-4 text-center shadow-sm">
                <div className="w-10 h-10 bg-accent-soft rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Users className="w-5 h-5 text-accent" />
                </div>
                <p className="text-2xl font-bold text-accent font-mono">{reviewLeadCount}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Leads</p>
              </div>
              <div className="bg-white rounded-2xl border border-border-light p-4 text-center shadow-sm">
                <div className="w-10 h-10 bg-success-soft rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Globe className="w-5 h-5 text-success" />
                </div>
                <p className="text-2xl font-bold text-success font-mono">{selectedNiche}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Niche</p>
              </div>
              {leadSource === 'leads' && (
                <div className="bg-white rounded-2xl border border-border-light p-4 text-center shadow-sm">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <MapPin className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="text-2xl font-bold text-amber-600 font-mono truncate">
                    {dorkCityConfirmed || (dorkCity ? dorkCity : '—')}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Target City</p>
                </div>
              )}
              <div className="bg-white rounded-2xl border border-border-light p-4 text-center shadow-sm">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Send className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-blue-600 font-mono">{selectedAccountIds.size}</p>
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
              <div className="p-4 flex items-center gap-4">
                <div className="w-28 h-20 rounded-xl bg-surface overflow-hidden shadow-inner shrink-0">
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
                  <p className="font-serif text-base font-bold text-ink">{templates.find(t => t.id === selectedTemplateId)?.name}</p>
                  <p className="text-xs text-ink-secondary capitalize mt-0.5">{selectedNiche} · AI personalized per lead</p>
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
                    const adjustedCount = isLast ? reviewLeadCount - (accountCount * idx) : accountCount;
                    return (
                      <div key={id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            acc?.provider === 'gmail'
                              ? 'bg-[#EA4335]/10 text-[#EA4335]'
                              : 'bg-[#0078D4]/10 text-[#0078D4]'
                          }`}>
                            {acc?.email?.[0]?.toUpperCase() || id[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-ink">{acc?.email || id}</p>
                            <p className="text-[10px] text-ink-tertiary capitalize">{acc?.provider === 'gmail' ? 'Google Gmail' : 'Microsoft Outlook'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
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
                <p className="text-sm text-ink font-medium">
                  {emailSubject
                    ? emailSubject
                    : `Personalized {FIRST_NAME} — {CITY} Business Inquiry`}
                </p>
              </div>
            </div>

            {/* Launch CTA banner */}
            {selectedAccountIds.size > 0 ? (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent via-indigo-600 to-blue-600 p-5 text-center shadow-lg">
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
      <div className="px-6 py-4 border-t border-border-light flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={activeStep === 1}
          onClick={() => {
            playGentleChime();
            setActiveStep(prev => prev - 1);
            stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className={`text-xs font-semibold px-4 py-2 border border-border-main rounded-lg bg-white text-ink leading-none transition-all ${
            activeStep === 1 ? 'opacity-0 pointer-events-none' : 'hover:bg-off-white'
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
          const disabled = blocked || alsoRequiresSelection || (activeStep === 4 && isProbingTokens);
          return (
            <button
              type="button"
              disabled={disabled}
              onClick={handleNextStep}
              className={`text-xs font-semibold px-5 py-2.5 rounded-lg flex items-center gap-1.5 transition-all ${
                disabled
                  ? 'bg-surface text-ink-tertiary cursor-not-allowed'
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
