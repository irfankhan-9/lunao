// Telnyx OAuth connection manager.
//
// Renders the "Connect with Telnyx" button + the list of already-connected
// Telnyx accounts (with status, phone count, and disconnect). Follows the
// exact same shape as EmailAccountsManager.tsx so the two providers feel
// consistent in the dashboard.
//
// All data flows through the real backend:
//   - GET  /api/telnyx/accounts              -> list
//   - GET  /api/telnyx/oauth/url             -> { url } (legacy alias; window.location.href = url)
//   - GET  /api/telnyx/connect               -> { url } (canonical; same shape, PKCE + S256)
//   - GET  /api/telnyx/callback?code=…       -> stores the row (browser closes)
//   - DELETE /api/telnyx/accounts/:id        -> disconnect
//   - GET  /api/telnyx/accounts/:id/numbers  -> sender-number picker data

import React, { useEffect, useState, useCallback } from 'react';
import {
  Phone, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle, ExternalLink, ShieldCheck, X
} from 'lucide-react';
import { playSoftTap, playGentleChime, playElegantError } from '../utils/audio';

interface TelnyxConnection {
  id: string;
  account_email: string;
  account_label: string;
  total_numbers: number;
  status: 'active' | 'needs_reconnect' | 'revoked';
  expires_at: number | null;
  expires_in: number | null;
  connected_at: number;
}

interface TelnyxConnectionManagerProps {
  onConnectionsChange?: () => void;
}

