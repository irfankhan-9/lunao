// Email Accounts Management Component
// Shows connected email accounts and health metrics

import React, { useState, useEffect } from 'react';
import {
  Mail, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle, Clock,
  TrendingUp, TrendingDown, AlertTriangle, ExternalLink, ShieldCheck, X
} from 'lucide-react';
import { playSoftTap, playGentleChime, playElegantError, playVictoryCelebration } from '../utils/audio';

interface EmailAccount {
  id: string;
  provider: 'gmail' | 'outlook';
  email: string;
  displayName: string;
  status: 'healthy' | 'warming_up' | 'needs_attention' | 'disconnected';
  warmupStage: string;
  sendsToday: number;
  remainingToday: number;
  dailyCap: number;
  bounceRate7d: number;
  lastSuccessfulSend: number | null;
  connectedAt: number;
  tokenStatus: 'active' | 'needs_reconnect' | 'revoked';
  health?: {
    daysConnected: number;
    recommendation: string;
  };
}

interface EmailAccountsManagerProps {
  userPlan?: string;
  onAccountsChange?: () => void;
}

export const EmailAccountsManager: React.FC<EmailAccountsManagerProps> = ({
  userPlan = 'Free Plan',
  onAccountsChange,
}) => {
  const isPro = userPlan === 'Pro Plan' || userPlan === 'Agency Plan';
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);
  const [connectProvider, setConnectProvider] = useState<'gmail' | 'outlook'>('gmail');
  const [connecting, setConnecting] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  useEffect(() => {
    loadAccounts();
  }, []);
  
  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dash-Free-Plan';
      const { listEmailAccounts } = await import('../lib/pipelineClient');
      const raw = await listEmailAccounts(ownerKey);
      // Defensive dedupe by (provider,email) so the UI never shows the same
      // Gmail twice. The server enforces this with a unique index, but
      // legacy rows + optimistic local state can still produce dupes.
      const seen = new Map<string, any>();
      for (const acc of raw) {
        const key = `${acc.provider}::${String(acc.email || '').toLowerCase()}`;
        const prev = seen.get(key);
        if (!prev || (acc.connected_at || 0) > (prev.connected_at || 0)) {
          seen.set(key, acc);
        }
      }
      const accs = Array.from(seen.values());
      setAccounts(accs.map(acc => ({
        id: acc.id,
        provider: acc.provider,
        email: acc.email,
        displayName: acc.display_name,
        status: acc.status,
        warmupStage: acc.warmup_stage,
        sendsToday: acc.sends_today,
        remainingToday: acc.remaining_today,
        dailyCap: acc.daily_cap,
        bounceRate7d: acc.bounce_rate_7d,
        lastSuccessfulSend: acc.last_successful_send,
        connectedAt: acc.connected_at,
        tokenStatus: acc.token_status,
        health: acc.health,
      })));
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { initiateOAuthFlow } = await import('../lib/pipelineClient');
      initiateOAuthFlow(connectProvider);
    } catch (err) {
      playElegantError();
      setConnecting(false);
    }
  };
  
  const handleDisconnect = async (accountId: string) => {
    try {
      const { disconnectEmailAccount } = await import('../lib/pipelineClient');
      await disconnectEmailAccount(accountId);
      playGentleChime();
      setDeleteConfirm(null);
      loadAccounts();
      onAccountsChange?.();
    } catch (err) {
      playElegantError();
    }
  };
  
  const formatLastSend = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp * 1000;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };
  
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy': return 'bg-success-soft text-success border-success/20';
      case 'warming_up': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'needs_attention': return 'bg-danger/10 text-danger border-danger/20';
      case 'disconnected': return 'bg-surface text-ink-tertiary border-border-main';
      default: return 'bg-surface text-ink-secondary border-border-main';
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'warming_up': return <Clock className="w-3.5 h-3.5" />;
      case 'needs_attention': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'disconnected': return <AlertCircle className="w-3.5 h-3.5" />;
      default: return <AlertCircle className="w-3.5 h-3.5" />;
    }
  };
  
  const getWarmupLabel = (stage: string): string => {
    switch (stage) {
      case 'stage_1': return 'Days 1-3 (15/day)';
      case 'stage_2': return 'Days 4-10 (30/day)';
      case 'stage_3': return 'Day 11+ (50/day)';
      case 'steady': return 'Steady state';
      default: return stage;
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif text-ink">Email Accounts</h2>
          <p className="text-xs text-ink-secondary mt-0.5">Manage connected email accounts for sending campaigns</p>
        </div>
        <button
          type="button"
          onClick={() => { playSoftTap(); setShowConnectModal(true); }}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          Connect Account
        </button>
      </div>
      
      {/* Compliance Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-800">Email Compliance</p>
          <p className="text-xs text-blue-700">
            Connected accounts are subject to Gmail/Outlook sending policies. We automatically rate-limit 
            sends to reduce bounce risk. Every email includes an unsubscribe link per CAN-SPAM requirements.
          </p>
        </div>
      </div>
      
      {/* Accounts List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 bg-off-white border border-border-main rounded-xl">
          <Mail className="w-10 h-10 mx-auto mb-3 text-ink-tertiary opacity-50" />
          <p className="text-sm font-semibold text-ink">No email accounts connected</p>
          <p className="text-xs text-ink-secondary mt-1">Connect a Gmail or Outlook account to start sending campaigns</p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div key={account.id} className="bg-white border border-border-main rounded-xl overflow-hidden">
              {/* Header */}
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    account.provider === 'gmail' ? 'bg-red-50' : 'bg-blue-50'
                  }`}>
                    <Mail className={`w-5 h-5 ${
                      account.provider === 'gmail' ? 'text-red-500' : 'text-blue-500'
                    }`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{account.displayName}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border flex items-center gap-1 ${getStatusColor(account.status)}`}>
                        {getStatusIcon(account.status)}
                        <span className="capitalize">{account.status.replace('_', ' ')}</span>
                      </span>
                    </div>
                    <p className="text-xs text-ink-secondary">{account.email}</p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => { playSoftTap(); setDeleteConfirm(account.id); }}
                  className="p-2 hover:bg-danger-soft hover:text-danger rounded-lg transition-colors text-ink-tertiary"
                  title="Disconnect account"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              {/* Stats Grid */}
              <div className="px-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Today's Sends */}
                  <div className="bg-off-white rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-secondary font-semibold mb-1">Today</p>
                    <p className="text-sm font-semibold text-ink">
                      {account.sendsToday} <span className="text-ink-tertiary text-xs font-normal">/ {account.dailyCap}</span>
                    </p>
                    <div className="mt-1.5 h-1.5 bg-surface rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          account.sendsToday / account.dailyCap > 0.9 ? 'bg-danger' :
                          account.sendsToday / account.dailyCap > 0.7 ? 'bg-amber-500' : 'bg-success'
                        }`}
                        style={{ width: `${Math.min(100, (account.sendsToday / account.dailyCap) * 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Remaining */}
                  <div className="bg-off-white rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-secondary font-semibold mb-1">Remaining</p>
                    <p className={`text-sm font-semibold ${
                      account.remainingToday < 5 ? 'text-amber-600' : 'text-ink'
                    }`}>
                      {account.remainingToday}
                      <span className="text-ink-tertiary text-xs font-normal"> sends</span>
                    </p>
                  </div>
                  
                  {/* Bounce Rate */}
                  <div className="bg-off-white rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-secondary font-semibold mb-1">Bounce Rate (7d)</p>
                    <p className={`text-sm font-semibold flex items-center gap-1 ${
                      account.bounceRate7d > 5 ? 'text-danger' : 
                      account.bounceRate7d > 2 ? 'text-amber-600' : 'text-success'
                    }`}>
                      {account.bounceRate7d > 5 ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : account.bounceRate7d > 2 ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                      {account.bounceRate7d.toFixed(1)}%
                    </p>
                  </div>
                  
                  {/* Last Send */}
                  <div className="bg-off-white rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-secondary font-semibold mb-1">Last Send</p>
                    <p className="text-sm font-semibold text-ink">
                      {formatLastSend(account.lastSuccessfulSend)}
                    </p>
                  </div>
                </div>
                
                {/* Warmup Stage & Recommendation */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200`}>
                      {getWarmupLabel(account.warmupStage)}
                    </span>
                    {account.health?.daysConnected !== undefined && (
                      <span className="text-[10px] text-ink-tertiary">
                        {account.health.daysConnected} days connected
                      </span>
                    )}
                  </div>
                  {account.health?.recommendation && (
                    <p className="text-[10px] text-ink-secondary max-w-[300px] truncate" title={account.health.recommendation}>
                      {account.health.recommendation}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Token Status Warning */}
              {account.tokenStatus === 'needs_reconnect' && (
                <div className="px-4 pb-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-amber-800">Re-authentication required</p>
                      <p className="text-[10px] text-amber-700">This account needs to be reconnected to continue sending.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConnect()}
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
      
      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowConnectModal(false)}>
          <div className="bg-white border border-border-main rounded-xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border-light flex items-center justify-between">
              <h3 className="text-lg font-serif text-ink">Connect Email Account</h3>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="p-2 hover:bg-off-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-ink-secondary" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-sm text-ink-secondary">
                Connect your email account to send campaigns. We use OAuth 2.0 so your password is never stored.
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConnectProvider('gmail')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    connectProvider === 'gmail'
                      ? 'border-red-500 bg-red-50'
                      : 'border-border-main hover:border-red-200'
                  }`}
                >
                  <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Mail className="w-6 h-6 text-red-500" />
                  </div>
                  <p className="text-sm font-semibold text-ink">Gmail</p>
                  <p className="text-[10px] text-ink-secondary">Google Workspace</p>
                </button>
                
                <button
                  type="button"
                  onClick={() => setConnectProvider('outlook')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    connectProvider === 'outlook'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-border-main hover:border-blue-200'
                  }`}
                >
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Mail className="w-6 h-6 text-blue-500" />
                  </div>
                  <p className="text-sm font-semibold text-ink">Outlook</p>
                  <p className="text-[10px] text-ink-secondary">Microsoft 365</p>
                </button>
              </div>
              
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="w-full px-4 py-3 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {connecting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Connect with {connectProvider === 'gmail' ? 'Google' : 'Microsoft'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white border border-border-main rounded-xl max-w-sm w-full shadow-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Disconnect Account?</h3>
                <p className="text-xs text-ink-secondary">
                  {accounts.find(a => a.id === deleteConfirm)?.email}
                </p>
              </div>
            </div>
            
            <p className="text-xs text-ink-secondary">
              This will remove the account's connection. Any scheduled sends will be cancelled. This action cannot be undone.
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

export default EmailAccountsManager;
