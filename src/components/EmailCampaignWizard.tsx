// Email Campaign Wizard Component
// Replaces the SMS campaign type with a full email campaign flow
// Matches existing campaign wizard patterns 100%

import React, { useState, useRef, useEffect } from 'react';
import {
  Mail, Send, Upload, Globe, Check, ChevronRight, ChevronLeft, AlertCircle,
  CheckCircle, Loader2, X, ShieldAlert, Plus, Trash2, Eye, ExternalLink,
  RefreshCw, Link2, AlertTriangle, Zap, Clock, Pencil
} from 'lucide-react';
import { playGentleChime, playLaunchSwell, playVictoryCelebration, playSoftTap, playElegantError, playSoftBubble, playElegantBell } from '../utils/audio';
import { validateCsvFile, CsvValidation, PipelineLead, runEmailCampaign, probeAllEmailAccounts, initiateOAuthFlow, EmailAccountProbeResult, EmailCampaignEvent } from '../lib/pipelineClient';
import { Template } from '../types';
import { nicheList } from '../data';
import { TemplateSimPreview } from './TemplateSimPreview';
import { CsvPreview } from './CsvPreview';

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
  // Fired when the user clicks "View in Recent Campaigns" on the
  // celebration card. App.tsx uses it to scroll to the campaign in the
  // Recent Campaigns section and trigger the scroll-target-pulse flash.
  onViewDetails?: (campaignId: string) => void;
  // Fired when the user clicks "Edit outreach" on a Recent Campaigns row.
  // App.tsx uses it to re-open this wizard with the source campaign's
  // subject/body pre-filled.
  initialSubject?: string;
  initialBody?: string;
}

const COST_PER_EMAIL = 2; // Email campaign cost

// Default email templates
const DEFAULT_EMAIL_SUBJECT = "Quick question about {{business_name}}";
const DEFAULT_EMAIL_BODY = `Hi {{business_name}} team,

I came across {{business_name}} in {{city}} and noticed you don't have a website that showcases your services.

I built a beautiful, free landing page just for you — take a look:
{{site_url}}

It only takes a moment to review, and there's no commitment.

Best regards,
The Lunao Team`;

// Step definitions
const EMAIL_STEPS = [
  { step: 1, name: 'Select Niche' },
  { step: 2, name: 'Choose Lead Source' },
  { step: 3, name: 'Select Template' },
  { step: 4, name: 'Connect Accounts' },
  { step: 5, name: 'Review & Launch' },
];