export const TelnyxConnectionManager: React.FC<TelnyxConnectionManagerProps> = ({
  onConnectionsChange,
}) => {
  const [connections, setConnections] = useState<TelnyxConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    // Pull a cached list from localStorage first so the UI never renders the
    // empty "No Telnyx accounts connected" state on a hot reload. The server
    // is the source of truth — we replace the cached list as soon as the
    // round-trip lands.
    let cached: TelnyxConnection[] = [];
    try {
      const raw = localStorage.getItem('lunao_telnyx_connections_cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) cached = parsed;
      }
    } catch {
      /* ignore */
    }
    setConnections(cached);
    setIsLoading(cached.length === 0);

    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
      const res = await fetch(`/api/telnyx/accounts?ownerKey=${encodeURIComponent(ownerKey)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const fresh = Array.isArray(data.accounts) ? data.accounts : [];
      setConnections(fresh);
      try {
        localStorage.setItem('lunao_telnyx_connections_cache', JSON.stringify(fresh));
      } catch {
        /* ignore quota errors */
      }
    } catch (err) {
      console.error('[telnyx] failed to load connections:', err);
      // Leave the cached list in place rather than blanking the UI.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();

    // Listen for the postMessage the Telnyx OAuth popup sends when it
    // finishes the callback. The popup closes itself; we just need to know
    // the result so we can refresh the connection list + flash a banner.
    const onMessage = (ev: MessageEvent) => {
      // Only trust same-origin messages so a malicious extension/site
      // can't fake an oauth-success event.
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; status?: string; error?: string } | null;
      if (!data || data.type !== 'lunao:telnyx-oauth-result') return;

      if (data.status === 'success') {
        // Persist a quick hint so the dashboard can surface the new account
        // without an extra round-trip on the next render.
        try {
          localStorage.setItem('lunao_telnyx_last_connected', String(Date.now()));
        } catch {
          /* ignore */
        }
        loadConnections();
        onConnectionsChange?.();
      } else if (data.status === 'error') {
        playElegantError();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadConnections, onConnectionsChange]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
      const res = await fetch(`/api/telnyx/connect?ownerKey=${encodeURIComponent(ownerKey)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        playElegantError();
        alert(err.error || 'Failed to start Telnyx OAuth');
        setConnecting(false);
        return;
      }
      const { url } = await res.json();

      // Open the Telnyx consent screen in a POPUP rather than navigating
      // the current tab. This keeps the dashboard mounted, alive, and on
      // localhost:3000 the whole time — the user does not need to
      // re-login or re-navigate when the popup closes.
      //
      // Popup blockers usually allow window.open() only when it's a direct
      // user-gesture (a click handler), which this is.
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
        // Popup was blocked — fall back to a new tab so the user can still
        // complete the flow. The callback will reload to the static
        // "Telnyx connected" page; the user can close it and return.
        const tab = window.open(url, '_blank');
        if (!tab) {
          // Last-ditch fallback: navigate this tab. (Same as the old
          // behaviour so the user is never stuck.)
          window.location.href = url;
        }
        setConnecting(false);
        return;
      }
      popup.focus();

      // Watch the popup. When it closes (after the callback page calls
      // window.close), automatically refresh the connection list so the
      // newly-connected account appears without any user action.
      const poll = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(poll);
          setConnecting(false);
          loadConnections();
          onConnectionsChange?.();
        }
      }, 600);

      // Also listen for a postMessage that arrives BEFORE the popup is
      // detected as closed (which is the normal case).
      const onMsgEarly = (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin) return;
        const data = ev.data as { type?: string; status?: string } | null;
        if (data?.type === 'lunao:telnyx-oauth-result') {
          // Give the popup one tick to call window.close() — most browsers
          // don't allow window.close() during the same JS turn as the
          // postMessage, so a brief wait avoids a stuck empty popup.
          setTimeout(() => {
            try { popup.close(); } catch { /* ignore */ }
          }, 250);
        }
      };
      window.addEventListener('message', onMsgEarly);
      // Clean up the message listener when the popup closes.
      const closeHandler = window.setInterval(() => {
        if (popup.closed) {
          window.removeEventListener('message', onMsgEarly);
          window.clearInterval(closeHandler);
        }
      }, 800);
    } catch (err) {
      playElegantError();
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      const res = await fetch(`/api/telnyx/accounts/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      playGentleChime();
      setDeleteConfirm(null);
      // Remove the disconnected account from local cache immediately so the
      // UI doesn't keep showing stale data.
      setConnections((prev) => {
        const next = prev.filter((c) => c.id !== id);
        try {
          localStorage.setItem('lunao_telnyx_connections_cache', JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      onConnectionsChange?.();
    } catch (err) {
      playElegantError();
    }
  };

  const formatExpiresIn = (seconds: number | null): string => {
    if (seconds == null) return 'unknown';
    if (seconds <= 0) return 'expired';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">Connected Telnyx Accounts</h3>
          <p className="text-xs text-ink-secondary mt-0.5">
            One-click OAuth access. No API keys to copy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { playSoftTap(); handleConnect(); }}
          disabled={connecting}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
        >
          {connecting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Connect with Telnyx
        </button>
      </div>

      {/* Compliance Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-800">Telnyx OAuth</p>
          <p className="text-xs text-blue-700">
            We use the standard OAuth 2.0 authorization code flow. Your access and refresh tokens
            are encrypted at rest with AES-256-GCM. Lunao never sees your Telnyx password.
          </p>
        </div>
      </div>

      {/* Connections List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-10 bg-off-white border border-border-main rounded-xl">
          <Phone className="w-10 h-10 mx-auto mb-3 text-ink-tertiary opacity-50" />
          <p className="text-sm font-semibold text-ink">No Telnyx accounts connected</p>
          <p className="text-xs text-ink-secondary mt-1">
            Click <strong>Connect with Telnyx</strong> above to start sending SMS.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="bg-white border border-border-main rounded-xl overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {conn.account_label || conn.account_email || 'Telnyx account'}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                        conn.status === 'active'
                          ? 'bg-success-soft text-success border-success/20'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {conn.status === 'active' ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" />
                        )}
                        <span className="capitalize">{conn.status.replace('_', ' ')}</span>
                      </span>
                    </div>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {conn.total_numbers} phone number{conn.total_numbers === 1 ? '' : 's'} connected
                      {conn.expires_at != null && (
                        <>
                          {' · '}
                          token expires in {formatExpiresIn(conn.expires_in)}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { playSoftTap(); setDeleteConfirm(conn.id); }}
                  className="p-2 hover:bg-danger-soft hover:text-danger rounded-lg transition-colors text-ink-tertiary"
                  title="Disconnect account"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {conn.status === 'needs_reconnect' && (
                <div className="px-4 pb-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-amber-800">Re-authentication required</p>
                      <p className="text-[10px] text-amber-700">
                        The access token expired or was revoked. Reconnect to keep sending.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnect}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold rounded-lg flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white border border-border-main rounded-xl max-w-sm w-full shadow-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Disconnect Telnyx?</h3>
                <p className="text-xs text-ink-secondary">
                  Active SMS campaigns will fall back to other connected providers.
                </p>
              </div>
            </div>

            <p className="text-xs text-ink-secondary">
              This will remove the OAuth connection. You can reconnect at any time.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-border-main rounded-lg text-xs font-semibold text-ink hover:bg-off-white transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDisconnect(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-danger hover:bg-danger-hover text-white rounded-lg text-xs font-semibold transition-all"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TelnyxConnectionManager;