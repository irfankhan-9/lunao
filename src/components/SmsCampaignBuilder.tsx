import { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Upload,
  FileText,
  MessageSquare,
  Send,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Phone,
  Plus,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  initiateTelnyxOAuth,
  listTelnyxAccounts,
  listTelnyxNumbers,
  type TelnyxAccount,
  type TelnyxPhoneNumber,
} from '../lib/pipelineClient';

interface SmsCampaignBuilderProps {
  onComplete?: (campaign: SmsCampaign) => void;
  onCancel?: () => void;
}

interface SmsCampaign {
  name: string;
  type: 'promotion' | 'reminder' | 'announcement';
  tags: string[];
  leads: Lead[];
  senderNumber: string;
  message: string;
}

interface Lead {
  name: string;
  phone: string;
  city?: string;
  businessName?: string;
}

const STEPS = [
  { id: 1, label: 'Campaign Basics', icon: FileText },
  { id: 2, label: 'Audience', icon: Upload },
  { id: 3, label: 'SMS Setup', icon: Phone },
  { id: 4, label: 'Message', icon: MessageSquare },
  { id: 5, label: 'Review & Launch', icon: Send },
];

export function SmsCampaignBuilder({ onComplete, onCancel }: SmsCampaignBuilderProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [campaign, setCampaign] = useState<SmsCampaign>({
    name: '',
    type: 'promotion',
    tags: [],
    leads: [],
    senderNumber: '',
    message: '',
  });
  const [accounts, setAccounts] = useState<TelnyxAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TelnyxPhoneNumber[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [oauthStarting, setOauthStarting] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const ownerKey = typeof window !== 'undefined'
    ? (localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan')
    : 'dash-Free-Plan';

  const reloadAccounts = useCallback(async () => {
    const accs = await listTelnyxAccounts(ownerKey);
    setAccounts(accs);
    const active = accs.find((a) => a.status === 'active') || accs[0];
    setActiveAccountId(active?.id || null);
    return active;
  }, [ownerKey]);

  // Load numbers for the active account
  const reloadNumbers = useCallback(async (accountId: string | null) => {
    if (!accountId) {
      setNumbers([]);
      return;
    }
    setLoadingNumbers(true);
    try {
      const list = await listTelnyxNumbers(accountId, ownerKey);
      setNumbers(list);
    } catch (err) {
      console.error('[sms-builder] failed to load numbers:', err);
      setNumbers([]);
    } finally {
      setLoadingNumbers(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    reloadAccounts().then((active) => {
      if (active) reloadNumbers(active.id);
    });
  }, [reloadAccounts, reloadNumbers]);

  // Re-check accounts whenever the window regains focus (the OAuth callback
  // closes itself and the user is back on the builder tab).
  useEffect(() => {
    const handler = () => {
      reloadAccounts().then((active) => {
        if (active) reloadNumbers(active.id);
      });
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [reloadAccounts, reloadNumbers]);

  // When the active account changes, refresh the number list.
  useEffect(() => {
    if (activeAccountId) reloadNumbers(activeAccountId);
  }, [activeAccountId, reloadNumbers]);

  // Auto-pick the first number once they load.
  useEffect(() => {
    if (numbers.length > 0 && !campaign.senderNumber) {
      setCampaign((prev) => ({ ...prev, senderNumber: numbers[0].number }));
    }
  }, [numbers, campaign.senderNumber]);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.trim().split('\n');
        if (lines.length < 2) {
          setCsvError('CSV must have at least a header row and one data row');
          return;
        }

        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('tel'));
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('business'));
        const cityIdx = headers.findIndex(h => h.includes('city') || h.includes('location'));

        if (phoneIdx === -1) {
          setCsvError('CSV must have a "phone" column');
          return;
        }

        const leads: Lead[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols[phoneIdx]) {
            leads.push({
              name: nameIdx !== -1 ? cols[nameIdx] : `Lead ${i}`,
              phone: cols[phoneIdx],
              city: cityIdx !== -1 ? cols[cityIdx] : undefined,
            });
          }
        }

        if (leads.length === 0) {
          setCsvError('No valid leads found in CSV');
          return;
        }

        setCampaign(prev => ({ ...prev, leads }));
      } catch {
        setCsvError('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  };

  const handleConnectTelnyx = async () => {
    setConnectError(null);
    setOauthStarting(true);
    try {
      await initiateTelnyxOAuth();
      // Browser will navigate to Telnyx; reloadAccounts() will run on focus.
    } catch (err: any) {
      setConnectError(err?.message || 'Failed to start Telnyx OAuth');
      setOauthStarting(false);
    }
  };

  const handleLaunch = async () => {
    if (!activeAccountId || !campaign.senderNumber) return;

    setLaunching(true);
    try {
      // Real launch — POST to the campaign runner with the OAuth account id
      // and the selected sender number. The pipeline uses the OAuth access
      // token to send each SMS via Telnyx.
      const res = await fetch('/api/campaign/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerKey,
          name: campaign.name,
          type: campaign.type,
          tags: campaign.tags,
          leads: campaign.leads,
          message: campaign.message,
          sms: {
            accountId: activeAccountId,
            from: campaign.senderNumber,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onComplete?.({ ...campaign, ...(data?.campaign || {}) });
    } catch (err) {
      console.error('[sms-builder] launch failed:', err);
      setConnectError((err as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return campaign.name.trim().length > 0;
      case 2:
        return campaign.leads.length > 0;
      case 3:
        return !!activeAccountId && campaign.senderNumber.length > 0;
      case 4:
        return campaign.message.trim().length > 0;
      default:
        return true;
    }
  };

  const needsTelnyxConnection = accounts.length === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Onboarding Banner */}
      {currentStep === 3 && needsTelnyxConnection && (
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Phone className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold mb-1">Connect Telnyx Before Launching Campaigns</h3>
              <p className="text-sm text-blue-100 mb-4">
                Click below to authorize Lunao to send SMS through your Telnyx account.
                No API keys to copy — we use OAuth.
              </p>
              <button
                onClick={handleConnectTelnyx}
                disabled={oauthStarting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {oauthStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                {oauthStarting ? 'Opening Telnyx…' : 'Connect with Telnyx'}
              </button>
              {connectError && (
                <p className="text-xs text-blue-100 mt-3 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {connectError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step Progress */}
      <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className={`flex items-center gap-3 ${isActive ? 'text-blue-600' : isCompleted ? 'text-emerald-600' : 'text-ink-tertiary'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                    isActive ? 'border-blue-600 bg-blue-50' :
                    isCompleted ? 'border-emerald-600 bg-emerald-50' :
                    'border-border-main bg-off-white'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className="text-sm font-medium hidden sm:block">{step.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${currentStep > step.id ? 'bg-emerald-300' : 'bg-border-main'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm min-h-[400px]">
        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Campaign Name</label>
              <input
                type="text"
                value={campaign.name}
                onChange={(e) => setCampaign(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Spring Promo 2025"
                className="w-full px-4 py-2.5 rounded-lg border border-border-main bg-white text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Campaign Type</label>
              <select
                value={campaign.type}
                onChange={(e) => setCampaign(prev => ({ ...prev, type: e.target.value as SmsCampaign['type'] }))}
                className="w-full px-4 py-2.5 rounded-lg border border-border-main bg-white text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              >
                <option value="promotion">Promotion</option>
                <option value="reminder">Reminder</option>
                <option value="announcement">Announcement</option>
              </select>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Upload Leads CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="w-full px-4 py-2.5 rounded-lg border border-border-main bg-white text-sm"
              />
              <p className="text-[10px] text-ink-tertiary mt-1">
                CSV must contain a "phone" column. Optional: "name", "city".
              </p>
            </div>
            {csvError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertTriangle className="w-4 h-4" />
                {csvError}
              </div>
            )}
            {csvFile && campaign.leads.length > 0 && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-sm text-emerald-800">
                  <strong>{campaign.leads.length}</strong> leads loaded from CSV
                </p>
              </div>
            )}
            <details className="text-xs text-ink-secondary">
              <summary className="cursor-pointer font-medium">CSV format example</summary>
              <pre className="mt-2 p-2 bg-off-white rounded font-mono text-[10px]">
{`name,phone,city
John's Barbershop,+15125551234,Austin
Perfect Cuts,+15125555678,Houston`}
              </pre>
            </details>
          </div>
        )}

        {/* Step 3: SMS Setup */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-ink mb-1">SMS Setup</h3>
              <p className="text-sm text-ink-secondary">
                Pick a Telnyx account and a sender number for this campaign.
              </p>
            </div>

            {/* Account selector (when multiple accounts are connected) */}
            {accounts.length > 1 && (
              <div>
                <h4 className="text-sm font-semibold text-ink mb-2">Telnyx Account</h4>
                <select
                  value={activeAccountId || ''}
                  onChange={(e) => setActiveAccountId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-border-main bg-white text-sm"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_label || acc.account_email || `Telnyx (${acc.total_numbers} numbers)`}
                      {acc.status === 'needs_reconnect' ? ' — needs reconnect' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Connection Status */}
            {activeAccountId ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold">Telnyx Connected</span>
                </div>
                <button
                  type="button"
                  onClick={() => activeAccountId && reloadNumbers(activeAccountId)}
                  disabled={loadingNumbers}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900"
                >
                  {loadingNumbers ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Refresh numbers
                </button>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-blue-900">Connect Your SMS Provider</h4>
                    <p className="text-xs text-blue-700 mt-1 mb-3">
                      Connect your Telnyx account via OAuth to start sending campaigns.
                    </p>
                    <button
                      onClick={handleConnectTelnyx}
                      disabled={oauthStarting}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {oauthStarting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {oauthStarting ? 'Opening Telnyx…' : 'Connect with Telnyx'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Number Selection */}
            {activeAccountId && (
              <div>
                <h4 className="text-sm font-semibold text-ink mb-3">Sender Number</h4>
                {loadingNumbers ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    <span className="ml-2 text-sm text-ink-secondary">Loading your Telnyx numbers…</span>
                  </div>
                ) : numbers.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800">
                      No phone numbers found on this Telnyx account.
                      Buy one at <a className="underline" href="https://portal.telnyx.com" target="_blank" rel="noopener noreferrer">portal.telnyx.com</a> then click Refresh.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {numbers.map((num) => (
                      <button
                        key={num.number}
                        onClick={() => setCampaign(prev => ({ ...prev, senderNumber: num.number }))}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          campaign.senderNumber === num.number
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-border-main hover:border-blue-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-medium text-ink">{num.number}</span>
                          {campaign.senderNumber === num.number && (
                            <CheckCircle className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Message</label>
              <textarea
                value={campaign.message}
                onChange={(e) => setCampaign(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Hi! Check out our new spring promo — visit {{site_url}}"
                rows={6}
                className="w-full px-4 py-2.5 rounded-lg border border-border-main bg-white text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              />
              <p className="text-[10px] text-ink-tertiary mt-1">
                Use <code>{'{{business_name}}'}</code>, <code>{'{{city}}'}</code>, <code>{'{{site_url}}'}</code> for personalization.
              </p>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-ink">Review & Launch</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-off-white rounded-lg">
                <p className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold mb-1">Campaign</p>
                <p className="text-sm font-semibold text-ink">{campaign.name}</p>
              </div>
              <div className="p-3 bg-off-white rounded-lg">
                <p className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold mb-1">Leads</p>
                <p className="text-sm font-semibold text-ink">{campaign.leads.length}</p>
              </div>
              <div className="p-3 bg-off-white rounded-lg col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold mb-1">Sender Number</p>
                <div className="text-sm font-mono font-semibold text-ink">{campaign.senderNumber}</div>
              </div>
              <div className="p-3 bg-off-white rounded-lg col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold mb-1">Message Preview</p>
                <p className="text-sm text-ink whitespace-pre-wrap">{campaign.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border-main bg-white text-ink text-sm font-medium hover:bg-off-white transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        {currentStep < STEPS.length ? (
          <button
            onClick={() => setCurrentStep(currentStep + 1)}
            disabled={!canProceed()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-30"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={launching || !canProceed()}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-30"
          >
            {launching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Launching…
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
}