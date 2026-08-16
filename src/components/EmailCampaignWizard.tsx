// Email Campaign Wizard Component
// Replaces the SMS campaign type with a full email campaign flow
// Matches existing campaign wizard patterns 100%

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mail, Send, Upload, Globe, Check, ChevronRight, ChevronLeft, AlertCircle,
  CheckCircle, CheckCircle2, Loader2, X, ShieldAlert, Plus, Trash2, Eye, ExternalLink,
  RefreshCw, Link2, AlertTriangle, Zap, Clock, Pencil, Sparkles, FileSpreadsheet,
  Smartphone, Monitor, Maximize2, Users, Layout, Type
} from 'lucide-react';
import { playGentleChime, playLaunchSwell, playVictoryCelebration, playSoftTap, playElegantError, playSoftBubble, playElegantBell } from '../utils/audio';
import { validateCsvFile, CsvValidation, PipelineLead, runEmailCampaign, probeAllEmailAccounts, initiateOAuthFlow, EmailAccountProbeResult, EmailCampaignEvent } from '../lib/pipelineClient';
import { Template } from '../types';
import { nicheList } from '../data';
import { TemplateSimPreview } from './TemplateSimPreview';
import { CsvPreview } from './CsvPreview';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { CampaignProgressToggle, CampaignProgressData } from './CampaignProgressToggle';

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

  // State for the progress toggle
  const [activeProgressToggle, setActiveProgressToggle] = useState<CampaignProgressData | null>(null);
  
  // Track if we're showing the completion screen (vs wizard mode)
  const [isShowingCompletion, setIsShowingCompletion] = useState(false);
  
  const [activeStep, setActiveStep] = useState<number>(1);
  
  // Niche selection
  const [selectedNiche, setSelectedNiche] = useState<string>('Barber');
  
  // Lead source
  const [leadSource, setLeadSource] = useState<'csv' | 'places_api'>('csv');
  
  // CSV state
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [isCsvParsing, setIsCsvParsing] = useState<boolean>(false);
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  const [csvLeads, setCsvLeads] = useState<PipelineLead[]>([]);
  const [csvValidation, setCsvValidation] = useState<CsvValidation | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  
  // Places API state
  const [placesCity, setPlacesCity] = useState<string>('');
  const [placesLoading, setPlacesLoading] = useState<boolean>(false);
  const [placesResults, setPlacesResults] = useState<any[]>([]);
  
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
  }>({ sitesStaged: 0, emailsSent: 0, emailsFailed: 0, deploying: false });

  const [celebratedCampaign, setCelebratedCampaign] = useState<{
    id: string;
    subject: string;
    body: string;
  } | null>(null);
  
  const [campaignName, setCampaignName] = useState<string>(`${selectedNiche} Email Campaign`);
  const stepContentRef = useRef<HTMLDivElement>(null);

  // Template list for preview navigation
  const nicheTemplates = templates.filter(t => t.niche === selectedNiche);
  const nicheCustom = customTemplates.filter(t => t.niche === selectedNiche);
  const allTemplates = [...nicheTemplates, ...nicheCustom];
  
  useEffect(() => {
    // Scroll to show step indicator (in Campaigns.tsx) after step change
    const timer = setTimeout(() => {
      const stepTrack = document.getElementById('wizard-steps-horizontal-track');
      if (stepTrack) {
        stepTrack.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    playGentleChime(activeStep);
    onStepChange?.(activeStep);
    return () => clearTimeout(timer);
  }, [activeStep]);
  
  useEffect(() => {
    loadConnectedAccounts();
  }, []);

  useEffect(() => {
    if (typeof initialSubject === 'string') setEmailSubject(initialSubject);
    if (typeof initialBody === 'string') setEmailBody(initialBody);
    if (initialSubject || initialBody) setActiveStep(4);
  }, [initialSubject, initialBody]);

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
        deployedSites: runningEmailCampaign.deployedSites,
      });
    } else if (celebratedCampaign && launchComplete && !isLaunching && isShowingCompletion) {
      // Campaign just finished - show completion in toggle (only when showing completion screen)
      const totalSent = launchResults?.sent ?? 0;
      const totalFailed = launchResults?.failed ?? 0;
      const sitesCount = launchResults?.perLead?.filter((p: any) => p.siteUrl).length ?? 0;
      const accountsUsed = launchResults?.perAccount?.length ?? selectedAccountIds.size;

      setActiveProgressToggle({
        id: celebratedCampaign.id,
        kind: 'email',
        name: celebratedCampaign.name,
        status: 'completed',
        total: csvParsedCount || totalSent + totalFailed,
        done: totalSent + totalFailed,
        sitesGenerated: sitesCount,
        emailsSent: totalSent,
        emailsFailed: totalFailed,
        accountsUsed,
        deployedSites: launchResults?.perLead?.filter((p: any) => p.siteUrl).map((p: any) => p.siteUrl) ?? [],
      });
    } else {
      // No active campaigns - clear toggle
      setActiveProgressToggle(null);
    }
  }, [activeCampaignRuns, celebratedCampaign, launchComplete, isLaunching, launchResults, csvParsedCount, selectedAccountIds.size, isShowingCompletion]);

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
      const { listEmailAccounts } = await import('../lib/pipelineClient');
      const raw = await listEmailAccounts(ownerKey);
      const accounts = dedupeAccounts(raw);
      setConnectedAccounts(accounts.map(acc => ({
        id: acc.id,
        provider: acc.provider,
        email: acc.email,
        displayName: acc.display_name,
        status: acc.status,
        sendsToday: acc.sends_today,
        remainingToday: acc.remaining_today,
        dailyCap: acc.daily_cap,
        warmupStage: acc.warmup_stage,
        bounceRate7d: acc.bounce_rate_7d,
        lastSuccessfulSend: acc.last_successful_send,
        tokenStatus: acc.token_status || 'active',
        tokenError: null,
        tokenCheckedAt: null,
      })));
    } catch (err) {
      console.error('Failed to load accounts:', err);
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
  
  const handleLaunch = async () => {
    setLaunchError(null);
    
    // Auto-scroll to step indicator when launching
    setTimeout(() => {
      const stepTrack = document.getElementById('wizard-steps-horizontal-track');
      if (stepTrack) {
        stepTrack.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    
    const totalLeads = csvLeads.length;
    if (totalLeads === 0) {
      setLaunchError('Upload a CSV with business data before launching.');
      return;
    }
    
    if (selectedAccountIds.size === 0) {
      setLaunchError('Select at least one email account to send from.');
      return;
    }
    
    const requiredCredits = totalLeads * COST_PER_EMAIL;
    if (userCredits < requiredCredits) {
      playElegantError();
      setLaunchError(`Insufficient credits: this campaign needs ${requiredCredits} credits (${totalLeads} leads × ${COST_PER_EMAIL}). You have ${userCredits}.`);
      return;
    }
    
    onCreditsChange?.(Math.max(0, userCredits - requiredCredits));
    
    setIsLaunching(true);
    setLaunchProgress(5);
    setLaunchMessage('AI is warming up...');
    setLaunchResults(null);
    setLaunchError(null);
    setLaunchComplete(false);
    playLaunchSwell();
    
    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
      const { createEmailCampaign, runEmailCampaign: runEmail } = await import('../lib/pipelineClient');
      
      const campaign = await createEmailCampaign(
        ownerKey,
        {
          niche: selectedNiche,
          templateKey: selectedTemplateId,
          leadSource: leadSource,
          targetVolume: csvLeads.length,
          city: placesCity,
          emailSubject,
          emailBody,
        },
        csvLeads,
      );

      setCelebratedCampaign({
        id: campaign.id,
        subject: emailSubject,
        body: emailBody,
      });

      // Register this campaign as an active run for the progress toggle
      upsertActiveRun?.({
        id: campaign.id,
        kind: 'email',
        name: campaignName,
        niche: selectedNiche,
        total: csvLeads.length,
        done: 0,
        status: 'starting',
        startedAt: Date.now(),
        sitesGenerated: 0,
        emailsSent: 0,
        emailsFailed: 0,
        accountsUsed: selectedAccountIds.size,
      });

      // Notify parent to add campaign to list
      onCampaignCreated?.({
        id: campaign.id,
        name: campaignName,
        niche: selectedNiche,
        templateId: selectedTemplateId,
        type: 'email',
        status: 'Active',
        createdAt: new Date().toISOString(),
        emailAccountsUsed: Array.from(selectedAccountIds).map(id => {
          const acc = connectedAccounts.find(a => a.id === id);
          return {
            accountId: id,
            accountEmail: acc?.email || id,
            sent: 0,
            failed: 0,
          };
        }),
        leadsFound: csvLeads.length,
        sitesGenerated: 0,
        emailsSent: 0,
        emailsFailed: 0,
      });

      // Initialize launchResults with per-account tracking
      setLaunchResults({
        sent: 0,
        failed: 0,
        status: 'running',
        perAccount: Array.from(selectedAccountIds).map(id => {
          const acc = connectedAccounts.find(a => a.id === id);
          return {
            accountId: id,
            accountEmail: acc?.email || id,
            sent: 0,
            failed: 0,
          };
        }),
        perLead: [],
      });

      setLaunchProgress(15);
      setLaunchMessage('AI is editing templates...');
      
      setLiveCounters({ sitesStaged: 0, emailsSent: 0, emailsFailed: 0, deploying: false });
      
      const perLead: any[] = [];
      // Single source of truth — every event that updates a lead's record goes
      // through upsertPerLead() which dedupes by (leadId || email || slug ||
      // index). This prevents the same lead from being counted twice when
      // site:staged and send:sent both push entries with different identifiers.
      const upsertPerLead = (entry: any) => {
        const key = entry.leadId ?? entry.email ?? entry.slug ?? entry.index;
        if (key === undefined || key === null) {
          perLead.push(entry);
          return;
        }
        const existingIdx = perLead.findIndex((p) => {
          const pKey = p.leadId ?? p.email ?? p.slug ?? p.index;
          return pKey !== undefined && pKey !== null && pKey === key;
        });
        if (existingIdx >= 0) {
          perLead[existingIdx] = { ...perLead[existingIdx], ...entry };
        } else {
          perLead.push(entry);
        }
      };
      const humanStage = (type: string): string => {
        switch (type) {
          case 'lead:start': return 'preparing magic';
          case 'discovery:start': return 'finding the right inbox';
          case 'discovery:found': return 'found the perfect email';
          case 'discovery:not_found': return 'no email found';
          case 'site:compiling': return 'AI is editing your template';
          case 'site:staged': return 'personalized site ready';
          case 'site:failed': return 'something went wrong';
          case 'phase1:complete': return 'all sites prepped';
          case 'deploy:start': return 'deploying to the cloud';
          case 'deploy:done': return 'website is live now!';
          case 'email:sent': return 'email delivered';
          case 'send:sent': return 'email sent';
          case 'send:queued': return 'scheduled for later';
          case 'send:failed': return 'email failed';
          case 'send:error': return 'delivery error';
          default: return type;
        }
      };
      const smoothProgress = (type: string, index: number, total: number, current: number): number => {
        if (!total || total <= 0) return Math.min(100, current + 5);
        const elapsed = (Math.max(1, index) - 1) / total;
        let stage = 0.05;
        if (type === 'site:compiling') stage = 0.20;
        else if (type === 'site:staged') stage = 0.40;
        else if (type === 'deploy:start') stage = 0.55;
        else if (type === 'deploy:done') stage = 0.75;
        else if (type === 'send:sent') stage = 1.00;
        else if (type === 'send:failed' || type === 'send:error') stage = 1.00;
        else if (type === 'discovery:found' || type === 'discovery:not_found') stage = 0.15;
        const next = Math.round((elapsed + stage / total) * 100);
        return Math.min(100, Math.max(current, next));
      };
// Capture stable refs at launch time so late SSE events arriving
      // AFTER handleReset / "Launch Another Campaign" cleared
      // celebratedCampaign don't crash with "Cannot read properties of null".
      // We use the freshly-created campaign object (not the React state
      // celebratedCampaign, whose closure value is stale at this point).
      const campaignId = campaign.id;
      const launchCampaignName = campaignName;

      const result = await runEmail(
        campaign.id,
        Array.from(selectedAccountIds),
        (e: EmailCampaignEvent) => {
          try {
          if (e.type === 'site:staged') {
            setLiveCounters(c => ({ ...c, sitesStaged: c.sitesStaged + 1 }));
          } else if (e.type === 'deploy:start') {
            setLiveCounters(c => ({ ...c, deploying: true }));
          } else if (e.type === 'deploy:done' || e.type === 'deploy:failed') {
            setLiveCounters(c => ({ ...c, deploying: false }));
          } else if (e.type === 'send:sent') {
            // Increment once here (single source of truth). Don't double-count
            // in the perLead/dispatch branch below.
            setLiveCounters(c => ({ ...c, emailsSent: c.emailsSent + 1 }));
          } else if (e.type === 'send:failed' || e.type === 'send:error') {
            setLiveCounters(c => ({ ...c, emailsFailed: c.emailsFailed + 1 }));
          }

          if (typeof e.index === 'number' && typeof e.total === 'number') {
            setLaunchProgress(prev => smoothProgress(e.type, e.index!, e.total!, prev));
          } else if (e.type === 'deploy:start') {
            setLaunchProgress(prev => Math.min(90, prev));
          } else if (e.type === 'deploy:done') {
            setLaunchProgress(prev => Math.min(100, prev + 5));
          }

          if (e.type === 'lead:start') {
            setLaunchMessage(`personalizing website for ${e.name}...`);
          } else if (e.type === 'site:staged') {
            setLaunchMessage(`site ready for ${e.name}...`);
          } else if (e.type === 'phase1:complete') {
            setLaunchMessage(`${e.ready} sites personalized — deploying...`);
          } else if (e.type === 'deploy:start') {
            setLaunchMessage(`deploying ${e.count || ''} sites to cloud...`);
          } else if (e.type === 'deploy:failed') {
            setLaunchMessage(`deploy failed — ${e.error}`);
          } else if (e.type === 'deploy:done') {
            setLaunchMessage(`all sites live! — sending emails...`);
          } else if (e.type === 'send:sent') {
            setLaunchMessage(`sent ${e.index}/${e.total} emails`);
          } else if (e.type === 'send:failed' || e.type === 'send:error') {
            setLaunchMessage(`failed ${e.index}/${e.total} — retrying...`);
          } else if (e.type === 'send:queued') {
            setLaunchMessage(`queued ${e.index}/${e.total} emails...`);
          }

          if (e.type === 'send:sent') {
            upsertPerLead({
              leadId: e.leadId,
              name: e.name,
              email: e.email,
              accountEmail: e.accountEmail,
              subject: e.subject,
              siteUrl: e.siteUrl,
              status: 'sent',
            });
            // Update launch results for real-time display using functional update.
            // NOTE: do NOT increment emailsSent here — it's already handled in
            // the liveCounters branch above (and would otherwise double-count).
            setLaunchResults(prev => {
              const prevSent = prev?.sent || 0;
              const prevPerLead = prev?.perLead || [];
              const prevPerAccount = prev?.perAccount || [];
              const newPerLead = prevPerLead.some((p: any) => p.leadId === e.leadId && p.status === 'sent')
                ? prevPerLead
                : [...prevPerLead, {
                    leadId: e.leadId,
                    name: e.name,
                    email: e.email,
                    accountEmail: e.accountEmail,
                    subject: e.subject,
                    siteUrl: e.siteUrl,
                    status: 'sent',
                  }];
              // Update per-account stats
              let newPerAccount = prevPerAccount;
              const accIdx = newPerAccount.findIndex((a: any) => (a.accountEmail || a.email) === e.accountEmail);
              if (accIdx >= 0) {
                newPerAccount = newPerAccount.map((a: any, i: number) =>
                  i === accIdx ? { ...a, sent: (a.sent || 0) + 1 } : a
                );
              } else {
                newPerAccount = [...newPerAccount, { accountEmail: e.accountEmail, sent: 1, failed: 0 }];
              }
              return { sent: prevSent + 1, failed: prev?.failed || 0, status: prev?.status || 'running', perLead: newPerLead, perAccount: newPerAccount };
            });
            // Update campaign in list in real-time
            window.dispatchEvent(new CustomEvent('lunao:campaign-progress', { detail: {
              id: campaignId,
              emailsSent: 1,
              emailsFailed: 0,
              lead: { leadId: e.leadId, name: e.name, email: e.email, slug: e.slug, accountEmail: e.accountEmail, siteUrl: e.siteUrl, status: 'sent' }
            }}));
            // Update active run progress for toggle
            updateActiveRun?.(campaignId, { status: 'running' });
          } else if (e.type === 'send:failed' || e.type === 'send:error') {
            upsertPerLead({
              leadId: e.leadId,
              name: e.name,
              accountEmail: e.accountEmail,
              status: 'failed',
              reason: e.reason || e.error,
            });
            // NOTE: emailsFailed is already incremented in the liveCounters
            // branch above (line ~610) — do NOT double-count here.
            // Update launch results for real-time display using functional update
            setLaunchResults(prev => {
              const prevFailed = prev?.failed || 0;
              const prevPerLead = prev?.perLead || [];
              const newPerLead = [...prevPerLead, {
                leadId: e.leadId,
                name: e.name,
                accountEmail: e.accountEmail,
                status: 'failed',
                reason: e.reason || e.error,
              }];
              return { sent: prev?.sent || 0, failed: prevFailed + 1, status: prev?.status || 'running', perLead: newPerLead, perAccount: prev?.perAccount || [] };
            });
            // Update campaign in list in real-time
            window.dispatchEvent(new CustomEvent('lunao:campaign-progress', { detail: {
              id: campaignId,
              emailsSent: 0,
              emailsFailed: 1,
              lead: { leadId: e.leadId, name: e.name, accountEmail: e.accountEmail, status: 'failed', reason: e.reason || e.error }
            }}));
          } else if (e.type === 'send:queued') {
            upsertPerLead({
              leadId: e.leadId,
              name: e.name,
              status: 'queued',
              reason: e.reason,
            });
          } else if (e.type === 'site:staged') {
            // Use slug as the primary key — server pipeline emits the
            // business slug with every site:staged event, which is stable
            // across Phase 1 staging and Phase 2 URL-swap (only the URL
            // changes; the slug stays). Fall back to index for safety.
            const leadKey = e.slug ?? e.leadId ?? e.index;
            upsertPerLead({
              leadId: leadKey,
              index: e.index,
              name: e.name,
              slug: e.slug,
              siteUrl: e.siteUrl,
              status: 'pending',
            });
            // Fire progress so the Recent Campaigns card populates deployedSites in real time
            window.dispatchEvent(new CustomEvent('lunao:campaign-progress', { detail: {
              id: campaignId,
              emailsSent: 0,
              emailsFailed: 0,
              lead: { leadId: leadKey, name: e.name, slug: e.slug, siteUrl: e.siteUrl, status: 'pending' }
            }}));
            // Update active run with sitesGenerated for the toggle (use unique-leads count)
            const uniqueSites = new Set(perLead.filter((p: any) => p.siteUrl).map((p: any) => p.leadId ?? p.index)).size;
            updateActiveRun?.(campaignId, { sitesGenerated: uniqueSites });
          } else if (e.type === 'complete') {
            // Use functional setState to get latest values
            setLaunchResults(prev => {
              const currentSent = prev?.sent || 0;
              const currentFailed = prev?.failed || 0;
              const currentPerLead = prev?.perLead || [];
              const currentPerAccount = prev?.perAccount || [];
              return {
                sent: e.sent !== undefined && e.sent !== null ? e.sent : currentSent,
                failed: e.failed !== undefined && e.failed !== null ? e.failed : currentFailed,
                status: e.status || 'completed',
                perAccount: e.perAccount && e.perAccount.length > 0 ? e.perAccount : currentPerAccount,
                perLead: currentPerLead.length > 0 ? currentPerLead : perLead,
              };
            });
            setLaunchProgress(100);

            // Calculate final values using accumulated perLead array
            const finalSent = e.sent !== undefined ? e.sent : perLead.filter(p => p.status === 'sent').length;
            const finalFailed = e.failed !== undefined ? e.failed : perLead.filter(p => p.status === 'failed').length;

            // Calculate per-account stats from perLead if not provided by backend
            const perAccountFromLeads: any[] = [];
            const accountMap: Record<string, any> = {};
            for (const lead of perLead) {
              if (lead.accountEmail) {
                if (!accountMap[lead.accountEmail]) {
                  accountMap[lead.accountEmail] = { accountEmail: lead.accountEmail, sent: 0, failed: 0 };
                }
                if (lead.status === 'sent') accountMap[lead.accountEmail].sent++;
                else if (lead.status === 'failed') accountMap[lead.accountEmail].failed++;
              }
            }
            const finalPerAccount = e.perAccount && e.perAccount.length > 0
              ? e.perAccount
              : Object.values(accountMap);

            // Update campaign in list with final results - ONLY ONCE
            const finalCampaign = {
              id: campaignId,
              name: launchCampaignName,
              niche: selectedNiche,
              templateId: selectedTemplateId,
              type: 'email',
              status: 'Completed',
              createdAt: new Date().toISOString(),
              emailAccountsUsed: finalPerAccount.map((a: any) => ({
                accountId: a.accountId || a.id || '',
                accountEmail: a.accountEmail || a.email || '',
                sent: a.sent || 0,
                failed: a.failed || 0,
              })),
              emailsSent: finalSent,
              emailsFailed: finalFailed,
              // sitesGenerated = unique leads that have a siteUrl (deduped by leadId /
              // email / slug / index — see upsertPerLead).
              sitesGenerated: perLead.filter((p: any) => p.siteUrl).length,
              deployedSites: perLead.filter((p: any) => p.siteUrl).map((p: any, idx: number) => ({
                slug: p.slug || (p.email || p.name || `lead-${idx}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                name: p.name || 'Lead',
                city: undefined,
                url: p.siteUrl,
                leadId: p.leadId,
                status: 'live' as const,
              })),
              emailLeads: perLead.map((p: any) => ({
                leadId: p.leadId,
                name: p.name,
                email: p.email,
                siteUrl: p.siteUrl,
                accountEmail: p.accountEmail,
                status: p.status === 'failed' ? 'failed' : 'sent',
                reason: p.reason,
              })),
            };
            // Dispatch event for parent to update - ALWAYS FIRE THIS
            window.dispatchEvent(new CustomEvent('lunao:campaign-complete', { detail: finalCampaign }));
            console.log('[EmailCampaign] Campaign complete event dispatched:', finalCampaign.id, 'sent:', finalSent, 'failed:', finalFailed);
          }
          } catch (err) {
            // Safety net: never let an SSE callback throw and crash the React
            // tree. Log and keep the stream alive.
            console.warn('[EmailCampaign] SSE handler swallowed error:', err);
          }
        }
      );

      // Capture campaign ID at launch time (for the 5s fallback below).
      // Note: campaignId / launchCampaignName above are already stable captures.
      const campaignIdForFallback = campaignId;
      const campaignNameForFallback = launchCampaignName;
      const selectedNicheForFallback = selectedNiche;
      const selectedTemplateIdForFallback = selectedTemplateId;
      
      // CRITICAL: Ensure campaign-complete event fires even if SSE doesn't send it
      // This is a fallback that fires after SSE connection closes
      setTimeout(() => {
        // Only dispatch if we haven't already (check if launchComplete is set)
        if (!launchComplete) {
          const currentSent = launchResults?.sent || perLead.filter(p => p.status === 'sent').length;
          const currentFailed = launchResults?.failed || perLead.filter(p => p.status === 'failed').length;
          // Calculate per-account from leads
          const accountMap: Record<string, any> = {};
          for (const lead of perLead) {
            if (lead.accountEmail) {
              if (!accountMap[lead.accountEmail]) {
                accountMap[lead.accountEmail] = { accountEmail: lead.accountEmail, sent: 0, failed: 0 };
              }
              if (lead.status === 'sent') accountMap[lead.accountEmail].sent++;
              else if (lead.status === 'failed') accountMap[lead.accountEmail].failed++;
            }
          }
          const fallbackPerAccount = Object.values(accountMap);
          const finalCampaign = {
            id: campaignIdForFallback,
            name: campaignNameForFallback,
            niche: selectedNicheForFallback,
            templateId: selectedTemplateIdForFallback,
            type: 'email',
            status: 'Completed',
            createdAt: new Date().toISOString(),
            emailAccountsUsed: fallbackPerAccount.map((a: any) => ({
              accountId: a.accountId || '',
              accountEmail: a.accountEmail || '',
              sent: a.sent || 0,
              failed: a.failed || 0,
            })),
            emailsSent: currentSent,
            emailsFailed: currentFailed,
            sitesGenerated: perLead.filter((p: any) => p.siteUrl).length,
            deployedSites: perLead.filter((p: any) => p.siteUrl).map((p: any, idx: number) => ({
              slug: (p.email || p.name || `lead-${idx}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              name: p.name || 'Lead',
              city: undefined,
              url: p.siteUrl,
              status: 'live' as const,
            })),
            emailLeads: perLead.map((p: any) => ({
              leadId: p.leadId,
              name: p.name,
              email: p.email,
              siteUrl: p.siteUrl,
              accountEmail: p.accountEmail,
              status: p.status === 'failed' ? 'failed' : 'sent',
              reason: p.reason,
            })),
          };
          window.dispatchEvent(new CustomEvent('lunao:campaign-complete', { detail: finalCampaign }));
          console.log('[EmailCampaign] FALLBACK: Campaign complete event dispatched after timeout');
        }
      }, 5000); // 5 second fallback
      
      setLaunchProgress(100);
      setLaunchMessage(
        result?.sent > 0
          ? `Sent ${result.sent} email${result.sent === 1 ? '' : 's'}!`
          : `Campaign finished — ${result?.sent || 0} sent, ${result?.failed || 0} failed.`,
      );
      setLaunchComplete(true);
      setIsShowingCompletion(true);

      // Auto-dismiss after 3 seconds with animation
      setTimeout(() => {
        const container = document.getElementById('campaign-progress-container');
        if (container) {
          container.classList.add('animate-slide-down-fade');
        }
        setTimeout(() => {
          setActiveStep(1);
          setLaunchComplete(false);
          setIsShowingCompletion(false);
          setCsvFileName(null);
          setCsvLeads([]);
          setCsvValidation(null);
          setLaunchProgress(0);
          setLaunchMessage('');
          setLaunchResults(null);
          setActiveProgressToggle(null);
          setCelebratedCampaign(null);
          setLiveCounters({ sitesStaged: 0, emailsSent: 0, emailsFailed: 0, deploying: false });
        }, 400);
      }, 3000);

      // Mark the active run as completed for the progress toggle
      if (celebratedCampaign?.id) {
        updateActiveRun?.(celebratedCampaign.id, { status: 'completed' });
      }
      if ((result?.sent || 0) > 0) {
        playVictoryCelebration();
      } else {
        playElegantError();
      }
      onLaunch?.();
      
    } catch (err: any) {
      playElegantError();
      setLaunchError(err.message || 'Campaign launch failed.');
      onCreditsChange?.(userCredits);
    } finally {
      setIsLaunching(false);
    }
  };
  
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
    setPlacesResults([]);
    // Clear progress toggle and celebration state to prevent stale data
    setActiveProgressToggle(null);
    setCelebratedCampaign(null);
    setIsShowingCompletion(false);
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

  if (celebratedCampaign) {
    const sent = isLaunching ? liveCounters.emailsSent : (launchResults?.sent ?? liveCounters.emailsSent ?? 0);
    const failed = isLaunching ? liveCounters.emailsFailed : (launchResults?.failed ?? liveCounters.emailsFailed ?? 0);
    const sitesLive = isLaunching
      ? liveCounters.sitesStaged
      : (launchResults?.perLead?.filter((p: any) => p.siteUrl).length ?? liveCounters.sitesStaged ?? 0);
    const perAcc = launchResults?.perAccount;
    const accountsUsed = Array.isArray(perAcc) && perAcc.length > 0
      ? perAcc.length
      : selectedAccountIds.size;
    const isRunning = isLaunching && !launchComplete;
    const isDone = !!launchComplete && !!launchResults;
    const campaignId = celebratedCampaign?.id || '';

    return (
      <div className="space-y-6">
        <div className="relative px-6 py-5 bg-white border-b border-border-main flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-ink-secondary font-semibold">Email campaign</p>
            <p className="text-base font-serif text-ink leading-tight">{campaignName}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
            <span className="font-mono">id</span>
            <span className="font-mono text-ink-secondary truncate max-w-[180px]">{campaignId}</span>
          </span>
        </div>

        <div className="px-6 pb-6 animate-fade-in">
          <div className="relative overflow-hidden rounded-2xl border border-success/25 bg-gradient-to-br from-success-soft via-white to-accent-soft/60 shadow-sm animate-celebration-bloom">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-success/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative p-5 sm:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-success text-white flex items-center justify-center shadow-sm">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  {isRunning && (
                    <span className="absolute inset-0 rounded-full border-2 border-success animate-campaign-running-ring" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-lg sm:text-xl font-serif font-semibold text-ink leading-tight">
                      Campaign launched successfully!
                    </p>
                    {isRunning && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        Running
                      </span>
                    )}
                    {isDone && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        failed === 0
                          ? 'bg-success-soft text-success border-success/25'
                          : sent === 0
                            ? 'bg-danger/10 text-danger border-danger/25'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {failed === 0 ? 'Completed' : sent === 0 ? 'Failed' : 'Partial'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-secondary mt-1 leading-snug">
                    {isRunning
                      ? launchMessage || 'Sending personalized emails to each prospect…'
                      : launchMessage || `Campaign finished — ${sent} sent, ${failed} failed.`}
                  </p>
                </div>
              </div>

              {/* Detailed Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-white/80 border border-border-light rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Sites Built</p>
                  <p className="text-2xl font-bold text-accent font-mono mt-0.5 animate-counter-pop">{sitesLive}</p>
                  <p className="text-[9px] text-ink-tertiary mt-0.5">Deployed</p>
                </div>
                <div className="bg-white/80 border border-border-light rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Emails Sent</p>
                  <p className="text-2xl font-bold text-success font-mono mt-0.5 animate-counter-pop">{sent}</p>
                  <p className="text-[9px] text-ink-tertiary mt-0.5">Delivered</p>
                </div>
                <div className="bg-white/80 border border-border-light rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Failed</p>
                  <p className={`text-2xl font-bold font-mono mt-0.5 animate-counter-pop ${failed > 0 ? 'text-danger' : 'text-ink-tertiary'}`}>{failed}</p>
                  <p className="text-[9px] text-ink-tertiary mt-0.5">{failed > 0 ? 'See reasons below' : 'All clean'}</p>
                </div>
                <div className="bg-white/80 border border-border-light rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Accounts</p>
                  <p className="text-2xl font-bold text-ink font-mono mt-0.5 animate-counter-pop">{accountsUsed}</p>
                  <p className="text-[9px] text-ink-tertiary mt-0.5">Sending inboxes</p>
                </div>
              </div>

              {/* Per-account breakdown */}
              {isDone && perAcc && perAcc.length > 0 && (
                <div className="bg-white/60 border border-border-light rounded-xl p-4 space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Emails by Account</p>
                  <div className="space-y-2">
                    {perAcc.map((acc: any, idx: number) => {
                      const accTotal = (acc.sent || 0) + (acc.failed || 0);
                      const pct = accTotal > 0 ? Math.round(((acc.sent || 0) / accTotal) * 100) : 0;
                      return (
                        <div key={idx} className="flex items-center gap-3 text-[11px]">
                          <Mail className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span className="flex-1 min-w-0 font-mono text-ink truncate">{acc.accountEmail || acc.email || 'Account'}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-success font-bold">{acc.sent || 0}</span>
                            {acc.failed > 0 && <span className="text-danger font-bold">/{acc.failed}</span>}
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Single unified progress log */}
              {isRunning && (
                <div className="flex items-center gap-2 text-[11px] text-ink-secondary bg-white/70 border border-border-light rounded-lg px-3 py-2.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
                  <span className="font-medium truncate">{launchMessage || 'AI is working its magic...'}</span>
                  <span className="ml-auto text-[10px] text-ink-tertiary font-bold shrink-0">{launchProgress}%</span>
                </div>
              )}

              {isDone && failed > 0 && launchResults?.perLead && (() => {
                const failures = launchResults.perLead.filter((r: any) => r.status === 'failed' && r.reason);
                if (failures.length === 0) return null;
                const reasonCounts: Record<string, number> = {};
                for (const f of failures) {
                  const r = (f.reason || 'unknown').trim();
                  reasonCounts[r] = (reasonCounts[r] || 0) + 1;
                }
                const top = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];
                if (!top) return null;
                const [reasonText, count] = top;
                return (
                  <div className="flex items-start gap-2 text-[11px] bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-danger">Top failure reason: </span>
                      <span className="text-ink break-words">{reasonText}</span>
                      {count < failures.length && (
                        <span className="text-ink-tertiary ml-1">({count} of {failures.length})</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-border-light/80">
                <button
                  type="button"
                  onClick={() => {
                    playSoftTap();
                    setCelebratedCampaign(null);
                    setLaunchComplete(false);
                    setLaunchResults(null);
                    setLaunchProgress(0);
                    setLaunchMessage('');
                    setActiveStep(1);
                    setIsShowingCompletion(false);
                    // Clear progress toggle when starting a new campaign
                    setActiveProgressToggle(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-border-main text-[11px] font-semibold text-ink hover:bg-off-white transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Launch another
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
              {nicheList.map((niche) => {
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
              <p className="text-sm text-ink-secondary">Upload a CSV or use Places API to find businesses.</p>
            </div>
            
            {/* Lead Source Tabs - Brand New Design */}
            <div className="flex gap-2 p-1.5 bg-gradient-to-r from-surface to-off-white rounded-2xl w-fit shadow-inner">
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
                onClick={() => { playSoftTap(); setLeadSource('places_api'); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  leadSource === 'places_api'
                    ? 'bg-white text-accent shadow-lg shadow-accent/20 ring-2 ring-accent/30'
                    : `text-ink-secondary hover:text-ink hover:bg-white/50 ${!isPro ? 'opacity-60' : ''}`
                } ${!isPro ? 'opacity-60' : ''}`}
                disabled={!isPro}
                title={!isPro ? 'Places API is a Pro feature' : undefined}
              >
                <Zap className="w-5 h-5" />
                Places API
                {!isPro && <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">Pro</span>}
              </button>
            </div>
            
            {/* CSV Upload - BRAND NEW BEAUTIFUL DESIGN */}
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
                          {/* Floating sparkle */}
                          <div className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center animate-bounce-subtle">
                            <Sparkles className="w-3 h-3 text-accent" />
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
            
            {/* Places API */}
            {leadSource === 'places_api' && isPro && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-secondary mb-1.5">City</label>
                    <input
                      type="text"
                      value={placesCity}
                      onChange={(e) => setPlacesCity(e.target.value)}
                      placeholder="e.g., Austin, TX"
                      className="w-full px-3 py-2 border border-border-main rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Business Category</label>
                    <select
                      value={selectedNiche}
                      onChange={(e) => setSelectedNiche(e.target.value)}
                      className="w-full px-3 py-2 border border-border-main rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                      {nicheList.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                    </select>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => { setPlacesLoading(true); setTimeout(() => setPlacesLoading(false), 1500); }}
                  disabled={!placesCity || placesLoading}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                    !placesCity || placesLoading
                      ? 'bg-surface text-ink-tertiary cursor-not-allowed'
                      : 'bg-accent hover:bg-accent-hover text-white'
                  }`}
                >
                  {placesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  <span>Find Businesses</span>
                </button>
                
                {placesResults.length > 0 && (
                  <div className="bg-success-soft border border-success/20 rounded-xl p-4">
                    <p className="text-sm font-semibold text-success">{placesResults.length} businesses found</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Step 3: Select Template - COMPLETELY REDESIGNED */}
        {activeStep === 3 && (
          <div className="space-y-6 animate-fade-in">
            {/* Brand New Header Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/5 via-white to-accent/10 border border-accent/20 shadow-lg shadow-accent/10">
              <div className="absolute -top-16 -right-16 w-56 h-56 bg-accent/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-accent/8 rounded-full blur-3xl" />
              
              <div className="relative p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-xl shadow-accent/30">
                      <Globe className="w-7 h-7 text-white" />
                    </div>
                    {/* Animated ring */}
                    <div className="absolute inset-0 rounded-2xl border-2 border-accent/40 animate-ping" />
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="font-serif text-2xl md:text-3xl text-ink leading-tight">Pick your template</h3>
                    <p className="text-sm md:text-base text-ink-secondary mt-2 leading-relaxed">
                      Each site will be personalized with the lead's business info. Click any card for a full preview.
                    </p>
                    {allTemplates.length > 0 && (
                      <div className="flex items-center gap-4 mt-4 flex-wrap">
                        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-border-light">
                          <Check className="w-4 h-4 text-success" />
                          <span className="text-sm font-semibold text-ink">{allTemplates.length}</span>
                          <span className="text-xs text-ink-secondary">templates available</span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-border-light">
                          <span className="text-sm font-semibold text-accent">{selectedNiche}</span>
                          <span className="text-xs text-ink-secondary">niche selected</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {allTemplates.length === 0 ? (
              <div className="text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-border-main">
                <div className="w-16 h-16 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-4">
                  <Globe className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-lg font-bold text-ink mb-2">No templates available</h3>
                <p className="text-sm text-ink-secondary max-w-sm mx-auto">
                  Pick a different niche above to see pre-built templates.
                </p>
              </div>
            ) : (
              /* COMPLETELY NEW TEMPLATE GRID - Much bigger, more beautiful */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
                {allTemplates.map((tpl, index) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          // Already selected - open preview modal
                          openPreviewModal(tpl.id, index);
                        } else {
                          // Not selected - select it with beautiful sound
                          playElegantBell();
                          setSelectedTemplateId(tpl.id);
                        }
                      }}
                      className={`group relative bg-white rounded-2xl overflow-hidden border-2 transition-all duration-300 text-left cursor-pointer ${
                        isSelected
                          ? 'border-accent shadow-2xl shadow-accent/20 ring-4 ring-accent/10 scale-[1.02]'
                          : 'border-border-light hover:border-accent/40 hover:shadow-xl hover:shadow-accent/10 hover:-translate-y-2'
                      }`}
                    >
                      {/* Animated glow on selected */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-accent/5 pointer-events-none animate-pulse" />
                      )}
                      
                      {/* Preview Image Area - Much Bigger */}
                      <div className="relative aspect-[16/11] bg-gradient-to-br from-surface via-off-white to-surface overflow-hidden cursor-pointer" onClick={() => openPreviewModal(tpl.id, index)}>
                        <TemplateSimPreview
                          id={tpl.id}
                          name={tpl.name}
                          niche={tpl.niche}
                          badge={tpl.tag || ''}
                          isMostUsed={tpl.isMostUsed}
                          selected={isSelected}
                        />
                        
                        {/* Hover Overlay with Actions */}
                        <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/40 transition-all duration-300 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); openPreviewModal(tpl.id, index); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openPreviewModal(tpl.id, index); } }}
                            className="flex items-center gap-2 px-5 py-3 bg-white text-ink font-bold rounded-xl shadow-xl hover:bg-accent hover:text-white transition-all transform hover:scale-105 cursor-pointer"
                          >
                            <Eye className="w-5 h-5" />
                            Preview
                          </div>
                        </div>
                        
                        {/* Selection Badge */}
                        <div className={`absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                          isSelected
                            ? 'bg-accent text-white scale-100 ring-4 ring-white/60'
                            : 'bg-white/90 backdrop-blur-sm text-transparent group-hover:text-ink-secondary scale-90 group-hover:scale-100'
                        }`}>
                          <Check className="w-5 h-5" strokeWidth={3} />
                        </div>
                        
                        {/* Niche Badge */}
                        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/95 backdrop-blur-sm text-ink shadow-lg border border-border-light">
                          {tpl.niche}
                        </div>
                        
                        {/* Popular Badge */}
                        {tpl.isMostUsed && (
                          <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 text-white text-[10px] font-bold uppercase tracking-wider rounded-full shadow-lg flex items-center gap-1.5">
                            <span className="text-sm">★</span>
                            Most Popular
                          </div>
                        )}
                      </div>
                      
                      {/* Card Body - Larger, More Space */}
                      <div className="p-5 md:p-6 space-y-4">
                        <div>
                          <h4 className="text-lg md:text-xl font-bold text-ink leading-tight">
                            {tpl.name}
                          </h4>
                          {tpl.tag && (
                            <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
                              {tpl.tag}
                            </p>
                          )}
                        </div>
                        
                        {/* Selection Status */}
                        <div className={`flex items-center justify-between pt-3 border-t transition-all duration-300 ${
                          isSelected ? 'border-accent/30' : 'border-border-light'
                        }`}>
                          <span className={`flex items-center gap-2 text-sm font-semibold transition-colors ${
                            isSelected ? 'text-accent' : 'text-ink-secondary group-hover:text-accent'
                          }`}>
                            {isSelected ? (
                              <>
                                <Check className="w-5 h-5" strokeWidth={3} />
                                Selected
                              </>
                            ) : (
                              <>
                                <Eye className="w-5 h-5" />
                                Click to preview
                              </>
                            )}
                          </span>
                          
                          {/* Animated indicator */}
                          <div className={`flex items-center gap-1 transition-all duration-300 ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}>
                            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                            <div className="w-2 h-2 rounded-full bg-accent/60 animate-pulse animation-delay-100" />
                            <div className="w-2 h-2 rounded-full bg-accent/30 animate-pulse animation-delay-200" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            
            {/* Preview Modal */}
            <TemplatePreviewModal
              template={selectedTemplateForPreview}
              isOpen={previewModalOpen}
              onClose={() => setPreviewModalOpen(false)}
            />
          </div>
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
                    : Object.values(accountProbes).some(p => !p.ok)
                      ? 'bg-danger/10 border-danger/30 text-danger'
                      : 'bg-success-soft border-success/20 text-success'
                }`}>
                  <div className="flex items-center gap-2">
                    {isProbingTokens ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : Object.values(accountProbes).some(p => !p.ok) ? (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    <span className="font-semibold">
                      {isProbingTokens
                        ? 'Verifying connected accounts…'
                        : Object.values(accountProbes).some(p => !p.ok)
                          ? `${Object.values(accountProbes).filter(p => !p.ok).length} account${Object.values(accountProbes).filter(p => !p.ok).length === 1 ? '' : 's'} need${Object.values(accountProbes).filter(p => !p.ok).length === 1 ? 's' : ''} to reconnect`
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
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-border-light p-4 text-center shadow-sm">
                <div className="w-10 h-10 bg-accent-soft rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Users className="w-5 h-5 text-accent" />
                </div>
                <p className="text-2xl font-bold text-accent font-mono">{csvParsedCount}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Leads</p>
              </div>
              <div className="bg-white rounded-2xl border border-border-light p-4 text-center shadow-sm">
                <div className="w-10 h-10 bg-success-soft rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Globe className="w-5 h-5 text-success" />
                </div>
                <p className="text-2xl font-bold text-success font-mono">{selectedNiche}</p>
                <p className="text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold mt-0.5">Niche</p>
              </div>
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
                <p className="text-[11px] font-bold text-blue-600">{csvParsedCount} emails total</p>
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
                    const accountCount = Math.ceil(csvParsedCount / selectedAccountIds.size);
                    const isLast = idx === selectedAccountIds.size - 1;
                    const adjustedCount = isLast ? csvParsedCount - (accountCount * idx) : accountCount;
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
                    {csvParsedCount} personalized emails · {selectedAccountIds.size} sending account{selectedAccountIds.size > 1 ? 's' : ''} · AI-built sites included
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
          onClick={() => { playGentleChime(); setActiveStep(prev => prev - 1); }}
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
              onClick={() => { playGentleChime(); setActiveStep(prev => prev + 1); }}
              className={`text-xs font-semibold px-5 py-2.5 rounded-lg flex items-center gap-1.5 transition-all ${
                disabled
                  ? 'bg-surface text-ink-tertiary cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-white shadow-sm'
              }`}
            >
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4" />
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

      {(isLaunching || launchComplete) && (
        <div id="campaign-progress-container" className={`mx-6 mb-4 overflow-hidden transition-all duration-500 ${launchComplete ? 'animate-slide-up-fade' : ''}`}>
          <div className="bg-white border-2 border-blue-200 rounded-2xl shadow-lg shadow-blue-100/50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {launchComplete ? (
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  </div>
                ) : (
                  <div className="relative">
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-white">
                    {launchComplete ? 'Campaign Complete!' : 'Running Campaign...'}
                  </p>
                  <p className="text-[11px] text-blue-100">{launchMessage}</p>
                </div>
              </div>
              {/* Live percentage */}
              {isLaunching && (
                <div className="text-white font-black text-lg">{launchProgress}%</div>
              )}
            </div>

            {/* Stats Row - Compact */}
            <div className="px-4 py-3 flex items-center gap-3">
              {/* Sites */}
              <div className="flex-1 bg-blue-50 rounded-xl p-2.5 text-center border border-blue-100">
                <div className="text-lg mb-0.5">🏗️</div>
                <div className="text-xl font-black text-blue-700">{liveCounters.sitesStaged}</div>
                <div className="text-[10px] text-blue-500 font-semibold uppercase">Sites</div>
              </div>

              {/* Sent */}
              <div className="flex-1 bg-blue-50 rounded-xl p-2.5 text-center border border-blue-100">
                <div className="text-lg mb-0.5">✉️</div>
                <div className="text-xl font-black text-blue-700">{liveCounters.emailsSent}</div>
                <div className="text-[10px] text-blue-500 font-semibold uppercase">Sent</div>
              </div>

              {/* Failed */}
              <div className="flex-1 bg-red-50 rounded-xl p-2.5 text-center border border-red-100">
                <div className="text-lg mb-0.5">❌</div>
                <div className="text-xl font-black text-red-600">{liveCounters.emailsFailed}</div>
                <div className="text-[10px] text-red-500 font-semibold uppercase">Failed</div>
              </div>

              {/* Accounts */}
              <div className="flex-1 bg-blue-50 rounded-xl p-2.5 text-center border border-blue-100">
                <div className="text-lg mb-0.5">👤</div>
                <div className="text-xl font-black text-blue-700">{selectedAccountIds.size}</div>
                <div className="text-[10px] text-blue-500 font-semibold uppercase">Accounts</div>
              </div>
            </div>

            {/* Progress Bar (while launching) */}
            {isLaunching && (
              <div className="px-4 pb-3">
                <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden border border-blue-200">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 rounded-full relative overflow-hidden"
                    style={{ width: `${launchProgress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  </div>
                </div>
              </div>
            )}

            {/* Victory Celebration (3 seconds then auto-dismiss) */}
            {launchComplete && (
              <div className="relative overflow-hidden">
                {/* Confetti */}
                {Array.from({ length: 30 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full animate-confetti-fall"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: '-8px',
                      backgroundColor: ['#3B82F6', '#60A5FA', '#93C5FD', '#FFD700', '#BFDBFE'][Math.floor(Math.random() * 5)],
                      animationDelay: `${Math.random() * 1000}ms`,
                      animationDuration: `${1500 + Math.random() * 1000}ms`,
                    }}
                  />
                ))}
                
                {/* Victory Banner */}
                <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100 border-t border-blue-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎉</span>
                    <p className="text-sm font-bold text-blue-800">
                      {launchResults?.sent && launchResults.sent > 0 
                        ? `${launchResults.sent} emails sent successfully!` 
                        : 'Campaign finished!'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {['🌟', '💪', '🏆', '🚀'].map((emoji, i) => (
                      <span key={i} className="text-xl animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}>{emoji}</span>
                    ))}
                  </div>
                </div>

                {/* Auto-dismiss countdown */}
                <div className="h-1 bg-blue-200">
                  <div className="h-full bg-blue-500 animate-shrink-width" />
                </div>
              </div>
            )}

            {/* Launch Another Button */}
            <div className="px-4 py-3 bg-blue-50 border-t border-blue-200">
              <button
                type="button"
                onClick={handleReset}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg"
              >
                🚀 Launch Another Campaign
              </button>
            </div>
          </div>
        </div>
      )}

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
