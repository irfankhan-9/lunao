import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, MessageSquare, Send, CheckCircle, Reply, Phone, Loader2, ShieldCheck, Zap } from 'lucide-react';

interface MessagingStats {
  totalSent: number;
  totalDelivered: number;
  deliveryRate: number;
  repliesReceived: number;
  activeNumbers: number;
  balance?: { available: string; currency: string };
  account?: {
    email: string;
    label: string;
    status: string;
    profileId: string;
    profileName: string;
  };
}

interface DailyVolume {
  date: string;
  sent: number;
  delivered: number;
}

export function MessagingAnalytics() {
  const [stats, setStats] = useState<MessagingStats>({
    totalSent: 0,
    totalDelivered: 0,
    deliveryRate: 0,
    repliesReceived: 0,
    activeNumbers: 0,
    balance: { available: '0.00', currency: 'USD' },
    account: {
      email: '',
      label: 'Telnyx Account',
      status: 'disconnected',
      profileId: null,
      profileName: null,
    },
  });
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const ownerKey = (typeof window !== 'undefined' && localStorage.getItem('lunao_owner_key')) || 'dash-Free-Plan';
        const res = await fetch(`/api/messaging/stats?ownerKey=${encodeURIComponent(ownerKey)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.stats) {
            setStats({
              totalSent: Number(data.stats.totalSent || 0),
              totalDelivered: Number(data.stats.totalDelivered || 0),
              deliveryRate: Number(data.stats.deliveryRate || 0),
              repliesReceived: Number(data.stats.repliesReceived || 0),
              activeNumbers: Number(data.stats.activeNumbers || 0),
              balance: data.stats.balance || { available: '0.00', currency: 'USD' },
              account: data.stats.account || {
                email: '',
                label: 'Telnyx Account',
                status: 'disconnected',
                profileId: null,
                profileName: null,
              },
            });
          }
          if (Array.isArray(data?.dailyVolume) && data.dailyVolume.length > 0) {
            setDailyVolume(data.dailyVolume);
          } else {
            const days: DailyVolume[] = [];
            for (let i = 6; i >= 0; i--) {
              const date = new Date();
              date.setDate(date.getDate() - i);
              const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
              days.push({ date: dayStr, sent: 0, delivered: 0 });
            }
            setDailyVolume(days);
          }
        }
      } catch (err) {
        console.error('Failed to load analytics', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const maxVolume = Math.max(...dailyVolume.map(d => d.sent), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-serif text-ink tracking-tight mb-1">Messaging Analytics</h2>
            <p className="text-sm text-ink-secondary">
              Track your SMS performance and engagement metrics.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
              Last 7 days
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : (
        <>
          {/* Live Telnyx Carrier Account Banner */}
          <div className="bg-white border border-border-main rounded-xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ink">Telnyx Carrier Account</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    stats.account?.email
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {stats.account?.email ? '10DLC Live Carrier' : 'Not Connected'}
                  </span>
                </div>
                <p className="text-xs text-ink-secondary mt-0.5 font-mono">
                  {stats.account?.email 
                    ? `${stats.account.email}${stats.activeNumbers ? ` · ${stats.activeNumbers} Active Number${stats.activeNumbers > 1 ? 's' : ''}` : ''}`
                    : 'Connect your Telnyx account in Settings'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs w-full md:w-auto">
              <div className="flex-1 md:flex-none px-3.5 py-1.5 bg-surface border border-border-light rounded-lg">
                <span className="text-[10px] uppercase font-bold text-ink-tertiary block">Telnyx Balance</span>
                <span className="font-mono font-bold text-emerald-600 text-sm">
                  ${stats.balance?.available ?? '0.00'} {stats.balance?.currency || 'USD'}
                </span>
              </div>
              <div className="flex-1 md:flex-none px-3.5 py-1.5 bg-surface border border-border-light rounded-lg">
                <span className="text-[10px] uppercase font-bold text-ink-tertiary block">Messaging Profile</span>
                <span className="font-semibold text-ink flex items-center gap-1.5 text-xs">
                  <span className={`w-2 h-2 rounded-full ${stats.account?.profileName ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                  {stats.account?.profileName || 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Send}
              label="Total Sent"
              value={stats.totalSent.toLocaleString()}
              trend="+12%"
              trendUp
              color="blue"
            />
            <StatCard
              icon={CheckCircle}
              label="Delivered"
              value={stats.totalDelivered.toLocaleString()}
              trend="+8%"
              trendUp
              color="emerald"
            />
            <StatCard
              icon={TrendingUp}
              label="Delivery Rate"
              value={`${stats.deliveryRate}%`}
              trend="-0.3%"
              trendUp={false}
              color="purple"
            />
            <StatCard
              icon={Reply}
              label="Replies Received"
              value={stats.repliesReceived.toLocaleString()}
              trend="+24%"
              trendUp
              color="amber"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SMS Volume Chart */}
            <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-ink">SMS Volume</h3>
                <div className="flex items-center gap-4 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-ink-secondary">Sent</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-ink-secondary">Delivered</span>
                  </div>
                </div>
              </div>
              <div className="h-48 flex items-end justify-between gap-2">
                {dailyVolume.map((day, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end gap-1 h-40">
                      <div
                        className="flex-1 bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                        style={{ height: `${(day.sent / maxVolume) * 100}%` }}
                        title={`${day.sent} sent`}
                      />
                      <div
                        className="flex-1 bg-emerald-500 rounded-t transition-all hover:bg-emerald-600"
                        style={{ height: `${(day.delivered / maxVolume) * 100}%` }}
                        title={`${day.delivered} delivered`}
                      />
                    </div>
                    <span className="text-[10px] text-ink-tertiary font-medium">{day.date}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reply Trends */}
            <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-ink">Reply Rate</h3>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700">
                  {((stats.repliesReceived / stats.totalDelivered) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Replied', value: stats.repliesReceived, color: 'bg-emerald-500' },
                  { label: 'No Reply', value: stats.totalDelivered - stats.repliesReceived, color: 'bg-gray-200' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-ink-secondary">{item.label}</span>
                      <span className="font-bold text-ink">{item.value.toLocaleString()}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all`}
                        style={{
                          width: `${item.label === 'Replied'
                            ? (stats.repliesReceived / stats.totalDelivered) * 100
                            : ((stats.totalDelivered - stats.repliesReceived) / stats.totalDelivered) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 bg-off-white rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink">
                      {stats.repliesReceived} conversations started
                    </p>
                    <p className="text-[10px] text-ink-tertiary">
                      Average reply rate: {((stats.repliesReceived / stats.totalDelivered) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Numbers Performance */}
          <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-ink mb-4">Numbers Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-light text-left text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
                    <th className="pb-3">Phone Number</th>
                    <th className="pb-3">Messages Sent</th>
                    <th className="pb-3">Delivery Rate</th>
                    <th className="pb-3">Replies</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b border-border-light">
                    <td className="py-3 font-mono">+1 (555) 123-4567</td>
                    <td className="py-3">847</td>
                    <td className="py-3">
                      <span className="text-emerald-600 font-medium">96.8%</span>
                    </td>
                    <td className="py-3">62</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono">+1 (800) 555-0199</td>
                    <td className="py-3">400</td>
                    <td className="py-3">
                      <span className="text-emerald-600 font-medium">95.0%</span>
                    </td>
                    <td className="py-3">27</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendUp,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  color: 'blue' | 'emerald' | 'purple' | 'amber';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="bg-white border border-border-main rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
          trendUp ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'
        }`}>
          {trend}
        </span>
      </div>
      <div className="text-2xl font-bold text-ink mb-0.5">{value}</div>
      <div className="text-[11px] text-ink-secondary font-medium">{label}</div>
    </div>
  );
}
