// SmsCampaignWizard Component
// Mirrors EmailCampaignWizard structure: 5-step flow for SMS campaigns.
//   Step 1: Niche Selection
//   Step 2: Lead Source (CSV upload, Google Maps coming soon)
//   Step 3: Template Selection (for site_url in SMS)
//   Step 4: Phone Number Selection (with auto-create messaging profile)
//   Step 5: Review & Launch

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  MessageSquare, Send, Upload, Globe, Check, ChevronRight, ChevronLeft,
  AlertCircle, CheckCircle, CheckCircle2, Loader2, X, Plus, RefreshCw,
  Sparkles, FileSpreadsheet, Eye, ExternalLink, Phone, Users, Clock,
  Smartphone, Monitor, Layout, MapPin, AlertTriangle
} from 'lucide-react';
import {
  playGentleChime, playLaunchSwell, playVictoryCelebration,
  playSoftTap, playElegantError, playSoftBubble, playElegantBell,
} from '../utils/audio';
import {
  validateCsvFile, CsvValidation, PipelineLead,
  runCampaign,
  isAutomatedSmsPlan, canUseOwnTelnyx,
} from '../lib/pipelineClient';
import { nicheList } from '../data';
import { Template } from '../types';
import { TemplateSimPreview } from './TemplateSimPreview';
import { CsvPreview } from './CsvPreview';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { CampaignProgressToggle, CampaignProgressData } from './CampaignProgressToggle';
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

