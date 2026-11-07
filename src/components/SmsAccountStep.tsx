import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Phone, CheckCircle2, AlertCircle, RefreshCw, Key,
  ExternalLink, Mail, ShieldCheck, Check, Trash2, ShieldAlert
} from 'lucide-react';
import { playSoftTap, playElegantError, playGentleChime, playConfirmSuccess } from '../utils/audio';
import { PipelineLead, canUseOwnTelnyx } from '../lib/pipelineClient';
import { inspectLeadsForTelnyx } from '../lib/phoneRouteValidator';
import { CarrierRouteInspectionCard } from './CarrierRouteInspectionCard';
import {
  getCachedTelnyxData,
  syncTelnyxAccountLive,
  saveCachedTelnyxData,
  clearTelnyxAuth,
  CachedTelnyxData,
} from '../lib/telnyxClient';

interface SmsAccountStepProps {
  ownerKey: string;
  userPlan?: string;
  mode?: 'auto' | 'byo';
  selectedPhoneNumber: string | null;
  onSelectPhone: (phoneNumber: string, accountId: string, profileId: string | null) => void;
  onAccountsChange?: () => void;
  targetCountries?: string[];
  leads?: PipelineLead[];
  onExcludeIncompatibleLeads?: (indexes: number[]) => void;
}

export interface TelnyxNumberItem {
  id: string;
  phoneNumber: string;
  status: string;
  smsCapable: boolean;
  profileId: string | null;
  profileName: string | null;
  canSend: boolean;
  needsMessagingProfile: boolean;
}

const DEFAULT_SUPPORT_EMAIL = 'lunaoxx77@gmail.com';
const STORAGE_KEY = 'lunao_custom_telnyx_api_key';

