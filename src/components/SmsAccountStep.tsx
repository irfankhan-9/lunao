// SmsAccountStep.tsx
//
// Phone number selection for SMS campaigns with full Telnyx messaging profile
// integration. This step:
//   1. Shows all phone numbers from connected Telnyx accounts
//   2. Checks each number's messaging profile for eligibility:
//      - Has a messaging profile assigned
//      - Webhook URL is configured for Lunao
//      - Supports SMS to the countries in the CSV leads
//   3. Offers two paths for setup:
//      - "Auto-Configure" - our software edits the profile (webhook + countries)
//      - "Create in Telnyx" - opens Telnyx portal for manual creation
//   4. Validates that the selected number can SMS all target countries

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Phone, Plus, AlertCircle, CheckCircle, RefreshCw, MessageSquare,
  Globe, X, Settings, AlertTriangle, ExternalLink, Loader2, Shield,
  Wifi, ShieldCheck, Mail, Building2
} from 'lucide-react';
import { playSoftTap, playElegantError } from '../utils/audio';
import {
  listTelnyxAccounts,
  listTelnyxNumbersWithStatus,
  TelnyxPhoneNumberWithStatus,
  checkProfileEligibility,
  checkDestinationEligibility,
  DestinationIssue,
  DestinationEligibilityResult,
  getTelnyxPortalUrl,
  getTelnyxConnectionStatus,
  TelnyxConnectionStatus,
} from '../lib/pipelineClient';
import SmsDestinationResults from './SmsDestinationResults';

interface SmsAccountStepProps {
  ownerKey: string;
  userPlan?: string;             // e.g. 'Free Plan', 'Starter Plan'
  // How to route: 'auto' = Lunao shared sender (Free/Starter),
  //               'byo' = user connects their own Telnyx account (Growth+)
  mode?: 'auto' | 'byo';
  selectedPhoneNumber: string | null;
  onSelectPhone: (phoneNumber: string, accountId: string, profileId: string | null) => void;
  onAccountsChange?: () => void;
  // Countries to check eligibility against (extracted from CSV leads)
  targetCountries?: string[];
}

interface TelnyxAccount {
  id: string;
  account_email: string;
  account_label: string;
  total_numbers: number;
  status: 'active' | 'needs_reconnect' | 'revoked';
  expires_at: number | null;
}

interface NumberWithEligibility extends TelnyxPhoneNumberWithStatus {
  accountId?: string;
  accountEmail?: string;
  eligibilityCheck?: {
    canSend: boolean;
    webhookCorrect: boolean;
    countriesSupported: string[];
    countriesMissing: string[];
    needsSetup: boolean;
    reason: string;
  };
  isCheckingEligibility?: boolean;
}

// Profile selection modal for numbers that have a profile but need configuration
interface ProfileConfigModal {
  accountId: string;
  accountEmail: string;
  phoneNumber: string;
  profileId: string;
  profileName: string;
  missingCountries: string[];
  webhookCorrect: boolean;
  currentWebhookUrl: string | null;
  neededWebhookUrl: string;
}