const DEFAULT_SMS_MESSAGE = `Hi {{business_name}},

I built a beautiful, free landing page for your business in {{city}}:
{{site_url}}

Takes 30 seconds to review. No commitment.

- Lunao`;

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
  // Progress tracking
  const [activeProgressToggle, setActiveProgressToggle] = useState<CampaignProgressData | null>(null);
  const [isShowingCompletion, setIsShowingCompletion] = useState(false);
  const [campaignName, setCampaignName] = useState<string>('SMS Campaign');

  // Wizard step state
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

  // Step 5: SMS Content
  const [smsMessage, setSmsMessage] = useState<string>(DEFAULT_SMS_MESSAGE);

  // Launch state
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [celebratedCampaign, setCelebratedCampaign] = useState<any>(null);

  // Derived: templates for selected niche
  const nicheTemplates = templates.filter((t) => t.niche === selectedNiche);
  const nicheCustom = customTemplates.filter((t) => t.niche === selectedNiche);
  const allTemplates = [...nicheTemplates, ...nicheCustom];

  // Extract unique destination COUNTRY CODES (ISO 3166-1 alpha-2) from CSV leads.
  // - If a 'country' field exists on the lead, use it directly.
  // - Otherwise, fall back to mapping US state codes -> "US".
  // - Unknown codes are dropped (we'd rather show an empty list than a wrong one).
  const targetCountries = useMemo(() => {
    if (!csvLeads.length) return [];
    const countries = new Set<string>();
    const US_STATE_TO_COUNTRY = (state: string) => {
      // All US states/territories -> US
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

  // CSV file handler — forwards plan so server can gate to Canada for Free/Starter
  const handleFileSelect = async (file: File) => {
    setIsCsvParsing(true);
    setCsvError(null);
    setCsvFileName(file.name);

    try {
      const validation = await validateCsvFile(file, ownerKey, userPlan);
      setCsvValidation(validation);
      setCsvLeads(validation.leads);
      setCsvParsedCount(validation.validCount);
      if (!validation.ok) {
        setCsvError(validation.message || 'CSV validation failed');
      }
    } catch (err: any) {
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

  // Step navigation
  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!selectedNiche;
      case 2:
        if (leadSource === 'csv') {
          return csvLeads.length > 0 && !csvError;
        }
        return false; // google_maps not implemented yet
      case 3:
        return !!selectedTemplateId;
      case 4:
        // Automated (Free/Starter): Lunao handles the sender — always valid.
        // BYO (Growth+): must have a connected phone, account, and messaging profile.
        if (isAutomatedSmsPlan(userPlan)) return true;
        return !!selectedPhoneNumber && !!selectedAccountId && !!selectedProfileId;
      case 5:
        return smsMessage.trim().length > 0;
      default:
        return true;
    }
  };

  const handleNextStep = () => {
    if (canProceedFromStep(activeStep)) {
      playSoftTap();
      setActiveStep((s) => Math.min(5, s + 1));
    } else {
      playElegantError();
    }
  };

  const handlePrevStep = () => {
    playSoftTap();
    setActiveStep((s) => Math.max(1, s - 1));
  };

  // Launch campaign
  const handleLaunch = async () => {
    if (!canProceedFromStep(5)) return;
    setIsLaunching(true);
    setLaunchError(null);

    try {
      // Cost check
      const totalCost = csvLeads.length * COST_PER_SMS;
      if (userCredits < totalCost) {
        setLaunchError(`Insufficient credits. Need ${totalCost}, have ${userCredits}.`);
        setIsLaunching(false);
        playElegantError();
        return;
      }

      // Deduct credits
      const newCredits = userCredits - totalCost;
      onCreditsChange?.(newCredits);

      // Launch via the existing campaign pipeline (SMS path)
      const smsPayload = isAutomatedSmsPlan(userPlan)
        ? undefined // server uses LUNAO_TELNYX_API_KEY for Free/Starter
        : { accountId: selectedAccountId, from: selectedPhoneNumber };

      const events: any[] = [];
      const result = await runCampaign(
        {
          businesses: csvLeads,
          niche: selectedNiche,
          templateKey: selectedTemplateId,
          name: campaignName,
          ownerKey,
          plan: userPlan,
          smsTemplate: smsMessage,
          sms: smsPayload,
        } as any,
        (event) => {
          events.push(event);
          if (event.type === 'campaign' && event.campaignId) {
            setActiveProgressToggle({
              id: event.campaignId,
              name: campaignName,
              kind: 'sms',
              total: csvLeads.length,
              done: event.count || 0,
              sitesGenerated: event.sitesGenerated || 0,
              emailsSent: event.smsSent || event.count || 0,
              emailsFailed: event.smsFailed || 0,
            });
          }
        }
      );

      // Show completion
      setCelebratedCampaign({
        id: result.campaignId,
        name: campaignName,
        niche: selectedNiche,
        totalLeads: csvLeads.length,
        sitesGenerated: events.filter((e) => e.type === 'site:staged').length,
        smsSent: events.filter((e) => e.type === 'send:sent').length,
        smsFailed: events.filter((e) => e.type === 'send:failed').length,
      });
      setIsShowingCompletion(true);
      onLaunch?.();
      playVictoryCelebration();
    } catch (err: any) {
      setLaunchError(err.message || 'Campaign launch failed');
      playElegantError();
    } finally {
      setIsLaunching(false);
    }
  };

  // Render completion screen
  if (isShowingCompletion && celebratedCampaign) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-serif text-ink mb-2">Campaign Launched!</h2>
          <p className="text-sm text-ink-secondary mb-6">
            Your SMS campaign is now sending to {celebratedCampaign.totalLeads} leads.
          </p>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
            <div className="bg-white border border-border-main rounded-xl p-4">
              <p className="text-xs text-ink-secondary uppercase tracking-wider">Sent</p>
              <p className="text-2xl font-bold text-success">{celebratedCampaign.smsSent}</p>
            </div>
            <div className="bg-white border border-border-main rounded-xl p-4">
              <p className="text-xs text-ink-secondary uppercase tracking-wider">Failed</p>
              <p className="text-2xl font-bold text-danger">{celebratedCampaign.smsFailed}</p>
            </div>
            <div className="bg-white border border-border-main rounded-xl p-4">
              <p className="text-xs text-ink-secondary uppercase tracking-wider">Sites</p>
              <p className="text-2xl font-bold text-accent">{celebratedCampaign.sitesGenerated}</p>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => {
                onViewDetails?.(celebratedCampaign.id);
              }}
              className="px-6 py-3 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-all"
            >
              View Details
            </button>
            <button
              type="button"
              onClick={() => {
                setIsShowingCompletion(false);
                setActiveStep(1);
                setCelebratedCampaign(null);
                setCsvLeads([]);
                setCsvParsedCount(0);
                setSelectedPhoneNumber(null);
              }}
              className="px-6 py-3 border border-border-main hover:bg-off-white text-ink text-sm font-semibold rounded-lg transition-all"
            >
              New Campaign
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render wizard steps
  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {[
          { num: 1, label: 'Niche' },
          { num: 2, label: 'Leads' },
          { num: 3, label: 'Template' },
          { num: 4, label: 'Phone' },
          { num: 5, label: 'Review' },
        ].map(({ num, label }) => (
          <div key={num} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                num === activeStep
                  ? 'bg-accent text-white'
                  : num < activeStep
                  ? 'bg-success text-white'
                  : 'bg-off-white text-ink-tertiary border border-border-main'
              }`}
            >
              {num < activeStep ? <Check className="w-4 h-4" /> : num}
            </div>
            <span className={`ml-2 text-xs font-medium ${
              num === activeStep ? 'text-ink' : 'text-ink-secondary'
            }`}>
              {label}
            </span>
            {num < 5 && <ChevronRight className="w-4 h-4 text-ink-tertiary mx-3" />}
          </div>
        ))}
      </div>

      {/* Step 1: Niche Selection */}
      {activeStep === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-serif text-ink">Choose a Niche</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Select the business niche for your SMS campaign
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {nicheList.map((niche) => {
              // nicheList items are objects: { id, emoji, label }
              const nicheId = (niche as any).id || niche;
              const nicheLabel = (niche as any).label || (niche as any).id || niche;
              const nicheEmoji = (niche as any).emoji || '';
              const isSelected = selectedNiche === nicheId;
              return (
                <button
                  key={nicheId}
                  type="button"
                  onClick={() => {
                    playSoftBubble();
                    setSelectedNiche(nicheId);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${
                    isSelected
                      ? 'border-accent bg-accent-soft'
                      : 'border-border-main hover:border-accent/40 bg-white'
                  }`}
                >
                  {nicheEmoji && (
                    <p className="text-2xl mb-1">{nicheEmoji}</p>
                  )}
                  <p className="text-sm font-semibold text-ink">{nicheLabel}</p>
                  {isSelected && (
                    <CheckCircle className="w-4 h-4 text-accent mx-auto mt-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Lead Source */}
      {activeStep === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-serif text-ink">Add Your Leads</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Upload a CSV with phone numbers or use Google Maps (coming soon)
            </p>
          </div>

          {/* Lead source tabs */}
          <div className="flex items-center gap-2 border-b border-border-main">
            <button
              type="button"
              onClick={() => setLeadSource('csv')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                leadSource === 'csv'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5" />
              CSV Upload
            </button>
            <button
              type="button"
              onClick={() => setLeadSource('google_maps')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                leadSource === 'google_maps'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 inline mr-1.5" />
              Find Leads in Canada
              {!isAutomatedSmsPlan(userPlan) && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  Beta
                </span>
              )}
            </button>
          </div>

          {/* CSV Upload */}
          {leadSource === 'csv' && (
            <div className="space-y-4">
              {/* Column Requirements Guide */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Required CSV Columns
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-ink">Business Name</p>
                  <p className="text-[10px] text-ink-secondary">e.g., "Joe's Barbershop"</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-ink">City</p>
                  <p className="text-[10px] text-ink-secondary">e.g., "Austin, TX"</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-ink">Phone Number</p>
                  <p className="text-[10px] text-ink-secondary">e.g., "(512) 555-1234"</p>
                </div>
              </div>
            </div>
          </div>

          {/* Canada-only error card — shown when any rows were rejected as non-Canadian */}
              {csvValidation && isAutomatedSmsPlan(userPlan) && (csvValidation.countryBlockedCount ?? 0) > 0 && (
                <CanadaOnlyErrorCard
                  invalidRows={csvValidation.invalidRows}
                  validCount={csvValidation.validCount}
                  totalRows={csvValidation.totalRows}
                  allowedCountries={csvValidation.allowedCountries}
                  onRemoveNonCanadian={() => {
                    // Strip country-blocked rows from invalidRows and re-validate locally
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
                  onClose={() => {
                    setCsvError(null);
                  }}
                />
              )}

              {/* Standard Validation Status Banner */}
              {csvValidation && (csvValidation.countryBlockedCount ?? 0) === 0 && (
                <div className={`rounded-xl border p-4 ${
                  csvValidation.ok && csvValidation.invalidCount === 0
                    ? 'bg-success-soft border-success/20'
                    : csvValidation.validCount > 0
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-danger-soft border-danger/20'
                }`}>
                  {csvValidation.ok && csvValidation.invalidCount === 0 ? (
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-ink">All {csvValidation.validCount} rows validated</p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          Every row has a valid <span className="font-semibold">Business Name</span>, <span className="font-semibold">City</span>, and <span className="font-semibold">Phone Number</span>.
                        </p>
                      </div>
                    </div>
                  ) : csvValidation.validCount > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-ink">
                            {csvValidation.validCount} valid, {csvValidation.invalidCount} invalid
                          </p>
                          <p className="text-xs text-ink-secondary mt-0.5">
                            {csvValidation.invalidCount} row(s) are missing required data and will be skipped.
                          </p>
                        </div>
                      </div>
                      {csvValidation.invalidRows.length > 0 && (
                        <div className="bg-white/60 rounded-lg p-3 max-h-40 overflow-y-auto">
                          <p className="text-[10px] font-bold text-ink uppercase tracking-wider mb-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-danger" />
                            Invalid Rows (showing first 10)
                          </p>
                          <div className="space-y-1.5">
                            {csvValidation.invalidRows.slice(0, 10).map((row) => (
                              <div key={row.line} className="flex items-start gap-2 text-xs bg-white/80 rounded px-2 py-1">
                                <span className="text-ink-tertiary font-mono shrink-0">L{row.line}:</span>
                                <span className="font-medium text-ink shrink-0 max-w-[120px] truncate">{row.name || '(blank)'}</span>
                                <span className="text-danger shrink-0">— {row.issues.join(', ')}</span>
                              </div>
                            ))}
                            {csvValidation.invalidRows.length > 10 && (
                              <p className="text-[10px] text-ink-tertiary text-center pt-1">
                                +{csvValidation.invalidRows.length - 10} more invalid rows
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-danger">No valid leads found</p>
                        <p className="text-xs text-ink-secondary mt-0.5">{csvValidation.message}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Missing Columns Warning */}
              {csvValidation?.missingColumns && csvValidation.missingColumns.length > 0 && (
                <div className="bg-danger-soft border-2 border-danger/30 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-danger">Missing Required Columns</p>
                      <p className="text-xs text-ink-secondary mt-1">
                        Your CSV is missing: <span className="font-bold text-danger">{csvValidation.missingColumns.join(', ')}</span>. 
                        Add these columns with headers and re-upload.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!csvFileName ? (
                <div
                  className="border-2 border-dashed border-border-main rounded-xl p-12 text-center cursor-pointer hover:border-accent/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file && file.name.endsWith('.csv')) {
                      handleFileSelect(file);
                    }
                  }}
                >
                  <Upload className="w-10 h-10 mx-auto mb-3 text-ink-tertiary" />
                  <p className="text-sm font-semibold text-ink mb-1">
                    Drop your CSV here or click to browse
                  </p>
                  <p className="text-xs text-ink-secondary">
                    Required columns: name, phone, city
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                </div>
              ) : csvLeads.length > 0 ? (
                <CsvPreview
                  fileName={csvFileName || 'upload.csv'}
                  leads={csvLeads}
                  totalCount={csvParsedCount}
                  onClear={() => {
                    setCsvFileName(null);
                    setCsvLeads([]);
                    setCsvParsedCount(0);
                    setCsvValidation(null);
                    setCsvError(null);
                  }}
                />
              ) : (
                <div className="text-center py-8 border border-amber-200 bg-amber-50/50 rounded-xl">
                  <p className="text-sm font-semibold text-ink">No valid leads found</p>
                  {csvError && (
                    <p className="text-xs text-danger mt-1">{csvError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCsvFileName(null);
                      setCsvValidation(null);
                      setCsvError(null);
                    }}
                    className="mt-3 px-4 py-2 bg-ink hover:bg-ink/90 text-white text-xs font-semibold rounded-lg"
                  >
                    Try Another File
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Find Leads in Canada */}
          {leadSource === 'google_maps' && (
            <SmsLeadFinder
              ownerKey={ownerKey}
              userPlan={userPlan}
              onLeadsSelected={(leads) => {
                setCsvLeads(leads);
                setCsvParsedCount(leads.length);
                setCsvValidation({
                  ok: leads.length > 0,
                  detectedColumns: [],
                  missingColumns: [],
                  totalRows: leads.length,
                  validCount: leads.length,
                  invalidCount: 0,
                  leads,
                  invalidRows: [],
                  message: `${leads.length} leads added from Google Maps`,
                  countryBlockedCount: 0,
                  allowedCountries: null,
                });
              }}
            />
          )}
        </div>
      )}

      {/* Step 3: Template Selection */}
      {activeStep === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-serif text-ink">Choose a Template</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              The template generates the landing page link sent in your SMS
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {allTemplates.map((tpl, index) => {
              const tplId = (tpl as any).id || (tpl as any).slug;
              const isSelected = selectedTemplateId === tplId;
              return (
                <div
                  key={tplId}
                  className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                    isSelected
                      ? 'border-accent shadow-lg'
                      : 'border-border-main hover:border-accent/40'
                  }`}
                  onClick={() => {
                    playElegantBell();
                    setSelectedTemplateId(tplId);
                  }}
                >
                  <TemplateSimPreview
                    id={tplId}
                    name={(tpl as any).name || 'Template'}
                    niche={(tpl as any).niche || selectedNiche}
                    badge={(tpl as any).tag || ''}
                    isMostUsed={(tpl as any).isMostUsed}
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-accent rounded-full flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-sm p-2 border-t border-border-light">
                    <p className="text-xs font-semibold text-ink text-center truncate">
                      {(tpl as any).name}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 4: Phone Number */}
      {activeStep === 4 && (
        <SmsAccountStep
          ownerKey={ownerKey}
          userPlan={userPlan}
          mode={isAutomatedSmsPlan(userPlan) ? 'auto' : 'byo'}
          selectedPhoneNumber={selectedPhoneNumber}
          onSelectPhone={handleSelectPhone}
          targetCountries={targetCountries}
        />
      )}

      {/* Step 5: Review */}
      {activeStep === 5 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-serif text-ink">Review & Launch</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Confirm your campaign settings before launching
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-off-white rounded-xl p-4">
              <p className="text-xs text-ink-secondary uppercase tracking-wider">Leads</p>
              <p className="text-lg font-bold text-ink mt-1">{csvLeads.length}</p>
            </div>
            <div className="bg-off-white rounded-xl p-4">
              <p className="text-xs text-ink-secondary uppercase tracking-wider">Niche</p>
              <p className="text-lg font-bold text-ink mt-1">{selectedNiche}</p>
            </div>
            <div className="bg-off-white rounded-xl p-4">
              <p className="text-xs text-ink-secondary uppercase tracking-wider">From</p>
              <p className="text-sm font-bold text-ink mt-1 truncate">{selectedPhoneNumber}</p>
            </div>
            <div className="bg-off-white rounded-xl p-4">
              <p className="text-xs text-ink-secondary uppercase tracking-wider">Cost</p>
              <p className="text-lg font-bold text-ink mt-1">
                {csvLeads.length * COST_PER_SMS} credits
              </p>
            </div>
          </div>

          {/* SMS Content */}
          <div className="bg-white border border-border-main rounded-xl p-5">
            <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wider mb-2">
              SMS Message
            </p>
            <textarea
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              className="w-full p-3 border border-border-main rounded-lg text-sm bg-white text-ink focus:outline-none focus:border-accent resize-none"
              rows={5}
              placeholder="Write your SMS message..."
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  const textarea = document.querySelector('textarea');
                  if (textarea) {
                    const start = textarea.selectionStart;
                    const newValue = smsMessage.slice(0, start) + '{{business_name}}' + smsMessage.slice(start);
                    setSmsMessage(newValue);
                  }
                }}
                className="text-[10px] px-2 py-1 bg-off-white hover:bg-surface rounded border border-border-main"
              >
                + business_name
              </button>
              <button
                type="button"
                onClick={() => {
                  const textarea = document.querySelector('textarea');
                  if (textarea) {
                    const start = textarea.selectionStart;
                    const newValue = smsMessage.slice(0, start) + '{{city}}' + smsMessage.slice(start);
                    setSmsMessage(newValue);
                  }
                }}
                className="text-[10px] px-2 py-1 bg-off-white hover:bg-surface rounded border border-border-main"
              >
                + city
              </button>
              <button
                type="button"
                onClick={() => {
                  const textarea = document.querySelector('textarea');
                  if (textarea) {
                    const start = textarea.selectionStart;
                    const newValue = smsMessage.slice(0, start) + '{{site_url}}' + smsMessage.slice(start);
                    setSmsMessage(newValue);
                  }
                }}
                className="text-[10px] px-2 py-1 bg-off-white hover:bg-surface rounded border border-border-main"
              >
                + site_url
              </button>
            </div>
          </div>

          {/* Error */}
          {launchError && (
            <div className="bg-danger-soft border border-danger/20 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{launchError}</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-border-light">
        <button
          type="button"
          onClick={handlePrevStep}
          disabled={activeStep === 1 || isLaunching}
          className="px-5 py-2.5 border border-border-main rounded-lg text-sm font-semibold text-ink hover:bg-off-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {activeStep < 5 ? (
          <button
            type="button"
            onClick={handleNextStep}
            disabled={!canProceedFromStep(activeStep)}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Next Step
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLaunch}
            disabled={isLaunching || !canProceedFromStep(5)}
            className="px-6 py-2.5 bg-gradient-to-r from-accent to-blue-600 hover:from-accent-hover hover:to-blue-700 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isLaunching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Launch Campaign
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default SmsCampaignWizard;
