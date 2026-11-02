import React, { useState } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { ConnectedEmailAccount } from '../../types';
import { Button } from './Button';
import { Badge } from './Badge';

interface ConnectedEmailBannerProps {
  account: ConnectedEmailAccount | null;
  onReauth: () => Promise<void>;
  onConnect: (email: string) => Promise<void>;
  onDisconnect?: () => Promise<void>;
  onToggleTestExpiry?: () => Promise<void>;
  compact?: boolean;
}

export const ConnectedEmailBanner: React.FC<ConnectedEmailBannerProps> = ({
  account,
  onReauth,
  onConnect,
  onDisconnect,
  onToggleTestExpiry,
  compact = false,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  const isConnected = account && account.status !== 'disconnected' && !!account.email;
  const isExpired = account && account.status === 'expired';
  const isActive = isConnected && !isExpired;

  const handleReauthClick = async () => {
    setIsProcessing(true);
    try {
      await onReauth();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsProcessing(true);
    try {
      await onConnect(emailInput.trim());
      setIsConnectModalOpen(false);
      setEmailInput('');
    } finally {
      setIsProcessing(false);
    }
  };

  if (compact) {
    if (!isConnected) {
      return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 text-xs">
            <div className="p-1.5 rounded-lg bg-slate-200 text-slate-600">
              <Mail className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">No Business Email Connected</p>
              <p className="text-[11px] text-slate-500">Connect a Gmail account for sending client notifications</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsConnectModalOpen(true)}
            leftIcon={<Mail className="w-3.5 h-3.5" />}
          >
            Connect Gmail
          </Button>
        </div>
      );
    }

    if (isExpired) {
      return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-300">
          <div className="flex items-center gap-2 text-xs">
            <div className="p-1.5 rounded-lg bg-amber-200 text-amber-900 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-amber-950 truncate">{account.email}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-200 text-amber-900">
                  Session Expired
                </span>
              </div>
              <p className="text-[11px] text-amber-800">
                Authentication token expired. Automated & manual emails are paused until re-authenticated.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="primary"
              onClick={handleReauthClick}
              disabled={isProcessing}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />}
            >
              {isProcessing ? 'Re-authenticating...' : 'Re-authenticate Account'}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
        <div className="flex items-center gap-2.5 text-xs min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-emerald-950 truncate">{account.email}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                Connected & Active
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 truncate">
              Ready for instant confirmations, reminders, and client follow-ups
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleTestExpiry && (
            <button
              type="button"
              onClick={onToggleTestExpiry}
              className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition"
              title="Toggle expired state for testing"
            >
              Simulate Expiry
            </button>
          )}
          {onDisconnect && (
            <button
              type="button"
              onClick={onDisconnect}
              className="text-[11px] text-slate-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition"
              title="Disconnect account"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    );
  }

  // Full detailed card
  return (
    <>
      <div
        className={`p-4 rounded-2xl border transition-all ${
          !isConnected
            ? 'bg-white border-slate-200'
            : isExpired
            ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
            : 'bg-white border-slate-200 shadow-2xs'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                !isConnected
                  ? 'bg-slate-100 text-slate-600'
                  : isExpired
                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isExpired ? (
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              ) : isConnected ? (
                <Mail className="w-5 h-5 text-emerald-700" />
              ) : (
                <Mail className="w-5 h-5 text-slate-500" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  {isConnected ? account.email : 'No Business Email Connected'}
                </h3>
                {isConnected && (
                  <Badge
                    variant={isExpired ? 'warning' : 'success'}
                    size="sm"
                  >
                    {isExpired ? 'Session Expired — Action Required' : 'Active & Connected'}
                  </Badge>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-0.5">
                {!isConnected
                  ? 'Connect your business Gmail account with 1-click to automatically send confirmations and reminders from your own address.'
                  : isExpired
                  ? 'Your Gmail authorization token has expired or was revoked. Re-authenticate now to resume sending automations and client emails.'
                  : 'Automations, booking confirmations, reminders, and follow-ups are actively sent using this verified account.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isConnected ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsConnectModalOpen(true)}
                leftIcon={<Mail className="w-4 h-4" />}
              >
                Connect Gmail Account
              </Button>
            ) : isExpired ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleReauthClick}
                  disabled={isProcessing}
                  leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />}
                >
                  {isProcessing ? 'Re-authenticating...' : 'Re-authenticate Gmail'}
                </Button>
                {onToggleTestExpiry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onToggleTestExpiry}
                  >
                    Set Active
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReauthClick}
                  disabled={isProcessing}
                  leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />}
                >
                  {isProcessing ? 'Checking...' : 'Refresh Token'}
                </Button>
                {onToggleTestExpiry && (
                  <button
                    type="button"
                    onClick={onToggleTestExpiry}
                    className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
                    title="Simulate token expiration to test re-auth UI flow"
                  >
                    Simulate Expiry
                  </button>
                )}
                {onDisconnect && (
                  <button
                    type="button"
                    onClick={onDisconnect}
                    className="text-xs text-slate-500 hover:text-red-600 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-red-50 transition"
                    title="Disconnect account"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status Highlights */}
        {isConnected && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                OAuth 2.0 Token Status: <strong className={isExpired ? 'text-amber-700' : 'text-emerald-700'}>{isExpired ? 'Needs Re-auth' : 'Valid'}</strong>
              </span>
              <span>
                Daily Quota: <strong>{account.dailyQuotaRemaining ?? 500} / 500 emails</strong>
              </span>
            </div>
            <span>
              Connected: <strong>{account.connectedAt ? new Date(account.connectedAt).toLocaleDateString() : 'Active'}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Connect Modal */}
      {isConnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Connect Business Email</h3>
                <p className="text-xs text-slate-500">Authenticate your Gmail or Workspace account</p>
              </div>
            </div>

            <form onSubmit={handleConnectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Business Gmail / Workspace Address
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="owner@yourbusiness.com"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  1-click authentication will connect this account for automatic email delivery.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConnectModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isProcessing}
                  leftIcon={<Mail className="w-3.5 h-3.5" />}
                >
                  {isProcessing ? 'Authenticating...' : 'Authorize & Connect'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
