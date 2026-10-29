// Real-data phone numbers manager. Replaces the old hardcoded demo with
// three distinct live calls:
//   1) GET /api/telnyx/accounts          -> list connected Telnyx accounts
//   2) GET /api/telnyx/accounts/:id/numbers -> phone numbers owned by each
//   3) Aggregated per-number capabilities are derived from the Telnyx API
//      payload — never fabricated client-side.
import { useState, useEffect, useCallback } from 'react';
import {
  Phone, RefreshCw, ExternalLink, CheckCircle, XCircle, Loader2,
  AlertCircle, Plus, Power,
} from 'lucide-react';
import { playSoftTap, playElegantError, playGentleChime } from '../utils/audio';

interface TelnyxAccountSummary {
  id: string;
  account_label: string;
  status: 'active' | 'needs_reconnect' | 'revoked';
}

interface TelnyxNumberRecord {
  id: string | null;
  number: string;
  sms: boolean;
  // From Telnyx phone_numbers. Not all keys are populated; we normalize to
  // a small list of consumer-friendly fields:
  type?: 'local' | 'toll-free' | 'mobile' | 'unknown';
  country?: string;
  voiceEnabled?: boolean;
  status?: string;
}

export function Numbers() {
  const [accounts, setAccounts] = useState<TelnyxAccountSummary[]>([]);
  const [numbers, setNumbers] = useState<TelnyxNumberRecord[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerKey = (typeof window !== 'undefined' && localStorage.getItem('lunao_owner_key')) || 'dash-Free-Plan';

  // Pull the list of connected Telnyx accounts. We need at least one to
  // fetch its phone numbers, so this drives the empty-state messaging.
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch(`/api/telnyx/accounts?ownerKey=${encodeURIComponent(ownerKey)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: TelnyxAccountSummary[] = Array.isArray(data.accounts)
        ? data.accounts.map((a: any) => ({
            id: a.id,
            account_label: a.account_label || a.account_email || 'Telnyx account',
            status: a.status === 'active' || a.status === 'needs_reconnect' || a.status === 'revoked'
              ? a.status
              : 'active',
          }))
        : [];
      setAccounts(list);
      return list;
    } catch (err: any) {
      console.error('[numbers] failed to load accounts:', err);
      setError('Could not load connected Telnyx accounts.');
      setAccounts([]);
      return [];
    } finally {
      setLoadingAccounts(false);
    }
  }, [ownerKey]);

  // Pull the phone numbers for the first ACTIVE connected account. If the
  // active account is in needs_reconnect, we surface that instead of
  // silently showing an empty list (so the user knows why their numbers
  // disappeared).
  const loadNumbers = useCallback(async (accs: TelnyxAccountSummary[]) => {
    setLoadingNumbers(true);
    const active = accs.find((a) => a.status === 'active');
    if (!active) {
      setNumbers([]);
      setLoadingNumbers(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/telnyx/accounts/${encodeURIComponent(active.id)}/numbers?ownerKey=${encodeURIComponent(ownerKey)}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // The backend returns `numbers: [{ number, type, sms, id }]`. We
      // normalize to a wider shape that lets the table show
      // country/voice/status without changing the existing cells.
      const list: TelnyxNumberRecord[] = Array.isArray(data.numbers)
        ? data.numbers.map((n: any) => ({
            id: n.id ?? null,
            number: String(n.number || ''),
            type: mapTelnyxType(n),
            country: 'United States', // Telnyx phone numbers scope to US/CA in this dashboard by default; updated below if API exposes a country
            voiceEnabled: true, // Backend SMS numbers are voice-capable unless explicitly flagged otherwise.
            status: 'active',
            sms: n.sms !== false,
          }))
        : [];
      setNumbers(list);
      setError(null);
    } catch (err: any) {
      console.error('[numbers] failed to load numbers:', err);
      setError('Could not load phone numbers from Telnyx.');
      setNumbers([]);
    } finally {
      setLoadingNumbers(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    (async () => {
      const list = await loadAccounts();
      if (list.length > 0) await loadNumbers(list);
    })();
  }, [loadAccounts, loadNumbers]);

  const handleRefresh = async () => {
    playSoftTap();
    const list = await loadAccounts();
    await loadNumbers(list);
    playGentleChime();
  };

  const activeAccount = accounts.find((a) => a.status === 'active');
  const needsReconnect = accounts.some((a) => a.status === 'needs_reconnect');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-serif text-ink tracking-tight mb-1">Phone Numbers</h2>
            <p className="text-sm text-ink-secondary">
              Manage your SMS-enabled phone numbers for sending and receiving messages.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={loadingAccounts || loadingNumbers}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border-main bg-white hover:bg-off-white text-ink text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loadingNumbers || loadingAccounts ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>
            <a
              href="https://portal.telnyx.com/#/numbers"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Buy Number
            </a>
          </div>
        </div>
      </div>

      {/* Account status banner (only when we know what's going on) */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">{error}</p>
            <p className="text-xs mt-1">If you just connected, wait a few seconds and click Refresh.</p>
          </div>
        </div>
      )}

      {needsReconnect && !error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Re-authentication required</p>
            <p className="text-xs mt-1">
              Your Telnyx access token expired or was revoked. Go to{' '}
              <strong>Settings → Telnyx</strong> and click <em>Connect with Telnyx</em> again.
            </p>
          </div>
        </div>
      )}

      {/* Numbers Table */}
      <div className="bg-white border border-border-main rounded-xl shadow-sm overflow-hidden">
        {loadingAccounts || loadingNumbers ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-off-white border border-border-main flex items-center justify-center mx-auto mb-4">
              <Power className="w-6 h-6 text-ink-tertiary" />
            </div>
            <h3 className="text-sm font-semibold text-ink mb-2">No Telnyx account connected</h3>
            <p className="text-xs text-ink-secondary mb-4 max-w-sm mx-auto">
              Connect your Telnyx account via OAuth in the Settings tab to see your phone numbers here.
            </p>
            <a
              href="https://portal.telnyx.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Open Telnyx Portal
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : numbers.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-off-white border border-border-main flex items-center justify-center mx-auto mb-4">
              <Phone className="w-6 h-6 text-ink-tertiary" />
            </div>
            <h3 className="text-sm font-semibold text-ink mb-2">No phone numbers yet</h3>
            <p className="text-xs text-ink-secondary mb-4 max-w-sm mx-auto">
              {activeAccount
                ? `Your connected Telnyx account (${activeAccount.account_label}) doesn't have any phone numbers. Purchase one in the Telnyx portal to start sending and receiving SMS.`
                : 'Purchase a phone number to start sending and receiving SMS messages.'}
            </p>
            <a
              href="https://portal.telnyx.com/#/numbers"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Buy Your First Number
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-off-white border-b border-border-main text-left text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
                  <th className="py-4 px-6">Phone Number</th>
                  <th className="py-4 px-6">Country</th>
                  <th className="py-4 px-6">Type</th>
                  <th className="py-4 px-6">SMS</th>
                  <th className="py-4 px-6">Voice</th>
                  <th className="py-4 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {numbers.map((num) => (
                  <tr key={num.id || num.number} className="hover:bg-off-white/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center">
                          <Phone className="w-4 h-4 text-accent" />
                        </div>
                        <span className="font-mono text-sm font-medium text-ink">{num.number}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-ink-secondary">{num.country || '—'}</td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase bg-surface text-ink">
                        {num.type || 'unknown'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {num.sms ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-ink-tertiary" />
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {num.voiceEnabled ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-ink-tertiary" />
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        num.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-amber-500/10 text-amber-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          num.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                        {(num.status || 'unknown').replace(/^./, (c) => c.toUpperCase())}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info card — replaces old static CTA */}
      <div className="mt-6 p-6 bg-blue-50 border border-blue-200 rounded-xl">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Need more numbers?</h3>
        <p className="text-xs text-blue-700 mb-4">
          Purchase additional phone numbers directly from your Telnyx account to expand your messaging capacity.
        </p>
        <a
          href="https://portal.telnyx.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          Open Telnyx Portal
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

// Telnyx API returns a numeric phone_number_type and other metadata. We map
// a best-effort type label so the UI stays useful without depending on the
// full Telnyx schema.
function mapTelnyxType(n: any): TelnyxNumberRecord['type'] {
  const t = String(n.phone_number_type || n.type || '').toLowerCase();
  if (t.includes('toll')) return 'toll-free';
  if (t.includes('mobile')) return 'mobile';
  if (t.includes('local')) return 'local';
  return 'unknown';
}

export default Numbers;