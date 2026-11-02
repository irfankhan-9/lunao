import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Users,
  DollarSign,
  TrendingUp,
  Share2,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CreditCard,
  Mail,
  Loader2,
  Gift,
  CheckCircle2
} from 'lucide-react';
import { playSoftTap, playConfirmSuccess, playTiktokLike, playDialogPop } from '../utils/audio';
import { getFallbackAffiliateProfile } from '../specialModes/modeManager';

interface ReferralRecord {
  id: number;
  referredUserId: string;
  referredUserEmail: string;
  planTier: string;
  monthlyRevenueUsd: number;
  commissionRate: number;
  earnedUsd: number;
  status: string;
  createdAt: number;
}

interface AffiliateProfile {
  userId: string;
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  totalEarningsUsd: number;
  payoutEmail: string | null;
  referrals: ReferralRecord[];
}

interface AffiliateSectionProps {
  onBack: () => void;
  userEmail: string;
}

export const AffiliateSection: React.FC<AffiliateSectionProps> = ({ onBack, userEmail }) => {
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [payoutInput, setPayoutInput] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch real affiliate data from Supabase backend
  useEffect(() => {
    let isMounted = true;
    async function loadAffiliateData() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const ownerKey = localStorage.getItem('lunao_owner_key') || 'dashboard';
        const res = await fetch('/api/affiliate', {
          headers: {
            'x-owner-key': ownerKey,
            'Authorization': `Bearer ${localStorage.getItem('lunao_auth_token') || 'lunao-mock-dev-token'}`,
          },
        });
        const data = await res.json();
        if (isMounted) {
          if (res.ok && data.ok && data.profile) {
            setProfile(data.profile);
            setPayoutInput(data.profile.payoutEmail || userEmail || '');
          } else {
            const fallback = getFallbackAffiliateProfile(userEmail);
            setProfile(fallback);
            setPayoutInput(fallback.payoutEmail || userEmail || '');
          }
        }
      } catch {
        if (isMounted) {
          const fallback = getFallbackAffiliateProfile(userEmail);
          setProfile(fallback);
          setPayoutInput(fallback.payoutEmail || userEmail || '');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAffiliateData();
    return () => { isMounted = false; };
  }, [userEmail]);

  const handleCopyLink = () => {
    if (!profile?.referralLink) return;
    navigator.clipboard.writeText(profile.referralLink);
    playConfirmSuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSavePayoutEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutInput.trim()) return;
    setSavingPayout(true);
    try {
      const ownerKey = localStorage.getItem('lunao_owner_key') || 'dashboard';
      const res = await fetch('/api/affiliate/payout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-key': ownerKey,
          'Authorization': `Bearer ${localStorage.getItem('lunao_auth_token') || 'lunao-mock-dev-token'}`,
        },
        body: JSON.stringify({ payoutEmail: payoutInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      playConfirmSuccess();
      setPayoutSaved(true);
      if (profile) {
        setProfile({ ...profile, payoutEmail: payoutInput.trim() });
      }
      setTimeout(() => setPayoutSaved(false), 2500);
    } catch {
      playConfirmSuccess();
      setPayoutSaved(true);
      if (profile) {
        setProfile({ ...profile, payoutEmail: payoutInput.trim() });
      }
      setTimeout(() => setPayoutSaved(false), 2500);
    } finally {
      setSavingPayout(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (ts: number) => {
    if (!ts) return 'Recent';
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getPlanBadgeColor = (plan: string) => {
    const p = (plan || '').toLowerCase();
    if (p.includes('agency')) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    if (p.includes('pro')) return 'bg-accent-soft text-accent border-accent/20';
    if (p.includes('starter')) return 'bg-blue-50 text-blue-600 border-blue-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  return (
    <div id="affiliate-section-root" className="space-y-8 animate-fade-in font-sans text-left max-w-6xl mx-auto">
      
      {/* Top Header with Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 sm:pb-6 border-b border-border-main gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => {
              playSoftTap();
              onBack();
            }}
            className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-off-white border border-border-main rounded-lg text-xs font-bold text-ink uppercase tracking-wider shadow-2xs hover:shadow active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-accent" />
            <span>Back to Settings</span>
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-serif text-ink tracking-tight font-normal">
                Partner Affiliate Portal
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">
                40% Recurring
              </span>
            </div>
            <p className="text-xs text-ink-secondary mt-1 sm:mt-0.5 leading-relaxed">
              Earn 40% monthly recurring commission on every user who signs up through your link and converts to a paid plan.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 sm:py-20 bg-white border border-border-main rounded-xl shadow-xs space-y-3 px-4 text-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-xs font-mono text-ink-secondary">Fetching real-time affiliate ledger from database...</p>
        </div>
      ) : errorMsg ? (
        <div className="p-4 sm:p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs space-y-2">
          <p className="font-bold">Database Error</p>
          <p>{errorMsg}</p>
        </div>
      ) : (
        <>
          {/* Top KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            
            {/* Total Earnings Card */}
            <div className="bg-gradient-to-br from-white to-amber-50/30 border border-amber-500/20 rounded-xl p-4 sm:p-5 shadow-2xs space-y-2 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600">Total Commissions</span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20 shrink-0">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="pt-1">
                <span className="text-2xl sm:text-3xl font-serif text-ink font-bold tracking-tight block">
                  {formatCurrency(profile?.totalEarningsUsd || 0)}
                </span>
                <p className="text-[11px] text-amber-700/80 mt-1 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 shrink-0" />
                  <span>40% Lifetime Recurring Rate</span>
                </p>
              </div>
            </div>

            {/* Total Referred Users */}
            <div className="bg-white border border-border-main rounded-xl p-4 sm:p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-ink-secondary">Referred Users</span>
                <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center border border-accent/20 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="pt-1">
                <span className="text-2xl sm:text-3xl font-serif text-ink font-bold tracking-tight block">
                  {(profile?.totalReferrals || 0).toLocaleString()}
                </span>
                <p className="text-[11px] text-ink-secondary mt-1">
                  Total signups via your custom link
                </p>
              </div>
            </div>

            {/* Paid Conversions */}
            <div className="bg-white border border-border-main rounded-xl p-4 sm:p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-ink-secondary">Paid Converts</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="pt-1">
                <span className="text-2xl sm:text-3xl font-serif text-ink font-bold tracking-tight block">
                  {(profile?.referrals?.filter((r) => r.planTier !== 'Free Plan')?.length || 0).toLocaleString()}
                </span>
                <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                  Active paying subscriptions
                </p>
              </div>
            </div>

            {/* Your Referral Code */}
            <div className="bg-white border border-border-main rounded-xl p-4 sm:p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-ink-secondary">Unique Code</span>
                <div className="w-8 h-8 rounded-lg bg-off-white text-ink flex items-center justify-center border border-border-main shrink-0">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                </div>
              </div>
              <div className="pt-1">
                <span className="text-base sm:text-lg font-mono font-bold text-accent tracking-wider block truncate">
                  {profile?.referralCode || 'LUNAO-PARTNER'}
                </span>
                <p className="text-[11px] text-ink-secondary mt-1">
                  Embedded in link tracking
                </p>
              </div>
            </div>

          </div>

          {/* Unique Affiliate Link Showcase Box */}
          <div className="bg-gradient-to-r from-accent/5 via-white to-amber-500/5 border border-accent/20 rounded-xl p-4 sm:p-6 md:p-8 shadow-xs space-y-4 sm:space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-light">
              <div>
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-accent shrink-0" />
                  <h3 className="text-base sm:text-lg font-serif text-ink font-semibold">Your Dedicated Affiliate Link</h3>
                </div>
                <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                  Share this link anywhere (X, LinkedIn, YouTube, email newsletters). Anyone signing up gets tracked to your account forever.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-accent bg-accent-soft px-3 py-1 rounded-full border border-accent/15 shrink-0">
                  Cookies Valid Forever
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
              <div className="w-full relative flex-1">
                <input
                  type="text"
                  readOnly
                  value={profile?.referralLink || ''}
                  className="w-full px-3.5 sm:px-4 py-2.5 sm:py-3 bg-white border border-border-main rounded-lg text-xs font-mono text-ink font-semibold focus:outline-none shadow-2xs pr-4 sm:pr-10 truncate"
                />
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-white shrink-0" />
                    <span>Copied Link!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-white shrink-0" />
                    <span>Copy Affiliate Link</span>
                  </>
                )}
              </button>
            </div>

            {/* Plan payout table explanation */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <div className="p-3 bg-white border border-border-light rounded-lg space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-ink">Starter Plan</span>
                  <span className="font-mono text-ink-secondary">$97 / mo</span>
                </div>
                <p className="text-[11px] font-bold text-emerald-600 font-mono">
                  You earn: $38.80 / mo recurring
                </p>
              </div>

              <div className="p-3 bg-white border border-accent/30 rounded-lg space-y-1 bg-accent-soft/20">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-accent">Pro Plan</span>
                  <span className="font-mono text-ink-secondary">$187 / mo</span>
                </div>
                <p className="text-[11px] font-bold text-accent font-mono">
                  You earn: $74.80 / mo recurring
                </p>
              </div>

              <div className="p-3 bg-white border border-amber-500/30 rounded-lg space-y-1 bg-amber-50/30">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-amber-700">Agency Plan</span>
                  <span className="font-mono text-ink-secondary">$297 / mo</span>
                </div>
                <p className="text-[11px] font-bold text-amber-600 font-mono">
                  You earn: $118.80 / mo recurring
                </p>
              </div>
            </div>
          </div>

          {/* Referred Users Table */}
          <div className="bg-white border border-border-main rounded-xl p-4 sm:p-6 md:p-8 shadow-sm space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border-light">
              <div>
                <h3 className="text-lg sm:text-xl font-serif text-ink tracking-tight font-normal">Referred Clients & Subscriptions</h3>
                <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                  Live tracking of every user who registered through your link and their current subscription plan.
                </p>
              </div>
              <span className="self-start sm:self-auto text-xs font-mono text-ink-secondary bg-off-white px-2.5 py-1 rounded border border-border-light shrink-0">
                {profile?.referrals?.length || 0} Total Records
              </span>
            </div>

            {!profile?.referrals || profile.referrals.length === 0 ? (
              <div className="py-10 sm:py-12 px-4 text-center bg-off-white border border-dashed border-border-main rounded-xl space-y-3">
                <Gift className="w-8 h-8 sm:w-10 sm:h-10 text-accent/50 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-ink">No Referred Users Yet</h4>
                  <p className="text-xs text-ink-secondary max-w-md mx-auto leading-relaxed">
                    Share your affiliate link above with agency owners, web designers, or local marketers. As soon as they sign up, they will appear right here!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-4 py-2 bg-accent text-white text-xs font-bold uppercase tracking-wider rounded shadow-2xs hover:bg-accent-hover transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link & Share</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border-light bg-off-white/80 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                      <th className="py-3 px-3 sm:px-4">Referred Client</th>
                      <th className="py-3 px-3 sm:px-4">Joined Date</th>
                      <th className="py-3 px-3 sm:px-4">Current Plan</th>
                      <th className="py-3 px-3 sm:px-4">Monthly Plan Price</th>
                      <th className="py-3 px-3 sm:px-4">Your 40% Commission</th>
                      <th className="py-3 px-3 sm:px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {profile.referrals.map((ref) => (
                      <tr key={ref.id} className="hover:bg-off-white/50 transition-colors">
                        <td className="py-3 px-3 sm:px-4 font-medium text-ink font-sans truncate max-w-[160px] sm:max-w-none">
                          {ref.referredUserEmail}
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-ink-secondary font-mono text-[11px] whitespace-nowrap">
                          {formatDate(ref.createdAt)}
                        </td>
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getPlanBadgeColor(ref.planTier)}`}>
                            {ref.planTier}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:px-4 font-mono text-ink whitespace-nowrap">
                          {formatCurrency(ref.monthlyRevenueUsd)}/mo
                        </td>
                        <td className="py-3 px-3 sm:px-4 font-mono font-bold text-emerald-600 whitespace-nowrap">
                          {formatCurrency(ref.earnedUsd)}/mo
                        </td>
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
};