export const EmailCampaignWizard: React.FC<EmailCampaignWizardProps> = ({
  templates,
  customTemplates = [],
  userPlan = 'Free Plan',
  userCredits,
  onCreditsChange,
  onLaunch,
  onViewDetails,
  initialSubject,
  initialBody,
}) => {
  const isPro = userPlan === 'Pro Plan' || userPlan === 'Agency Plan';
  
  // Step state
  const [activeStep, setActiveStep] = useState<number>(1);
  const stepRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  
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
  
  // Connected accounts
  const [connectedAccounts, setConnectedAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(false);
  const [isProbingTokens, setIsProbingTokens] = useState<boolean>(false);
  const [accountProbes, setAccountProbes] = useState<Record<string, EmailAccountProbeResult>>({});
  const stepTrackRef = useRef<HTMLDivElement | null>(null);
  
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

  // Live counters that tick up the moment each SSE event arrives. These
  // are populated during the run so the celebration card shows real-time
  // progress instead of a frozen "0 / 0 / 0" until `complete` fires.
  // Once the final `complete` event lands we still defer to
  // `launchResults` for the canonical count, but `liveCounters` drives
  // the UI throughout the run.
  const [liveCounters, setLiveCounters] = useState<{
    sitesStaged: number;   // Phase 1: sites compiled + staged (pre-deploy)
    emailsSent: number;   // Phase 3: emails successfully sent
    emailsFailed: number; // Phase 3: emails that failed
    deploying: boolean;   // True during Cloudflare batch deploy (Phase 2)
  }>({ sitesStaged: 0, emailsSent: 0, emailsFailed: 0, deploying: false });

  // Celebrated campaign — set the moment `createEmailCampaign` returns.
  // Drives the celebration card that replaces the wizard UI. Holds the
  // subject/body so the user can one-click back into "Edit outreach".
  const [celebratedCampaign, setCelebratedCampaign] = useState<{
    id: string;
    subject: string;
    body: string;
  } | null>(null);
  
  // Campaign name
  const [campaignName, setCampaignName] = useState<string>(`${selectedNiche} Email Campaign`);
  
  // Auto-scroll to current step content when step changes
  const stepContentRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Scroll to the absolute top of the page so the user always sees the
    // step indicator + the new step title together. The old behavior
    // (scroll to #email-wizard-content) only nudged the viewport up a few
    // hundred pixels which made the transition feel choppy.
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });

    // Play a gentle chime sound when the step changes
    playGentleChime(activeStep);
  }, [activeStep]);
  
  // Load connected accounts
  useEffect(() => {
    loadConnectedAccounts();
  }, []);

  // Apply initialSubject/initialBody when the parent flips them. Used by
  // the "Edit outreach" flow: a parent that owns the wizard passes a
  // source campaign's subject/body in, and we pre-fill the email editor
  // + jump to step 4 so the user can iterate the message.
  useEffect(() => {
    if (typeof initialSubject === 'string') setEmailSubject(initialSubject);
    if (typeof initialBody === 'string') setEmailBody(initialBody);
    if (initialSubject || initialBody) setActiveStep(4);
    // We intentionally do NOT depend on initialSubject/initialBody —
    // the parent passes these in ONCE when the user clicks Edit, and
    // we never want to clobber local edits if the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubject, initialBody]);
  
  // Defensive dedupe by (provider,email). The server already enforces this
  // with a unique index, but legacy rows + optimistic local state can still
  // produce two cards for the same Gmail — never let that reach the UI.
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

  // Hit the OAuth endpoint once per connected account to confirm the
  // refresh token is still valid. Cheaper than letting send-time fail.
  const probeAllTokens = async () => {
    const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
    setIsProbingTokens(true);
    try {
      const results = await probeAllEmailAccounts(ownerKey);
      const map: Record<string, EmailAccountProbeResult> = {};
      for (const r of results) map[r.id] = r;
      setAccountProbes(map);
      // Refresh the account list so the server-side status column also
      // reflects "needs_attention" for any token we just confirmed dead.
      await loadConnectedAccounts();
    } catch (err) {
      console.error('Token probe failed:', err);
    } finally {
      setIsProbingTokens(false);
    }
  };

  // Auto-probe every time the user lands on step 4 (Connect Accounts).
  useEffect(() => {
    if (activeStep === 4 && connectedAccounts.length > 0) {
      probeAllTokens();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, connectedAccounts.length]);
  
  // Handle CSV file upload
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
  
  // Toggle account selection
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
  
  // Insert token helper
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
  
  // Launch campaign
  const handleLaunch = async () => {
    setLaunchError(null);
    
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
    
    // Optimistic debit
    onCreditsChange?.(Math.max(0, userCredits - requiredCredits));
    
    setIsLaunching(true);
    setLaunchProgress(0);
    setLaunchMessage('Preparing email campaign...');
    setLaunchResults(null);
    setLaunchError(null);
    setLaunchComplete(false);
    playLaunchSwell();
    
    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
      const { createEmailCampaign, runEmailCampaign: runEmail } = await import('../lib/pipelineClient');
      
      // Create campaign (pass parsed leads so they're stored in the DB)
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

      // The campaign row is now committed — swap the wizard UI to the
      // celebration card IMMEDIATELY so the user never sees a raw
      // "Launching..." button. The SSE stream keeps updating live counters
      // through `setLaunchResults` / `setLaunchMessage`.
      setCelebratedCampaign({
        id: campaign.id,
        subject: emailSubject,
        body: emailBody,
      });

      setLaunchProgress(15);
      setLaunchMessage('Starting per-lead pipeline...');
      
      // Reset live counters at the start of each run so re-launching
      // doesn't accumulate stale numbers from the previous campaign.
      setLiveCounters({ sitesStaged: 0, emailsSent: 0, emailsFailed: 0, deploying: false });
      
      // Capture every per-lead event so the result card shows exactly what
      // happened (which account sent, which failed, which got queued, etc.)
      const perLead: any[] = [];
      // Smooth progress bar: bump up on EVERY event using a stage weight
      // so the bar climbs 0% → 100% across the whole run instead of
      // stuttering at 80–98%. Never goes down.
      const humanStage = (type: string): string => {
        switch (type) {
          case 'lead:start':          return 'starting lead';
          case 'discovery:start':     return 'discovering email';
          case 'discovery:found':     return 'email found';
          case 'discovery:not_found': return 'no email found';
          case 'site:compiling':      return 'building site';
          case 'site:staged':         return 'site staged';
          case 'site:failed':          return 'site failed';
          case 'phase1:complete':      return 'all staged';
          case 'deploy:start':         return 'pushing to Cloudflare';
          case 'deploy:done':          return 'cloudflare live';
          case 'email:sent':          return 'email sent';
          case 'send:sent':           return 'email sent';
          case 'send:queued':         return 'queued for later';
          case 'send:failed':         return 'send failed';
          case 'send:error':          return 'send error';
          default:                    return type;
        }
      };
      const smoothProgress = (type: string, index: number, total: number, current: number): number => {
        if (!total || total <= 0) return Math.min(100, current + 5);
        const elapsed = (Math.max(1, index) - 1) / total; // 0..(N-1)/N
        let stage = 0.05;
        if (type === 'site:compiling')    stage = 0.20;
        else if (type === 'site:staged')  stage = 0.45;
        else if (type === 'deploy:start') stage = 0.50;
        else if (type === 'deploy:done')  stage = 0.65;
        else if (type === 'send:sent')    stage = 1.00;
        else if (type === 'send:failed'
              || type === 'send:error')   stage = 1.00;
        else if (type === 'discovery:found'
              || type === 'discovery:not_found') stage = 0.15;
        const next = Math.round((elapsed + stage / total) * 100);
        return Math.min(100, Math.max(current, next));
      };
      const result = await runEmail(
        campaign.id,
        Array.from(selectedAccountIds),
        (e: EmailCampaignEvent) => {
          // ---- Live counters: tick on every relevant event so the
          // celebration card shows real-time progress ----
          // NOTE: sites counter advances on `site:staged` (Phase 1 done),
          // NOT `site:deployed` which no longer fires before emails.
          if (e.type === 'site:staged') {
            setLiveCounters(c => ({ ...c, sitesStaged: c.sitesStaged + 1 }));
          } else if (e.type === 'deploy:start') {
            setLiveCounters(c => ({ ...c, deploying: true }));
          } else if (e.type === 'deploy:done' || e.type === 'deploy:failed') {
            setLiveCounters(c => ({ ...c, deploying: false }));
          } else if (e.type === 'send:sent') {
            setLiveCounters(c => ({ ...c, emailsSent: c.emailsSent + 1 }));
          } else if (e.type === 'send:failed' || e.type === 'send:error') {
            setLiveCounters(c => ({ ...c, emailsFailed: c.emailsFailed + 1 }));
          }

          // ---- Smooth progress bar ----
          if (typeof e.index === 'number' && typeof e.total === 'number') {
            setLaunchProgress(prev => smoothProgress(e.type, e.index!, e.total!, prev));
          } else if (e.type === 'deploy:start') {
            setLaunchProgress(prev => Math.min(90, prev));
          } else if (e.type === 'deploy:done') {
            setLaunchProgress(prev => Math.min(100, prev + 5));
          }

          // ---- Human-friendly launch message ----
          if (e.type === 'lead:start') {
            setLaunchMessage(`Lead ${e.index}/${e.total}: ${e.name} — ${humanStage(e.type)}…`);
          } else if (e.type === 'site:staged') {
            setLaunchMessage(`Site staged for ${e.name} — waiting for Cloudflare deploy…`);
          } else if (e.type === 'phase1:complete') {
            setLaunchMessage(`${e.ready} sites ready — pushing to Cloudflare…`);
          } else if (e.type === 'deploy:start') {
            setLaunchMessage(`Deploying ${e.count || ''} sites to Cloudflare Pages…`);
          } else if (e.type === 'deploy:failed') {
            setLaunchMessage(`Cloudflare deploy failed — ${e.error}`);
          } else if (e.type === 'deploy:done') {
            setLaunchMessage(`All sites live on Cloudflare! — Sending emails…`);
          } else if (e.type === 'send:sent') {
            setLaunchMessage(`Sent ${e.index}/${e.total}: ${e.name} via ${e.accountEmail}`);
          } else if (e.type === 'send:failed' || e.type === 'send:error') {
            setLaunchMessage(`Failed ${e.index}/${e.total}: ${e.name}${e.reason || e.error ? ` — ${e.reason || e.error}` : ''}`);
          } else if (e.type === 'send:queued') {
            setLaunchMessage(`Queued ${e.index}/${e.total}: ${e.name}${e.reason ? ` — ${e.reason}` : ''}`);
          }

          // ---- Per-lead accumulator for the final results card ----
          if (e.type === 'send:sent') {
            perLead.push({
              leadId: e.leadId,
              name: e.name,
              email: e.email,
              accountEmail: e.accountEmail,
              subject: e.subject,
              siteUrl: e.siteUrl,
              status: 'sent',
            });
          } else if (e.type === 'send:failed' || e.type === 'send:error') {
            perLead.push({
              leadId: e.leadId,
              name: e.name,
              accountEmail: e.accountEmail,
              status: 'failed',
              reason: e.reason || e.error,
            });
          } else if (e.type === 'send:queued') {
            perLead.push({
              leadId: e.leadId,
              name: e.name,
              status: 'queued',
              reason: e.reason,
            });
          } else if (e.type === 'site:staged') {
            // Phase 1 may emit `site:staged` before Phase 3 creates the per-lead
            // row via `send:sent`. Create a placeholder if missing so the
            // `siteUrl` lands on the right row for the final results card.
            const found = perLead.find((p: any) => p.leadId === e.leadId);
            if (found) {
              found.siteUrl = e.siteUrl;
            } else {
              perLead.push({
                leadId: e.leadId,
                name: e.name,
                siteUrl: e.siteUrl,
                status: 'pending',
              });
            }
          } else if (e.type === 'complete') {
            setLaunchResults({
              sent: e.sent || 0,
              failed: e.failed || 0,
              status: e.status || 'completed',
              perAccount: e.perAccount || [],
              perLead,
            });
            // Snap progress to 100% on completion.
            setLaunchProgress(100);
          }
        }
      );
      
      // If the SSE stream didn't emit `complete` (rare race), still record
      // the final counts so the result card renders.
      if (!launchResults) {
        setLaunchResults({
          sent: result?.sent || 0,
          failed: result?.failed || 0,
          status: 'completed',
          perAccount: [],
          perLead,
        });
      }
      
      setLaunchProgress(100);
      setLaunchMessage(
        result?.sent > 0
          ? `Sent ${result.sent} email${result.sent === 1 ? '' : 's'}!`
          : `Campaign finished — ${result?.sent || 0} sent, ${result?.failed || 0} failed.`,
      );
      setLaunchComplete(true);
      if ((result?.sent || 0) > 0) {
        playVictoryCelebration();
      } else {
        playElegantError();
      }
      onLaunch?.();
      
    } catch (err: any) {
      playElegantError();
      setLaunchError(err.message || 'Campaign launch failed.');
      onCreditsChange?.(userCredits); // Refund
    } finally {
      setIsLaunching(false);
    }
  };
  
  // Reset wizard
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
  };
  
  // Template options for selected niche
  const nicheTemplates = templates.filter(t => t.niche === selectedNiche);
  const nicheCustom = customTemplates.filter(t => t.niche === selectedNiche);
  const allTemplates = [...nicheTemplates, ...nicheCustom];
  
  // Check if account has capacity warning
  const getAccountCapacityWarning = (account: EmailAccount, leadsCount: number): string | null => {
    const assignedLeads = Math.ceil(leadsCount / selectedAccountIds.size);
    if (account.remainingToday < assignedLeads) {
      return `This may exceed today's safe limit (${assignedLeads} assigned, ${account.remainingToday} remaining)`;
    }
    return null;
  };
  
  // When the campaign is created, swap the entire wizard UI for the
  // celebration card. We collapse the step content upward with
  // `.animate-wizard-collapse-up` so the transition feels intentional
  // rather than abrupt. Returns here so the wizard JSX never renders.
  if (celebratedCampaign) {
    // Counter resolution order:
    //   1. liveCounters (real-time SSE-driven, updates during the run)
    //   2. launchResults (canonical totals from the `complete` event)
    // This way the cards tick up the instant each lead finishes, AND
    // they snap to the canonical final count once the campaign ends.
    const sent      = isLaunching ? liveCounters.emailsSent   : (launchResults?.sent   ?? liveCounters.emailsSent   ?? 0);
    const failed    = isLaunching ? liveCounters.emailsFailed : (launchResults?.failed ?? liveCounters.emailsFailed ?? 0);
    // Sites count: derived from the per-lead siteUrl list captured during the
    // SSE stream. While running, the live counter ticks on `site:staged`; once
    // `complete` fires, the canonical count is the number of per-lead rows
    // that have a siteUrl attached (i.e. successfully deployed + linked).
    const sitesLive = isLaunching
      ? liveCounters.sitesStaged
      : (launchResults?.perLead?.filter((p: any) => p.siteUrl).length ?? liveCounters.sitesStaged ?? 0);
    // Defensive fallback for `perAccount` length so we never blank the tree.
    const perAcc = launchResults?.perAccount;
    const accountsUsed = Array.isArray(perAcc) && perAcc.length > 0
      ? perAcc.length
      : selectedAccountIds.size;
    const isRunning = isLaunching && !launchComplete;
    const isDone = !!launchComplete && !!launchResults;
    const campaignId = celebratedCampaign.id;

    return (
      <div className="space-y-6">
        {/* Header strip — mirrors the wizard step indicator's footprint
            so the page rhythm stays consistent. */}
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

        {/* Celebration card — lifted 1:1 from Campaigns.tsx so the two
            wizards share the exact same visual language. */}
        <div className="px-6 pb-6 animate-fade-in">
          <div className="relative overflow-hidden rounded-2xl border border-success/25 bg-gradient-to-br from-success-soft via-white to-accent-soft/60 shadow-sm animate-celebration-bloom">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-success/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative p-5 sm:p-6 space-y-4">
              {/* Heading row */}
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

              {/* Live counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-white/80 border border-border-light rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Sites</p>
                  <p
                    key={`sites-${sitesLive}`}
                    className="text-2xl font-bold text-accent font-mono mt-0.5 animate-counter-pop"
                  >
                    {sitesLive}
                  </p>
                  <p className="text-[9px] text-ink-tertiary mt-0.5">Sites staged</p>
                </div>
                <div className="bg-white/80 border border-border-light rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Emails</p>
                  <p
                    key={`emails-${sent}`}
                    className="text-2xl font-bold text-success font-mono mt-0.5 animate-counter-pop"
                  >
                    {sent}
                  </p>
                  <p className="text-[9px] text-ink-tertiary mt-0.5">Delivered</p>
                </div>
                <div className="bg-white/80 border border-border-light rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Failed</p>
                  <p
                    key={`failed-${failed}`}
                    className={`text-2xl font-bold font-mono mt-0.5 animate-counter-pop ${failed > 0 ? 'text-danger' : 'text-ink-tertiary'}`}
                  >
                    {failed}
                  </p>
                  <p className="text-[9px] text-ink-tertiary mt-0.5">{failed > 0 ? 'See reasons below' : 'All clean'}</p>
                </div>
                <div className="bg-white/80 border border-border-light rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Accounts</p>
                  <p className="text-2xl font-bold text-ink font-mono mt-0.5 animate-counter-pop">{accountsUsed}</p>
                  <p className="text-[9px] text-ink-tertiary mt-0.5">Sending inboxes</p>
                </div>
              </div>

              {/* Cloudflare deploy banner — visible while Phase 2 is running.
                  The deploy blocks all email sends so we surface it prominently. */}
              {isRunning && liveCounters.deploying && (
                <div className="flex items-center gap-2 text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                  <span className="font-medium">Deploying sites to Cloudflare Pages…</span>
                  <span className="ml-auto text-blue-500 font-bold shrink-0">No emails sent yet</span>
                </div>
              )}

              {/* Live streaming progress chip */}
              {isRunning && (
                <div className="flex items-center gap-2 text-[11px] text-ink-secondary bg-white/70 border border-border-light rounded-lg px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
                  <span className="font-mono truncate">{launchMessage || 'Deploying sites and sending emails in parallel…'}</span>
                  <span className="ml-auto text-[10px] text-ink-tertiary font-bold shrink-0">{launchProgress}%</span>
                </div>
              )}

              {/* Latest failure reason chip */}
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

              {/* Footer actions — Edit outreach + View in Recent Campaigns + Launch another */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t border-border-light/80">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      // Re-open the wizard on the outreach step with this
                      // campaign's subject/body pre-filled. The user can
                      // iterate the message and launch again.
                      playGentleChime();
                      setCelebratedCampaign(null);
                      setLaunchComplete(false);
                      setLaunchResults(null);
                      setLaunchProgress(0);
                      setLaunchMessage('');
                      setEmailSubject(celebratedCampaign.subject);
                      setEmailBody(celebratedCampaign.body);
                      setActiveStep(4);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-border-main text-[11px] font-semibold text-ink hover:bg-off-white transition-all cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" /> Edit outreach
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSoftTap();
                      // Surface the campaign in the Recent Campaigns section.
                      // App.tsx wires this through `onViewDetails` so the user
                      // sees the same scroll-target-pulse animation.
                      onViewDetails?.(campaignId);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-soft text-accent border border-accent/20 text-[11px] font-semibold hover:bg-accent hover:text-white transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-3 h-3" /> View in Recent Campaigns
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSoftTap();
                    // Launch another: reset everything, go back to step 1.
                    setCelebratedCampaign(null);
                    setLaunchComplete(false);
                    setLaunchResults(null);
                    setLaunchProgress(0);
                    setLaunchMessage('');
                    setActiveStep(1);
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
      {/* Step Indicator — horizontally scrollable on small screens */}
      <div className="relative px-6 md:px-8 py-6 md:py-8 bg-white border-b border-border-main">
        <button
          type="button"
          onClick={() => stepTrackRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
          className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 items-center justify-center bg-white/90 border border-border-main rounded-full shadow-sm hover:bg-off-white"
          aria-label="Scroll steps left"
        >
          <ChevronLeft className="w-4 h-4 text-ink" />
        </button>
        <button
          type="button"
          onClick={() => stepTrackRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
          className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 items-center justify-center bg-white/90 border border-border-main rounded-full shadow-sm hover:bg-off-white"
          aria-label="Scroll steps right"
        >
          <ChevronRight className="w-4 h-4 text-ink" />
        </button>
        <div
          id="email-wizard-steps-track"
          ref={stepTrackRef}
          className="scrollbar-thin flex flex-nowrap items-center overflow-x-auto gap-4 px-6 md:px-12 snap-x snap-mandatory"
        >
          {EMAIL_STEPS.map((item) => (
            <React.Fragment key={item.step}>
              <div
                ref={el => { stepRefs.current[item.step] = el; }}
                className="flex items-center gap-3 shrink-0 snap-center"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                  activeStep === item.step
                    ? 'bg-accent text-white ring-4 ring-accent-soft'
                    : activeStep > item.step
                      ? 'bg-success text-white'
                      : 'bg-surface text-ink-secondary border border-border-main'
                }`}>
                  {activeStep > item.step ? <Check className="w-4 h-4" /> : item.step}
                </div>
                <div className="flex flex-col whitespace-nowrap">
                  <span className={`text-[11px] uppercase tracking-wider font-semibold ${
                    activeStep === item.step ? 'text-accent' : 'text-ink-secondary'
                  }`}>
                    Step 0{item.step}
                  </span>
                  <span className={`text-xs font-medium leading-tight ${
                    activeStep === item.step ? 'font-semibold text-ink' : 'text-ink-secondary'
                  }`}>
                    {item.name}
                  </span>
                </div>
              </div>
              {item.step < 5 && (
                <div className="hidden md:block h-[1px] bg-border-light flex-1 mx-4 min-w-[20px]" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      
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
                      // Bubble pop on select is the most satisfying micro-sound
                      // for "I just picked this one" — feels like a tactile click.
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
                    {/* Decorative radial bloom on hover/selected */}
                    <div className={`pointer-events-none absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl transition-opacity ${
                      isSelected ? 'bg-accent/20 opacity-100' : 'bg-accent/0 opacity-0 group-hover:bg-accent/10 group-hover:opacity-100'
                    }`} />

                    {/* Niche emoji — much larger, like an icon hero */}
                    <div className={`relative mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl transition-all ${
                      isSelected
                        ? 'bg-accent text-white shadow-sm rotate-[-6deg]'
                        : 'bg-accent-soft text-accent group-hover:bg-accent group-hover:text-white group-hover:rotate-[-6deg]'
                    }`}>
                      <span className="drop-shadow-sm">{niche.emoji}</span>
                    </div>

                    {/* Label */}
                    <p className={`relative text-sm font-bold mt-3 leading-tight transition-colors ${
                      isSelected ? 'text-accent' : 'text-ink group-hover:text-accent'
                    }`}>
                      {niche.label}
                    </p>

                    {/* Selected check + caption */}
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
        
        {/* Step 2: Choose Lead Source */}
        {activeStep === 2 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl text-ink">Choose your leads</h3>
              <p className="text-sm text-ink-secondary">Upload a CSV or use Places API to find businesses.</p>
            </div>
            
            {/* Lead Source Tabs */}
            <div className="flex gap-2 p-1 bg-off-white rounded-xl w-fit">
              <button
                type="button"
                onClick={() => { playSoftTap(); setLeadSource('csv'); }}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  leadSource === 'csv'
                    ? 'bg-white text-accent shadow-sm border border-accent/20'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <Upload className="w-3.5 h-3.5 inline mr-1.5" />
                Upload CSV
              </button>
              <button
                type="button"
                onClick={() => { playSoftTap(); setLeadSource('places_api'); }}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  leadSource === 'places_api'
                    ? 'bg-white text-accent shadow-sm border border-accent/20'
                    : 'text-ink-secondary hover:text-ink'
                } ${!isPro ? 'opacity-60' : ''}`}
                disabled={!isPro}
                title={!isPro ? 'Places API is a Pro feature' : undefined}
              >
                <Zap className="w-3.5 h-3.5 inline mr-1.5" />
                Places API
                {!isPro && <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 rounded">Pro</span>}
              </button>
            </div>
            
            {/* CSV Upload */}
            {leadSource === 'csv' && (
              <div className="space-y-4">
                {!csvFileName ? (
                  <label className="block cursor-pointer">
                    <div className="border-2 border-dashed border-border-main rounded-xl p-8 text-center hover:border-accent/50 hover:bg-accent-soft/10 transition-all">
                      <Upload className="w-8 h-8 mx-auto mb-3 text-ink-tertiary" />
                      <p className="text-sm font-semibold text-ink">Drop your CSV file here</p>
                      <p className="text-xs text-ink-secondary mt-1">or click to browse</p>
                      <p className="text-[10px] text-ink-tertiary mt-3">Required columns: business_name, email, phone, city</p>
                    </div>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
                    />
                  </label>
                ) : (
                  <div className="space-y-3">
                    <CsvPreview
                      fileName={csvFileName}
                      leads={csvLeads}
                      totalCount={csvParsedCount}
                      onClear={() => { playSoftTap(); setCsvFileName(null); setCsvLeads([]); setCsvValidation(null); setCsvParsedCount(0); }}
                      ClearIcon={X}
                    />
                    <div className="flex items-center justify-between gap-3 px-1">
                      <p className="text-[11px] text-ink-secondary">
                        Looks good? Continue to <span className="font-semibold text-ink">pick a template</span>.
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
                        className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1"
                      >
                        <Upload className="w-3 h-3" />
                        Upload another
                      </button>
                    </div>
                  </div>
                )}
                
                {csvError && (
                  <div className="bg-danger/5 border border-danger/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <p className="text-xs text-danger">{csvError}</p>
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
        
        {/* Step 3: Select Template */}
        {activeStep === 3 && (
          <div className="space-y-6 animate-fade-in">
            {/* Brand-consistent header card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-soft/60 via-white to-accent-soft/20 border border-accent/15 p-5">
              <div className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 bg-accent/10 rounded-full blur-3xl" />
              <div className="relative flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center shadow-sm shrink-0">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-xl text-ink leading-tight">Pick your template</h3>
                  <p className="text-sm text-ink-secondary mt-1 leading-snug">
                    Each site will be personalized with the lead's business info. Tap any card to select it.
                  </p>
                  {allTemplates.length > 0 && (
                    <div className="flex items-center gap-3 mt-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white border border-accent/25 text-accent shadow-xs">
                        <Check className="w-3 h-3" /> 1 selected
                      </span>
                      <span className="text-[11px] text-ink-tertiary font-sans">
                        {allTemplates.length} template{allTemplates.length === 1 ? '' : 's'} for {selectedNiche}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {allTemplates.length === 0 ? (
              <div className="text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-border-main">
                <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-4">
                  <Globe className="w-7 h-7 text-accent" />
                </div>
                <h3 className="text-base font-bold font-sans text-ink mb-1.5">No templates available for {selectedNiche}</h3>
                <p className="text-sm text-ink-secondary font-sans max-w-sm mx-auto">
                  Pick a different niche above to see pre-built templates.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
                {allTemplates.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      // Crystalline bell tone signals "this template is now mine"
                      // — distinct from the niche bubble to keep the two pickers
                      // sonically identifiable.
                      playElegantBell();
                      setSelectedTemplateId(tpl.id);
                      setSelectedTemplateForPreview(tpl as Template);
                    }}
                    className={`group relative bg-white rounded-2xl overflow-hidden border-2 transition-all duration-200 text-left cursor-pointer ${
                      isSelected
                        ? 'border-accent shadow-[0_18px_48px_rgba(99,102,241,0.22)] ring-4 ring-accent/20 scale-[1.015]'
                        : 'border-border-main hover:border-accent/40 hover:shadow-[0_18px_48px_rgba(26,25,22,0.12)] hover:-translate-y-1 hover:scale-[1.01]'
                    }`}
                  >
                    {/* Glow pulse on selection — replays every time the user
                        picks this card so the "selected" feedback is fresh. */}
                    {isSelected && (
                      <span
                        key={`glow-${tpl.id}-${selectedTemplateId}`}
                        className="pointer-events-none absolute inset-0 rounded-2xl animate-template-glow-pulse"
                      />
                    )}

                    {/* Bigger preview area — taller aspect ratio so the
                        template visually pops in the grid. */}
                    <div className="relative aspect-[4/3] sm:aspect-[16/11] bg-gradient-to-br from-accent/8 to-accent/3 overflow-hidden">
                      <TemplateSimPreview
                        id={tpl.id}
                        name={tpl.name}
                        niche={tpl.niche}
                        badge={tpl.tag || ''}
                        isMostUsed={tpl.isMostUsed}
                      />
                      {/* Selection badge top-right */}
                      <div className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-md ${
                        isSelected
                          ? 'bg-accent text-white scale-100 ring-4 ring-white/60'
                          : 'bg-white/90 backdrop-blur-sm border border-border-main text-transparent scale-90 group-hover:scale-100 group-hover:text-ink-secondary'
                      }`}>
                        <Check className="w-4 h-4" strokeWidth={3} />
                      </div>
                      {/* Niche ribbon top-left */}
                      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/95 backdrop-blur-sm text-ink shadow-sm border border-border-light">
                        {tpl.niche}
                      </div>
                    </div>

                    {/* Card body — bigger, more breathing room */}
                    <div className="p-4 sm:p-5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm sm:text-base font-bold font-sans text-ink leading-tight line-clamp-2 flex-1">
                          {tpl.name}
                        </p>
                        {tpl.isMostUsed && (
                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            ★ Popular
                          </span>
                        )}
                      </div>
                      {tpl.tag && (
                        <p className="text-[11px] sm:text-xs text-ink-secondary font-sans line-clamp-2 leading-snug">
                          {tpl.tag}
                        </p>
                      )}
                      <div className="pt-2.5 mt-1 border-t border-border-light/80 flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold font-sans transition-colors ${
                          isSelected ? 'text-accent' : 'text-ink-secondary group-hover:text-accent'
                        }`}>
                          {isSelected ? (
                            <>
                              <Check className="w-3.5 h-3.5" strokeWidth={3} />
                              Selected
                            </>
                          ) : (
                            <>Tap to select</>
                          )}
                        </span>
                        <Eye className="w-3.5 h-3.5 text-ink-tertiary group-hover:text-accent transition-colors" />
                      </div>
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
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
                {/* Pre-flight probe banner — surfaces any dead refresh tokens
                    before the user even tries to advance to Review. */}
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

                {connectedAccounts.map((account) => {
                  const isSelected = selectedAccountIds.has(account.id);
                  const capacityWarning = csvLeads.length > 0 ? getAccountCapacityWarning(account, csvLeads.length) : null;
                  const probe = accountProbes[account.id];
                  const tokenDead = probe && !probe.ok;
                  // Server-side status is also a strong signal, but we trust
                  // the live probe more (it catches the case where the status
                  // column hasn't been flipped yet).
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
                            <span className={account.remainingToday < 5 ? 'text-amber-600' : ''}>
                              {account.remainingToday} remaining
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
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl text-ink">Review & launch</h3>
              <p className="text-sm text-ink-secondary">Confirm your campaign details before sending.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-off-white border border-border-main rounded-xl p-4 space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Niche</p>
                <p className="text-sm font-semibold text-ink">{selectedNiche}</p>
              </div>
              <div className="bg-off-white border border-border-main rounded-xl p-4 space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Leads</p>
                <p className="text-sm font-semibold text-ink">{csvParsedCount}</p>
              </div>
              <div className="bg-off-white border border-border-main rounded-xl p-4 space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Cost</p>
                <p className="text-sm font-semibold text-accent">{csvParsedCount * COST_PER_EMAIL} credits</p>
              </div>
            </div>
            
            <div className="bg-off-white border border-border-main rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold mb-2">Sending Accounts</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(selectedAccountIds).map(id => {
                  const acc = connectedAccounts.find(a => a.id === id);
                  return (
                    <span key={id} className="text-xs bg-white px-2 py-1 rounded-lg border border-border-main">
                      {acc?.email || id}
                    </span>
                  );
                })}
                {selectedAccountIds.size === 0 && (
                  <span className="text-xs text-ink-tertiary">No accounts selected</span>
                )}
              </div>
            </div>
            
            {/* Send Schedule Estimate */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-blue-800">Estimated Send Schedule</p>
                <p className="text-xs text-blue-700">
                  {csvLeads.length} leads across {selectedAccountIds.size} accounts with ~{Math.floor(120 / selectedAccountIds.size)} emails/account/day.
                  Campaign will complete in approximately {Math.ceil(csvLeads.length / (selectedAccountIds.size * 30))} days.
                </p>
              </div>
            </div>
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
          // On step 4 we MUST validate every selected account's refresh
          // token before letting the user move on. If any selected account
          // is dead, block the transition with a clear inline error.
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
      
      {/* Inline error: blocks Next when on step 4 with dead tokens */}
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

      {/* Launch Progress */}
      {(isLaunching || launchComplete) && (
        <div className="mx-6 mb-4 p-4 bg-off-white border border-border-main rounded-xl space-y-3">
          {isLaunching && (
            <>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-accent animate-spin" />
                <p className="text-sm font-semibold text-ink">Campaign running...</p>
              </div>
              <div className="w-full bg-border-main/30 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent h-full transition-all duration-300"
                  style={{ width: `${launchProgress}%` }}
                />
              </div>
              <p className="text-xs text-ink-secondary">{launchMessage}</p>
            </>
          )}
          {launchComplete && launchResults && (
            <div className="space-y-3">
              <div className={`p-4 rounded-xl border ${launchResults.sent > 0 && launchResults.failed === 0 ? 'bg-success-soft border-success/20' : launchResults.sent === 0 ? 'bg-danger/5 border-danger/20' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  {launchResults.sent > 0 && launchResults.failed === 0
                    ? <CheckCircle className="w-6 h-6 text-success shrink-0" />
                    : launchResults.sent === 0
                      ? <X className="w-6 h-6 text-danger shrink-0" />
                      : <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className={`text-base font-bold ${launchResults.sent > 0 && launchResults.failed === 0 ? 'text-success' : launchResults.sent === 0 ? 'text-danger' : 'text-amber-700'}`}>
                      {launchResults.sent > 0 && launchResults.failed === 0
                        ? `Campaign complete! ${launchResults.sent} sent.`
                        : launchResults.sent === 0
                          ? `Campaign finished — 0 emails sent, ${launchResults.failed} failed.`
                          : `Campaign finished — ${launchResults.sent} sent, ${launchResults.failed} failed.`}
                    </p>
                    <p className="text-xs text-ink-secondary">{launchMessage}</p>
                  </div>
                </div>
              </div>

              {launchResults.perLead.length > 0 && (
                <div className="bg-white border border-border-main rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-off-white border-b border-border-main">
                    <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-semibold">Per-lead results</p>
                  </div>
                  <ul className="divide-y divide-border-main/50">
                    {launchResults.perLead.map((lead, i) => (
                      <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink truncate">{lead.name}</p>
                          <p className="text-[11px] text-ink-secondary truncate">
                            {lead.email || lead.accountEmail || '—'}
                            {lead.accountEmail ? ` · via ${lead.accountEmail}` : ''}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          lead.status === 'sent'
                            ? 'bg-success/10 text-success'
                            : lead.status === 'queued'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-danger/10 text-danger'
                        }`}>
                          {lead.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={handleReset}
                className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all"
              >
                Launch another campaign
              </button>
            </div>
          )}
        </div>
      )}

      {/* Launch Error */}
      {launchError && (
        <div className="mx-6 mb-4 p-3 bg-danger/5 border border-danger/20 rounded-xl">
          <p className="text-xs text-danger font-semibold">{launchError}</p>
        </div>
      )}
    </div>
  );
};

export default EmailCampaignWizard;
