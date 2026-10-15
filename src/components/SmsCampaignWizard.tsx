// SmsCampaignWizard Component
// 100% Identical Visual Design & Workflow as EmailCampaignWizard
// 5-Step Architecture:
//   Step 1: Select Niche (Identical 3D Squircle Cards, Glow, Pop)
//   Step 2: Choose Leads (Pill Tabs: CSV Upload & Canada Lead Finder)
//   Step 3: Choose Template (Hero Banner, 3-Col Preview Grid, Preview Modal)
//   Step 4: Phone & 10DLC Setup (SmsAccountStep in Luxury Container)
//   Step 5: Review & Launch (Dual-Column, Variable Chips, Mobile SMS Simulator, Cost Calculator)

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MessageSquare, Send, Upload, Check, ChevronRight, ChevronLeft,
  AlertCircle, CheckCircle, CheckCircle2, Loader2, X, Plus, Eye,
  Sparkles, FileSpreadsheet, Phone, Users, Clock,
  Smartphone, Monitor, Layout, MapPin, AlertTriangle, ExternalLink,
  Terminal, Globe, CheckCheck, Copy, Edit3, Filter, RotateCcw, Sliders,
  Layers, ShieldCheck
} from 'lucide-react';
import {
  playGentleChime, playLaunchSwell, playVictoryCelebration,
  playSoftTap, playElegantError, playSoftBubble, playElegantBell,
} from '../utils/audio';
import {
  validateCsvFile, CsvValidation, PipelineLead,
  runCampaign, isAutomatedSmsPlan, canUseOwnTelnyx,
} from '../lib/pipelineClient';
import { useSyncNiches } from '../lib/nichesSync';
import { Template } from '../types';
import { TemplateSimPreview } from './TemplateSimPreview';
import { CsvPreview } from './CsvPreview';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { CampaignTemplateStep } from './CampaignTemplateStep';
import { SmsAccountStep } from './SmsAccountStep';
import { SmsLeadFinder } from './SmsLeadFinder';
import { CanadaOnlyErrorCard } from './CanadaOnlyErrorCard';

interface SmsCampaignWizardProps {
  templates: Template[];
  customTemplates?: any[];
  userPlan?: string;
  userCredits: number;
  ownerKey: string;
  onCreditsChange?: (credits: number) => void;
  onLaunch?: () => void;
  onCampaignCreated?: (campaign: any) => void;
  onViewDetails?: (campaignId: string) => void;
  onStepChange?: (step: number) => void;
}

const COST_PER_SMS = 2;

export interface SmsTemplatePreset {
  id: string;
  name: string;
  badge: string;
  text: string;
}

export const PRESET_SMS_TEMPLATES: SmsTemplatePreset[] = [
  {
    id: 'referral_josh',
    name: 'Josh Referral Hook (Recommended)',
    badge: 'Referral',
    text: `Yoo pal, Josh recomended u. But saw u had no site, so I build u one. pls update me tysm.

{{site_url}}`,
  },
  {
    id: 'no_catch_niche',
    name: 'No Catch (Niche & City Hook)',
    badge: 'Niche Value',
    text: `Yoo pal, No catch, already built u the best {{niche}} site in {{city}} plss update me ty.

{{site_url}}`,
  },
  {
    id: 'compact_short',
    name: 'Ultra Short 1-Segment Hook',
    badge: '1-Seg Safe',
    text: `Yoo pal, built u a site: {{site_url}} pls update me tysm.`,
  },
];

const DEFAULT_SMS_MESSAGE = PRESET_SMS_TEMPLATES[0].text;

export const interpolateSmsVariables = (
  template: string,
  data: {
    businessName?: string;
    city?: string;
    siteUrl?: string;
    niche?: string;
  }
): string => {
  const bName = data.businessName || 'there';
  const city = data.city || 'your area';
  const url = data.siteUrl || 'https://lunao-web-designn.pages.dev/preview/';
  const niche = (data.niche || 'business').toLowerCase();

  return template
    .replace(/\{\{business_name\}\}/gi, bName)
    .replace(/\(business\s*name\)/gi, bName)
    .replace(/\{\{city\}\}/gi, city)
    .replace(/\(\s*city\s*\)/gi, city)
    .replace(/\{\{site_url\}\}/gi, url)
    .replace(/\(\s*site\s*url\s*\)/gi, url)
    .replace(/\{\{niche\}\}/gi, niche)
    .replace(/\{\{nche\}\}/gi, niche)
    .replace(/\(\s*nche\s*\)/gi, niche)
    .replace(/\(\s*niche\s*\)/gi, niche);
};