export const SmsAccountStep: React.FC<SmsAccountStepProps> = ({
  ownerKey,
  userPlan,
  mode = 'byo',
  selectedPhoneNumber,
  onSelectPhone,
  onAccountsChange,
  targetCountries = [],
}) => {
  const [accounts, setAccounts] = useState<TelnyxAccount[]>([]);
  const [numbersWithEligibility, setNumbersWithEligibility] = useState<NumberWithEligibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [oauthPopup, setOauthPopup] = useState<Window | null>(null);

  // Authoritative connection status snapshot from /api/telnyx/connection-status.
  // Drives the 1st-paint UI decision — empty / connected / expired / loading —
  // so the user never sees a stale "Buy one" CTA flash while we're still
  // probing their token. The boolean `isLoading` covers the in-flight window;
  // the snapshot populates once the probe returns.
  const [status, setStatus] = useState<TelnyxConnectionStatus | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState<boolean>(true);

  // Profile configuration modal
  const [configModal, setConfigModal] = useState<ProfileConfigModal | null>(null);

  // Smart destination matrix state
  const [destinationReport, setDestinationReport] = useState<DestinationEligibilityResult | null>(null);
  const [isCheckingDestinations, setIsCheckingDestinations] = useState(false);

  // ---- Connection status probe (single round-trip aggregate) ----
  // The wizard's first paint should already know:
  //   - is the user connected at all?
  //   - is the token currently valid?
  //   - do they have numbers on file?
  // Doing this in one fetch (and rendering a skeleton while we wait)
  // replaces the previous three-step waterfall that flashed between
  // empty-states before settling on the real UI.
  const refreshStatus = useCallback(async () => {
    setIsStatusLoading(true);
    try {
      const s = await getTelnyxConnectionStatus(ownerKey);
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setIsStatusLoading(false);
    }
  }, [ownerKey]);

  // Initial mount + on ownerKey change
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // =======================================================================
  // AUTOMATED MODE — Free / Starter plans
  // The user sees Lunao's shared Canadian sender card. No OAuth, no number
  // picker, no "buy in Telnyx". They proceed directly to Step 5.
  // =======================================================================
  if (mode === 'auto') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-serif text-ink">Lunao handles delivery</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Your plan includes Lunao's verified Canadian sender — no setup required.
          </p>
        </div>

        {/* Shared sender badge */}
        <div className="bg-white border border-border-main rounded-xl p-5 flex items-center gap-4">
          <div className="relative w-12 h-12 rounded-xl bg-success-soft flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-success" />
            <span className="absolute inset-0 rounded-xl bg-success/15 animate-ping" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink">Lunao shared sender ready</p>
            <p className="text-xs text-ink-secondary mt-0.5">
              {status?.senderNumber
                ? <>From <span className="font-mono font-semibold text-ink">{status.senderNumber}</span> · Verified Canadian number</>
                : 'Canadian sender · Auto-assigned at launch'}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-success-soft text-success border border-success/30">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Live
          </span>
        </div>

        {/* Confirmation note */}
        <div className="bg-off-white border border-border-main rounded-xl p-4">
          <p className="text-xs text-ink-secondary leading-relaxed">
            <span className="font-semibold text-ink">All set.</span> Lunao will automatically route your SMS through its Canadian sender number. You don't need to connect a Telnyx account — it's already configured for your plan.
          </p>
          {userPlan && (
            <p className="text-[11px] text-ink-tertiary mt-2">
              Plan: <span className="font-semibold text-ink">{userPlan}</span> · SMS available in Canada only
            </p>
          )}
        </div>

        {/* Upgrade nudge — subtle */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-900 mb-0.5">Want to use your own Telnyx account?</p>
          <p className="text-[11px] text-blue-800/80 leading-relaxed">
            Upgrade to Growth, Pro, or Agency to connect your own Telnyx account, send from your own number, and unlock SMS to any country worldwide.
          </p>
        </div>
      </div>
    );
  }

  // =======================================================================
  // BRING-YOUR-OWN (Growth / Pro / Agency) — existing full flow below
  // =======================================================================

  // Load connected accounts AND their numbers
  const loadAccounts = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    console.log('[SmsAccountStep] Loading Telnyx accounts...');
    try {
      const accs = await listTelnyxAccounts(ownerKey);
      console.log('[SmsAccountStep] Got accounts:', accs);
      const activeAccs = accs.filter((a: TelnyxAccount) => a.status === 'active');
      const needsReconnectAccs = accs.filter((a: TelnyxAccount) => a.status !== 'active');

      // Show ALL accounts (active + needs_reconnect). The render will show
      // a reconnect card for any that aren't active.
      setAccounts(accs);

      if (activeAccs.length === 0) {
        // No active accounts. The render will show the auth card.
        setNumbersWithEligibility([]);
        return;
      }

      // Load numbers for each ACTIVE account.
      // If a per-account call 401s, that account becomes "needs_reconnect"
      // and we don't include its numbers.
      const allNumbers: NumberWithEligibility[] = [];
      let anyExpired = false;
      for (const acc of activeAccs) {
        try {
          const numbers = await listTelnyxNumbersWithStatus(acc.id, ownerKey);
          for (const num of numbers) {
            allNumbers.push({
              ...num,
              accountId: acc.id,
              accountEmail: acc.account_email,
            });
          }
        } catch (err: any) {
          console.error('[SmsAccountStep] Failed to load numbers for account', acc.id, err);
          const msg = String(err?.message || '');
          if (msg.includes('expired') || msg.includes('revoked') || msg.includes('401')) {
            anyExpired = true;
          }
        }
      }

      // If any account 401'd, refresh the account list to pick up the
      // status flip the backend already made (needs_reconnect).
      if (anyExpired) {
        try {
          const fresh = await listTelnyxAccounts(ownerKey);
          setAccounts(fresh);
        } catch (_) { /* swallow */ }
      }

      setNumbersWithEligibility(allNumbers);

      // Refresh the high-level status snapshot so the parent UI re-evaluates
      // its loading skeletons (e.g. when a number appears or auth flips).
      try {
        const fresh = await getTelnyxConnectionStatus(ownerKey);
        setStatus(fresh);
      } catch {
        /* ignore */
      }

      // Check eligibility for numbers with profiles
      if (targetCountries.length > 0 && allNumbers.length > 0) {
        checkEligibilityForNumbers(allNumbers);
      }
    } catch (err) {
      console.error('[SmsAccountStep] Failed to load accounts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [ownerKey, targetCountries.join(',')]);

  // Check eligibility for all numbers that have a messaging profile
  const checkEligibilityForNumbers = useCallback(async (numbers: NumberWithEligibility[]) => {
    const numbersWithProfiles = numbers.filter(n => n.profileId && n.canSend);
    if (numbersWithProfiles.length === 0) return;

    setIsCheckingEligibility(true);
    console.log('[SmsAccountStep] Checking eligibility for', numbersWithProfiles.length, 'numbers...');

    // Check each number's profile eligibility
    const updatedNumbers = [...numbersWithEligibility];
    
    for (const num of numbersWithProfiles) {
      // Mark as checking
      const idx = updatedNumbers.findIndex(n => n.number === num.number && n.accountId === num.accountId);
      if (idx >= 0) {
        updatedNumbers[idx] = { ...updatedNumbers[idx], isCheckingEligibility: true };
        setNumbersWithEligibility([...updatedNumbers]);
      }

      try {
        const result = await checkProfileEligibility(
          num.accountId,
          num.profileId!,
          targetCountries,
          ownerKey
        );

        const idx2 = updatedNumbers.findIndex(n => n.number === num.number && n.accountId === num.accountId);
        if (idx2 >= 0) {
          const webhookCorrect = result?.webhookCheck?.correct ?? false;
          const missingCountries = result?.countryCheck?.unsupported ?? [];
          
          updatedNumbers[idx2] = {
            ...updatedNumbers[idx2],
            isCheckingEligibility: false,
            eligibilityCheck: {
              canSend: result?.needsSetup === false && webhookCorrect,
              webhookCorrect,
              countriesSupported: result?.countryCheck?.supported ?? [],
              countriesMissing: missingCountries,
              needsSetup: result?.needsSetup ?? !num.profileId,
              reason: !num.profileId 
                ? 'No messaging profile assigned'
                : missingCountries.length > 0 
                  ? `Missing SMS support for: ${missingCountries.join(', ')}`
                  : !webhookCorrect 
                    ? 'Webhook URL not configured for Lunao'
                    : 'Ready to send SMS',
            },
          };
          setNumbersWithEligibility([...updatedNumbers]);
        }
      } catch (err) {
        console.error('[SmsAccountStep] Eligibility check failed for', num.number, err);
        const idx3 = updatedNumbers.findIndex(n => n.number === num.number && n.accountId === num.accountId);
        if (idx3 >= 0) {
          updatedNumbers[idx3] = {
            ...updatedNumbers[idx3],
            isCheckingEligibility: false,
            eligibilityCheck: {
              canSend: false,
              webhookCorrect: false,
              countriesSupported: [],
              countriesMissing: targetCountries,
              needsSetup: true,
              reason: 'Failed to check eligibility',
            },
          };
          setNumbersWithEligibility([...updatedNumbers]);
        }
      }
    }

    setIsCheckingEligibility(false);
  }, [ownerKey, targetCountries.join(','), numbersWithEligibility]);

  // Load on mount
  useEffect(() => {
    setIsLoading(true);
    loadAccounts(false);
  }, []);

  // Re-check eligibility when countries change
  useEffect(() => {
    if (targetCountries.length > 0 && numbersWithEligibility.length > 0) {
      const numbersWithProfiles = numbersWithEligibility.filter(n => n.profileId && n.canSend);
      if (numbersWithProfiles.length > 0) {
        checkEligibilityForNumbers(numbersWithProfiles);
      }
    }
  }, [targetCountries.join(',')]);

  // Poll OAuth popup closure
  useEffect(() => {
    if (!oauthPopup) return;
    const poll = setInterval(() => {
      if (oauthPopup.closed) {
        clearInterval(poll);
        setOauthPopup(null);
        setIsConnecting(false);
        loadAccounts();
        refreshStatus();
        onAccountsChange?.();
      }
    }, 300);
    return () => clearInterval(poll);
  }, [oauthPopup, loadAccounts, refreshStatus, onAccountsChange]);

  // Listen for postMessage from OAuth callback
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'lunao:telnyx-oauth-result') {
        console.log('[telnyx] OAuth result received:', event.data);
        if (event.data.status === 'ok') {
          loadAccounts();
          refreshStatus();
          onAccountsChange?.();
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadAccounts, refreshStatus, onAccountsChange]);

  // Handle phone number selection
  const handleSelectPhone = (num: NumberWithEligibility) => {
    // BLOCK selection if no profile assigned
    if (!num.profileId) {
      playElegantError();
      return;
    }
    
    // BLOCK selection if eligibility check shows it can't send
    const eligibility = num.eligibilityCheck;
    if (eligibility && !eligibility.canSend) {
      playElegantError();
      // Show the specific error reason prominently - don't allow selection
      return;
    }

    // Only allow fully eligible numbers
    playSoftTap();
    onSelectPhone(num.number, num.accountId, num.profileId);
  };

  // ---- Run the destination diagnostic ----
  // Called when the user opens "Fix Now" or clicks "Re-check".
  // Hits /api/telnyx/destination-eligibility which queries Telnyx
  // and returns a flat list of issues (errors) with Fix-in-Telnyx CTAs.
  // NO auto-configuration — user must fix in Telnyx portal.
  const runDestinationCheck = async (
    accountId: string,
    phoneNumber: string,
    _profileId: string,
  ) => {
    if (!accountId || !phoneNumber) return;
    setIsCheckingDestinations(true);
    try {
      const countries = (targetCountries && targetCountries.length > 0)
        ? targetCountries
        : ['US', 'CA', 'GB']; // sensible default if CSV has no country column
      const report = await checkDestinationEligibility(
        accountId,
        phoneNumber,
        countries,
        ownerKey
      );
      setDestinationReport(report);
    } catch (err: any) {
      console.error('[destination-check] failed:', err);
    } finally {
      setIsCheckingDestinations(false);
    }
  };

  // Handle Connect Telnyx button
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const ownerKeyParam = encodeURIComponent(ownerKey);
      const res = await fetch(`/api/telnyx/oauth/url?ownerKey=${ownerKeyParam}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        playElegantError();
        alert(err.error || 'Failed to start Telnyx OAuth');
        setIsConnecting(false);
        return;
      }
      const { url } = await res.json();

      const popup = window.open(
        url,
        'telnyx-oauth',
        'width=560,height=720,menubar=no,toolbar=no,location=no'
      );

      if (popup) {
        setOauthPopup(popup);
        popup.focus();
      } else {
        playElegantError();
        alert('Please allow popups for this site to connect your Telnyx account.');
        setIsConnecting(false);
      }
    } catch (err) {
      playElegantError();
      setIsConnecting(false);
    }
  };

  // Open Telnyx portal for manual messaging profile creation
  const handleOpenTelnyxPortal = async () => {
    const urls = await getTelnyxPortalUrl(ownerKey);
    if (urls?.portalUrl) {
      window.open(urls.portalUrl, '_blank');
    }
  };

  // Categorize numbers by status
  const { readyNumbers, needsConfigNumbers, noProfileNumbers } = useMemo(() => {
    const ready: NumberWithEligibility[] = [];
    const needsConfig: NumberWithEligibility[] = [];
    const noProfile: NumberWithEligibility[] = [];

    for (const num of numbersWithEligibility) {
      if (!num.profileId) {
        noProfile.push(num);
      } else if (num.eligibilityCheck?.needsSetup === false && num.eligibilityCheck?.webhookCorrect) {
        ready.push(num);
      } else {
        needsConfig.push(num);
      }
    }

    return { readyNumbers: ready, needsConfigNumbers: needsConfig, noProfileNumbers: noProfile };
  }, [numbersWithEligibility]);

  // ===================== RENDER STATE MACHINE =====================
  // The flow now opens with an authoritative status snapshot from
  // /api/telnyx/connection-status. While that returns, the user sees
  // a clean skeleton — never a "Buy one" flash.
  //
  //   A. isStatusLoading  →  shimmer skeleton
  //   B. !connected       →  big "Connect Telnyx" CTA (smooth fade-in)
  //   C. connected, but every account expired/needs reconnect
  //                       →  dedicated reconnect CTA, not a buy-number CTA
  //   D. connected + valid token + 0 numbers
  //                       →  "Connected as … — buy your first number" with
  //                          a green connection badge so the user sees their
  //                          integration is healthy.
  //   E. connected + valid token + numbers
  //                       →  full picker (existing behaviour)

  // ---- A. Loading skeleton ----
  // We render for at least ~250ms so the skeleton is perceptible — anything
  // shorter than that reads as a flicker, not a state. A minimal "min
  // visible time" pattern.
  if (isStatusLoading || (status === null && !accounts.length)) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-serif text-ink">Select Phone Number</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Validating your Telnyx connection…
          </p>
        </div>

        {/* Connection status skeleton row */}
        <div className="bg-white border border-border-main rounded-xl p-5 overflow-hidden">
          <div className="flex items-center gap-4 animate-pulse">
            <div className="w-12 h-12 rounded-xl bg-off-white" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 bg-off-white rounded" />
              <div className="h-2 w-56 bg-off-white rounded opacity-70" />
            </div>
            <div className="h-6 w-24 bg-off-white rounded-full" />
          </div>
        </div>

        {/* Number-list skeleton */}
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-white border border-border-main rounded-xl p-4 flex items-center gap-3 overflow-hidden animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-off-white shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 bg-off-white rounded" />
                <div className="h-2 w-48 bg-off-white rounded opacity-70" />
              </div>
              <div className="h-7 w-20 bg-off-white rounded-full" />
            </div>
          ))}
          <p className="text-[11px] text-ink-tertiary text-center pt-1">
            <Loader2 className="w-3 h-3 inline-block mr-1 align-[-2px] animate-spin" />
            Probing Telnyx for active connections and phone numbers…
          </p>
        </div>
      </div>
    );
  }

  // ---- B. Not connected at all ----
  if (!status?.connected) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-serif text-ink">Connect Telnyx</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Connect your Telnyx account to send SMS campaigns
          </p>
        </div>

        <div className="bg-white border-2 border-dashed border-border-main rounded-2xl p-6 sm:p-10 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-blue-100 flex items-center justify-center">
            <Building2 className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
          </div>
          <p className="text-base font-bold text-ink mb-1">Connect your Telnyx account</p>
          <p className="text-xs text-ink-secondary mb-6 max-w-md mx-auto leading-relaxed">
            Lunao uses Telnyx to deliver SMS. Click below to authorize — it takes 30 seconds and Lunao never sees your password.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full sm:w-auto justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg flex items-center gap-2 mx-auto disabled:opacity-50 transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            {isConnecting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Opening Telnyx…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Connect with Telnyx
              </>
            )}
          </button>
          <p className="text-[10px] text-ink-tertiary mt-4 uppercase tracking-wider">
            <Wifi className="w-3 h-3 inline-block mr-1 align-[-2px]" />
            Read-only · Revoke anytime
          </p>
        </div>
      </div>
    );
  }

  // ---- C. Connected but the token is no longer valid (every account expired/revoked) ----
  if (
    status.connected &&
    !status.hasValidToken &&
    status.accountsActive === 0 &&
    status.accountsNeedReconnect > 0
  ) {
    const reconnectAccts = accounts.filter((a) => a.status !== 'active');
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-serif text-ink">Reconnect Telnyx</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            Your access expired. One click to refresh — keeps your numbers intact.
          </p>
        </div>

        {reconnectAccts.length === 0 && status.primaryAccount ? (
          // Fallback when the row collection hasn't been hydrated yet but
          // the status snapshot already says we need reconnect.
          <div className="bg-white border-2 border-warn/40 rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-warn-soft flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-warn" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink truncate">{status.primaryAccount.email}</p>
                <p className="text-xs text-ink-secondary mt-1">
                  We couldn't validate your access token. Reconnect to refresh it.
                </p>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full sm:w-auto justify-center px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
              >
                {isConnecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Reconnect
              </button>
            </div>
          </div>
        ) : (
          reconnectAccts.map((acc) => (
            <div key={acc.id} className="bg-white border-2 border-warn/40 rounded-xl p-4 sm:p-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-warn-soft flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-warn" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink truncate">{acc.account_email}</p>
                  <p className="text-xs text-ink-secondary mt-1">
                    {acc.status === 'revoked'
                      ? "You revoked Lunao's access. Reconnect to continue."
                      : 'Your access token expired. Reconnect to refresh it.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="w-full sm:w-auto justify-center px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
                >
                  {isConnecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Reconnect
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // ---- D. Connected & valid token, but no numbers yet ----
  // The user has authorized Lunao, their token is live, but they haven't
  // bought/ported a phone number in Telnyx yet. Show a confident,
  // on-brand "buy your first number" CTA — not the previous "weird empty
  // list" flash.
  if (
    status.connected &&
    status.hasValidToken &&
    status.numbersTotal === 0 &&
    readyNumbers.length === 0 &&
    needsConfigNumbers.length === 0 &&
    noProfileNumbers.length === 0 &&
    !isLoading
  ) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Live connection badge */}
        <div className="bg-white border border-border-main rounded-xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
          <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-success-soft flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-success" />
            {/* green pulse ring */}
            <span className="absolute inset-0 rounded-xl bg-success/15 animate-ping" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink">Connected to Telnyx</p>
            <p className="text-xs text-ink-secondary mt-0.5 truncate">
              {status.primaryAccount?.email ? (
                <>
                  Signed in as <span className="font-semibold text-ink">{status.primaryAccount.email}</span>
                </>
              ) : (
                'Token verified'
              )}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-success-soft text-success border border-success/30">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Live
          </span>
        </div>

        {/* Buy your first number — premium CTA */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-100 rounded-2xl p-6 sm:p-10 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-5 rounded-2xl bg-white border border-blue-100 flex items-center justify-center shadow-sm">
            <Phone className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
          </div>
          <p className="text-base font-bold text-ink mb-1">Buy your first number</p>
          <p className="text-xs text-ink-secondary mb-6 max-w-md mx-auto leading-relaxed">
            Pick a number with the country area code your customers dial. SMS-eligible numbers start at <span className="font-semibold text-ink">$1/mo</span>. It takes about a minute in Telnyx Mission Control.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2">
            <a
              href="https://portal.telnyx.com/#/app/numbers/buy"
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              Buy a number in Telnyx
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
            <button
              type="button"
              onClick={() => {
                refreshStatus();
                loadAccounts(true);
              }}
              disabled={isStatusLoading || isLoading}
              className="w-full sm:w-auto justify-center px-5 py-3 bg-white hover:bg-off-white border border-border-main text-ink text-xs font-semibold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isStatusLoading || isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              I just bought one — sync
            </button>
          </div>
          <p className="text-[10px] text-ink-tertiary mt-5 uppercase tracking-wider">
            <Mail className="w-3 h-3 inline-block mr-1 align-[-2px]" />
            Or port an existing number · Free on annual plans
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Live connection badge — top-level reassurance that Lunao is
          currently authenticated against Telnyx. Token expiry surfaces
          here so the user sees it before they pick a number. */}
      <div className="bg-white border border-border-main rounded-xl p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4">
        <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-success-soft flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-success" />
          <span className="absolute inset-0 rounded-xl bg-success/15 animate-ping" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-ink">Connected to Telnyx</p>
          <p className="text-[11px] text-ink-secondary mt-0.5 truncate">
            {status?.primaryAccount?.email ? (
              <>
                Signed in as <span className="font-semibold text-ink">{status.primaryAccount.email}</span>
                {status.primaryAccount?.expiresInSec != null && status.primaryAccount.expiresInSec > 0 && (
                  <>
                    {' · '}
                    <span className="text-ink-tertiary">
                      Token refreshes in {Math.floor(status.primaryAccount.expiresInSec / 60)} min
                    </span>
                  </>
                )}
              </>
            ) : (
              'Token verified'
            )}
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-success-soft text-success border border-success/30">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          Live
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-serif text-ink">Select Phone Number</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            {targetCountries.length > 0
              ? `Checking SMS eligibility for ${targetCountries.length} country destination(s)`
              : 'Choose a phone number for your SMS campaign'
            }
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isCheckingEligibility && (
            <span className="text-xs text-ink-secondary flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking...
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              refreshStatus();
              loadAccounts(true);
            }}
            disabled={isLoading || isStatusLoading}
            className="px-3 py-2 border border-blue-200 hover:bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {isLoading || isStatusLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync
          </button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="text-ink-secondary">{readyNumbers.length} ready</span>
        </div>
        {needsConfigNumbers.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-ink-secondary">{needsConfigNumbers.length} need setup</span>
          </div>
        )}
        {noProfileNumbers.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-danger" />
            <span className="text-ink-secondary">{noProfileNumbers.length} no profile</span>
          </div>
        )}
      </div>

      {/* No numbers at all — empty state fallback (only shown if State D's
          early-return was somehow bypassed). State D above is the canonical
          "Buy your first number" CTA; this is a defensive fallback. */}
      {readyNumbers.length === 0 && needsConfigNumbers.length === 0 && noProfileNumbers.length === 0 && !isLoading && (
        <div className="bg-white border-2 border-dashed border-border-main rounded-xl p-6 sm:p-12 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-2xl bg-blue-100 flex items-center justify-center">
            <MessageSquare className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
          </div>
          <p className="text-base font-bold text-ink mb-2">No phone numbers yet</p>
          <p className="text-xs text-ink-secondary mb-6 max-w-md mx-auto">
            Buy or port a phone number in Telnyx Mission Control, then click Sync. Numbers must be assigned to a messaging profile.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2">
            <a
              href="https://portal.telnyx.com/#/app/numbers/buy"
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto justify-center px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Buy a number in Telnyx
            </a>
            <button
              type="button"
              onClick={() => {
                refreshStatus();
                loadAccounts(true);
              }}
              disabled={isLoading || isStatusLoading}
              className="w-full sm:w-auto justify-center px-5 py-2 bg-white hover:bg-off-white border border-border-main text-ink text-xs font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isLoading || isStatusLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync
            </button>
          </div>
        </div>
      )}

      {/* Ready Numbers */}
      {readyNumbers.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-success uppercase tracking-wider flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Ready to Send SMS
          </p>
          {readyNumbers.map((num) => {
            const isSelected = selectedPhoneNumber === num.number;
            return (
              <button
                key={`${num.accountId}-${num.number}`}
                type="button"
                onClick={() => handleSelectPhone(num)}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-3 ${
                  isSelected
                    ? 'border-accent bg-accent-soft'
                    : 'border-border-main hover:border-success/50 bg-white'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-accent text-white' : 'bg-success-soft text-success'
                }`}>
                  {isSelected ? <CheckCircle className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-ink">{num.number}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-success-soft text-success border border-success/20 font-bold">
                      <CheckCircle className="w-3 h-3" /> Ready
                    </span>
                  </div>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Profile: <span className="font-semibold text-ink">{num.profileName || 'Default'}</span>
                    {num.eligibilityCheck?.countriesSupported?.length > 0 && (
                      <span className="ml-2 text-success">
                        ✓ {num.eligibilityCheck.countriesSupported.length} countries
                      </span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Numbers Needing Configuration - CANNOT BE USED */}
      {needsConfigNumbers.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-danger uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Cannot Use — Needs Fixing
          </p>
          <div className="bg-danger-soft border-2 border-danger/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-danger">These numbers cannot send SMS until fixed</p>
                <p className="text-xs text-ink-secondary mt-1">
                  Each has a messaging profile but needs configuration. Click "Fix Now" to auto-configure — we'll set the webhook URL and add missing country destinations.
                </p>
              </div>
            </div>
          </div>
          {needsConfigNumbers.map((num) => {
            const eligibility = num.eligibilityCheck;
            // Build the specific error message
            const errorMessages: string[] = [];
            if (!eligibility?.webhookCorrect) {
              errorMessages.push('Webhook URL not set to Lunao');
            }
            if (eligibility?.countriesMissing?.length) {
              errorMessages.push(`Missing SMS support for: ${eligibility.countriesMissing.join(', ')}`);
            }
            const errorText = errorMessages.length > 0 
              ? errorMessages.join(' • ') 
              : 'Messaging profile needs configuration';
            
            return (
              <div
                key={`${num.accountId}-${num.number}`}
                className="w-full p-4 rounded-xl border-2 border-danger/30 bg-danger-soft/30 flex items-start gap-3"
              >
                <div className="w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center shrink-0">
                  {num.isCheckingEligibility ? (
                    <Loader2 className="w-6 h-6 text-danger animate-spin" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-danger" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-ink">{num.number}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20 font-bold">
                      <AlertCircle className="w-3 h-3" /> Cannot Use
                    </span>
                  </div>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Profile: <span className="font-semibold text-ink">{num.profileName || 'Default'}</span>
                  </p>
                  <p className="text-xs text-danger font-semibold mt-1">
                    ⚠️ {errorText}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Open the smart destination matrix modal. This calls
                    // Telnyx first to learn the number's actual capabilities,
                    // then tells the user exactly what's fixable vs blocked.
                    setConfigModal({
                      accountId: num.accountId || '',
                      accountEmail: num.accountEmail || '',
                      phoneNumber: num.number,
                      profileId: num.profileId || '',
                      profileName: num.profileName || 'Unnamed Profile',
                      missingCountries: eligibility?.countriesMissing || [],
                      webhookCorrect: eligibility?.webhookCorrect || false,
                      currentWebhookUrl: null,
                      neededWebhookUrl: 'https://your-app.com/api/webhooks/telnyx',
                    });
                    runDestinationCheck(num.accountId || '', num.number, num.profileId || '');
                    playSoftTap();
                  }}
                  className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-lg flex items-center gap-1 shrink-0 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  Fix Now
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Numbers Without Messaging Profile */}
      {noProfileNumbers.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-danger uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Cannot Send — No Messaging Profile
          </p>
          <div className="bg-danger-soft border-2 border-danger/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-danger">These numbers need a messaging profile</p>
                <p className="text-xs text-ink-secondary mt-1">
                  Create a messaging profile in Telnyx and assign these numbers to it. Our software will then auto-configure the webhooks.
                </p>
                <button
                  type="button"
                  onClick={handleOpenTelnyxPortal}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Telnyx to Create Profile
                </button>
              </div>
            </div>
          </div>
          {noProfileNumbers.map((num) => (
            <div
              key={`${num.accountId}-${num.number}`}
              className="w-full p-4 rounded-xl border-2 border-danger/20 bg-white flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-danger-soft flex items-center justify-center shrink-0">
                <Phone className="w-6 h-6 text-danger" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-ink">{num.number}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-danger-soft text-danger border border-danger/20 font-bold">
                    <AlertCircle className="w-3 h-3" /> No Profile
                  </span>
                </div>
                <p className="text-xs text-danger mt-0.5 font-medium">
                  ⚠️ Must create a messaging profile in Telnyx first
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenTelnyxPortal}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Create
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Profile Configuration Modal */}
      {configModal && (
        <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white border border-border-main rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-border-light flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-ink">Fix in Telnyx</h3>
                  <p className="text-xs text-ink-secondary">
                    {configModal.phoneNumber} — {configModal.profileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isCheckingDestinations) return;
                  setConfigModal(null);
                  setDestinationReport(null);
                }}
                className="p-2 hover:bg-off-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-ink-secondary" />
              </button>
            </div>

            {/* Body (scrollable) */}
            <div className="p-5 overflow-y-auto flex-1">
              <SmsDestinationResults
                issues={destinationReport?.issues || []}
                overallStatus={destinationReport?.overallStatus || 'blocked'}
                phoneNumber={destinationReport?.phoneNumber}
                profile={destinationReport?.profile}
                numberType={destinationReport?.numberType}
                numberCountry={destinationReport?.numberCountry}
                targetCountries={destinationReport?.targetCountries}
                expectedWebhookUrl={destinationReport?.expectedWebhookUrl}
                isLoading={isCheckingDestinations}
                onRecheck={() => runDestinationCheck(
                  configModal.accountId,
                  configModal.phoneNumber,
                  configModal.profileId,
                )}
              />
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border-light bg-off-white flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenTelnyxPortal}
                className="px-4 py-2 border border-blue-200 hover:bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold transition-all flex items-center gap-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Telnyx Portal
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => {
                  setConfigModal(null);
                  setDestinationReport(null);
                }}
                disabled={isCheckingDestinations}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmsAccountStep;
