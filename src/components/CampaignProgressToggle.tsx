// CampaignProgressToggle Component
// Beautiful floating toggle showing real-time campaign progress with emoji stats
// Connected to real API endpoints for live updates

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe, Mail, CheckCircle2, XCircle, Users,
  ChevronDown, ChevronUp, Loader2, Sparkles,
  Trophy, Star, PartyPopper, X, ExternalLink
} from 'lucide-react';
import { playVictoryCelebration } from '../utils/audio';
import { getEmailCampaign } from '../lib/pipelineClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CampaignProgressData {
  id: string;
  kind: 'email' | 'site-deploy';
  name: string;
  status: 'starting' | 'running' | 'cancelling' | 'cancelled' | 'completed';
  total: number;
  done: number;
  sitesGenerated?: number;
  emailsSent?: number;
  emailsFailed?: number;
  accountsUsed?: number;
  // Dork-only fields — when set, the toggle renders an extra "Leads" tile
  // showing leadsFound / leadsTarget side-by-side, and hides the generic
  // "📊 {done} / {total} leads" subline (which isn't meaningful during
  // the discovery phase).
  leadsFound?: number;
  leadsTarget?: number;
  deployedSites?: Array<{
    slug: string;
    name: string;
    city?: string;
    url: string;
    status: string;
  }>;
}

interface CampaignProgressToggleProps {
  campaign: CampaignProgressData;
  onDismiss?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Polling hook for live updates
// ---------------------------------------------------------------------------
function useCampaignPolling(
  campaignId: string,
  enabled: boolean,
  campaignStatus: string,
  campaignTotal: number,
  campaignLeadsFound?: number,
  campaignLeadsTarget?: number,
) {
  const [data, setData] = useState<CampaignProgressData | null>(null);

  useEffect(() => {
    // Don't start polling if campaign is already complete
    if (!enabled || campaignStatus !== 'running' || !campaignId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const result = await getEmailCampaign(campaignId);
        if (cancelled) return;
        if (result && result.campaign) {
          const c = result.campaign;
          // Stop polling if campaign is no longer running (completed/cancelled).
          // This prevents stale server data from overwriting accurate completion values.
          if (c.status && c.status !== 'running' && c.status !== 'starting') {
            cancelled = true;
            clearInterval(pollInterval);
            return;
          }
          // For dork runs the progress bar should reflect leads discovered so far
          // (not emails sent, which stays at 0 during discovery). For CSV runs
          // we keep the existing done=sent semantics.
          const isDork = campaignLeadsTarget !== undefined;
          const doneForBar = isDork
            ? (typeof campaignLeadsFound === 'number' ? campaignLeadsFound : (c.sent || 0))
            : (c.sent || 0);
          const totalForBar = isDork ? (campaignLeadsTarget ?? c.totalLeads ?? campaignTotal) : (c.totalLeads ?? campaignTotal);
          setData({
            id: c.id || campaignId,
            kind: 'email',
            name: c.name || 'Campaign',
            status: c.status === 'completed' ? 'completed' : 'running',
            total: totalForBar,
            done: doneForBar,
            // Use the live count we now attach in getEmailCampaign — it's the
            // authoritative unique-site count, not c.sent (which can include retries).
            sitesGenerated: c.sites_generated || 0,
            emailsSent: c.sent || 0,
            emailsFailed: c.failed || 0,
            accountsUsed: c.accountsUsed || 0,
            // Carry through the dork-only fields so re-renders don't drop them.
            leadsFound: campaignLeadsFound,
            leadsTarget: campaignLeadsTarget,
            deployedSites: c.deployedSites || [],
          });
        }
      } catch (e) {
        // Silent fail - keep using local data
      }
    };

    // Poll every 2 seconds
    const pollInterval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [campaignId, enabled, campaignStatus, campaignTotal, campaignLeadsFound, campaignLeadsTarget]);

  return data;
}

// ---------------------------------------------------------------------------
// Confetti Particle Component
// ---------------------------------------------------------------------------
const ConfettiParticle: React.FC<{ delay: number; x: number; color: string }> = ({ delay, x, color }) => (
  <div
    className="absolute w-2 h-2 rounded-full animate-confetti"
    style={{
      left: `${x}%`,
      top: '-10px',
      backgroundColor: color,
      animationDelay: `${delay}ms`,
      boxShadow: `0 0 6px ${color}`,
    }}
  />
);

// ---------------------------------------------------------------------------
// Victory Animation Component
// ---------------------------------------------------------------------------
const VictoryAnimation: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [show, setShow] = useState(true);
  const [confetti, setConfetti] = useState<Array<{ id: number; x: number; color: string; delay: number }>>([]);

