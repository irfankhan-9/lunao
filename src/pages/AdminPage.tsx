import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Lock,
  Unlock,
  Users,
  Globe,
  ExternalLink,
  Search,
  RefreshCw,
  BarChart3,
  Layers,
  MapPin,
  Activity,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  Building2,
  Compass,
  AlertCircle,
  X,
  Radio,
  FileText,
  SlidersHorizontal,
  Sparkles,
  Coins,
  Plus
} from 'lucide-react';
import { Logo } from '../landing/components/Logo';

interface AdminStats {
  totalUsers: number;
  totalSitesRebranded: number;
  totalSitesDeployed: number;
  totalCampaigns: number;
  totalBusinessesRequested: number;
  totalGoogleMapsCalls: number;
}

interface AdminUser {
  owner_key: string;
  email?: string;
  name?: string;
  plan: string;
  balance: number;
  aiCreditsBalance?: number;
  planExpiresAt?: number | null;
  sitesRebranded: number;
  sitesDeployed: number;
  campaignsCount: number;
  businessesRequested: number;
  googleMapsCalls: number;
  lastActive: string | number;
}

const PLAN_OPTIONS = ['Free Plan', 'Starter Plan', 'Pro Plan', 'Agency Plan'] as const;
const PLAN_DEFAULT_CREDITS: Record<string, { lunao: number; ai: number }> = {
  'Free Plan': { lunao: 15, ai: 0 },
  'Starter Plan': { lunao: 2500, ai: 600 },
  'Pro Plan': { lunao: 6500, ai: 1300 },
  'Agency Plan': { lunao: 12000, ai: 2000 },
};

export interface GoogleMapsCallItem {
  callNumber: number;
  query?: string;
  maxAllowed: number;
  placesReturned: number;
  emailsFound?: number;
  duplicatesFiltered?: number;
  validLeadsKept: number;
  status: string;
}

export interface AdminCampaign {
  id: string;
  owner_key: string;
  name: string;
  niche: string;
  status: string;
  total_leads: number;
  sites_generated: number;
  sms_sent: number;
  started_at: string | number;
  type?: string;
  businessesRequested: number;
  emailsFound?: number;
  maxAllowedPerCall?: number;
  googleMapsCalls: number;
  callBreakdown?: GoogleMapsCallItem[];
  csv_snapshot?: string | any;
}

interface AdminSite {
  id: string;
  owner_id: string;
  slug: string;
  business_name: string;
  city: string;
  niche: string;
  deploy_url?: string;
  campaign_source?: string;
  campaign_id?: string;
  created_at: string | number;
}

interface AdminPageProps {
  onNavigateHome: () => void;
}

const STORAGE_KEY = 'lunao_admin_auth_v1';