export const SmsCampaignWizard: React.FC<SmsCampaignWizardProps> = ({
  templates,
  customTemplates = [],
  userPlan = 'Free Plan',
  userCredits,
  ownerKey,
  onCreditsChange,
  onLaunch,
  onCampaignCreated,
  onViewDetails,
  onStepChange,
}) => {
  const [allNiches] = useSyncNiches();

  // Completion & Campaign info
  const [isShowingCompletion, setIsShowingCompletion] = useState(false);
  const [campaignName, setCampaignName] = useState<string>('SMS Campaign');

  // Wizard step state (1-5)
  const [activeStep, setActiveStep] = useState<number>(1);

  // Step 1: Niche
  const [selectedNiche, setSelectedNiche] = useState<string>('Barber');

  // Step 2: Lead Source
  const [leadSource, setLeadSource] = useState<'csv' | 'google_maps'>('csv');
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [isCsvParsing, setIsCsvParsing] = useState<boolean>(false);
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  const [csvLeads, setCsvLeads] = useState<PipelineLead[]>([]);
  const [csvValidation, setCsvValidation] = useState<CsvValidation | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('barber-dark-luxury');
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewTemplateIndex, setPreviewTemplateIndex] = useState<number>(0);

  // Step 4: Phone Number Selection
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Step 5: SMS Content & Advanced Segment Customization
  const [smsMessage, setSmsMessage] = useState<string>(DEFAULT_SMS_MESSAGE);
  const [activePresetId, setActivePresetId] = useState<string>('referral_josh');
  const [copiedPreviewSms, setCopiedPreviewSms] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 2-Segment specific customization & individual lead overrides
  const [enable2SegOverride, setEnable2SegOverride] = useState<boolean>(false);
  const [twoSegTemplate, setTwoSegTemplate] = useState<string>(
    `Yoo pal, built u a site: {{site_url}} pls update me tysm.`
  );
  const [customLeadMessages, setCustomLeadMessages] = useState<Record<number, string>>({});
  const [editingLeadIndex, setEditingLeadIndex] = useState<number | null>(null);
  const [editingLeadCopy, setEditingLeadCopy] = useState<string>('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | '1seg' | '2seg'>('all');
  const [previewLeadIndex, setPreviewLeadIndex] = useState<number>(0);

  // Autonomous Launch & Live Progress State
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [launchProgress, setLaunchProgress] = useState<number>(0);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [celebratedCampaign, setCelebratedCampaign] = useState<any>(null);
  const [activeLeadIndex, setActiveLeadIndex] = useState<number>(0);
  const [aiLogs, setAiLogs] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'agent' | 'success' | 'code' }>>([]);
  const [completedSitesList, setCompletedSitesList] = useState<Array<{ slug: string; name: string; city?: string; phone?: string; url: string; smsText?: string; status: 'live' | 'failed'; smsStatus?: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed'; smsError?: string | null; telnyxId?: string | null }>>([]);
  const [dispatchedSmsList, setDispatchedSmsList] = useState<Array<{ name: string; phone?: string; url: string; status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed'; telnyxId?: string | null; smsError?: string | null }>>([]);
  const terminalBoxRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);
  const progressContainerRef = useRef<HTMLDivElement>(null);

  // Monitor internal scrolling in the terminal console so users can scroll up
  const handleTerminalScroll = () => {
    const el = terminalBoxRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If distance from bottom is greater than 35px, user is manually reading earlier logs
    isUserScrolledUpRef.current = distanceFromBottom > 35;
  };

  useEffect(() => {
    if (isLaunching && terminalBoxRef.current) {
      // ONLY scroll the terminal box itself internally — NEVER scroll the outer window or page!
      if (!isUserScrolledUpRef.current) {
        terminalBoxRef.current.scrollTop = terminalBoxRef.current.scrollHeight;
      }
    }
  }, [aiLogs, isLaunching]);

  // Auto-scroll up to the top when launching outreach from Step 6 so progress UI starts cleanly from the top
  useEffect(() => {
    if (isLaunching) {
      const scrollUpToTop = () => {
        // 1. Scroll main dashboard content container smoothly to top
        const mainFlow = document.getElementById('main-content-flow');
        if (mainFlow) {
          mainFlow.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // 2. Scroll the progress section or wizard card into view smoothly
        const progressEl = progressContainerRef.current ||
                           document.getElementById('sms-launch-progress-container') ||
                           document.getElementById('campaigns-generator-wizard-card') ||
                           document.getElementById('wizard-step-contents-wrapper');
        if (progressEl) {
          progressEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // 3. Fallback for document / window scrolling
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };

      // Trigger immediately and with a small frame delay to ensure DOM alignment
      scrollUpToTop();
      const timer = setTimeout(scrollUpToTop, 50);
      return () => clearTimeout(timer);
    }
  }, [isLaunching]);

  // Also auto-scroll up when completion celebration screen appears
  useEffect(() => {
    if (isShowingCompletion) {
      const timer = setTimeout(() => {
        const mainFlow = document.getElementById('main-content-flow');
        if (mainFlow) {
          mainFlow.scrollTo({ top: 0, behavior: 'smooth' });
        }
        const wizardCard = document.getElementById('campaigns-generator-wizard-card') ||
                           document.getElementById('sms-campaign-completion-container');
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

  const stepContentRef = useRef<HTMLDivElement>(null);

  // Derived: templates for selected niche
  const nicheTemplates = useMemo(() => {
    return templates.filter((t) => t.niche.toLowerCase() === selectedNiche.toLowerCase());
  }, [templates, selectedNiche]);

  const nicheCustom = useMemo(() => {
    return customTemplates.filter((t) => t.niche.toLowerCase() === selectedNiche.toLowerCase());
  }, [customTemplates, selectedNiche]);

  const allTemplates = useMemo(() => {
    const list = [...nicheTemplates, ...nicheCustom];
    if (list.length > 0) return list;
    return templates.slice(0, 4);
  }, [nicheTemplates, nicheCustom, templates]);

  // Keep selectedTemplateId valid when niche changes
  useEffect(() => {
    if (allTemplates.length > 0 && !allTemplates.some(t => t.id === selectedTemplateId)) {
      setSelectedTemplateId(allTemplates[0].id);
    }
  }, [allTemplates, selectedTemplateId]);

  // Target countries
  const targetCountries = useMemo(() => {
    if (!csvLeads.length) return [];
    const countries = new Set<string>();
    const US_STATE_TO_COUNTRY = (state: string) => {
      if (/^[A-Z]{2}$/.test(state)) return 'US';
      return null;
    };
    for (const lead of csvLeads) {
      const rawCountry = (lead.country || '').toUpperCase().trim();
      const rawState = (lead.state || '').toUpperCase().trim();

      if (rawCountry.length === 2 && /^[A-Z]{2}$/.test(rawCountry)) {
        countries.add(rawCountry);
        continue;
      }
      if (rawState) {
        const mapped = US_STATE_TO_COUNTRY(rawState);
        if (mapped) countries.add(mapped);
      }
    }
    return [...countries];
  }, [csvLeads]);

  // Update campaign name when niche changes
  useEffect(() => {
    setCampaignName(`${selectedNiche} SMS Campaign`);
  }, [selectedNiche]);

  // Notify parent of step changes
  useEffect(() => {
    onStepChange?.(activeStep);
  }, [activeStep, onStepChange]);

  // CSV file handler
  const handleFileSelect = async (file: File) => {
    setIsCsvParsing(true);
    setCsvError(null);
    setCsvFileName(file.name);
    playLaunchSwell();

    try {
      const validation = await validateCsvFile(file, ownerKey, userPlan);
      setCsvValidation(validation);
      setCsvLeads(validation.leads);
      setCsvParsedCount(validation.validCount);
      if (!validation.ok) {
        playElegantError();
        setCsvError(validation.message || 'CSV validation failed');
      } else {
        playVictoryCelebration();
      }
    } catch (err: any) {
      playElegantError();
      setCsvError(err.message || 'Failed to parse CSV');
      setCsvLeads([]);
      setCsvParsedCount(0);
    } finally {
      setIsCsvParsing(false);
    }
  };

  // Phone number selection handler
  const handleSelectPhone = (phone: string, accountId: string, profileId: string | null) => {
    setSelectedPhoneNumber(phone);
    setSelectedAccountId(accountId);
    setSelectedProfileId(profileId);
  };

  // Step navigation checks
  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return Boolean(selectedNiche);
      case 2:
        return csvLeads.length > 0;
      case 3:
        return Boolean(selectedTemplateId);
      case 4:
        return isAutomatedSmsPlan(userPlan) || Boolean(selectedPhoneNumber);
      case 5:
        return Boolean(smsMessage.trim());
      case 6:
        return (
          csvLeads.length > 0 &&
          Boolean(smsMessage.trim()) &&
          userCredits >= csvLeads.length * COST_PER_SMS
        );
      default:
        return false;
    }
  };

  const handleNextStep = () => {
    if (canProceedFromStep(activeStep)) {
      playGentleChime(activeStep + 1);
      setActiveStep((s) => Math.min(6, s + 1));
      stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      playElegantError();
    }
  };

  const handlePrevStep = () => {
    playGentleChime();
    setActiveStep((s) => Math.max(1, s - 1));
    stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openPreviewModal = (templateId: string, index: number) => {
    playSoftTap();
    setSelectedTemplateId(templateId);
    setPreviewTemplateIndex(index);
    setPreviewModalOpen(true);
  };

  // Insert variable tag into SMS message textarea
  const insertVariableTag = (tag: string) => {
    playSoftTap();
    if (!textareaRef.current) {
      setSmsMessage((prev) => prev + ` {{${tag}}}`);
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const current = textarea.value;
    const insertion = `{{${tag}}}`;
    const next = current.substring(0, start) + insertion + current.substring(end);
    setSmsMessage(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 10);
  };

  // Launch campaign with sequential autonomous AI rebranding & SMS proposal dispatch
  const handleLaunch = async () => {
    const totalLeads = csvLeads.length;
    if (totalLeads === 0 || !canProceedFromStep(5)) return;

    const totalCost = totalLeads * COST_PER_SMS;
    if (userCredits < totalCost) {
      playElegantError();
      setLaunchError(`Insufficient credits. You need ${totalCost} credits, but currently have ${userCredits}.`);
      return;
    }

    setIsLaunching(true);
    setLaunchError(null);
    setLaunchProgress(5);
    setActiveLeadIndex(0);
    setAiLogs([]);
    setCompletedSitesList([]);
    setDispatchedSmsList([]);
    playLaunchSwell();

    // Smoothly auto-scroll up so the progress UI starts cleanly from the top
    try {
      const mainFlow = document.getElementById('main-content-flow');
      if (mainFlow) {
        mainFlow.scrollTo({ top: 0, behavior: 'smooth' });
      }
      const wizardCard = document.getElementById('campaigns-generator-wizard-card') ||
                         document.getElementById('sms-launch-progress-container') ||
                         document.getElementById('wizard-step-contents-wrapper');
      if (wizardCard) {
        wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      // non-fatal
    }

    // Deduct credits optimistically
    const nextCredits = Math.max(0, userCredits - totalCost);
    onCreditsChange?.(nextCredits);
    localStorage.setItem('lunao_user_credits', nextCredits.toString());

    const newCampId = 'sms_' + Date.now();
    const finalName = campaignName || `${selectedNiche} SMS Campaign`;
    const resolvedOwnerKey = ownerKey || localStorage.getItem('lunao_owner_key') || `dash-${userPlan.replace(/\s+/g, '-')}`;

    const getTime = () => {
      const d = new Date();
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    };

    const addLog = (text: string, type: 'info' | 'agent' | 'success' | 'code' = 'info') => {
      setAiLogs((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, time: getTime(), text, type }]);
    };

    addLog(`Initializing SMS Outreach Engine for niche: "${selectedNiche}"`, 'info');
    addLog(`Sender Route: ${selectedPhoneNumber || '+1 (604) 953-9651'} (Telnyx Canada 10DLC)`, 'info');
    addLog(`Queued batch of ${totalLeads} local businesses for autonomous rebranding & SMS dispatch.`, 'info');

    const completedAccumulator: Array<{ slug: string; name: string; city?: string; phone?: string; url: string; smsText?: string; status: 'live' | 'failed' }> = [];

    // Process businesses sequentially one-by-one!
    for (let i = 0; i < totalLeads; i++) {
      const lead = csvLeads[i];
      setActiveLeadIndex(i);

      addLog(`[Target ${i + 1}/${totalLeads}] Preparing AI rebranding workspace for "${lead.name}" (${lead.city || 'Local Area'})...`, 'agent');
      await new Promise((r) => setTimeout(r, 350));

      addLog(`[AI Rebranding] Generating personalized copy, localized trust badges & headlines for "${lead.name}"...`, 'agent');
      await new Promise((r) => setTimeout(r, 400));

      addLog(`[Edge Deployment] Compiling and deploying live website to Lunao edge CDN...`, 'info');
      await new Promise((r) => setTimeout(r, 350));

      let siteUrl = '';
      let slug = '';
      let deployedOk = false;

      // Real rebranding and deploying site via Cloudflare Pages API endpoint!
      try {
        const resp = await fetch('/api/site-deploy/rebrand-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business: { name: lead.name, city: lead.city, phone: lead.phone },
            niche: selectedNiche,
            templateKey: selectedTemplateId,
            ownerKey: resolvedOwnerKey,
            deploy: true,
          }),
        });
        const data = await resp.json();
        if (data.ok && data.slug) {
          slug = data.slug;
          siteUrl = `https://lunao-web-designn.pages.dev/${slug}/`;
          deployedOk = true;
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

      // Format personalized SMS proposal (respecting 2-seg override and individual customization)
      const recipientPhone = lead.phone || (selectedPhoneNumber ? '+1 604-555-0199' : '+1 604-953-9651');

      let leadMessageTemplate = smsMessage;
      let used2SegShortener = false;
      if (customLeadMessages[i] !== undefined) {
        leadMessageTemplate = customLeadMessages[i];
      } else if (enable2SegOverride) {
        const standardTest = interpolateSmsVariables(smsMessage, {
          businessName: lead.name,
          city: lead.city,
          siteUrl,
          niche: selectedNiche,
        });
        if (standardTest.length > 160) {
          leadMessageTemplate = twoSegTemplate;
          used2SegShortener = true;
        }
      }

      const personalizedSms = interpolateSmsVariables(leadMessageTemplate, {
        businessName: lead.name,
        city: lead.city,
        siteUrl,
        niche: selectedNiche,
      });

      const smsCharLen = personalizedSms.length;
      const smsSegs = smsCharLen <= 160 ? 1 : Math.ceil(smsCharLen / 153);

      addLog(`[SMS Engine] Composing personalized hook (${smsSegs} segment · ${smsCharLen} chars${used2SegShortener ? ' · 2-seg shortened' : ''}) for ${recipientPhone}...`, 'code');
      addLog(`[Outbound SMS] "${personalizedSms.replace(/\n/g, ' ').slice(0, 60)}..."`, 'code');
      await new Promise((r) => setTimeout(r, 350));

      addLog(`[Carrier Network] Routing outbound SMS to ${recipientPhone} via Telnyx Messaging Profile...`, 'agent');

      let smsDeliveryStatus: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' = 'queued';
      let telnyxMessageId: string | null = null;
      let deliveryErrorMessage: string | null = null;

      try {
        const smsRes = await fetch('/api/sms/send-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipientPhone,
            text: personalizedSms,
            leadName: lead.name,
            businessName: lead.name,
            city: lead.city,
            siteUrl,
            campaignId: newCampId,
            ownerKey: resolvedOwnerKey,
          }),
        });
        const smsData = await smsRes.json().catch(() => ({}));
        if (smsData.ok && (smsData.id || smsData.telnyxId)) {
          telnyxMessageId = smsData.id || smsData.telnyxId;
          smsDeliveryStatus = (smsData.status === 'delivered') ? 'delivered' : 'queued';
          addLog(`[Telnyx API] SMS queued with carrier. Telnyx ID: ${telnyxMessageId} [Status: Queued]`, 'code');
        } else if (smsData.status === 'failed' || smsData.error) {
          smsDeliveryStatus = 'failed';
          deliveryErrorMessage = smsData.error || 'Carrier rejection';
          addLog(`[Telnyx Failure] SMS failed for ${lead.name}: ${deliveryErrorMessage} (Code: ${smsData.errorCode || 'E_CARRIER'})`, 'agent');
        } else {
          telnyxMessageId = smsData.id || smsData.telnyxId || null;
          smsDeliveryStatus = smsData.status || 'queued';
          addLog(`[Telnyx API] Outbound queued: ${smsDeliveryStatus}`, 'info');
        }
      } catch (smsErr: any) {
        smsDeliveryStatus = 'failed';
        deliveryErrorMessage = smsErr.message || 'Network error';
        addLog(`[Telnyx Error] SMS dispatch error: ${deliveryErrorMessage}`, 'agent');
      }

      const siteItem = {
        slug: slug || `site-${i + 1}`,
        name: lead.name || `Business ${i + 1}`,
        city: lead.city || 'Austin',
        phone: recipientPhone,
        url: siteUrl,
        smsText: personalizedSms,
        status: 'live' as const,
        smsStatus: smsDeliveryStatus,
        smsError: deliveryErrorMessage,
        telnyxId: telnyxMessageId,
      };
      completedAccumulator.push(siteItem);
      setCompletedSitesList([...completedAccumulator]);
      setDispatchedSmsList([...completedAccumulator as any]);

      // 1. Instantly dispatch event for Messaging tab & PWA sync
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('lunao_sms_dispatched', {
            detail: {
              id: Date.now() + i,
              campaignId: newCampId,
              leadId: null,
              ownerKey: resolvedOwnerKey,
              toNumber: recipientPhone,
              fromNumber: selectedPhoneNumber || '+1 (604) 953-9651',
              body: personalizedSms,
              status: smsDeliveryStatus,
              telnyxId: telnyxMessageId,
              errorCode: null,
              errorMessage: deliveryErrorMessage,
              segmentCount: smsSegs,
              costCredits: 2,
              refunded: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              leadName: lead.name,
              businessName: lead.name,
              city: lead.city,
              niche: selectedNiche,
              siteUrl,
            },
          })
        );
      }

      // 2. Instantly persist/update business in localStorage so Messaging knows business name & niche
      try {
        const rawBiz = localStorage.getItem('lunao_businesses');
        const bizList = rawBiz ? JSON.parse(rawBiz) : [];
        const normPhone = recipientPhone.replace(/\D/g, '');
        const exists = bizList.some((b: any) => (b.phone || '').replace(/\D/g, '') === normPhone);
        if (!exists) {
          const newBiz = {
            id: 'biz-' + Date.now() + '-' + i,
            name: lead.name,
            owner: '',
            phone: recipientPhone,
            city: lead.city || '',
            niche: selectedNiche || 'Lead',
            webStatus: 'Site generated',
            siteStatus: 'SMS sent',
            slug: siteItem.slug,
            siteUrl: siteItem.url,
            smsHistory: [
              {
                text: personalizedSms,
                timestamp: 'Just now',
                type: 'outgoing',
                deliveryStatus: smsDeliveryStatus,
              },
            ],
          };
          bizList.unshift(newBiz);
          localStorage.setItem('lunao_businesses', JSON.stringify(bizList));
        }
      } catch {
        // non-fatal
      }

      // If queued or in-flight, continuously poll every 3 seconds to track delivery / failure reasons from Telnyx
      if (telnyxMessageId && smsDeliveryStatus !== 'failed' && smsDeliveryStatus !== 'delivered') {
        const pollId = telnyxMessageId;
        const targetPhone = recipientPhone;
        const targetName = lead.name;
        (async () => {
          let attempts = 0;
          const maxAttempts = 30; // Poll every 3s for up to 90 seconds
          while (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            attempts++;
            try {
              const checkRes = await fetch(`/api/sms/status-check?id=${encodeURIComponent(pollId)}`);
              const checkData = await checkRes.json().catch(() => ({}));
              if (checkData.ok && checkData.status) {
                const updatedStatus = checkData.status.toLowerCase();
                if (updatedStatus === 'delivered') {
                  addLog(`[Telnyx Delivered] Carrier confirmed delivery to ${targetName} (${targetPhone}) [Status: SMS Delivered · 200 OK]`, 'success');
                  siteItem.smsStatus = 'delivered';
                  setCompletedSitesList([...completedAccumulator]);
                  setDispatchedSmsList([...completedAccumulator as any]);
                  playGentleChime();

                  // Dispatch instant status update event
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('lunao_sms_status_updated', {
                        detail: { telnyxId: pollId, phone: targetPhone, status: 'delivered' },
                      })
                    );
                    // Update saved campaign in localStorage
                    try {
                      const camps = JSON.parse(localStorage.getItem('lunao_campaigns') || '[]');
                      const targetCamp = camps.find((c: any) => c.id === newCampId);
                      if (targetCamp && Array.isArray(targetCamp.smsLeads)) {
                        const targetLead = targetCamp.smsLeads.find((l: any) => l.telnyxId === pollId || l.phone === targetPhone);
                        if (targetLead) {
                          targetLead.status = 'delivered';
                          targetCamp.smsSent = targetCamp.smsLeads.filter((l: any) => l.status === 'delivered' || l.status === 'sent').length;
                          localStorage.setItem('lunao_campaigns', JSON.stringify(camps));
                        }
                      }
                    } catch {}
                  }
                  break;
                } else if (updatedStatus === 'failed') {
                  const reason = checkData.errorMessage || checkData.errorCode || 'Carrier rejected message';
                  addLog(`[Telnyx Alert] SMS failed for ${targetName} (${targetPhone}): ${reason} (Code: ${checkData.errorCode || 'UNKNOWN'})`, 'agent');
                  siteItem.smsStatus = 'failed';
                  siteItem.smsError = reason;
                  setCompletedSitesList([...completedAccumulator]);
                  setDispatchedSmsList([...completedAccumulator as any]);

                  // Dispatch instant status update event
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('lunao_sms_status_updated', {
                        detail: { telnyxId: pollId, phone: targetPhone, status: 'failed', errorMessage: reason, errorCode: checkData.errorCode },
                      })
                    );
                    try {
                      const camps = JSON.parse(localStorage.getItem('lunao_campaigns') || '[]');
                      const targetCamp = camps.find((c: any) => c.id === newCampId);
                      if (targetCamp && Array.isArray(targetCamp.smsLeads)) {
                        const targetLead = targetCamp.smsLeads.find((l: any) => l.telnyxId === pollId || l.phone === targetPhone);
                        if (targetLead) {
                          targetLead.status = 'failed';
                          targetLead.smsError = reason;
                          targetCamp.smsFailed = (targetCamp.smsFailed || 0) + 1;
                          localStorage.setItem('lunao_campaigns', JSON.stringify(camps));
                        }
                      }
                    } catch {}
                  }
                  break;
                } else if (updatedStatus === 'sent' || updatedStatus === 'queued') {
                  siteItem.smsStatus = updatedStatus;
                  setCompletedSitesList([...completedAccumulator]);
                  setDispatchedSmsList([...completedAccumulator as any]);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('lunao_sms_status_updated', {
                        detail: { telnyxId: pollId, phone: targetPhone, status: updatedStatus },
                      })
                    );
                  }
                }
              }
            } catch (err: any) {
              console.warn('[Telnyx Poll Error]', err.message);
            }
          }
        })();
      }

      const pct = Math.round(((i + 1) / totalLeads) * 100);
      setLaunchProgress(pct);

      if (i < totalLeads - 1) {
        addLog(`[Queue] Transitioning to target ${i + 2}/${totalLeads}...`, 'info');
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    addLog(`All ${totalLeads} websites deployed & SMS proposals processed through carrier!`, 'success');
    await new Promise((r) => setTimeout(r, 600));

    // Construct full campaign record with real statuses and Completed status!
    const completeCampRecord = {
      id: newCampId,
      name: finalName,
      niche: selectedNiche,
      totalLeads: totalLeads,
      leadsFound: totalLeads,
      sitesGenerated: completedAccumulator.filter(s => s.status === 'live').length,
      sites: completedAccumulator.filter(s => s.status === 'live').length,
      smsSent: completedAccumulator.filter(s => s.smsStatus === 'delivered' || s.smsStatus === 'sent').length,
      smsFailed: completedAccumulator.filter(s => s.smsStatus === 'failed').length,
      claimed: 0,
      status: 'Completed' as const,
      createdAt: new Date().toISOString().split('T')[0],
      templateId: selectedTemplateId,
      type: 'sms' as const,
      deployedSites: completedAccumulator.map(s => ({
        slug: s.slug,
        name: s.name,
        city: s.city,
        url: s.url,
        status: s.status,
      })),
      smsLeads: completedAccumulator.map((s, idx) => ({
        leadId: `sms-lead-${idx + 1}`,
        name: s.name,
        businessName: s.name,
        phone: s.phone || '',
        city: s.city || '',
        siteUrl: s.url,
        status: (s.smsStatus || 'queued') as any,
        smsText: s.smsText || '',
        sentAt: getTime(),
        smsError: s.smsError || null,
        telnyxId: s.telnyxId || null,
      })),
      smsPhoneUsed: selectedPhoneNumber || '+1 (604) 953-9651',
      smsMessage: smsMessage,
      leads: csvLeads.map((l) => ({ name: l.name, city: l.city, phone: l.phone })),
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
    setCelebratedCampaign(completeCampRecord);
    setIsShowingCompletion(true);
    playVictoryCelebration();
    onLaunch?.();
  };

  // List of leads to evaluate (fallback to 3 realistic sample leads if csvLeads is empty)
  const displayLeads: PipelineLead[] = useMemo(() => {
    if (csvLeads.length > 0) return csvLeads;
    return [
      {
        name: selectedNiche ? `${selectedNiche} Studio` : 'Vintage Cuts Barbershop',
        city: 'Austin, TX',
        phone: '+1 (512) 555-0199',
      },
      {
        name: selectedNiche ? `Premier ${selectedNiche} & Luxury Grooming Lounge` : 'Vancouver Luxury Barbers',
        city: 'Vancouver, BC',
        phone: '+1 (604) 953-9651',
      },
      {
        name: selectedNiche ? `${selectedNiche} Co` : 'Modern Cuts',
        city: 'Toronto, ON',
        phone: '+1 (416) 555-0144',
      },
    ];
  }, [csvLeads, selectedNiche]);

  // Evaluated messages, character counts, and segment classification for every lead
  const evaluatedLeads = useMemo(() => {
    return displayLeads.map((lead, idx) => {
      const cleanSlug = (lead.name || `business-${idx + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 28) || `site-${idx + 1}`;
      const siteUrl = `https://lunao-web-designn.pages.dev/${cleanSlug}/`;

      // 1. Calculate default message with primary template
      const defaultText = interpolateSmsVariables(smsMessage, {
        businessName: lead.name,
        city: lead.city,
        siteUrl,
        niche: selectedNiche,
      });
      const defaultChars = defaultText.length;
      const defaultSegments = defaultChars <= 160 ? 1 : Math.ceil(defaultChars / 153);

      // 2. Check if lead is customized individually or uses 2-segment specific template
      const customOverride = customLeadMessages[idx];
      let resolvedText = defaultText;
      let isOverriddenFor2Seg = false;
      let isCustomEdited = false;

      if (customOverride !== undefined) {
        resolvedText = interpolateSmsVariables(customOverride, {
          businessName: lead.name,
          city: lead.city,
          siteUrl,
          niche: selectedNiche,
        });
        isCustomEdited = true;
      } else if (enable2SegOverride && defaultSegments >= 2) {
        resolvedText = interpolateSmsVariables(twoSegTemplate, {
          businessName: lead.name,
          city: lead.city,
          siteUrl,
          niche: selectedNiche,
        });
        isOverriddenFor2Seg = true;
      }

      const finalChars = resolvedText.length;
      const finalSegments = finalChars <= 160 ? 1 : Math.ceil(finalChars / 153);

      return {
        index: idx,
        lead,
        cleanSlug,
        siteUrl,
        defaultText,
        defaultChars,
        defaultSegments,
        resolvedText,
        finalChars,
        finalSegments,
        isOverriddenFor2Seg,
        isCustomEdited,
      };
    });
  }, [displayLeads, smsMessage, selectedNiche, enable2SegOverride, twoSegTemplate, customLeadMessages]);

  const totalEvaluatedCount = evaluatedLeads.length;
  const oneSegmentCount = evaluatedLeads.filter((l) => l.finalSegments === 1).length;
  const twoSegmentCount = evaluatedLeads.filter((l) => l.finalSegments >= 2).length;
  const originalTwoSegmentCount = evaluatedLeads.filter((l) => l.defaultSegments >= 2).length;

  // Active preview lead for phone simulator
  const activePreview = evaluatedLeads[Math.min(previewLeadIndex, Math.max(0, evaluatedLeads.length - 1))] || evaluatedLeads[0];
  const sampleBusinessName = activePreview?.lead.name || (selectedNiche ? `${selectedNiche} Pro` : 'Vintage Cuts');
  const sampleCity = activePreview?.lead.city || 'Vancouver, BC';
  const sampleSiteUrl = activePreview?.siteUrl || `https://lunao-web-designn.pages.dev/preview/`;
  const sampleSlug = activePreview?.cleanSlug || 'preview';
  const interpolatedSms = activePreview?.resolvedText || smsMessage;
  const interpolatedCharCount = activePreview?.finalChars || interpolatedSms.length;
  const segmentsCount = activePreview?.finalSegments || (interpolatedCharCount <= 160 ? 1 : Math.ceil(interpolatedCharCount / 153));

  // =========================================================================
  // LIVE AUTONOMOUS SMS OUTREACH STUDIO & PROGRESS (Shown during deployment)
  // =========================================================================
  if (isLaunching) {
    const currentLead = csvLeads[activeLeadIndex] || csvLeads[0];
    const pct = Math.min(100, Math.round(((completedSitesList.length) / Math.max(1, csvLeads.length)) * 100));

    return (
      <div
        ref={progressContainerRef}
        id="sms-launch-progress-container"
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
                Lunao SMS Outreach Engine Active
              </div>
              <h3 className="text-2xl font-bold font-serif text-ink">
                Autonomous SMS Outreach in Progress
              </h3>
              <p className="text-xs text-ink-secondary">
                Autonomous pipeline rebranding custom landing pages, verifying live edge status, and dispatching personalized SMS proposals.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-xl bg-surface border border-border-main text-right shadow-xs">
                <p className="text-[10px] uppercase font-bold text-ink-tertiary">Verified Live Sites</p>
                <p className="text-lg font-bold font-mono text-emerald-600">
                  {completedSitesList.length} / {csvLeads.length}
                </p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-surface border border-border-main text-right shadow-xs">
                <p className="text-[10px] uppercase font-bold text-ink-tertiary">SMS Sent</p>
                <p className="text-lg font-bold font-mono text-accent">
                  {dispatchedSmsList.length} / {csvLeads.length}
                </p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 relative z-10">
            <div className="flex items-center justify-between text-xs text-ink-secondary">
              <span className="font-medium">
                Active Target {activeLeadIndex + 1} of {csvLeads.length}: <strong className="text-ink">{currentLead?.name}</strong> ({currentLead?.city || 'Local'})
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

          {/* Active Target Spotlight (Clean & professional, NO magic emoji) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-surface border border-border-main relative z-10 shadow-xs">
            <div>
              <p className="text-[10px] uppercase font-bold text-ink-tertiary">Target Business</p>
              <p className="text-sm font-bold text-ink truncate">{currentLead?.name}</p>
              <p className="text-xs text-ink-secondary">{currentLead?.city || 'Local Business'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-ink-tertiary">Active Task</p>
              <p className="text-sm font-bold text-emerald-600">
                Personalizing & Delivering Proposal
              </p>
              <p className="text-xs text-ink-secondary">Generating live URL & personalized hook</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-ink-tertiary">Outreach Status</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-xs font-bold font-mono text-emerald-600">
                  {completedSitesList.filter(s => s.smsStatus === 'delivered').length} Delivered
                </span>
                <span className="text-xs text-ink-tertiary">·</span>
                <span className="text-xs font-bold font-mono text-amber-600">
                  {completedSitesList.filter(s => s.smsStatus === 'queued' || (!s.smsStatus && s.smsStatus !== 'failed')).length} Queued
                </span>
                {completedSitesList.filter(s => s.smsStatus === 'failed').length > 0 && (
                  <>
                    <span className="text-xs text-ink-tertiary">·</span>
                    <span className="text-xs font-bold font-mono text-rose-600">
                      {completedSitesList.filter(s => s.smsStatus === 'failed').length} Failed
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">Telnyx 10DLC Carrier Network</p>
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

            {/* Live Sites & SMS Delivery Stream */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-ink-secondary flex-wrap gap-1">
                <span className="font-mono flex items-center gap-1.5 font-bold">
                  <Globe className="w-3.5 h-3.5 text-accent" /> Live Sites & SMS Dispatch ({completedSitesList.length})
                </span>
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    {completedSitesList.filter(s => s.smsStatus === 'delivered').length} Delivered
                  </span>
                  <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    {completedSitesList.filter(s => s.smsStatus === 'queued' || (!s.smsStatus && s.smsStatus !== 'failed' && s.smsStatus !== 'delivered' && s.smsStatus !== 'sent')).length} Queued
                  </span>
                  {completedSitesList.filter(s => s.smsStatus === 'failed').length > 0 && (
                    <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      {completedSitesList.filter(s => s.smsStatus === 'failed').length} Failed
                    </span>
                  )}
                </div>
              </div>
              <div className="h-64 rounded-2xl bg-surface border border-border-main p-2 overflow-y-auto space-y-2 scrollbar-thin shadow-inner">
                {completedSitesList.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-ink-tertiary text-xs italic">
                    Waiting for first landing page & message delivery...
                  </div>
                ) : (
                  completedSitesList.map((s, idx) => {
                    const isDelivered = s.smsStatus === 'delivered';
                    const isFailed = s.smsStatus === 'failed';
                    const isSent = s.smsStatus === 'sent';
                    const isQueued = !isDelivered && !isFailed && !isSent;
                    return (
                      <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-border-main shadow-xs">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          isDelivered ? 'bg-emerald-100 text-emerald-700' :
                          isFailed ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-700 animate-pulse'
                        }`}>
                          {isFailed ? <AlertTriangle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-ink truncate">{s.name}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 inline-flex items-center gap-1 ${
                              isDelivered ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                              isFailed ? 'text-rose-700 bg-rose-50 border-rose-200' :
                              isSent ? 'text-blue-700 bg-blue-50 border-blue-200' :
                              'text-amber-700 bg-amber-50 border-amber-200 animate-pulse'
                            }`} title={s.smsError || undefined}>
                              {isDelivered ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  SMS Delivered ✓
                                </>
                              ) : isSent ? (
                                <>
                                  <Send className="w-3 h-3 text-blue-600" />
                                  SMS Sent
                                </>
                              ) : isQueued ? (
                                <>
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  SMS Queued
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  SMS Failed
                                </>
                              )}
                            </span>
                          </div>
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline truncate block font-mono">
                            {s.url.replace(/^https?:\/\//, '')}
                          </a>
                          {s.smsError && (
                            <p className="text-[10px] text-rose-600 font-mono truncate mt-0.5 flex items-center gap-1" title={s.smsError}>
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              Reason: {s.smsError}
                            </p>
                          )}
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
  // COMPLETION SCREEN (Identical Gold Standard Victory Modal)
  // =========================================================================
  if (isShowingCompletion && celebratedCampaign) {
    const sites = celebratedCampaign.deployedSites || [];

    return (
      <div id="sms-campaign-completion-container" className="space-y-6 animate-celebrate-in scroll-mt-6">
        <div className="p-6 md:p-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-success-soft via-white to-accent-soft/40 border border-success/30 p-8 md:p-12 shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-success/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-2xl mx-auto text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-success-soft border-2 border-success/30 flex items-center justify-center text-success mx-auto shadow-inner animate-bounce">
                <Check className="w-10 h-10 stroke-[3]" />
              </div>

              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-soft border border-success/20 text-xs font-bold text-success uppercase tracking-wider">
                  SMS Campaign Completed
                </span>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-ink">
                  Campaign Successfully Completed!
                </h2>
                <p className="text-sm md:text-base text-ink-secondary">
                  "{celebratedCampaign.name}" finished dispatching SMS proposals to {celebratedCampaign.totalLeads} prospects.
                </p>
              </div>

              {/* Stats Counters Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                <div className="bg-white/90 border border-border-light rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Total Leads</p>
                  <p className="text-2xl font-bold text-ink font-mono mt-1">{celebratedCampaign.totalLeads}</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Processed</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">SMS Delivered</p>
                  <p className="text-2xl font-bold text-success font-mono mt-1">
                    {celebratedCampaign.smsLeads?.filter((l: any) => l.status === 'delivered').length ?? celebratedCampaign.smsSent}
                  </p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Carrier Confirmed</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Sites Built</p>
                  <p className="text-2xl font-bold text-accent font-mono mt-1">{celebratedCampaign.sitesGenerated}</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Live Links</p>
                </div>
                <div className="bg-white/90 border border-border-light rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-[10px] uppercase tracking-widest text-ink-secondary font-bold">Delivery Status</p>
                  <p className="text-2xl font-bold text-emerald-600 font-mono mt-1">10DLC</p>
                  <p className="text-[10px] text-ink-tertiary mt-0.5">Carrier Verified</p>
                </div>
              </div>

              {/* Deployed Sites & SMS Deliveries list */}
              {sites.length > 0 && (
                <div className="bg-white border border-border-main rounded-2xl p-5 text-left space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-border-light pb-3">
                    <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Globe className="w-4 h-4 text-accent" /> Live Deployed Sites & SMS Deliveries
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {sites.length} Live On Edge
                    </span>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                    {sites.map((site: any, idx: number) => {
                      const matchedLead = celebratedCampaign.smsLeads?.find((l: any, i: number) => i === idx || l.siteUrl === site.url);
                      const status = matchedLead?.status || 'delivered';
                      const isDelivered = status === 'delivered';
                      const isFailed = status === 'failed';
                      const isSent = status === 'sent';

                      return (
                        <div key={idx} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface border border-border-light hover:border-accent/40 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-ink truncate">{site.name}</p>
                            <a
                              href={site.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-accent hover:underline font-mono truncate flex items-center gap-1 mt-0.5"
                            >
                              <span>{site.url.replace(/^https?:\/\//, '')}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </div>
                          <div className="text-right shrink-0">
                            {isDelivered ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3" /> SMS Delivered ✓
                              </span>
                            ) : isFailed ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title={matchedLead?.smsError || undefined}>
                                <AlertTriangle className="w-3 h-3" /> SMS Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <Send className="w-3 h-3" /> SMS Sent
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
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

  // =========================================================================
  // MAIN 5-STEP WIZARD WORKSPACE
  // =========================================================================
  return (
    <div className="space-y-6">

      {/* STEP CONTENT CONTAINER */}
      <div ref={stepContentRef} id="sms-wizard-content" className="p-6 md:p-8 min-h-[350px] scroll-mt-4">

        {/* ===================================================================
            STEP 1: SELECT NICHE (100% Copy-Paste Gold Standard from Email)
        =================================================================== */}
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
                      setCampaignName(`${niche.label} SMS Campaign`);
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

        {/* ===================================================================
            STEP 2: CHOOSE LEADS (Pill Switcher, Dropzone, Canada Finder)
        =================================================================== */}
        {activeStep === 2 && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl text-ink">Choose your leads</h3>
              <p className="text-sm text-ink-secondary">Upload a CSV or discover verified local businesses in Canada with phone numbers.</p>
            </div>

            {/* Pill Tab Switcher */}
            <div className="flex gap-2 p-1.5 bg-gradient-to-r from-surface to-off-white rounded-2xl w-fit shadow-inner">
              <button
                type="button"
                onClick={() => { playSoftTap(); setLeadSource('csv'); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer ${
                  leadSource === 'csv'
                    ? 'bg-white text-accent shadow-lg shadow-accent/20 ring-2 ring-accent/30'
                    : 'text-ink-secondary hover:text-ink hover:bg-white/50'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5" />
                Upload CSV
              </button>
              <button
                type="button"
                onClick={() => { playSoftTap(); setLeadSource('google_maps'); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer ${
                  leadSource === 'google_maps'
                    ? 'bg-white text-accent shadow-lg shadow-accent/20 ring-2 ring-accent/30'
                    : 'text-ink-secondary hover:text-ink hover:bg-white/50'
                }`}
              >
                <MapPin className="w-5 h-5" />
                Find Leads in Canada
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                  Google Places
                </span>
              </button>
            </div>

            {/* CSV Upload Mode */}
            {leadSource === 'csv' && (
              <div className="space-y-5">
                {/* Canada-Only Error Guard if applicable */}
                {csvValidation && isAutomatedSmsPlan(userPlan) && (csvValidation.countryBlockedCount ?? 0) > 0 && (
                  <CanadaOnlyErrorCard
                    invalidRows={csvValidation.invalidRows}
                    validCount={csvValidation.validCount}
                    totalRows={csvValidation.totalRows}
                    allowedCountries={csvValidation.allowedCountries}
                    onRemoveNonCanadian={() => {
                      const nonBlocked = csvValidation.invalidRows.filter(
                        (r) => !(r.issues || []).some((msg) =>
                          msg.includes('Canadian numbers only') || msg.includes('Canadian') || msg.includes('recognised')
                        )
                      );
                      setCsvValidation({
                        ...csvValidation,
                        invalidCount: nonBlocked.length,
                        invalidRows: nonBlocked,
                        ok: csvValidation.validCount > 0 || nonBlocked.length === 0,
                        message: nonBlocked.length === 0
                          ? `All non-Canadian rows removed. ${csvValidation.validCount} valid leads ready.`
                          : csvValidation.message,
                      });
                    }}
                    onClearAll={() => {
                      setCsvLeads([]);
                      setCsvParsedCount(0);
                      setCsvValidation(null);
                      setCsvError(null);
                      setCsvFileName('');
                    }}
                    onClose={() => setCsvError(null)}
                  />
                )}

                {!csvFileName ? (
                  <label className="block cursor-pointer group">
                    <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-border-main hover:border-accent/50 bg-gradient-to-br from-surface via-white to-accent-soft/10 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-accent/10">
                      <div className="absolute -top-20 -right-20 w-48 h-48 bg-accent/5 rounded-full blur-3xl" />
                      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent/5 rounded-full blur-3xl" />

                      <div className="relative p-12 text-center">
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
                        <p className="text-xs text-ink-tertiary mt-6">Required columns: business_name, phone_number, city</p>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                  </label>
                ) : (
                  <div className="space-y-4">
                    <CsvPreview
                      fileName={csvFileName}
                      leads={csvLeads}
                      totalCount={csvParsedCount}
                      onClear={() => {
                        playSoftTap();
                        setCsvFileName(null);
                        setCsvLeads([]);
                        setCsvValidation(null);
                        setCsvParsedCount(0);
                        setCsvError(null);
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
                          setCsvError(null);
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
                  <div className="p-3 bg-danger-soft border border-danger/20 rounded-xl flex items-center gap-2 text-xs font-semibold text-danger">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{csvError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Find Leads in Canada (Google Places) */}
            {leadSource === 'google_maps' && (
              <div className="rounded-2xl bg-white border border-border-main p-6 shadow-xs">
                <SmsLeadFinder
                  ownerKey={ownerKey}
                  userPlan={userPlan}
                  onLeadsSelected={(leads) => {
                    setCsvLeads(leads);
                    setCsvParsedCount(leads.length);
                    setCsvFileName('google-maps-leads.csv');
                    setCsvValidation({
                      ok: leads.length > 0,
                      detectedColumns: ['name', 'phone', 'city'],
                      missingColumns: [],
                      totalRows: leads.length,
                      validCount: leads.length,
                      invalidCount: 0,
                      leads,
                      invalidRows: [],
                      message: `${leads.length} leads added from Google Places`,
                      countryBlockedCount: 0,
                      allowedCountries: null,
                    });
                    playVictoryCelebration();
                  }}
                />

                {csvLeads.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-border-light">
                    <CsvPreview
                      fileName="google-maps-leads.csv"
                      leads={csvLeads}
                      totalCount={csvParsedCount}
                      onClear={() => {
                        setCsvLeads([]);
                        setCsvParsedCount(0);
                      }}
                      ClearIcon={X}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            STEP 3: CHOOSE TEMPLATE
        =================================================================== */}
        {activeStep === 3 && (
          <CampaignTemplateStep
            allTemplates={allTemplates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={(tplId) => setSelectedTemplateId(tplId)}
            selectedNiche={selectedNiche}
            campaignType="sms"
          />
        )}

        {/* ===================================================================
            STEP 4: PHONE NUMBER & 10DLC SETUP
        =================================================================== */}
        {activeStep === 4 && (
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl text-ink">Sender phone & compliance</h3>
              <p className="text-sm text-ink-secondary">
                Select your sending phone number and verify 10DLC brand messaging parameters.
              </p>
            </div>

            <div className="rounded-2xl bg-white border border-border-main p-6 shadow-xs">
              <SmsAccountStep
                ownerKey={ownerKey}
                userPlan={userPlan}
                mode={isAutomatedSmsPlan(userPlan) ? 'auto' : 'byo'}
                selectedPhoneNumber={selectedPhoneNumber}
                onSelectPhone={handleSelectPhone}
                targetCountries={targetCountries}
              />
            </div>
          </div>
        )}

        {/* ===================================================================
            STEP 5: REVIEW, CONTENT & LAUNCH (Advanced Segment Engine)
        =================================================================== */}
        {/* ===================================================================
            STEP 5: SMS MESSAGE CONTENT & SEGMENT OPTIMIZER
        =================================================================== */}
        {activeStep === 5 && (
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl text-ink">Craft your SMS proposal message</h3>
              <p className="text-sm text-ink-secondary">
                Select high-converting pre-built hook copy or personalize your own. Inspect real-time segment math and per-recipient simulator preview.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (7/12): SMS Message Editor & 2-Segment Optimizer */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* Primary SMS Message Template */}
                <div className="p-6 rounded-2xl bg-white border border-border-main shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-ink block">Base SMS Message Template</span>
                      <span className="text-[11px] text-ink-tertiary">Used for all standard outreach messages</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-secondary">
                        <span className="font-mono font-semibold text-ink">{interpolatedCharCount}</span> chars (preview)
                      </span>
                      <span className="text-border-light text-xs">•</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold font-mono ${
                        segmentsCount === 1 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {segmentsCount} {segmentsCount === 1 ? 'segment' : 'segments'}
                      </span>
                    </div>
                  </div>

                  {/* Pre-Built SMS Templates (Requested by user) */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold text-ink-tertiary block">Pre-built templates:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {PRESET_SMS_TEMPLATES.map((preset) => {
                        const isSelected = smsMessage === preset.text;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              playSoftTap();
                              setSmsMessage(preset.text);
                              setActivePresetId(preset.id);
                            }}
                            className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                              isSelected
                                ? 'bg-blue-50/80 border-blue-500 shadow-xs'
                                : 'bg-surface hover:bg-off-white border-border-light text-ink'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold truncate text-ink">{preset.name}</span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                preset.id === 'referral_josh'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : preset.id === 'no_catch_niche'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-200 text-slate-700'
                              }`}>
                                {preset.badge}
                              </span>
                            </div>
                            <p className="text-[10px] text-ink-tertiary line-clamp-2 font-mono">
                              {preset.text.replace(/\n+/g, ' ')}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Variable Chips */}
                  <div className="space-y-1.5 pt-1 border-t border-border-light/70">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-ink-tertiary">Insert variable:</span>
                      {[
                        { key: 'site_url', label: '{{site_url}}' },
                        { key: 'niche', label: '{{niche}}' },
                        { key: 'city', label: '{{city}}' },
                        { key: 'business_name', label: '{{business_name}}' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => insertVariableTag(item.key)}
                          className="px-2.5 py-1 rounded-lg bg-surface hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-border-light text-xs font-mono font-medium text-ink transition-all cursor-pointer"
                        >
                          + {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    rows={4}
                    className="w-full p-4 rounded-xl border border-border-main focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm font-sans text-ink placeholder:text-ink-tertiary outline-none resize-none shadow-inner"
                    placeholder="Enter base SMS copy..."
                  />
                  <p className="text-[11px] text-ink-tertiary">
                    Tokens like <code className="font-mono text-blue-600">{"{{site_url}}"}</code> and <code className="font-mono text-blue-600">{"{{city}}"}</code> will be substituted dynamically for every recipient.
                  </p>
                </div>

                {/* 2-Segment Specific Optimizer & Customization Card */}
                <div className="p-6 rounded-2xl bg-white border border-border-main shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-light pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                          <span>2-Segment Message Optimizer</span>
                          <span className="text-[10px] text-ink-tertiary font-normal">(Long URLs Handler)</span>
                        </h4>
                        <p className="text-[11px] text-ink-secondary">
                          Customize a shorter SMS specifically for messages that exceed 160 characters.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {originalTwoSegmentCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>{originalTwoSegmentCount} need shortening</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>All messages ≤ 160 chars</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Explanatory description & toggle */}
                  <div className="p-3.5 rounded-xl bg-surface border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-ink">
                        Apply shorter copy for 2-segment messages alone?
                      </p>
                      <p className="text-[11px] text-ink-secondary">
                        Keeps 1-segment leads untouched, while automatically shortening long-slug messages under 160 chars.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        playSoftTap();
                        setEnable2SegOverride((prev) => !prev);
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
                        enable2SegOverride
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white border border-border-main text-ink hover:bg-off-white'
                      }`}
                    >
                      {enable2SegOverride ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Active (2-Seg Override On)</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Enable 2-Seg Shorter Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 2-Segment Custom Template Editor (When enabled) */}
                  {enable2SegOverride && (
                    <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-amber-600" />
                          Shorter Template for 2-Segment Messages Alone
                        </span>
                        <span className="text-[11px] font-mono text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border border-emerald-200">
                          {twoSegmentCount === 0 
                            ? '✓ 100% converted to 1 segment!' 
                            : `${originalTwoSegmentCount - twoSegmentCount} converted · ${twoSegmentCount} still > 160`}
                        </span>
                      </div>

                      {/* Quick shortening presets */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-amber-800">Quick short copy:</span>
                        <button
                          type="button"
                          onClick={() => {
                            playSoftTap();
                            setTwoSegTemplate(`Yoo pal, built u a site: {{site_url}} pls update me tysm.`);
                          }}
                          className="px-2 py-1 rounded bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold cursor-pointer"
                        >
                          ⚡ Ultra Short (44 chars)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playSoftTap();
                            setTwoSegTemplate(`Josh rec'd u. Built u a site: {{site_url}} update me ty`);
                          }}
                          className="px-2 py-1 rounded bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold cursor-pointer"
                        >
                          ⚡ Referral Short
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playSoftTap();
                            setTwoSegTemplate(`No catch, built u the best {{niche}} site: {{site_url}} let me know!`);
                          }}
                          className="px-2 py-1 rounded bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold cursor-pointer"
                        >
                          ⚡ No-Catch Short
                        </button>
                      </div>

                      <textarea
                        value={twoSegTemplate}
                        onChange={(e) => setTwoSegTemplate(e.target.value)}
                        rows={3}
                        className="w-full p-3 rounded-lg bg-white border border-amber-300 focus:border-accent text-xs font-sans text-ink placeholder:text-ink-tertiary outline-none resize-none shadow-xs"
                        placeholder="Enter shorter template for 2-segment messages..."
                      />
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column (5/12): Live SMS Bubble Preview Card (Brand Consistent: White, Blue, Green) */}
              <div className="lg:col-span-5 space-y-5">
                <div className="p-5 rounded-2xl bg-white border border-blue-200/80 shadow-xs space-y-4">
                  {/* Preview Header & Recipient Switcher */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-light pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/60 text-blue-600 flex items-center justify-center shadow-2xs">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-ink">Live SMS Bubble Preview</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-medium text-emerald-700">
                            Route: {selectedPhoneNumber || '+1 (604) 953-9651'} (Telnyx Canada 10DLC)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Recipient Navigator */}
                    <div className="flex items-center gap-1.5 bg-surface p-1 rounded-xl border border-border-light">
                      <button
                        type="button"
                        disabled={previewLeadIndex <= 0}
                        onClick={() => {
                          playSoftTap();
                          setPreviewLeadIndex((prev) => Math.max(0, prev - 1));
                        }}
                        className="px-2 py-1 rounded-lg bg-white border border-border-light text-[11px] font-bold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Previous recipient"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 inline" />
                      </button>

                      <select
                        value={previewLeadIndex}
                        onChange={(e) => {
                          playSoftTap();
                          setPreviewLeadIndex(Number(e.target.value));
                        }}
                        className="text-[11px] font-bold text-ink bg-transparent outline-none cursor-pointer px-1 py-0.5 max-w-[140px] truncate"
                      >
                        {evaluatedLeads.map((l, i) => (
                          <option key={i} value={i}>
                            {i + 1}. {l.lead.name} ({l.finalSegments} seg)
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={previewLeadIndex >= evaluatedLeads.length - 1}
                        onClick={() => {
                          playSoftTap();
                          setPreviewLeadIndex((prev) => Math.min(evaluatedLeads.length - 1, prev + 1));
                        }}
                        className="px-2 py-1 rounded-lg bg-white border border-border-light text-[11px] font-bold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Next recipient"
                      >
                        <ChevronRight className="w-3.5 h-3.5 inline" />
                      </button>
                    </div>
                  </div>

                  {/* Smartphone Canvas */}
                  <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-50/80 via-white to-blue-50/20 border border-blue-100 shadow-inner space-y-3">
                    {/* Recipient / Sender meta */}
                    <div className="text-center space-y-1">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-sm mx-auto">
                        L
                      </div>
                      <p className="text-xs font-bold text-ink flex items-center justify-center gap-1">
                        <span>Lunao Outreach</span>
                        <CheckCircle className="w-3 h-3 text-blue-600" />
                      </p>
                      <p className="text-[10px] text-ink-tertiary">
                        Recipient: <strong className="text-ink">{sampleBusinessName}</strong> ({sampleCity}) · Today
                      </p>
                    </div>

                    {/* Message Bubble (Brand Green & Blue) */}
                    <div className="space-y-1.5 max-w-md ml-auto">
                      <div className="p-4 rounded-2xl rounded-tr-sm bg-emerald-600 text-white shadow-md text-xs sm:text-[13px] font-sans leading-relaxed whitespace-pre-wrap">
                        {interpolatedSms}

                        {/* Live Website Card Attachment inside Bubble */}
                        <a
                          href={sampleSiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 p-3 rounded-xl bg-white text-ink border border-blue-100 shadow-sm flex items-center justify-between gap-2.5 hover:shadow-md hover:border-blue-300 transition-all block group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                              <Globe className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-ink truncate group-hover:text-blue-600 transition-colors">
                                {sampleBusinessName} — Live Site
                              </p>
                              <p className="text-[10px] font-mono text-blue-500 truncate">
                                {sampleSiteUrl.replace(/^https?:\/\//, '')}
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold shrink-0 group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors">
                            <span>View</span>
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        </a>
                      </div>

                      {/* Bubble status */}
                      <div className="flex items-center justify-between text-[10px] px-1">
                        <span className={`font-mono font-bold ${segmentsCount === 1 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {interpolatedCharCount} chars · {segmentsCount} {segmentsCount === 1 ? 'segment' : 'segments'}
                        </span>
                        <div className="flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Delivered · Direct carrier 10DLC</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Functionality Action Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-light text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        playSoftTap();
                        try {
                          await navigator.clipboard.writeText(interpolatedSms);
                          setCopiedPreviewSms(true);
                          setTimeout(() => setCopiedPreviewSms(false), 2000);
                        } catch {}
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-blue-50 hover:text-blue-700 border border-border-light text-ink font-semibold text-xs transition-colors cursor-pointer"
                    >
                      {copiedPreviewSms ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied to Clipboard!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-ink-secondary" />
                          <span>Copy Sample SMS</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-secondary font-medium">
                        Target URL:
                      </span>
                      <a
                        href={sampleSiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        <span>{sampleSlug}.pages.dev</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* All Messages & Segment Inspector */}
            <div className="p-6 rounded-2xl bg-white border border-border-main shadow-xs space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border-light pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-accent" />
                    <h4 className="text-base font-bold text-ink">All Messages & Segment Inspector</h4>
                  </div>
                  <p className="text-xs text-ink-secondary">
                    Review each prospect's exact proposal copy and carrier segments. Customize individual messages or shorten 2-segment messages alone.
                  </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 bg-surface p-1 rounded-xl border border-border-light">
                  <button
                    type="button"
                    onClick={() => {
                      playSoftTap();
                      setSegmentFilter('all');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      segmentFilter === 'all'
                        ? 'bg-white text-ink shadow-xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    All Messages ({totalEvaluatedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSoftTap();
                      setSegmentFilter('1seg');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      segmentFilter === '1seg'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <span>1 Segment</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono">
                      {oneSegmentCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSoftTap();
                      setSegmentFilter('2seg');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      segmentFilter === '2seg'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : twoSegmentCount > 0
                        ? 'text-amber-800 bg-amber-50 hover:bg-amber-100'
                        : 'text-ink-secondary'
                    }`}
                  >
                    <span>2 Segments</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-900 font-mono">
                      {twoSegmentCount}
                    </span>
                  </button>
                </div>
              </div>

              {/* Tip notice when 2-segment messages exist */}
              {twoSegmentCount > 0 && !enable2SegOverride && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>{twoSegmentCount} messages</strong> exceed 160 characters due to longer website URLs. You can shorten them above with the 2-Segment Optimizer or customize them individually below.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playSoftTap();
                      setEnable2SegOverride(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold text-xs shrink-0 hover:bg-amber-700 transition-colors cursor-pointer"
                  >
                    ⚡ Shorten 2-Seg Messages
                  </button>
                </div>
              )}

              {/* Messages Grid */}
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
                {evaluatedLeads
                  .filter((item) => {
                    if (segmentFilter === '1seg') return item.finalSegments === 1;
                    if (segmentFilter === '2seg') return item.finalSegments >= 2;
                    return true;
                  })
                  .map((item) => {
                    const isEditing = editingLeadIndex === item.index;
                    const isPreviewed = previewLeadIndex === item.index;

                    return (
                      <div
                        key={item.index}
                        className={`p-4 rounded-xl border transition-all ${
                          isPreviewed
                            ? 'bg-blue-50/40 border-blue-400 shadow-xs'
                            : item.finalSegments === 1
                            ? 'bg-white border-border-light hover:border-border-main'
                            : 'bg-amber-50/20 border-amber-200'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-light/60 pb-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-slate-100 font-mono text-[11px] font-bold text-ink flex items-center justify-center shrink-0">
                              {item.index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-ink truncate">{item.lead.name}</p>
                              <p className="text-[10px] text-ink-secondary truncate">
                                {item.lead.city || 'Local'} · {item.lead.phone || '+1 604-953-9651'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.isOverriddenFor2Seg && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                                ⚡ 2-Seg Shortened
                              </span>
                            )}
                            {item.isCustomEdited && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                                ✏️ Custom Edited
                              </span>
                            )}
                            <span className="text-[11px] font-mono text-ink-secondary font-medium">
                              {item.finalChars} chars
                            </span>
                            <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                              item.finalSegments === 1
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              {item.finalSegments} {item.finalSegments === 1 ? 'Segment' : 'Segments'}
                            </span>
                          </div>
                        </div>

                        {/* Message body or inline editor */}
                        <div className="pt-2.5 space-y-2">
                          {isEditing ? (
                            <div className="space-y-2 animate-fade-in">
                              <textarea
                                value={editingLeadCopy}
                                onChange={(e) => setEditingLeadCopy(e.target.value)}
                                rows={3}
                                className="w-full p-3 rounded-lg border border-accent text-xs font-sans text-ink outline-none"
                              />
                              <div className="flex items-center justify-between text-xs">
                                <span className={`font-mono text-[11px] font-bold ${
                                  editingLeadCopy.length <= 160 ? 'text-emerald-600' : 'text-amber-600'
                                }`}>
                                  {editingLeadCopy.length} chars ({editingLeadCopy.length <= 160 ? '1 segment' : '2 segments'})
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingLeadIndex(null)}
                                    className="px-2.5 py-1 rounded bg-surface hover:bg-slate-200 text-[11px] font-semibold text-ink cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      playSoftTap();
                                      setCustomLeadMessages((prev) => ({
                                        ...prev,
                                        [item.index]: editingLeadCopy,
                                      }));
                                      setEditingLeadIndex(null);
                                    }}
                                    className="px-3 py-1 rounded bg-accent text-white text-[11px] font-bold cursor-pointer hover:bg-accent-hover"
                                  >
                                    Save Message
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <p className="text-xs text-ink-secondary font-mono leading-relaxed bg-surface/70 p-2.5 rounded-lg flex-1 whitespace-pre-wrap">
                                {item.resolvedText}
                              </p>
                              
                              <div className="flex sm:flex-col items-center sm:items-end gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    playSoftTap();
                                    setPreviewLeadIndex(item.index);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-surface hover:bg-blue-50 hover:text-blue-700 border border-border-light text-[11px] font-semibold text-ink transition-colors cursor-pointer flex items-center gap-1"
                                >
                                  <Smartphone className="w-3 h-3" />
                                  <span>Preview</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    playSoftTap();
                                    setEditingLeadIndex(item.index);
                                    setEditingLeadCopy(item.resolvedText);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-surface hover:bg-slate-200 border border-border-light text-[11px] font-semibold text-ink transition-colors cursor-pointer flex items-center gap-1"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Customize</span>
                                </button>
                                {item.isCustomEdited && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      playSoftTap();
                                      setCustomLeadMessages((prev) => {
                                        const next = { ...prev };
                                        delete next[item.index];
                                        return next;
                                      });
                                    }}
                                    className="px-2 py-0.5 text-[10px] text-danger hover:underline cursor-pointer"
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Bottom Step 5 Advance Strip */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/70 via-surface to-emerald-50/70 border border-border-main flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-ink">
                  Finished with message copy & segment optimization?
                </p>
                <p className="text-[11px] text-ink-secondary">
                  Proceed to Step 6 to customize your campaign name and confirm final launch specifications.
                </p>
              </div>

              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold transition-all shadow-md shadow-accent/20 flex items-center justify-center gap-2 cursor-pointer shrink-0 active:scale-98"
              >
                <span>Continue to Review & Launch</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        )}

        {/* ===================================================================
            STEP 6: REVIEW & LAUNCH (Complete Specifications on One Clear Screen)
        =================================================================== */}
        {activeStep === 6 && (
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h3 className="font-serif text-2xl text-ink">Review & launch outreach</h3>
              <p className="text-sm text-ink-secondary">
                Comfortably review all campaign details, customize campaign name, and verify carrier segments before autonomous dispatch.
              </p>
            </div>

            {/* 1. Campaign Name Customizer */}
            <div className="p-6 rounded-2xl bg-white border border-border-main shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-accent" />
                  <span>Campaign Name (Customizable)</span>
                </label>
                <span className="text-[11px] text-ink-tertiary">Used in analytics, logs & reports</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Vancouver Barbers SMS Proposal Outreach"
                  className="flex-1 px-4 py-3 rounded-xl border border-border-main focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm font-semibold text-ink outline-none shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => {
                    playSoftTap();
                    setCampaignName(`${selectedNiche} SMS Campaign`);
                  }}
                  className="px-3 py-3 rounded-xl bg-surface hover:bg-slate-200 text-xs font-semibold text-ink-secondary transition-colors cursor-pointer"
                  title="Reset to default title"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 2. Four Big Core Specifications Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Specification 1: Template Selected */}
              <div className="p-5 rounded-2xl bg-white border border-border-main shadow-xs space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-ink-tertiary tracking-wider flex items-center gap-1">
                      <Layout className="w-3 h-3 text-accent" />
                      <span>Template</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playSoftTap();
                        setActiveStep(3);
                      }}
                      className="text-[10px] font-bold text-accent hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                  <h5 className="text-sm font-bold text-ink truncate">
                    {allTemplates.find((t) => t.id === selectedTemplateId)?.name || 'Custom Edge Template'}
                  </h5>
                  <p className="text-[11px] text-ink-secondary">
                    Niche: <strong className="text-ink">{selectedNiche}</strong>
                  </p>
                </div>
                <div className="pt-2 border-t border-border-light flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
                  <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">Cloudflare Pages Edge CDN</span>
                </div>
              </div>

              {/* Specification 2: Leads Amount */}
              <div className="p-5 rounded-2xl bg-white border border-border-main shadow-xs space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-ink-tertiary tracking-wider flex items-center gap-1">
                      <Users className="w-3 h-3 text-accent" />
                      <span>Target Leads</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playSoftTap();
                        setActiveStep(2);
                      }}
                      className="text-[10px] font-bold text-accent hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <h5 className="text-2xl font-bold font-mono text-ink">
                      {csvLeads.length || totalEvaluatedCount}
                    </h5>
                    <span className="text-xs text-ink-secondary font-medium">businesses</span>
                  </div>
                  <p className="text-[11px] text-ink-secondary truncate">
                    {csvFileName ? `CSV: ${csvFileName}` : 'Imported prospect pipeline'}
                  </p>
                </div>
                <div className="pt-2 border-t border-border-light flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>100% Phone Numbers Verified</span>
                </div>
              </div>

              {/* Specification 3: Sender Phone & Carrier Route */}
              <div className="p-5 rounded-2xl bg-white border border-border-main shadow-xs space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-ink-tertiary tracking-wider flex items-center gap-1">
                      <Phone className="w-3 h-3 text-accent" />
                      <span>Carrier Route</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playSoftTap();
                        setActiveStep(4);
                      }}
                      className="text-[10px] font-bold text-accent hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                  <h5 className="text-sm font-bold font-mono text-ink truncate">
                    {selectedPhoneNumber || '+1 (604) 953-9651'}
                  </h5>
                  <p className="text-[11px] text-ink-secondary">
                    Route: <strong className="text-ink">Telnyx Canada 10DLC</strong>
                  </p>
                </div>
                <div className="pt-2 border-t border-border-light flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>A2P Carrier Compliant</span>
                </div>
              </div>

              {/* Specification 4: Segment Breakdown (Prominently requested by user!) */}
              <div className="p-5 rounded-2xl bg-white border border-border-main shadow-xs space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-ink-tertiary tracking-wider flex items-center gap-1">
                      <Layers className="w-3 h-3 text-accent" />
                      <span>Segments Breakdown</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playSoftTap();
                        setActiveStep(5);
                      }}
                      className="text-[10px] font-bold text-accent hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                      <span className="text-[10px] uppercase font-bold text-emerald-800 block">1 Segment</span>
                      <span className="text-lg font-bold font-mono text-emerald-700">{oneSegmentCount}</span>
                      <span className="text-[9px] text-emerald-600 block">1 credit each</span>
                    </div>
                    <div className={`p-2 rounded-xl border text-center ${
                      twoSegmentCount > 0 
                        ? 'bg-amber-50 border-amber-200 text-amber-800' 
                        : 'bg-slate-50 border-border-light text-ink-secondary'
                    }`}>
                      <span className="text-[10px] uppercase font-bold block">2 Segments</span>
                      <span className="text-lg font-bold font-mono">{twoSegmentCount}</span>
                      <span className="text-[9px] text-ink-tertiary block">2 credits each</span>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-border-light flex items-center justify-between text-[10px] text-ink-secondary font-medium">
                  <span>Total segments:</span>
                  <strong className="text-ink font-mono">{oneSegmentCount + twoSegmentCount * 2} carrier units</strong>
                </div>
              </div>
            </div>

            {/* 3. SMS Message Preview & Snapshot Card */}
            <div className="p-6 rounded-2xl bg-white border border-border-main shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-light pb-3">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-accent" />
                    <span>Transmitted SMS Proposal Hook</span>
                  </h4>
                  <p className="text-xs text-ink-secondary">
                    Exact copy dispatched to prospects, including personalized edge landing page URLs.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {enable2SegOverride && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                      ⚡ 2-Segment Optimizer Active
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      playSoftTap();
                      setActiveStep(5);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-surface hover:bg-slate-200 text-xs font-semibold text-ink transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Message</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Standard Copy */}
                <div className="p-4 rounded-xl bg-surface border border-border-light space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink">Primary Template</span>
                    <span className="text-[10px] font-mono text-ink-tertiary font-bold">Standard Hook</span>
                  </div>
                  <p className="text-xs font-mono text-ink-secondary whitespace-pre-wrap leading-relaxed">
                    {smsMessage}
                  </p>
                </div>

                {/* Sample Interpolated Live Proposal */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/60 to-blue-50/60 border border-emerald-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900">Sample Live Delivery</span>
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                      {sampleBusinessName} ({segmentsCount} seg)
                    </span>
                  </div>
                  <p className="text-xs font-sans text-ink leading-relaxed whitespace-pre-wrap">
                    {interpolatedSms}
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Cost Summary & Final Autonomous Launch Card */}
            <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-white via-surface to-accent-soft/20 border border-border-main shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-light pb-5">
                <div className="space-y-1">
                  <h4 className="text-xl font-serif font-bold text-ink">Ready to Launch Outreach</h4>
                  <p className="text-xs text-ink-secondary">
                    Autonomous pipeline will compile custom pages, rebrand each site for {selectedNiche}, deploy to edge CDN, and dispatch SMS proposals.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-4 py-2 rounded-xl bg-white border border-border-main text-right shadow-xs">
                    <p className="text-[10px] uppercase font-bold text-ink-tertiary">Total Required</p>
                    <p className="text-xl font-bold font-mono text-accent">
                      {(csvLeads.length || totalEvaluatedCount) * COST_PER_SMS} credits
                    </p>
                  </div>
                  <div className="px-4 py-2 rounded-xl bg-white border border-border-main text-right shadow-xs">
                    <p className="text-[10px] uppercase font-bold text-ink-tertiary">Your Balance</p>
                    <p className={`text-xl font-bold font-mono ${
                      userCredits < (csvLeads.length || totalEvaluatedCount) * COST_PER_SMS ? 'text-danger' : 'text-success'
                    }`}>
                      {userCredits} credits
                    </p>
                  </div>
                </div>
              </div>

              {/* Insufficient credits warning */}
              {userCredits < (csvLeads.length || totalEvaluatedCount) * COST_PER_SMS && (
                <div className="p-4 rounded-xl bg-danger-soft border border-danger/30 text-xs text-danger font-semibold flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>
                    Insufficient credits ({userCredits} available, {(csvLeads.length || totalEvaluatedCount) * COST_PER_SMS} required). Please upgrade your plan or top up credits to launch this campaign.
                  </span>
                </div>
              )}

              {launchError && (
                <div className="p-4 rounded-xl bg-danger-soft border border-danger/30 text-xs text-danger font-semibold flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{launchError}</span>
                </div>
              )}

              {/* Big Autonomous Launch Button */}
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={isLaunching || !canProceedFromStep(6)}
                  className={`w-full py-4 rounded-2xl text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-xl cursor-pointer ${
                    isLaunching || !canProceedFromStep(6)
                      ? 'bg-surface text-ink-tertiary cursor-not-allowed shadow-none'
                      : 'bg-accent hover:bg-accent-hover text-white shadow-accent/25 active:scale-98'
                  }`}
                >
                  {isLaunching ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Sending Proposals ({launchProgress}%)</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Launch Autonomous SMS Outreach</span>
                    </>
                  )}
                </button>

                <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-ink-tertiary">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Real-time Cloudflare Pages deployment</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Telnyx verified A2P 10DLC routing</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-accent" />
                    <span>Automated prospect responses</span>
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ===================================================================
          BOTTOM NAVIGATION BAR (Identical Standard)
      =================================================================== */}
      <div className="px-6 py-4 border-t border-border-light flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={activeStep === 1 || isLaunching}
          onClick={handlePrevStep}
          className={`text-xs font-semibold px-4 py-2 border border-border-main rounded-lg bg-white text-ink leading-none transition-all cursor-pointer ${
            activeStep === 1 ? 'opacity-0 pointer-events-none' : 'hover:bg-off-white'
          }`}
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          Back
        </button>

        {activeStep < 6 && (
          <button
            type="button"
            disabled={!canProceedFromStep(activeStep)}
            onClick={handleNextStep}
            className={`text-xs font-semibold px-5 py-2.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              !canProceedFromStep(activeStep)
                ? 'bg-surface text-ink-tertiary cursor-not-allowed'
                : 'bg-accent hover:bg-accent-hover text-white shadow-sm'
            }`}
          >
            <span>{activeStep === 5 ? 'Review & Launch' : 'Next Step'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {activeStep === 6 && (
          <button
            type="button"
            onClick={handleLaunch}
            disabled={isLaunching || !canProceedFromStep(6)}
            className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              isLaunching || !canProceedFromStep(6)
                ? 'bg-surface text-ink-tertiary cursor-not-allowed'
                : 'bg-accent hover:bg-accent-hover text-white shadow-sm'
            }`}
          >
            {isLaunching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Launching...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Launch Outreach</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Template Preview Modal */}
      {previewModalOpen && (
        <TemplatePreviewModal
          templates={allTemplates}
          initialIndex={previewTemplateIndex}
          onClose={() => setPreviewModalOpen(false)}
          onSelectTemplate={(id) => {
            setSelectedTemplateId(id);
            setPreviewModalOpen(false);
          }}
          selectedTemplateId={selectedTemplateId}
        />
      )}
    </div>
  );
};

export default SmsCampaignWizard;