  useEffect(() => {
    // Generate confetti
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    const particles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 1500,
    }));
    setConfetti(particles);

    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(onComplete, 600); // Wait for fade animation
    }, 3500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!show) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none animate-fade-out">
        <div className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border-2 border-amber-300 rounded-3xl shadow-2xl p-8 sm:p-10 animate-scale-out max-w-md mx-4">
          <div className="text-center space-y-5">
            <div className="relative inline-block">
              <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg animate-bounce-slow">
                <Trophy className="w-14 h-14 text-white" />
              </div>
              <div className="absolute -top-3 -right-3 animate-pulse">
                <Sparkles className="w-8 h-8 text-yellow-400 drop-shadow-lg" />
              </div>
              <div className="absolute -bottom-2 -left-4 animate-spin-slow">
                <Star className="w-7 h-7 text-yellow-300 drop-shadow-lg" />
              </div>
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <div className="text-3xl animate-bounce" style={{ animationDelay: '0.2s' }}>✨</div>
              </div>
            </div>
            <h3 className="font-serif text-3xl sm:text-4xl font-bold bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 bg-clip-text text-transparent">
              Campaign Complete!
            </h3>
            <p className="text-amber-700 text-base">
              Your outreach campaign has finished successfully. Amazing work! 🚀
            </p>
            <div className="flex justify-center gap-3 text-4xl">
              <span className="animate-bounce" style={{ animationDelay: '0s' }}>🌟</span>
              <span className="animate-bounce" style={{ animationDelay: '0.15s' }}>🎉</span>
              <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>💪</span>
              <span className="animate-bounce" style={{ animationDelay: '0.45s' }}>🏆</span>
              <span className="animate-bounce" style={{ animationDelay: '0.6s' }}>🚀</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in overflow-hidden">
      {/* Confetti background */}
      <div className="absolute inset-0 overflow-hidden">
        {confetti.map((p) => (
          <ConfettiParticle key={p.id} delay={p.delay} x={p.x} color={p.color} />
        ))}
      </div>

      <div className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border-2 border-amber-300 rounded-3xl shadow-2xl p-8 sm:p-10 animate-scale-in max-w-md mx-4">
        {/* Animated border glow */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 opacity-20 animate-pulse-slow -z-10 blur-sm" />

        <div className="text-center space-y-5">
          <div className="relative inline-block">
            <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg animate-bounce-slow">
              <Trophy className="w-14 h-14 text-white" />
            </div>
            <div className="absolute -top-3 -right-3 animate-pulse">
              <Sparkles className="w-8 h-8 text-yellow-400 drop-shadow-lg" />
            </div>
            <div className="absolute -bottom-2 -left-4 animate-spin-slow">
              <Star className="w-7 h-7 text-yellow-300 drop-shadow-lg" />
            </div>
            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
              <div className="text-3xl animate-bounce" style={{ animationDelay: '0.2s' }}>✨</div>
            </div>
          </div>
          <h3 className="font-serif text-3xl sm:text-4xl font-bold bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 bg-clip-text text-transparent">
            Campaign Complete!
          </h3>
          <p className="text-amber-700 text-base">
            Your outreach campaign has finished successfully. Amazing work! 🚀
          </p>
          <div className="flex justify-center gap-3 text-4xl">
            <span className="animate-bounce" style={{ animationDelay: '0s' }}>🌟</span>
            <span className="animate-bounce" style={{ animationDelay: '0.15s' }}>🎉</span>
            <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>💪</span>
            <span className="animate-bounce" style={{ animationDelay: '0.45s' }}>🏆</span>
            <span className="animate-bounce" style={{ animationDelay: '0.6s' }}>🚀</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Progress Toggle Component
// ---------------------------------------------------------------------------
export const CampaignProgressToggle: React.FC<CampaignProgressToggleProps> = ({
  campaign,
  onDismiss
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true); // Auto-expand by default
  const [showVictory, setShowVictory] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [prevStatus, setPrevStatus] = useState(campaign.status);
  const hasAutoExpanded = useRef(false);

  // Poll for live updates while running
  const liveData = useCampaignPolling(campaign.id, campaign.status === 'running', campaign.status, campaign.total, campaign.leadsFound, campaign.leadsTarget);

  // Use the prop as the source of truth when the campaign is finished — the
  // polling hook only fires while running, so its final value can lag behind
  // the authoritative wizard-completion payload.
  const displayData = campaign.status === 'running' ? (liveData || campaign) : campaign;

  // Auto-expand when campaign is running
  useEffect(() => {
    if (campaign.status === 'running' && !hasAutoExpanded.current) {
      setIsExpanded(true);
      hasAutoExpanded.current = true;
    }
  }, [campaign.status]);

  // Handle completion
  useEffect(() => {
    if (campaign.status === 'completed' && prevStatus !== 'completed') {
      playVictoryCelebration();
      setShowVictory(true);
    }
    setPrevStatus(campaign.status);
  }, [campaign.status, prevStatus]);

  // Handle exit animation
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss?.(campaign.id);
    }, 400);
  }, [campaign.id, onDismiss]);

  // Calculate progress percentage
  const pct = displayData.total > 0
    ? Math.min(100, Math.round((displayData.done / displayData.total) * 100))
    : 0;

  // Get status color and gradient
  const getStatusGradient = () => {
    if (campaign.status === 'completed') return 'bg-gradient-to-r from-emerald-500 to-teal-500';
    if (campaign.status === 'cancelling') return 'bg-gradient-to-r from-amber-500 to-orange-500';
    if (campaign.status === 'cancelled') return 'bg-gradient-to-r from-gray-500 to-slate-500';
    return 'bg-gradient-to-r from-violet-500 to-purple-600';
  };

  const getStatusIcon = () => {
    if (campaign.status === 'completed') return <CheckCircle2 className="w-5 h-5" />;
    if (campaign.status === 'running') return <Loader2 className="w-5 h-5 animate-spin" />;
    if (campaign.status === 'cancelling') return <Loader2 className="w-5 h-5 animate-spin" />;
    return <Globe className="w-5 h-5" />;
  };

  return (
    <>
      {/* Victory overlay */}
      {showVictory && (
        <VictoryAnimation onComplete={() => {
          setShowVictory(false);
          handleDismiss();
        }} />
      )}

      {/* Progress toggle */}
      <div
        className={`fixed bottom-4 right-4 z-40 transition-all duration-500 ease-out ${
          isExiting
            ? 'opacity-0 translate-y-6 scale-90'
            : 'opacity-100 translate-y-0 scale-100'
        }`}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-violet-200 overflow-hidden w-80 sm:w-[22rem]">
          {/* Header */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-white cursor-pointer transition-all ${getStatusGradient()}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Animated icon */}
              <div className="relative">
                {getStatusIcon()}
                {campaign.status === 'running' && (
                  <span className="absolute -top-1 -right-1 text-xs animate-pulse">⚡</span>
                )}
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-bold truncate">{displayData.name || 'Campaign'}</p>
                <p className="text-xs opacity-90">
                  {campaign.status === 'completed' ? '✨ Complete!' :
                   campaign.status === 'running' ? `⚙️ ${pct}% done` :
                   campaign.status === 'cancelling' ? '⏳ Stopping...' :
                   campaign.status === 'cancelled' ? '❌ Cancelled' : '🚀 Starting...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Quick emoji stats */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs">
                {(displayData.sitesGenerated !== undefined && displayData.sitesGenerated > 0) && (
                  <span className="bg-white/25 backdrop-blur-sm px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                    🌐 {displayData.sitesGenerated}
                  </span>
                )}
                {(displayData.emailsSent !== undefined && displayData.emailsSent > 0) && (
                  <span className="bg-white/25 backdrop-blur-sm px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                    ✉️ {displayData.emailsSent}
                  </span>
                )}
              </div>
              {isExpanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronUp className="w-5 h-5" />
              )}
            </div>
          </button>

          {/* Expanded content - Always visible with beautiful stats */}
          <div className="p-4 space-y-4 bg-gradient-to-b from-violet-50/50 to-white">
            {/* Progress bar with gradient */}
            <div className="space-y-2">
              <div className="h-3.5 bg-gradient-to-r from-violet-100 to-purple-100 rounded-full overflow-hidden border border-violet-200 shadow-inner">
                <div
                  className={`h-full ${getStatusGradient()} transition-all duration-700 ease-out rounded-full relative overflow-hidden`}
                  style={{ width: `${pct}%` }}
                >
                  {/* Animated shimmer */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
                  {/* Progress dots */}
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/80 animate-pulse" />
                </div>
              </div>
              <div className="flex justify-between text-xs">
                {campaign.leadsFound === undefined && (
                  <span className="font-semibold text-violet-700">📊 {displayData.done} / {displayData.total} leads</span>
                )}
                {campaign.leadsFound !== undefined && (
                  <span className="font-semibold text-blue-700">👤 {displayData.leadsFound ?? 0} / {displayData.leadsTarget ?? '—'} leads</span>
                )}
                <span className="font-bold text-violet-600">{pct}%</span>
              </div>
            </div>

            {/* Beautiful Stats Grid with Emojis */}
            {/*
              Dork runs surface an additional full-width "Leads" tile
              (leadsFound / leadsTarget) above the standard 2x2 grid.
              CSV runs never set leadsFound, so this tile is hidden.
            */}
            {displayData.leadsFound !== undefined && (
              <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 rounded-xl p-3 border border-blue-200 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">👤</span>
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Leads</span>
                  </div>
                  <span className="text-[10px] font-bold text-blue-600/70 uppercase tracking-widest">discovered</span>
                </div>
                <p className="text-2xl font-black text-blue-800">
                  <span className="tabular-nums">{displayData.leadsFound ?? 0}</span>
                  <span className="text-base text-blue-500 font-bold mx-1">/</span>
                  <span className="text-base text-blue-500 font-bold tabular-nums">{displayData.leadsTarget ?? '—'}</span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* Sites generated */}
              <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 rounded-xl p-3 border border-blue-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🌐</span>
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Sites</span>
                </div>
                <p className="text-2xl font-black text-blue-800">
                  {displayData.sitesGenerated ?? 0}
                </p>
                <p className="text-[10px] text-blue-500 font-medium">generated</p>
              </div>

              {/* Emails sent */}
              <div className="bg-gradient-to-br from-emerald-50 via-green-50 to-emerald-100 rounded-xl p-3 border border-emerald-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">✉️</span>
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Sent</span>
                </div>
                <p className="text-2xl font-black text-emerald-800">
                  {displayData.emailsSent ?? 0}
                </p>
                <p className="text-[10px] text-emerald-500 font-medium">delivered</p>
              </div>

              {/* Emails failed */}
              <div className="bg-gradient-to-br from-red-50 via-rose-50 to-red-100 rounded-xl p-3 border border-red-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">❌</span>
                  <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Failed</span>
                </div>
                <p className="text-2xl font-black text-red-800">
                  {displayData.emailsFailed ?? 0}
                </p>
                <p className="text-[10px] text-red-500 font-medium">bounced</p>
              </div>

              {/* Accounts used */}
              <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 rounded-xl p-3 border border-amber-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">👤</span>
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Accounts</span>
                </div>
                <p className="text-2xl font-black text-amber-800">
                  {displayData.accountsUsed ?? 0}
                </p>
                <p className="text-[10px] text-amber-500 font-medium">sending</p>
              </div>
            </div>

            {/* Live Deployed Sites — only show when there are deployed sites */}
            {displayData.deployedSites && displayData.deployedSites.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">
                    🔗 Live Deployed Sites ({displayData.deployedSites.length})
                  </span>
                  <div className="flex-1 h-px bg-violet-200" />
                </div>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-1">
                  {displayData.deployedSites.slice(0, 8).map((site, idx) => (
                    <a
                      key={site.slug || idx}
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-[11px] text-blue-700 hover:from-blue-100 hover:to-indigo-100 hover:border-blue-300 hover:text-blue-800 transition-all shadow-sm hover:shadow-md max-w-[200px]"
                    >
                      <Globe className="w-3 h-3 shrink-0 text-blue-400 group-hover:text-blue-600 transition-colors" />
                      <span className="truncate font-semibold">{site.name}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ))}
                  {displayData.deployedSites.length > 8 && (
                    <div className="flex items-center px-2 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-[10px] text-violet-600 font-semibold">
                      +{displayData.deployedSites.length - 8} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Live status indicator */}
            <div className="flex items-center justify-between pt-2 border-t border-violet-100">
              {campaign.status === 'running' ? (
                <div className="flex items-center gap-2 text-xs text-violet-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                  </span>
                  <span className="font-semibold">🔄 Live updating...</span>
                </div>
              ) : campaign.status === 'completed' ? (
                <div className="flex items-center gap-2 text-xs text-emerald-600">
                  <span className="text-lg">✅</span>
                  <span className="font-semibold">Finished successfully!</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="text-lg">
                    {campaign.status === 'cancelled' ? '🚫' : '⏳'}
                  </span>
                  <span className="font-semibold capitalize">{campaign.status}</span>
                </div>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700 hover:from-violet-200 hover:to-purple-200 transition-all cursor-pointer border border-violet-200 shadow-sm hover:shadow-md"
              >
                Dismiss ✕
              </button>
            </div>
          </div>
        </div>

        {/* Pulse indicator when running */}
        {campaign.status === 'running' && (
          <div className="absolute -top-1 -right-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
        )}
      </div>

      {/* Custom styles for animations */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-shimmer {
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes scale-in {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes scale-out {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        .animate-scale-out {
          animation: scale-out 0.4s ease-in;
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 1.5s ease-in-out infinite;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }
      `}</style>
    </>
  );
};