export function AdminPage({ onNavigateHome }: AdminPageProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === 'authenticated';
    } catch {
      return false;
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [sites, setSites] = useState<AdminSite[]>([]);

  // Navigation / Filter State
  const [activeTab, setActiveTab] = useState<'users' | 'campaigns' | 'sites'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | null>(null);

  // Modal State for inspecting a specific campaign's Google Maps API calls
  const [inspectingCampaign, setInspectingCampaign] = useState<AdminCampaign | null>(null);

  // Modal State for granting Plans, Lunao Credits & AI Credits
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [grantTargetUser, setGrantTargetUser] = useState<AdminUser | null>(null);
  const [grantIdentifier, setGrantIdentifier] = useState('');
  const [grantUserSearch, setGrantUserSearch] = useState('');
  const [grantPickerOpen, setGrantPickerOpen] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [grantPlan, setGrantPlan] = useState<string>('');
  const [grantDurationDays, setGrantDurationDays] = useState<string>('30');
  const [grantLunaoMode, setGrantLunaoMode] = useState<'keep' | 'add' | 'set'>('keep');
  const [grantLunaoAmount, setGrantLunaoAmount] = useState<string>('');
  const [grantAiMode, setGrantAiMode] = useState<'keep' | 'add' | 'set'>('keep');
  const [grantAiAmount, setGrantAiAmount] = useState<string>('');
  const [grantNote, setGrantNote] = useState<string>('');
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

  const fetchFastUsers = async (pwdToUse?: string): Promise<AdminUser[]> => {
    const pwd = pwdToUse || sessionStorage.getItem('lunao_admin_secret') || '$KHAN1234455';
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/users?password=${encodeURIComponent(pwd)}`, {
        headers: {
          'X-Admin-Password': pwd,
          Authorization: `Bearer ${pwd}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid Admin Password. Access Denied.');
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data?.ok && Array.isArray(data.users)) {
        setUsers((prev) => {
          const prevMap = new Map(prev.map((u) => [u.owner_key, u]));
          return data.users.map((u: AdminUser) => {
            const existing = prevMap.get(u.owner_key);
            return existing
              ? {
                  ...existing,
                  ...u,
                  sitesRebranded: existing.sitesRebranded || u.sitesRebranded,
                  sitesDeployed: existing.sitesDeployed || u.sitesDeployed,
                  campaignsCount: existing.campaignsCount || u.campaignsCount,
                  businessesRequested: existing.businessesRequested || u.businessesRequested,
                  googleMapsCalls: existing.googleMapsCalls || u.googleMapsCalls,
                }
              : u;
          });
        });
        setStats((prev) =>
          prev
            ? { ...prev, totalUsers: Math.max(prev.totalUsers, data.users.length) }
            : {
                totalUsers: data.users.length,
                totalSitesRebranded: 0,
                totalSitesDeployed: 0,
                totalCampaigns: 0,
                totalBusinessesRequested: 0,
                totalGoogleMapsCalls: 0,
              }
        );
        return data.users;
      }
      return [];
    } finally {
      setLoadingUsers(false);
    }
  };

  const openGrantModal = (target?: AdminUser) => {
    setGrantTargetUser(target || null);
    setGrantIdentifier(target ? target.owner_key : '');
    setGrantUserSearch('');
    setGrantPickerOpen(!target);
    setGrantPlan('');
    setGrantDurationDays('30');
    setGrantLunaoMode('keep');
    setGrantLunaoAmount('');
    setGrantAiMode('keep');
    setGrantAiAmount('');
    setGrantNote('');
    setGrantError(null);
    setGrantSuccess(null);
    setGrantModalOpen(true);
    // Refresh all users instantly in background so the picker is always up to date
    fetchFastUsers().catch(() => {});
  };

  const grantFilteredUsers = useMemo(() => {
    const q = grantUserSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.owner_key.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.plan && u.plan.toLowerCase().includes(q))
    );
  }, [users, grantUserSearch]);

  const handleFillPlanDefaults = (planName: string) => {
    const resolvedPlan = planName || grantTargetUser?.plan || 'Starter Plan';
    const def = PLAN_DEFAULT_CREDITS[resolvedPlan];
    if (!def) return;
    setGrantLunaoMode('set');
    setGrantLunaoAmount(String(def.lunao));
    setGrantAiMode('set');
    setGrantAiAmount(String(def.ai));
  };

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantError(null);
    setGrantSuccess(null);

    const trimmedId = grantIdentifier.trim();
    if (!trimmedId) {
      setGrantError('Please enter a User ID (owner_key) or email address.');
      return;
    }

    const hasPlanChange = Boolean(grantPlan);
    const hasLunaoChange = grantLunaoMode !== 'keep';
    const hasAiChange = grantAiMode !== 'keep';
    if (!hasPlanChange && !hasLunaoChange && !hasAiChange) {
      setGrantError('Choose a plan, Lunao credits change, or AI credits change to apply.');
      return;
    }

    const lunaoNum = hasLunaoChange ? Number(grantLunaoAmount) : 0;
    if (hasLunaoChange && (!Number.isFinite(lunaoNum) || (grantLunaoMode === 'set' && lunaoNum < 0))) {
      setGrantError('Enter a valid Lunao credits number.');
      return;
    }

    const aiNum = hasAiChange ? Number(grantAiAmount) : 0;
    if (hasAiChange && (!Number.isFinite(aiNum) || (grantAiMode === 'set' && aiNum < 0))) {
      setGrantError('Enter a valid AI credits number.');
      return;
    }

    const pwd = sessionStorage.getItem('lunao_admin_secret') || '$KHAN1234455';
    const isEmailLookup = !grantTargetUser && trimmedId.includes('@');

    setGrantSaving(true);
    try {
      const res = await fetch('/api/admin/users/grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': pwd,
          Authorization: `Bearer ${pwd}`,
        },
        body: JSON.stringify({
          ownerKey: isEmailLookup ? undefined : trimmedId,
          email: isEmailLookup ? trimmedId : undefined,
          plan: grantPlan || null,
          durationDays: grantDurationDays === 'lifetime' ? null : Number(grantDurationDays),
          lunaoMode: grantLunaoMode,
          lunaoAmount: lunaoNum,
          aiMode: grantAiMode,
          aiAmount: aiNum,
          note: grantNote,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Request failed (HTTP ${res.status})`);
      }

      const updated = data.user;
      setUsers((prev) => {
        const exists = prev.some((u) => u.owner_key === updated.ownerKey);
        if (exists) {
          return prev.map((u) =>
            u.owner_key === updated.ownerKey
              ? {
                  ...u,
                  email: updated.email || u.email,
                  name: updated.name || u.name,
                  plan: updated.plan,
                  balance: updated.balance,
                  aiCreditsBalance: updated.aiCreditsBalance,
                  planExpiresAt: updated.planExpiresAt,
                }
              : u
          );
        }
        return [
          {
            owner_key: updated.ownerKey,
            email: updated.email,
            name: updated.name,
            plan: updated.plan,
            balance: updated.balance,
            aiCreditsBalance: updated.aiCreditsBalance,
            planExpiresAt: updated.planExpiresAt,
            sitesRebranded: 0,
            sitesDeployed: 0,
            campaignsCount: 0,
            businessesRequested: 0,
            googleMapsCalls: 0,
            lastActive: Date.now(),
          },
          ...prev,
        ];
      });

      setGrantSuccess(
        `Saved to Supabase: ${updated.plan} | Lunao: ${updated.balance} | AI: ${updated.aiCreditsBalance}`
      );
      fetchAdminData(pwd);
      setTimeout(() => {
        setGrantModalOpen(false);
      }, 900);
    } catch (err: any) {
      setGrantError(err.message || 'Failed to update plan & credits');
    } finally {
      setGrantSaving(false);
    }
  };

  const fetchAdminData = async (pwdToUse?: string) => {
    const pwd = pwdToUse || sessionStorage.getItem('lunao_admin_secret') || '$KHAN1234455';
    setLoading(true);
    setError(null);
    try {
      // Load all users immediately via fast endpoint while full overview aggregates in parallel
      const overviewPromise = fetch(`/api/admin/overview?password=${encodeURIComponent(pwd)}`, {
        headers: {
          'X-Admin-Password': pwd,
          'Authorization': `Bearer ${pwd}`,
        },
      });

      const fastUsers = await fetchFastUsers(pwd);
      if (fastUsers.length > 0) {
        setIsAuthenticated(true);
        sessionStorage.setItem(STORAGE_KEY, 'authenticated');
        sessionStorage.setItem('lunao_admin_secret', pwd);
      }

      const res = await overviewPromise;

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Invalid Admin Password. Access Denied.');
        }
        throw new Error(`Failed to load admin metrics: HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Server returned an error');

      setStats(data.stats);
      if (Array.isArray(data.users) && data.users.length > 0) {
        setUsers((prev) => {
          const map = new Map(prev.map((u) => [u.owner_key, u]));
          for (const u of data.users) {
            const existing = map.get(u.owner_key);
            map.set(u.owner_key, existing ? { ...existing, ...u, email: u.email || existing.email, name: u.name || existing.name } : u);
          }
          return Array.from(map.values()).sort((a, b) => (b.sitesRebranded + b.campaignsCount) - (a.sitesRebranded + a.campaignsCount));
        });
      }
      setCampaigns(data.campaigns || []);
      setSites(data.recentSites || []);
      setIsAuthenticated(true);
      sessionStorage.setItem(STORAGE_KEY, 'authenticated');
      sessionStorage.setItem('lunao_admin_secret', pwd);
    } catch (err: any) {
      setError(err.message || 'Error connecting to admin mission control');
      if (err.message.includes('Invalid Admin Password')) {
        setIsAuthenticated(false);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAdminData();
    }
  }, [isAuthenticated]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setAuthError('Please enter the administrator password.');
      return;
    }
    setAuthError(null);
    setLoading(true);
    try {
      await fetchAdminData(password.trim());
    } catch (err: any) {
      setAuthError(err.message || 'Incorrect password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('lunao_admin_secret');
    setPassword('');
  };

  // Filtered lists
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.owner_key.toLowerCase().includes(q) ||
        u.plan.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.name && u.name.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    if (selectedUserFilter) {
      list = list.filter((c) => c.owner_key === selectedUserFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.niche.toLowerCase().includes(q) ||
          c.owner_key.toLowerCase().includes(q)
      );
    }
    return list;
  }, [campaigns, selectedUserFilter, searchQuery]);

  const filteredSites = useMemo(() => {
    let list = sites;
    if (selectedUserFilter) {
      list = list.filter((s) => s.owner_id === selectedUserFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.business_name.toLowerCase().includes(q) ||
          s.city.toLowerCase().includes(q) ||
          s.niche.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          s.owner_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [sites, selectedUserFilter, searchQuery]);

  // Format dates
  const formatDate = (val: string | number | undefined) => {
    if (!val) return '—';
    try {
      const d = typeof val === 'number' ? new Date(val) : new Date(String(val));
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  // -------------------------------------------------------------------------
  // 1. Password Protection Modal
  // -------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-[#0E0F12] text-[#F3F4F6] flex flex-col items-center justify-center p-4 selection:bg-[#2563EB] selection:text-white font-sans">
        <div className="w-full max-w-md bg-[#16181D] border border-[#272A34] rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle lighting sheen */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#2563EB]/20 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[#2563EB]/15 border border-[#2563EB]/30 flex items-center justify-center text-[#3B82F6] shadow-inner">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <Logo size={24} showWordmark />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Executive Mission Control
              </h1>
              <p className="text-xs text-[#9CA3AF] mt-1">
                Restricted platform administration portal
              </p>
            </div>
          </div>

          {authError && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] mb-2">
                Administrator Access Key
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password…"
                  className="w-full h-11 px-4 pr-11 rounded-xl bg-[#1F222A] border border-[#2F333E] focus:border-[#3B82F6] focus:outline-none text-sm text-white placeholder-[#6B7280] transition-colors"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.99] font-medium text-sm text-white flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#2563EB]/25 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials…</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Access Mission Control</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#272A34] text-center">
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Public Site</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 2. Full Admin Dashboard Screen
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen w-full bg-[#0B0C0E] text-[#E5E7EB] font-sans antialiased selection:bg-[#2563EB] selection:text-white pb-20">
      {/* Top Fixed Admin Bar */}
      <header className="sticky top-0 z-30 w-full bg-[#121418]/90 backdrop-blur-md border-b border-[#232630] px-6 lg:px-12 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Logo size={26} showWordmark />
            <div className="h-4 w-px bg-[#2E3340]" />
            <span className="text-xs font-semibold tracking-wider uppercase text-[#3B82F6] bg-[#2563EB]/15 px-2.5 py-1 rounded-md border border-[#2563EB]/30">
              Executive Mission Control
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-[#10B981] bg-[#10B981]/10 px-2.5 py-1 rounded-md border border-[#10B981]/20">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span>Live Cloudflare & Supabase Sync</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchAdminData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1F26] hover:bg-[#262A34] border border-[#2C313E] text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Live Metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-400 transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock Session</span>
          </button>

          <button
            type="button"
            onClick={onNavigateHome}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-white ml-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit Admin</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 lg:px-12 pt-8 space-y-8">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchAdminData()}
              className="underline hover:text-white cursor-pointer ml-4 font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* 6 Hero KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Card 1: Total Users */}
          <div className="p-5 rounded-2xl bg-[#14161C] border border-[#222530] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Registered Users</span>
              <Users className="w-4 h-4 text-[#3B82F6]" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-white">
                {stats ? stats.totalUsers : '—'}
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-1">Tenant accounts</p>
            </div>
          </div>

          {/* Card 2: Total Sites Rebranded */}
          <div className="p-5 rounded-2xl bg-[#14161C] border border-[#222530] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Sites Rebranded</span>
              <Building2 className="w-4 h-4 text-[#A855F7]" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-white">
                {stats ? stats.totalSitesRebranded : '—'}
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-1">Compiled client sites</p>
            </div>
          </div>

          {/* Card 3: Total Sites Deployed */}
          <div className="p-5 rounded-2xl bg-[#14161C] border border-[#222530] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Live Deployed</span>
              <Globe className="w-4 h-4 text-[#10B981]" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-[#10B981]">
                {stats ? stats.totalSitesDeployed : '—'}
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-1">100% Edge HTTP 200</p>
            </div>
          </div>

          {/* Card 4: Google Maps API Calls */}
          <div className="p-5 rounded-2xl bg-[#14161C] border border-[#222530] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Maps API Calls</span>
              <Compass className="w-4 h-4 text-[#F59E0B]" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-[#F59E0B]">
                {stats ? stats.totalGoogleMapsCalls : '—'}
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-1">Places search calls</p>
            </div>
          </div>

          {/* Card 5: Businesses Requested */}
          <div className="p-5 rounded-2xl bg-[#14161C] border border-[#222530] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Requested Leads</span>
              <Layers className="w-4 h-4 text-[#EC4899]" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-white">
                {stats ? stats.totalBusinessesRequested : '—'}
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-1">Target volume across runs</p>
            </div>
          </div>

          {/* Card 6: Total Campaigns */}
          <div className="p-5 rounded-2xl bg-[#14161C] border border-[#222530] flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Campaigns Run</span>
              <Activity className="w-4 h-4 text-[#06B6D4]" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-white">
                {stats ? stats.totalCampaigns : '—'}
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-1">SMS & Email pipelines</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
          {/* Tabs */}
          <div className="flex items-center bg-[#14161C] p-1 rounded-xl border border-[#222530]">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              Users & Rebranded Sites ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('campaigns')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'campaigns'
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              Campaigns & Maps Calls ({campaigns.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sites')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'sites'
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              Live Deployed Sites ({sites.length})
            </button>
          </div>

          {/* Search & Active Filter Chip */}
          <div className="flex items-center gap-2.5">
            {selectedUserFilter && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB]/20 border border-[#2563EB]/40 text-xs text-[#93C5FD]">
                <span>User: {selectedUserFilter.slice(0, 16)}…</span>
                <button
                  type="button"
                  onClick={() => setSelectedUserFilter(null)}
                  className="hover:text-white cursor-pointer ml-1 text-sm font-bold"
                  title="Clear filter"
                >
                  ×
                </button>
              </div>
            )}

            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user, niche, city, site…"
                className="w-full h-10 pl-9 pr-4 rounded-xl bg-[#14161C] border border-[#222530] focus:border-[#3B82F6] focus:outline-none text-xs text-white placeholder-[#6B7280] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* TAB 1: USERS BREAKDOWN TABLE                                       */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'users' && (
          <div className="bg-[#14161C] border border-[#222530] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-[#222530] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">
                  User Accounts & Deployment Portfolio
                </h2>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  Manage plans, Lunao credits, AI credits, rebranded sites, and campaign volume per user
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#9CA3AF]">
                  Showing {filteredUsers.length} account(s)
                </span>
                <button
                  type="button"
                  onClick={() => openGrantModal()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-semibold text-white transition-colors cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Grant Plan / Credits</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#101217] text-[#9CA3AF] uppercase text-[10px] font-semibold tracking-wider border-b border-[#222530]">
                  <tr>
                    <th className="px-6 py-3.5">User / Account ID</th>
                    <th className="px-4 py-3.5">Active Plan</th>
                    <th className="px-4 py-3.5 text-center">Lunao Credits</th>
                    <th className="px-4 py-3.5 text-center">AI Credits</th>
                    <th className="px-4 py-3.5 text-center">Sites Rebranded</th>
                    <th className="px-4 py-3.5 text-center">Sites Deployed</th>
                    <th className="px-4 py-3.5 text-center">Campaigns</th>
                    <th className="px-4 py-3.5 text-center">Maps Calls</th>
                    <th className="px-4 py-3.5">Last Activity</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F222C]">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-[#6B7280]">
                        No user accounts match the search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isFiltered = selectedUserFilter === u.owner_key;
                      const isPaidPlan = u.plan && !u.plan.toLowerCase().includes('free');
                      return (
                        <tr
                          key={u.owner_key}
                          className={`hover:bg-[#1A1D24] transition-colors ${
                            isFiltered ? 'bg-[#2563EB]/10' : ''
                          }`}
                        >
                          <td className="px-6 py-4 max-w-[220px]" title={u.owner_key}>
                            {u.email ? (
                              <div>
                                <div className="font-medium text-white truncate">{u.email}</div>
                                <div className="font-mono text-[10px] text-[#9CA3AF] truncate">{u.owner_key}</div>
                              </div>
                            ) : (
                              <div className="font-mono font-medium text-white truncate">{u.owner_key}</div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col items-start gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#2563EB]/15 text-[#60A5FA] border border-[#2563EB]/30">
                                {u.plan}
                              </span>
                              {isPaidPlan && (
                                <span className="text-[10px] text-[#9CA3AF]">
                                  {u.planExpiresAt
                                    ? `Exp ${new Date(u.planExpiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                    : 'No expiry'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-[#10B981]">
                            {Number(u.balance || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-[#A855F7]">
                            {Number(u.aiCreditsBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-4 text-center font-bold text-white">
                            {u.sitesRebranded}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="font-bold text-[#10B981]">
                              {u.sitesDeployed}
                            </span>
                            {u.sitesRebranded > 0 && (
                              <span className="text-[10px] text-[#9CA3AF] ml-1">
                                ({Math.round((u.sitesDeployed / u.sitesRebranded) * 100)}%)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center text-[#9CA3AF] font-medium">
                            {u.campaignsCount}
                          </td>
                          <td className="px-4 py-4 text-center text-[#F59E0B] font-semibold">
                            {u.googleMapsCalls}
                          </td>
                          <td className="px-4 py-4 text-[#9CA3AF] text-[11px]">
                            {formatDate(u.lastActive)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openGrantModal(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2563EB]/15 hover:bg-[#2563EB]/25 text-[#60A5FA] text-[11px] font-semibold border border-[#2563EB]/30 transition-colors cursor-pointer"
                                title="Change plan or grant Lunao & AI credits"
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                                <span>Manage</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUserFilter(u.owner_key);
                                  setActiveTab('campaigns');
                                }}
                                className="text-xs text-[#F59E0B] hover:text-[#FBBF24] font-medium transition-colors cursor-pointer"
                                title="Inspect this user's campaigns and Google Maps calls"
                              >
                                Campaigns ({u.campaignsCount}) →
                              </button>
                              <span className="text-[#3A3F50]">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUserFilter(isFiltered ? null : u.owner_key);
                                  setActiveTab('sites');
                                }}
                                className="text-xs text-[#3B82F6] hover:text-[#60A5FA] font-medium transition-colors cursor-pointer"
                              >
                                Sites ({u.sitesRebranded}) →
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* TAB 2: CAMPAIGNS & GOOGLE MAPS TELEMETRY                           */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'campaigns' && (
          <div className="bg-[#14161C] border border-[#222530] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-[#222530] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Campaign Runs & Google Maps API Call Telemetry</span>
                  <span className="text-[11px] font-normal text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/25">
                    Max 20 Places / Call
                  </span>
                </h2>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  Inspect exact leads requested by any user, total Google Maps API calls made, and places returned per request
                </p>
              </div>
              <span className="text-xs text-[#9CA3AF]">
                Showing {filteredCampaigns.length} campaign(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#101217] text-[#9CA3AF] uppercase text-[10px] font-semibold tracking-wider border-b border-[#222530]">
                  <tr>
                    <th className="px-6 py-3.5">Campaign Name</th>
                    <th className="px-4 py-3.5">Niche</th>
                    <th className="px-4 py-3.5">Owner / User</th>
                    <th className="px-4 py-3.5 text-center">Volume Requested</th>
                    <th className="px-4 py-3.5 text-center">Google Maps Calls</th>
                    <th className="px-4 py-3.5 text-center">Max / Call</th>
                    <th className="px-4 py-3.5 text-center">Discovered / Found</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">API Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F222C]">
                  {filteredCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-[#6B7280]">
                        No campaign runs match the criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCampaigns.map((c) => {
                      const requested = Number(c.businessesRequested || c.total_leads) || 1;
                      const calls = Number(c.googleMapsCalls) || 1;
                      const isEmail = c.type === 'email';
                      const emailsFound = c.emailsFound !== undefined ? c.emailsFound : (c.sites_generated || 0);

                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-[#1A1D24] transition-colors cursor-pointer group"
                          onClick={() => setInspectingCampaign(c)}
                        >
                          <td className="px-6 py-4 font-semibold text-white group-hover:text-[#60A5FA] transition-colors">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  isEmail
                                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                    : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                }`}
                              >
                                {isEmail ? 'EMAIL' : 'SMS'}
                              </span>
                              <span>{c.name || (isEmail ? 'Email Discovery' : 'Outreach Campaign')}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-[#9CA3AF] capitalize">
                            {c.niche || 'Local Business'}
                          </td>
                          <td className="px-4 py-4 font-mono text-[11px] text-[#9CA3AF] max-w-[140px] truncate" title={c.owner_key}>
                            {c.owner_key}
                          </td>
                          <td className="px-4 py-4 text-center font-bold text-white">
                            <span className="px-2.5 py-1 rounded-md bg-[#2563EB]/15 text-[#93C5FD] border border-[#2563EB]/30">
                              {requested} {isEmail ? 'emails' : 'leads'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold text-[#F59E0B]">
                            {calls} call(s)
                          </td>
                          <td className="px-4 py-4 text-center font-mono text-[#9CA3AF]">
                            20 max
                          </td>
                          <td className="px-4 py-4 text-center font-mono font-bold">
                            {isEmail ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                {emailsFound} emails
                              </span>
                            ) : (
                              <span className="text-[#10B981]">
                                {c.sites_generated || 0} sites
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                c.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              }`}
                            >
                              {c.status || 'completed'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectingCampaign(c);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2563EB]/15 hover:bg-[#2563EB]/25 text-[#60A5FA] text-xs font-medium border border-[#2563EB]/30 transition-colors cursor-pointer"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              <span>Inspect Calls →</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* TAB 3: LIVE DEPLOYED SITES TABLE                                   */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'sites' && (
          <div className="bg-[#14161C] border border-[#222530] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-[#222530] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Live Deployed Client Websites
                </h2>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  100% Edge HTTP 200 URLs serving compiled personalized websites for tenant clients
                </p>
              </div>
              <span className="text-xs text-[#9CA3AF]">
                Showing {filteredSites.length} deployed site(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#101217] text-[#9CA3AF] uppercase text-[10px] font-semibold tracking-wider border-b border-[#222530]">
                  <tr>
                    <th className="px-6 py-3.5">Business Name</th>
                    <th className="px-4 py-3.5">City & Niche</th>
                    <th className="px-4 py-3.5">Owner / User</th>
                    <th className="px-4 py-3.5">Source</th>
                    <th className="px-6 py-3.5">Live Production URL</th>
                    <th className="px-6 py-3.5 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F222C]">
                  {filteredSites.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-[#6B7280]">
                        No deployed sites found for the current search/filter.
                      </td>
                    </tr>
                  ) : (
                    filteredSites.map((s) => {
                      const liveHref = s.slug && s.slug.length <= 63
                        ? `https://${s.slug}.lunao.org`
                        : (s.deploy_url || `https://lunao.org/${s.slug}`);
                      return (
                        <tr key={s.slug} className="hover:bg-[#1A1D24] transition-colors">
                          <td className="px-6 py-4 font-semibold text-white">
                            {s.business_name || s.slug}
                          </td>
                          <td className="px-4 py-4 text-[#9CA3AF]">
                            <span className="text-white font-medium">{s.city || 'Austin'}</span> •{' '}
                            <span className="capitalize">{s.niche || 'Local Business'}</span>
                          </td>
                          <td className="px-4 py-4 font-mono text-[11px] text-[#9CA3AF] max-w-[130px] truncate" title={s.owner_id}>
                            {s.owner_id}
                          </td>
                          <td className="px-4 py-4 text-[#9CA3AF] uppercase text-[10px] font-mono">
                            {s.campaign_source || 'direct'}
                          </td>
                          <td className="px-6 py-4">
                            <a
                              href={liveHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-[#3B82F6] hover:text-[#60A5FA] font-medium underline underline-offset-2 transition-colors"
                            >
                              <span>{s.slug}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </td>
                          <td className="px-6 py-4 text-right text-[#9CA3AF] text-[11px]">
                            {formatDate(s.created_at)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL: CAMPAIGN GOOGLE MAPS TELEMETRY INSPECTOR                     */}
      {/* ------------------------------------------------------------------- */}
      {inspectingCampaign && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#14161C] border border-[#2E3340] rounded-2xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-6 border-b border-[#222530] flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#F59E0B]/15 text-[#FBBF24] border border-[#F59E0B]/30 flex items-center gap-1">
                    <Compass className="w-3 h-3" />
                    Google Maps API Telemetry
                  </span>
                  <span className="text-xs text-[#9CA3AF]">
                    Campaign ID: {inspectingCampaign.id}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {inspectingCampaign.name || 'Outreach Campaign'}
                </h3>
                <p className="text-xs text-[#9CA3AF] font-mono">
                  Owner: {inspectingCampaign.owner_key} • Niche: <span className="text-white capitalize font-sans">{inspectingCampaign.niche}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectingCampaign(null)}
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#222530] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 bg-[#101217] border-b border-[#222530]">
              <div className="p-3 rounded-xl bg-[#181A22] border border-[#252834]">
                <span className="text-[10px] font-semibold uppercase text-[#9CA3AF] block">
                  {inspectingCampaign.type === 'email' ? 'Emails Requested' : 'Leads Requested'}
                </span>
                <span className="text-lg font-bold text-white mt-0.5 block">
                  {inspectingCampaign.businessesRequested || inspectingCampaign.total_leads}
                </span>
                <span className="text-[10px] text-[#9CA3AF]">
                  {inspectingCampaign.type === 'email' ? 'Email discovery target' : 'User target volume'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#181A22] border border-[#252834]">
                <span className="text-[10px] font-semibold uppercase text-[#9CA3AF] block">Maps API Calls</span>
                <span className="text-lg font-bold text-[#F59E0B] mt-0.5 block">
                  {inspectingCampaign.googleMapsCalls} call(s)
                </span>
                <span className="text-[10px] text-[#9CA3AF]">Google Places v1</span>
              </div>

              <div className="p-3 rounded-xl bg-[#181A22] border border-[#252834]">
                <span className="text-[10px] font-semibold uppercase text-[#9CA3AF] block">Max Allowed / Call</span>
                <span className="text-lg font-bold text-[#3B82F6] mt-0.5 block">
                  20 Places
                </span>
                <span className="text-[10px] text-[#9CA3AF]">Google hard ceiling</span>
              </div>

              <div className="p-3 rounded-xl bg-[#181A22] border border-[#252834]">
                <span className="text-[10px] font-semibold uppercase text-[#9CA3AF] block">
                  {inspectingCampaign.type === 'email' ? 'Emails Discovered' : 'Sites Generated'}
                </span>
                <span className="text-lg font-bold text-[#10B981] mt-0.5 block">
                  {inspectingCampaign.type === 'email'
                    ? (inspectingCampaign.emailsFound !== undefined ? inspectingCampaign.emailsFound : inspectingCampaign.sites_generated || 0)
                    : (inspectingCampaign.sites_generated || 0)}
                </span>
                <span className="text-[10px] text-[#9CA3AF]">
                  {inspectingCampaign.type === 'email' ? 'Verified mailboxes' : 'Live client portals'}
                </span>
              </div>
            </div>

            {/* Call-by-Call Breakdown Section */}
            <div className="p-6 space-y-4 max-h-[440px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">
                  Sequential Google Maps API Request Log & Keywords
                </h4>
                <span className="text-[11px] text-[#9CA3AF]">
                  Total {inspectingCampaign.callBreakdown?.length || inspectingCampaign.googleMapsCalls} request(s)
                </span>
              </div>

              <div className="space-y-3">
                {(inspectingCampaign.callBreakdown && inspectingCampaign.callBreakdown.length > 0
                  ? inspectingCampaign.callBreakdown
                  : [
                      {
                        callNumber: 1,
                        query: `${inspectingCampaign.niche} in Local Area`,
                        maxAllowed: 20,
                        placesReturned: inspectingCampaign.businessesRequested || inspectingCampaign.total_leads,
                        validLeadsKept: inspectingCampaign.businessesRequested || inspectingCampaign.total_leads,
                        emailsFound: inspectingCampaign.emailsFound || 0,
                        status: 'HTTP 200 OK — Scraped',
                      },
                    ]
                ).map((call) => (
                  <div
                    key={call.callNumber}
                    className="p-4 rounded-xl bg-[#181A22] border border-[#282C38] flex flex-col gap-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B] font-bold text-xs shrink-0 mt-0.5">
                          #{call.callNumber}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">
                              Google Places SearchText Endpoint
                            </span>
                            <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/20">
                              {call.status}
                            </span>
                            {call.duplicatesFiltered && call.duplicatesFiltered > 0 ? (
                              <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                                {call.duplicatesFiltered} duplicates filtered
                              </span>
                            ) : null}
                          </div>

                          {/* EXACT KEYWORD SEARCH DATA */}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-[#9CA3AF] font-semibold">Exact Keyword Searched:</span>
                            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-[#2563EB]/20 text-[#60A5FA] border border-[#2563EB]/40 select-all">
                              &ldquo;{call.query || `${inspectingCampaign.niche} in Local Area`}&rdquo;
                            </span>
                          </div>

                          <p className="text-[10px] text-[#6B7280] mt-1.5 font-mono">
                            Target Niche: {inspectingCampaign.niche} • Google Maps API v1
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:text-right border-t sm:border-t-0 border-[#222530] pt-2 sm:pt-0 shrink-0 self-end sm:self-center">
                        <div className="bg-[#111317] px-3 py-1.5 rounded-lg border border-[#222530]">
                          <span className="text-[9px] text-[#9CA3AF] uppercase block">Places Returned</span>
                          <span className="text-xs font-bold text-[#10B981]">
                            {call.placesReturned} Places
                          </span>
                        </div>
                        <div className="bg-[#111317] px-3 py-1.5 rounded-lg border border-[#222530]">
                          <span className="text-[9px] text-[#9CA3AF] uppercase block">Per-Call Limit</span>
                          <span className="text-xs font-mono text-[#9CA3AF]">
                            max {call.maxAllowed || 20}
                          </span>
                        </div>
                        <div className="bg-[#111317] px-3 py-1.5 rounded-lg border border-[#222530]">
                          <span className="text-[9px] text-[#9CA3AF] uppercase block">
                            {inspectingCampaign.type === 'email' ? 'Emails Found' : 'Valid Added'}
                          </span>
                          <span className="text-xs font-bold text-emerald-400">
                            +{call.emailsFound !== undefined ? call.emailsFound : call.validLeadsKept}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#101217] border-t border-[#222530] flex items-center justify-between">
              <span className="text-[11px] text-[#9CA3AF]">
                Google Places API pricing: $0 per month up to free credit quota
              </span>
              <button
                type="button"
                onClick={() => setInspectingCampaign(null)}
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL: GRANT PLAN, LUNAO CREDITS & AI CREDITS                       */}
      {/* ------------------------------------------------------------------- */}
      {grantModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-xl bg-[#14161C] border border-[#2E3340] rounded-2xl shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-[#222530] flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#2563EB]/15 text-[#60A5FA] border border-[#2563EB]/30 inline-flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" />
                    Supabase Plan & Credit Control
                  </span>
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  {grantTargetUser ? 'Manage User Plan & Credits' : 'Grant Plan & Credits to User'}
                </h3>
                {grantTargetUser && (
                  <p className="text-xs text-[#9CA3AF] mt-0.5 font-mono">
                    {grantTargetUser.email ? `${grantTargetUser.email} • ` : ''}
                    {grantTargetUser.owner_key}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setGrantModalOpen(false)}
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#222530] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGrantSubmit} className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
              {/* All-Users Live Picker inside Plan Grant Section */}
              <div className="p-3.5 rounded-xl bg-[#101217] border border-[#222530] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-[#3B82F6]" />
                    <span className="text-xs font-bold text-white">
                      Select User ({users.length} loaded)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchFastUsers().catch(() => {})}
                      disabled={loadingUsers}
                      className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-white cursor-pointer disabled:opacity-50"
                      title="Reload all users from Supabase"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingUsers ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    {grantTargetUser && (
                      <button
                        type="button"
                        onClick={() => setGrantPickerOpen((v) => !v)}
                        className="text-[11px] font-semibold text-[#60A5FA] hover:text-[#93C5FD] underline cursor-pointer"
                      >
                        {grantPickerOpen ? 'Hide List' : 'Switch User'}
                      </button>
                    )}
                  </div>
                </div>

                {grantTargetUser && (
                  <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg bg-[#161922] border border-[#2563EB]/30">
                    <div>
                      <span className="text-[10px] uppercase text-[#9CA3AF] block">Current Plan</span>
                      <span className="text-xs font-bold text-[#60A5FA]">{grantTargetUser.plan}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[#9CA3AF] block">Lunao Credits</span>
                      <span className="text-xs font-mono font-bold text-[#10B981]">
                        {Number(grantTargetUser.balance || 0).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[#9CA3AF] block">AI Credits</span>
                      <span className="text-xs font-mono font-bold text-[#A855F7]">
                        {Number(grantTargetUser.aiCreditsBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {grantPickerOpen && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={grantUserSearch}
                        onChange={(e) => setGrantUserSearch(e.target.value)}
                        placeholder="Search all users by email, name, account ID, or plan…"
                        className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#181A22] border border-[#2B303D] focus:border-[#3B82F6] focus:outline-none text-xs text-white placeholder-[#6B7280]"
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-[#1F222C] rounded-lg border border-[#222530] bg-[#14161C]">
                      {loadingUsers && users.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#9CA3AF]">Loading all users from Supabase…</div>
                      ) : grantFilteredUsers.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#6B7280]">No users match your search.</div>
                      ) : (
                        grantFilteredUsers.map((u) => {
                          const isSelected = grantTargetUser?.owner_key === u.owner_key;
                          return (
                            <button
                              key={u.owner_key}
                              type="button"
                              onClick={() => {
                                setGrantTargetUser(u);
                                setGrantIdentifier(u.owner_key);
                                setGrantPickerOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                isSelected ? 'bg-[#2563EB]/20' : 'hover:bg-[#1C1F28]'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-white truncate">
                                  {u.email || u.name || u.owner_key}
                                </div>
                                {u.email && (
                                  <div className="text-[10px] font-mono text-[#9CA3AF] truncate">{u.owner_key}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
                                <span className="px-1.5 py-0.5 rounded bg-[#2563EB]/15 text-[#60A5FA] border border-[#2563EB]/30 font-sans font-semibold">
                                  {u.plan}
                                </span>
                                <span className="text-[#10B981] font-bold">{Number(u.balance || 0).toLocaleString()}L</span>
                                <span className="text-[#A855F7] font-bold">
                                  {Number(u.aiCreditsBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}AI
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {!grantTargetUser && (
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">
                      Or Enter Email / Account ID Manually
                    </label>
                    <input
                      type="text"
                      value={grantIdentifier}
                      onChange={(e) => setGrantIdentifier(e.target.value)}
                      placeholder="user@example.com or owner_key…"
                      className="w-full h-9 px-3 rounded-lg bg-[#181A22] border border-[#2B303D] focus:border-[#3B82F6] focus:outline-none text-xs text-white placeholder-[#6B7280]"
                    />
                  </div>
                )}
              </div>

              {/* Plan + Duration */}
              <div className="space-y-2.5 p-4 rounded-xl bg-[#101217] border border-[#222530]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white">Subscription Plan</label>
                  <button
                    type="button"
                    onClick={() => handleFillPlanDefaults(grantPlan)}
                    className="text-[11px] font-semibold text-[#60A5FA] hover:text-[#93C5FD] underline cursor-pointer"
                  >
                    Fill Plan Default Credits
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[10px] uppercase text-[#9CA3AF] mb-1">Target Plan</span>
                    <select
                      value={grantPlan}
                      onChange={(e) => setGrantPlan(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#181A22] border border-[#2B303D] focus:border-[#3B82F6] focus:outline-none text-xs text-white"
                    >
                      <option value="">Keep Current ({grantTargetUser?.plan || 'Unchanged'})</option>
                      {PLAN_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-[#9CA3AF] mb-1">Plan Validity</span>
                    <select
                      value={grantDurationDays}
                      onChange={(e) => setGrantDurationDays(e.target.value)}
                      disabled={!grantPlan || grantPlan === 'Free Plan'}
                      className="w-full h-9 px-3 rounded-lg bg-[#181A22] border border-[#2B303D] focus:border-[#3B82F6] focus:outline-none text-xs text-white disabled:opacity-50"
                    >
                      <option value="30">30 Days (Standard)</option>
                      <option value="90">90 Days (Quarter)</option>
                      <option value="365">365 Days (1 Year)</option>
                      <option value="lifetime">No Expiry (Lifetime)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Lunao Credits & AI Credits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Lunao Action Credits */}
                <div className="p-4 rounded-xl bg-[#101217] border border-[#222530] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white inline-flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-[#10B981]" />
                      Lunao Credits
                    </span>
                  </div>
                  <select
                    value={grantLunaoMode}
                    onChange={(e) => setGrantLunaoMode(e.target.value as 'keep' | 'add' | 'set')}
                    className="w-full h-9 px-3 rounded-lg bg-[#181A22] border border-[#2B303D] focus:border-[#10B981] focus:outline-none text-xs text-white"
                  >
                    <option value="keep">Keep Current</option>
                    <option value="add">Add / Subtract (+/-)</option>
                    <option value="set">Set Exact Balance (=)</option>
                  </select>
                  <input
                    type="number"
                    step="0.5"
                    value={grantLunaoAmount}
                    onChange={(e) => setGrantLunaoAmount(e.target.value)}
                    disabled={grantLunaoMode === 'keep'}
                    placeholder={grantLunaoMode === 'add' ? 'e.g. 500 or -50' : 'e.g. 6500'}
                    className="w-full h-9 px-3 rounded-lg bg-[#181A22] border border-[#2B303D] focus:border-[#10B981] focus:outline-none text-xs text-white placeholder-[#6B7280] disabled:opacity-40"
                  />
                  {grantTargetUser && grantLunaoMode !== 'keep' && grantLunaoAmount !== '' && !isNaN(Number(grantLunaoAmount)) && (
                    <p className="text-[11px] text-[#10B981] font-mono">
                      New balance:{' '}
                      {(grantLunaoMode === 'set'
                        ? Math.max(0, Number(grantLunaoAmount))
                        : Math.max(0, Number(grantTargetUser.balance || 0) + Number(grantLunaoAmount))
                      ).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* AI Vibe Credits */}
                <div className="p-4 rounded-xl bg-[#101217] border border-[#222530] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#A855F7]" />
                      AI Credits
                    </span>
                  </div>
                  <select
                    value={grantAiMode}
                    onChange={(e) => setGrantAiMode(e.target.value as 'keep' | 'add' | 'set')}
                    className="w-full h-9 px-3 rounded-lg bg-[#181A22] border border-[#2B303D] focus:border-[#A855F7] focus:outline-none text-xs text-white"
                  >
                    <option value="keep">Keep Current</option>
                    <option value="add">Add / Subtract (+/-)</option>
                    <option value="set">Set Exact Balance (=)</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={grantAiAmount}
                    onChange={(e) => setGrantAiAmount(e.target.value)}
                    disabled={grantAiMode === 'keep'}
                    placeholder={grantAiMode === 'add' ? 'e.g. 500 or -50' : 'e.g. 1300'}
                    className="w-full h-9 px-3 rounded-lg bg-[#181A22] border border-[#2B303D] focus:border-[#A855F7] focus:outline-none text-xs text-white placeholder-[#6B7280] disabled:opacity-40"
                  />
                  {grantTargetUser && grantAiMode !== 'keep' && grantAiAmount !== '' && !isNaN(Number(grantAiAmount)) && (
                    <p className="text-[11px] text-[#A855F7] font-mono">
                      New balance:{' '}
                      {(grantAiMode === 'set'
                        ? Math.max(0, Number(grantAiAmount))
                        : Math.max(0, Number(grantTargetUser.aiCreditsBalance ?? 0) + Number(grantAiAmount))
                      ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              </div>

              {/* Optional Audit Note */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">
                  Audit Note (optional)
                </label>
                <input
                  type="text"
                  value={grantNote}
                  onChange={(e) => setGrantNote(e.target.value)}
                  placeholder="e.g. Partner comp upgrade, VIP bonus credits…"
                  className="w-full h-9 px-3 rounded-lg bg-[#101217] border border-[#282C38] focus:border-[#3B82F6] focus:outline-none text-xs text-white placeholder-[#6B7280]"
                />
              </div>

              {grantError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{grantError}</span>
                </div>
              )}
              {grantSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{grantSuccess}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#222530]">
                <button
                  type="button"
                  onClick={() => setGrantModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1F26] hover:bg-[#262A34] border border-[#2C313E] text-xs font-medium text-[#9CA3AF] hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={grantSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-60"
                >
                  {grantSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Supabase…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Plan & Credits</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
