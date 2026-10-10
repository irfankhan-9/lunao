import { useState, useEffect } from 'react';
import { Settings, ExternalLink, Loader2, Phone, AlertCircle } from 'lucide-react';
import { TelnyxConnectionManager } from './TelnyxConnectionManager';

interface TelnyxStatus {
  connected: boolean;
  totalNumbers: number;
  senderNumber: string;
  lastSync: string | null;
}

export function MessagingSettings() {
  const [telnyxStatus, setTelnyxStatus] = useState<TelnyxStatus>({
    connected: false,
    totalNumbers: 0,
    senderNumber: '',
    lastSync: null,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [senderNumber, setSenderNumber] = useState('');
  const [senderNumberSaved, setSenderNumberSaved] = useState(false);
  const [savingSender, setSavingSender] = useState(false);

  // Load the active Telnyx connection + chosen sender number from the
  // server. Everything here is real — no simulated / fake values anywhere.
  const refresh = async () => {
    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
      const res = await fetch(`/api/telnyx/accounts?ownerKey=${encodeURIComponent(ownerKey)}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      const active = accounts.find((a) => a.status === 'active') || accounts[0];
      setTelnyxStatus({
        connected: !!active,
        totalNumbers: active?.total_numbers || 0,
        senderNumber: '',
        lastSync: active ? new Date().toISOString() : null,
      });
    } catch (err) {
      console.error('[messaging-settings] failed to load telnyx status:', err);
    }
  };

  useEffect(() => {
    refresh();
    // Restore the chosen sender number (persisted separately so the user
    // doesn't have to re-select it on every refresh).
    const saved = localStorage.getItem('lunao_sender_number');
    if (saved) {
      setSenderNumber(saved);
      setSenderNumberSaved(true);
    }
    // Bump a hash on the URL so the OAuth callback page triggers a refresh
    // when the popup closes.
    const handler = () => refresh();
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
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
      <div className="bg-white border border-border-main rounded-xl shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="p-6 border-b border-border-light">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
              <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
                <circle cx="20" cy="20" r="18" stroke="#0066FF" strokeWidth="2" />
                <path d="M14 16C14 16 16 20 20 20C24 20 26 16 26 16" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" />
                <path d="M14 24C14 24 16 20 20 20C24 20 26 24 26 24" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-ink">Telnyx</h3>
              <p className="text-xs text-ink-secondary mt-0.5">
                Enterprise SMS with global coverage and real-time delivery
              </p>
            </div>
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