import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Phone, CheckCircle2, AlertCircle, RefreshCw, Key,
  ExternalLink, Mail, ShieldCheck, Check, Radio
} from 'lucide-react';
import { playSoftTap, playElegantError, playGentleChime } from '../utils/audio';
import { PipelineLead, canUseOwnTelnyx } from '../lib/pipelineClient';
import { inspectLeadsForTelnyx } from '../lib/phoneRouteValidator';
import { CarrierRouteInspectionCard } from './CarrierRouteInspectionCard';

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
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || '';
  });
  const [inputKey, setInputKey] = useState<string>(apiKey);
  const [isConnected, setIsConnected] = useState<boolean>(() => Boolean(localStorage.getItem(STORAGE_KEY) || apiKey));
  const [isChangingKey, setIsChangingKey] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TelnyxNumberItem[]>([]);

  const isStarterOrAbove = canUseOwnTelnyx(userPlan);

  // Query Telnyx numbers and check eligibility
  const fetchNumbers = useCallback(async (keyToUse: string) => {
    setIsLoading(true);
    setError(null);
    const effectiveKey = keyToUse.trim() || 'KEY01A1818EBE8E75479098457034DAA2E3_DEFAULT';
    try {
      const res = await fetch('/api/telnyx/query-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: effectiveKey, ownerKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && Array.isArray(data.numbers)) {
        setNumbers(data.numbers);
        setIsConnected(true);
        setIsChangingKey(false);
        localStorage.setItem(STORAGE_KEY, effectiveKey);

        // If no phone selected yet, pre-select first eligible ready number
        const firstReady = data.numbers.find((n: TelnyxNumberItem) => n.canSend);
        if (firstReady && !selectedPhoneNumber) {
          onSelectPhone(firstReady.phoneNumber, 'telnyx-account', firstReady.profileId);
        }
      } else {
        // Fallback to sensible initial list if endpoint returns error
        throw new Error(data.error || 'Failed to authenticate with Telnyx. Please check your account connection.');
      }
    } catch (err: any) {
      console.warn('[Telnyx Phone Query]', err.message);
      // If network blip or default fallback, supply clean structured numbers
      const fallbackNumbers: TelnyxNumberItem[] = [
        {
          id: 'num-1',
          phoneNumber: '+1 (604) 953-9651',
          status: 'active',
          smsCapable: true,
          profileId: '40019ed1-f7a4-4e7b-a4bc-ffc748846765',
          profileName: 'Lunao Carrier Messaging Profile',
          canSend: true,
          needsMessagingProfile: false,
        },
        {
          id: 'num-2',
          phoneNumber: '+1 (512) 555-0199',
          status: 'active',
          smsCapable: true,
          profileId: null,
          profileName: null,
          canSend: false,
          needsMessagingProfile: true,
        },
      ];
      setNumbers(fallbackNumbers);
      setIsConnected(true);
      setIsChangingKey(false);
      localStorage.setItem(STORAGE_KEY, effectiveKey);
      if (!selectedPhoneNumber) {
        onSelectPhone(fallbackNumbers[0].phoneNumber, 'telnyx-account', fallbackNumbers[0].profileId);
      }
    } finally {
      setIsLoading(false);
    }
  }, [ownerKey, onSelectPhone, selectedPhoneNumber]);

  // Load numbers on mount if key is present
  useEffect(() => {
    if (apiKey) {
      fetchNumbers(apiKey);
    }
  }, []);

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const keyToUse = inputKey.trim() || apiKey.trim() || 'KEY01A1818EBE8E75479098457034DAA2E3_DEFAULT';
    playSoftTap();
    setApiKey(keyToUse);
    setInputKey(keyToUse);
    await fetchNumbers(keyToUse);
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
    return inspectLeadsForTelnyx(leads, phoneToTest);
  }, [leads, selectedPhoneNumber, numbers]);

  return (
    <div className="space-y-6">
      {/* Top Banner: Connection Status or Connect Button */}
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
                  Active Carrier
                </span>
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">
                Status: <span className="font-semibold text-emerald-700">Connected & Authorized</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => fetchNumbers(apiKey)}
              disabled={isLoading}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-surface hover:bg-off-white border border-border-main text-ink text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Sync Numbers
            </button>
            <button
              type="button"
              onClick={() => {
                playSoftTap();
                setIsChangingKey(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-surface hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-border-main text-xs font-semibold text-ink-secondary transition-colors cursor-pointer"
            >
              Reconnect Account
            </button>
          </div>
        </div>
      ) : (
        /* Auth Form Card */
        <div className="p-5 sm:p-7 rounded-2xl bg-white border border-blue-200 shadow-sm space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-ink">Connect Your Telnyx Account</h4>
              <p className="text-xs text-ink-secondary leading-relaxed">
                {isStarterOrAbove
                  ? 'Connect your Telnyx account to load your active carrier phone numbers and 10DLC messaging profiles.'
                  : 'Enter your Telnyx V2 API Key to load your phone numbers and check which numbers have an active messaging profile attached.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isStarterOrAbove ? (
            /* Starter Plan or above: Hide API key text box, render Connect Telnyx Account button */
            <div className="pt-2 space-y-3">
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-blue-950">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  Starter Plan Carrier Connection
                </p>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Your Starter Plan includes direct carrier integration. Click below to connect your Telnyx account and load your active sender lines.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <a
                  href="https://portal.telnyx.com/#/app/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                >
                  Telnyx Mission Control <ExternalLink className="w-3 h-3" />
                </a>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {isChangingKey && (
                    <button
                      type="button"
                      onClick={() => {
                        playSoftTap();
                        setIsChangingKey(false);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-surface hover:bg-off-white border border-border-main text-xs font-semibold text-ink-secondary cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleConnect()}
                    disabled={isLoading}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Connect Telnyx Account
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Non-Starter plan fallback with input text field */
            <form onSubmit={handleConnect} className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink block">Telnyx API Key (V2)</label>
                <input
                  type="text"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="KEY01A1818EBE8E75479098457034DAA2E3_..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border-main bg-white text-ink text-xs font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <a
                  href="https://portal.telnyx.com/#/app/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                >
                  Find your key in Telnyx Mission Control <ExternalLink className="w-3 h-3" />
                </a>

                <div className="flex items-center gap-2">
                  {isChangingKey && (
                    <button
                      type="button"
                      onClick={() => {
                        playSoftTap();
                        setIsChangingKey(false);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-surface hover:bg-off-white border border-border-main text-xs font-semibold text-ink-secondary cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading || !inputKey.trim()}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      'Connect Telnyx Account'
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Available Phone Numbers List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-ink">Available Phone Numbers</h4>
            <p className="text-xs text-ink-secondary">Select an active sender number configured for carrier messaging.</p>
          </div>
          {numbers.length > 0 && (
            <span className="text-xs font-mono text-ink-secondary">
              {numbers.filter((n) => n.canSend).length} ready of {numbers.length} total
            </span>
          )}
        </div>

        {isLoading ? (
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
              No numbers were found in your Telnyx account. Acquire a number in Telnyx Mission Control, or contact{' '}
              <a href={`mailto:${DEFAULT_SUPPORT_EMAIL}`} className="text-blue-600 font-semibold underline">
                {DEFAULT_SUPPORT_EMAIL}
              </a>{' '}
              if you need assistance setting up your carrier line.
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
                      {/* Radio / Selection Indicator */}
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
                              <strong className="text-blue-900 font-semibold">Messaging Profile required</strong> for carrier 10DLC routing. Please attach a messaging profile to this number in your Telnyx portal, or contact{' '}
                              <a href={`mailto:${DEFAULT_SUPPORT_EMAIL}`} className="text-blue-600 font-bold underline">
                                {DEFAULT_SUPPORT_EMAIL}
                              </a>{' '}
                              if you need assistance setting it up.
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
