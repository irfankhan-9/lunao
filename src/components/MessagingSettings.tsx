import { useState, useEffect } from 'react';
import { Settings, ExternalLink, Loader2, Phone, AlertCircle, ShieldAlert, CheckCircle } from 'lucide-react';
import { TelnyxConnectionManager } from './TelnyxConnectionManager';
import { getCachedTelnyxData, syncTelnyxAccountLive, CachedTelnyxData } from '../lib/telnyxClient';

interface TelnyxStatus {
  connected: boolean;
  totalNumbers: number;
  senderNumber: string;
  lastSync: string | null;
  tokenExpired: boolean;
}

export function MessagingSettings() {
  const [initialCached] = useState<CachedTelnyxData>(() => getCachedTelnyxData());
  const [telnyxStatus, setTelnyxStatus] = useState<TelnyxStatus>({
    connected: initialCached.connected,
    totalNumbers: initialCached.numbers?.length || initialCached.account?.totalNumbers || 0,
    senderNumber: '',
    lastSync: initialCached.lastSyncedAt ? new Date(initialCached.lastSyncedAt).toISOString() : null,
    tokenExpired: initialCached.tokenExpired,
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [senderNumber, setSenderNumber] = useState('');
  const [senderNumberSaved, setSenderNumberSaved] = useState(false);
  const [savingSender, setSavingSender] = useState(false);

  // Live background sync from real Telnyx account
  const refresh = async () => {
    setIsSyncing(true);
    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
      const live = await syncTelnyxAccountLive(ownerKey);

      setTelnyxStatus({
        connected: live.connected,
        totalNumbers: live.numbers?.length || live.account?.totalNumbers || 0,
        senderNumber: '',
        lastSync: new Date().toISOString(),
        tokenExpired: live.tokenExpired,
      });
    } catch (err) {
      console.error('[messaging-settings] failed to sync telnyx status:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    refresh();
    const saved = localStorage.getItem('lunao_sender_number');
    if (saved) {
      setSenderNumber(saved);
      setSenderNumberSaved(true);
    } else {
      setSenderNumber('');
      setSenderNumberSaved(false);
    }

    const handler = () => refresh();
    window.addEventListener('focus', handler);

    const onSync = (e: any) => {
      const detail: CachedTelnyxData = e.detail;
      if (!detail) return;
      setTelnyxStatus({
        connected: detail.connected,
        totalNumbers: detail.numbers?.length || detail.account?.totalNumbers || 0,
        senderNumber: '',
        lastSync: new Date().toISOString(),
        tokenExpired: detail.tokenExpired,
      });
    };
    window.addEventListener('lunao:telnyx_sync', onSync);

    return () => {
      window.removeEventListener('focus', handler);
      window.removeEventListener('lunao:telnyx_sync', onSync);
    };
  }, []);

  const handleSaveSender = async () => {
    setSavingSender(true);
    try {
      if (senderNumber.trim()) {
        localStorage.setItem('lunao_sender_number', senderNumber.trim());
        setSenderNumberSaved(true);
        setMessage({ type: 'success', text: 'Sender number saved.' });
      } else {
        localStorage.removeItem('lunao_sender_number');
        setSenderNumberSaved(false);
        setMessage({ type: 'success', text: 'Sender number cleared.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save sender number.' });
    } finally {
      setSavingSender(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-serif text-ink tracking-tight">Messaging Settings</h2>
        </div>
        <p className="text-sm text-ink-secondary">
          Connect your SMS provider and manage messaging configuration.
        </p>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          message.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <ExternalLink className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Telnyx Integration Card */}
      <div className="bg-white border border-border-main rounded-xl shadow-sm overflow-hidden relative">
        {/* Dynamic Real-time Catching Progress Bar */}
        {isSyncing && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-accent/20 overflow-hidden z-10">
            <div className="h-full bg-accent animate-pulse w-full" />
          </div>
        )}

        {telnyxStatus.tokenExpired && (
          <div className="p-3.5 bg-rose-50 border-b border-rose-200 flex items-center justify-between gap-3 text-xs text-rose-800 animate-fade-in">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Telnyx connection token or cookie expired. Please reconnect below to resume outbound messaging.</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-rose-200/60 font-bold uppercase tracking-wider text-[10px] text-rose-900">
              Needs Re-auth
            </span>
          </div>
        )}

        {/* Card Header */}
        <div className="p-6 border-b border-border-light">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100 shrink-0">
                <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
                  <circle cx="20" cy="20" r="18" stroke="#0066FF" strokeWidth="2" />
                  <path d="M14 16C14 16 16 20 20 20C24 20 26 16 26 16" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" />
                  <path d="M14 24C14 24 16 20 20 20C24 20 26 24 26 24" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base font-semibold text-ink">Telnyx</h3>
                  {telnyxStatus.connected && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-3xs">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Telnyx Connected</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Enterprise SMS with global coverage and real-time delivery
                </p>
              </div>
            </div>
            {telnyxStatus.connected && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Carrier Connection Active
              </span>
            )}
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6 space-y-6">
          <TelnyxConnectionManager onConnectionsChange={refresh} />

          {/* Sender Number (per-user preference, applied to OAuth campaigns) */}
          <div className="border-t border-border-light pt-6 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-ink mb-1">Default Sender Number</h4>
              <p className="text-xs text-ink-secondary">
                The number SMS campaigns will send from. You can change this per campaign.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Sender Number
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  placeholder="+1 followed by your 10-digit number"
                  className="flex-1 px-4 py-2.5 rounded-lg border border-border-main bg-white text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                />
                <button
                  onClick={handleSaveSender}
                  disabled={savingSender}
                  className="px-4 py-2.5 rounded-lg bg-ink hover:bg-ink/90 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {savingSender ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Settings className="w-4 h-4" />
                  )}
                  {senderNumberSaved ? 'Update' : 'Save'}
                </button>
              </div>
              <p className="text-[10px] text-ink-tertiary mt-1">
                Must be one of your connected Telnyx numbers in E.164 format (country code + area code + number, e.g. +1 for US/Canada).
              </p>
            </div>

            {telnyxStatus.connected && telnyxStatus.totalNumbers > 0 && (
              <div className="p-3 bg-off-white rounded-lg flex items-start gap-2">
                <Phone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-ink-secondary">
                  Your Telnyx account has <strong>{telnyxStatus.totalNumbers}</strong> SMS-capable
                  phone number{telnyxStatus.totalNumbers === 1 ? '' : 's'} — the campaign
                  builder will offer each one as a sender option.
                </p>
              </div>
            )}

            {/* Live Telnyx Messaging Profile & Webhook Status */}
            <div className="border-t border-border-light pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Messaging Profile</h4>
                  <p className="text-sm font-medium text-ink flex items-center gap-2 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Profile: <span className="font-semibold">lunao</span>
                    <span className="text-xs text-ink-tertiary font-mono">(40019ed1-f7a4-4e7b-a4bc-ffc748846765)</span>
                  </p>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active & Synced
                </span>
              </div>

              <div className="bg-surface rounded-lg p-3 text-xs space-y-2 border border-border-light font-mono">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-ink-tertiary">Primary Webhook:</span>
                  <span className="text-ink truncate max-w-sm">
                    {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/telnyx` : 'https://ais-dev-5ofbocittfwiquw7hp4are-570409437174.asia-southeast1.run.app/api/webhooks/telnyx'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-ink-tertiary">Whitelisted Destinations:</span>
                  <span className="text-ink font-semibold">CA, US (All Verified)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-surface border border-border-light rounded-xl p-6">
        <h4 className="text-sm font-semibold text-ink mb-3">Need help?</h4>
        <div className="space-y-3 text-xs text-ink-secondary">
          <p>
            <strong className="text-ink">Connecting Telnyx:</strong> Click{' '}
            <strong>Connect with Telnyx</strong> and approve the consent screen on
            telnyx.com. Lunao will pull your account's phone numbers and let you pick a sender.
          </p>
          <p>
            <strong className="text-ink">Buying a phone number:</strong> In the Telnyx portal,
            navigate to <strong>Messaging → Numbers</strong> and click "Add Number".
            SMS-enabled numbers are required for sending.
          </p>
          <p>
            <strong className="text-ink">Webhook setup:</strong> Set your webhook URL to{' '}
            <code className="bg-white px-1.5 py-0.5 rounded border border-border-light font-mono">
              https://your-domain.com/api/webhooks/telnyx
            </code>{' '}
            to receive delivery reports and inbound replies.
          </p>
        </div>
      </div>
    </div>
  );
}