export const SmsAccountStep: React.FC<SmsAccountStepProps> = ({
  ownerKey,
  userPlan = 'Starter Plan',
  selectedPhoneNumber,
  onSelectPhone,
  onAccountsChange,
  leads = [],
  onExcludeIncompatibleLeads,
}) => {
  // Synchronously hydrate from browser cache & cookies (0ms instant loading)
  const [initialCached] = useState<CachedTelnyxData>(() => getCachedTelnyxData());
  const [apiKey, setApiKey] = useState<string>(initialCached.apiKey || '');
  const [inputKey, setInputKey] = useState<string>(initialCached.apiKey || '');
  const [isConnected, setIsConnected] = useState<boolean>(initialCached.connected);
  const [tokenExpired, setTokenExpired] = useState<boolean>(initialCached.tokenExpired);
  const [connectedAccountLabel, setConnectedAccountLabel] = useState<string>(
    initialCached.account?.label || initialCached.account?.email || (initialCached.apiKey ? 'Telnyx Authenticated Carrier' : '')
  );
  const [isChangingKey, setIsChangingKey] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOAuthConnecting, setIsOAuthConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TelnyxNumberItem[]>(initialCached.numbers || []);

  const isStarterOrAbove = canUseOwnTelnyx(userPlan);

  const onSelectPhoneRef = useRef(onSelectPhone);
  useEffect(() => {
    onSelectPhoneRef.current = onSelectPhone;
  }, [onSelectPhone]);

  const selectedPhoneNumberRef = useRef(selectedPhoneNumber);
  useEffect(() => {
    selectedPhoneNumberRef.current = selectedPhoneNumber;
  }, [selectedPhoneNumber]);

  // Auto-select ready number immediately from cache on initial mount
  useEffect(() => {
    if (numbers.length > 0 && !selectedPhoneNumberRef.current) {
      const firstReady = numbers.find((n) => n.canSend);
      if (firstReady) {
        onSelectPhoneRef.current(firstReady.phoneNumber, 'telnyx-account', firstReady.profileId);
      } else {
        onSelectPhoneRef.current(numbers[0].phoneNumber, 'telnyx-account', numbers[0].profileId);
      }
    }
  }, []);

  const isFetchingRef = useRef(false);

  // Fetch / Sync real numbers from Telnyx using stored API key or OAuth connection
  const fetchNumbers = useCallback(async (explicitKey?: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (numbers.length === 0) setIsLoading(true);
    setError(null);

    try {
      if (explicitKey) {
        saveCachedTelnyxData({ apiKey: explicitKey, connected: true });
        setApiKey(explicitKey);
      }

      const live = await syncTelnyxAccountLive(ownerKey);

      setNumbers(live.numbers);
      setIsConnected(live.connected);
      setTokenExpired(live.tokenExpired);
      if (live.account) {
        setConnectedAccountLabel(live.account.label || live.account.email || 'Telnyx Account');
      } else if (live.apiKey) {
        setConnectedAccountLabel('Telnyx API Key Line');
      }

      if (live.tokenExpired) {
        setError('Telnyx session or cookie expired. Please reconnect to resume carrier sending.');
      } else {
        setError(null);
      }

      const currentSel = selectedPhoneNumberRef.current;
      const firstReady = live.numbers.find((n: TelnyxNumberItem) => n.canSend);
      if (firstReady && !currentSel) {
        onSelectPhoneRef.current(firstReady.phoneNumber, 'telnyx-account', firstReady.profileId);
      } else if (live.numbers.length > 0 && !currentSel) {
        onSelectPhoneRef.current(live.numbers[0].phoneNumber, 'telnyx-account', live.numbers[0].profileId);
      }
    } catch (err: any) {
      console.warn('[Telnyx Query Error]', err.message);
      setError(err.message || 'Unable to connect to Telnyx. Please verify your credentials.');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [ownerKey, numbers.length]);

  // Sync on mount and subscribe to cross-tab / cross-section sync events
  useEffect(() => {
    fetchNumbers();

    const onSync = (e: any) => {
      const detail: CachedTelnyxData = e.detail;
      if (!detail) return;
      setIsConnected(detail.connected);
      setTokenExpired(detail.tokenExpired);
      setNumbers(detail.numbers || []);
      if (detail.apiKey) setApiKey(detail.apiKey);
      if (detail.account) {
        setConnectedAccountLabel(detail.account.label || detail.account.email || 'Telnyx Account');
      }
    };
    window.addEventListener('lunao:telnyx_sync', onSync);
    return () => window.removeEventListener('lunao:telnyx_sync', onSync);
  }, [fetchNumbers]);

  // Handle OAuth popup connection
  const handleConnectOAuth = async () => {
    playSoftTap();
    setIsOAuthConnecting(true);
    setError(null);

    try {
      const res = await fetch(`/api/telnyx/connect?ownerKey=${encodeURIComponent(ownerKey)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Telnyx OAuth is not configured on this domain. Please connect using your Telnyx V2 API Key below.');
      }

      const { url } = data;
      if (!url) throw new Error('No authorization URL returned from Telnyx.');

      const features = [
        'width=560',
        'height=720',
        'menubar=no',
        'toolbar=no',
        'location=no',
        'status=no',
        'scrollbars=yes',
        'resizable=yes',
      ].join(',');

      const popup = window.open(url, 'telnyx-oauth', features);
      if (!popup) {
        window.location.href = url;
        return;
      }
      popup.focus();

      const poll = window.setInterval(async () => {
        if (popup.closed) {
          window.clearInterval(poll);
          setIsOAuthConnecting(false);
          await fetchNumbers();
          onAccountsChange?.();
        }
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Error initiating Telnyx OAuth. You can connect using your Telnyx V2 API Key directly.');
      setIsOAuthConnecting(false);
      setIsChangingKey(true);
    }
  };

  // Handle direct API key submission
  const handleConnectKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = inputKey.trim();
    if (!cleanKey) {
      setError('Please enter your Telnyx V2 API key.');
      return;
    }

    playSoftTap();
    setApiKey(cleanKey);
    await fetchNumbers(cleanKey);
    onAccountsChange?.();
  };

  // Disconnect / switch account
  const handleDisconnect = async () => {
    playSoftTap();
    await clearTelnyxAuth(ownerKey);
    setApiKey('');
    setInputKey('');
    setIsConnected(false);
    setConnectedAccountLabel('');
    setNumbers([]);
    setIsChangingKey(true);
    setError(null);
    onSelectPhone('', '', null);
    onAccountsChange?.();
  };

  const handleSelectNumber = (num: TelnyxNumberItem) => {
    if (!num.canSend) {
      playElegantError();
      return;
    }
    playGentleChime();
    onSelectPhone(num.phoneNumber, 'telnyx-account', num.profileId);
  };

  // Inspect leads against selected or available Telnyx sender line
  const routeInspection = useMemo(() => {
    if (!leads || leads.length === 0) return null;
    const phoneToTest = selectedPhoneNumber || (numbers.find((n) => n.canSend)?.phoneNumber) || null;
    if (!phoneToTest) return null;
    return inspectLeadsForTelnyx(leads, phoneToTest);
  }, [leads, selectedPhoneNumber, numbers]);

  return (
    <div className="space-y-6">
      {/* Top Banner: Connection Status or Connect Options */}
      {isConnected && !isChangingKey ? (
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-border-main shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink">Telnyx Account Connected</p>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                  Live Carrier
                </span>
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">
                {connectedAccountLabel ? (
                  <span>Account: <strong className="text-ink">{connectedAccountLabel}</strong></span>
                ) : (
                  <span>Status: <span className="font-semibold text-emerald-700">Authenticated with Telnyx</span></span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => fetchNumbers()}
              disabled={isLoading}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-surface hover:bg-off-white border border-border-main text-ink text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Sync Numbers
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="px-3.5 py-2 rounded-xl bg-surface hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-border-main text-xs font-semibold text-ink-secondary transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        /* Real Authentication Card */
        <div className="p-5 sm:p-7 rounded-2xl bg-white border border-blue-200 shadow-sm space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-ink">Connect Your Real Telnyx Account</h4>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Connect your real Telnyx account via 1-click OAuth or enter your Telnyx V2 API Key to sync your verified carrier numbers and 10DLC messaging profiles.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Connect Option 1: 1-Click Telnyx OAuth */}
          <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-ink flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>1-Click Telnyx OAuth</span>
              </p>
              <p className="text-[11px] text-ink-secondary">
                Authorize directly with your Telnyx Mission Control login.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnectOAuth}
              disabled={isOAuthConnecting || isLoading}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              {isOAuthConnecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Opening Telnyx...
                </>
              ) : (
                'Connect with Telnyx'
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border-light" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">or enter API key</span>
            <div className="flex-1 h-px bg-border-light" />
          </div>

          {/* Connect Option 2: Telnyx V2 API Key Form */}
          <form onSubmit={handleConnectKey} className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink block">Telnyx API Key (V2)</label>
                <a
                  href="https://portal.telnyx.com/#/app/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                >
                  Get key in Mission Control <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="text"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="KEY018... (starts with KEY)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-main bg-white text-ink text-xs font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {isChangingKey && (
                <button
                  type="button"
                  onClick={() => {
                    playSoftTap();
                    setIsChangingKey(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-surface hover:bg-off-white border border-border-main text-xs font-semibold text-ink-secondary cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading || !inputKey.trim()}
                className="px-5 py-2 rounded-xl bg-ink hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Validating Key...
                  </>
                ) : (
                  'Validate & Connect Key'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Available Phone Numbers List (Real Telnyx Only) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-ink">Available Phone Numbers</h4>
            <p className="text-xs text-ink-secondary">Select an active sender number configured for carrier messaging.</p>
          </div>
          {numbers.length > 0 && (
            <div className="flex items-center gap-2">
              {isLoading && (
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-medium">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Syncing...
                </span>
              )}
              <span className="text-xs font-mono text-ink-secondary">
                {numbers.filter((n) => n.canSend).length} ready of {numbers.length} total
              </span>
            </div>
          )}
        </div>

        {isLoading && numbers.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-border-main text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
            <p className="text-xs text-ink-secondary">Querying Telnyx carrier numbers and checking messaging profile status...</p>
          </div>
        ) : numbers.length === 0 ? (
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-border-main text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Phone className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-ink">No Phone Numbers Found</p>
            <p className="text-xs text-ink-secondary max-w-md mx-auto leading-relaxed">
              {isConnected
                ? 'Your connected Telnyx account has no active phone numbers. Acquire a number in Telnyx Mission Control to begin sending.'
                : 'Connect your Telnyx account above to load your active carrier phone numbers.'}
            </p>
            <div className="pt-2">
              <a
                href="https://portal.telnyx.com/#/app/numbers/buy"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
              >
                Acquire Number in Telnyx <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {numbers.map((num) => {
              const isSelected = selectedPhoneNumber === num.phoneNumber;
              const isReady = num.canSend;
              const needsProfile = num.needsMessagingProfile;
              const isVoiceOnly = !num.smsCapable;

              return (
                <div
                  key={num.id || num.phoneNumber}
                  onClick={() => isReady && handleSelectNumber(num)}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    isReady
                      ? isSelected
                        ? 'bg-blue-50/50 border-blue-500 shadow-sm ring-2 ring-blue-100 cursor-pointer'
                        : 'bg-white hover:border-blue-300 border-border-main cursor-pointer'
                      : 'bg-surface/50 border-border-main opacity-90'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {/* Selection Radio Indicator */}
                      <div className="pt-0.5">
                        {isReady ? (
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-border-main bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-border-main bg-surface" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-ink font-mono">{num.phoneNumber}</span>
                          {isReady ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Ready for SMS
                            </span>
                          ) : needsProfile ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <AlertCircle className="w-3 h-3" /> Messaging Profile Required
                            </span>
                          ) : isVoiceOnly ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface text-ink-secondary border border-border-main">
                              Voice Only
                            </span>
                          ) : null}
                        </div>

                        {/* Status Details */}
                        {isReady ? (
                          <p className="text-xs text-ink-secondary">
                            SMS Capability: <span className="font-semibold text-emerald-700">Enabled</span> · Messaging Profile:{' '}
                            <span className="font-semibold text-ink">{num.profileName || num.profileId}</span>
                          </p>
                        ) : needsProfile ? (
                          <div className="mt-2 p-3 rounded-xl bg-white border border-blue-200 text-xs text-ink-secondary space-y-2">
                            <p className="leading-relaxed">
                              <strong className="text-blue-900 font-semibold">Messaging Profile required</strong> for carrier 10DLC routing. Please attach a messaging profile to this number in your Telnyx portal.
                            </p>
                            <div className="flex flex-wrap items-center gap-3 pt-0.5">
                              <a
                                href="https://portal.telnyx.com/#/app/messaging"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                              >
                                Create / Attach in Telnyx <ExternalLink className="w-3 h-3" />
                              </a>
                              <a
                                href={`mailto:${DEFAULT_SUPPORT_EMAIL}?subject=Help%20attaching%20Telnyx%20messaging%20profile%20to%20${encodeURIComponent(num.phoneNumber)}`}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-secondary hover:text-ink"
                              >
                                <Mail className="w-3 h-3 text-blue-600" /> Contact Support ({DEFAULT_SUPPORT_EMAIL})
                              </a>
                            </div>
                          </div>
                        ) : isVoiceOnly ? (
                          <p className="text-xs text-ink-tertiary">
                            This number is voice-only and cannot send SMS proposals.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {isReady && (
                      <span className={`text-xs font-semibold shrink-0 self-start sm:self-center ${isSelected ? 'text-blue-600 font-bold' : 'text-ink-tertiary'}`}>
                        {isSelected ? 'Selected' : 'Click to select'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Carrier Route & Destination Feasibility Card */}
      {routeInspection && (
        <div className="pt-1">
          <CarrierRouteInspectionCard
            summary={routeInspection}
            senderPhone={selectedPhoneNumber || (numbers.find((n) => n.canSend)?.phoneNumber)}
            onExcludeIncompatible={
              onExcludeIncompatibleLeads && routeInspection.incompatibleCount > 0
                ? () => {
                    const badIdxs = routeInspection.results
                      .filter((r) => !r.isCompatible)
                      .map((r) => r.index);
                    onExcludeIncompatibleLeads(badIdxs);
                  }
                : undefined
            }
          />
        </div>
      )}

      {/* White-Glove Support Footer Note */}
      <div className="p-4 rounded-xl bg-surface border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-ink-secondary">
        <span>
          Need help configuring Telnyx 10DLC or messaging profiles? Reach out anytime at{' '}
          <a href={`mailto:${DEFAULT_SUPPORT_EMAIL}`} className="font-semibold text-blue-600 hover:underline">
            {DEFAULT_SUPPORT_EMAIL}
          </a>
        </span>
        <a
          href="https://portal.telnyx.com/#/app/messaging"
          target="_blank"
          rel="noreferrer"
          className="text-ink hover:text-blue-600 flex items-center gap-1 font-semibold shrink-0"
        >
          Telnyx Messaging Hub <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default SmsAccountStep;
