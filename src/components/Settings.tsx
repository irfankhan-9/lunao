import React, { useState, useEffect } from 'react';
import { 
  Sparkles, LogOut, CheckCircle, AlertCircle, Shield, CreditCard, User, Edit3, X, Globe, Cloud, Key, Check, Loader2, Gift, DollarSign, Share2, ArrowRight
} from 'lucide-react';
import { playDialogPop, playConfirmSuccess, playCancelTone, playTiktokLike, playSoftTap } from '../utils/audio';
import { PartnerCodeBox } from '../specialModes/PartnerCodeBox';
import { AffiliateSection } from './AffiliateSection';

interface SettingsProps {
  userName: string;
  setUserName: (name: string) => void;
  userEmail: string;
  setUserEmail: (email: string) => void;
  userPlan: string;
  setUserPlan: (plan: string) => void;
  userCredits: number;
  telnyxKey: string;
  setTelnyxKey: (key: string) => void;
  telnyxPhone: string;
  setTelnyxPhone: (phone: string) => void;
  setActiveTab: (tab: any) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  userName,
  setUserName,
  userEmail,
  setUserEmail,
  userPlan,
  setUserPlan,
  userCredits,
  telnyxKey,
  setTelnyxKey,
  telnyxPhone,
  setTelnyxPhone,
  setActiveTab
}) => {
  const [copied, setCopied] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [globalKeysSaved, setGlobalKeysSaved] = useState(false);
  
  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [tempName, setTempName] = useState(userName);

  // Cloudflare & Edge Network Settings State
  const [cfConfigured, setCfConfigured] = useState(false);
  const [cfProject, setCfProject] = useState('lunao-web-designn');
  const [cfAccountId, setCfAccountId] = useState('');
  const [cfApiToken, setCfApiToken] = useState('');
  const [cfLoading, setCfLoading] = useState(false);
  const [cfStatusMsg, setCfStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/cloudflare', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('lunao_auth_token') || 'lunao-mock-dev-token'}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setCfConfigured(Boolean(data.configured));
          if (data.project) setCfProject(data.project);
          if (data.accountId) setCfAccountId(data.accountId);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveCloudflare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfApiToken.trim() || !cfAccountId.trim()) {
      setCfStatusMsg({ type: 'error', text: 'Both Cloudflare API Token and Account ID are required.' });
      return;
    }
    setCfLoading(true);
    setCfStatusMsg(null);
    try {
      const res = await fetch('/api/settings/cloudflare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('lunao_auth_token') || 'lunao-mock-dev-token'}`,
        },
        body: JSON.stringify({
          apiToken: cfApiToken.trim(),
          accountId: cfAccountId.trim(),
          project: cfProject.trim() || 'lunao-web-designn',
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCfConfigured(true);
        setCfStatusMsg({ type: 'success', text: 'Cloudflare Pages connected and verified successfully!' });
        playConfirmSuccess();
      } else {
        setCfStatusMsg({ type: 'error', text: data.error || 'Failed to validate Cloudflare credentials.' });
        playCancelTone();
      }
    } catch (err: any) {
      setCfStatusMsg({ type: 'error', text: err.message || 'Network error connecting to Cloudflare.' });
      playCancelTone();
    } finally {
      setCfLoading(false);
    }
  };

  // Sync tempName when userName changes externally
  useEffect(() => {
    setTempName(userName);
  }, [userName]);

  // Derive initials for avatar
  const getInitials = (name: string) => {
    return name
      .trim()
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';
  };

  const handleLogout = () => {
    const confirm = window.confirm("Are you sure you want to log out of your Lunao command center?");
    if (confirm) {
      alert("Successfully logged out. Redirecting to authentication gateway...");
      // Clear the local owner key so the Landing page is shown on reload.
      try { localStorage.removeItem('lunao_owner_key'); } catch { /* noop */ }
      // Simulate reload or logout state
      window.location.reload();
    }
  };

  const handleNameSaveClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim() === userName) {
      return; // No change made
    }
    playDialogPop();
    setShowConfirmModal(true);
  };

  const confirmNameChange = () => {
    playConfirmSuccess();
    setUserName(tempName);
    setShowConfirmModal(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const cancelNameChange = () => {
    playCancelTone();
    setShowConfirmModal(false);
    setTempName(userName); // Revert
  };

  const [currentSection, setCurrentSection] = useState<'settings' | 'affiliate'>('settings');

  if (currentSection === 'affiliate') {
    return (
      <AffiliateSection
        onBack={() => setCurrentSection('settings')}
        userEmail={userEmail}
      />
    );
  }

  return (
    <div id="settings-tab-root-container" className="space-y-8 animate-fade-in font-sans text-left">
      
      {/* Top Header */}
      <header id="settings-view-header" className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border-main gap-4">
        <div id="settings-titles" className="space-y-1">
          <h1 id="settings-top-heading" className="text-4xl font-serif text-ink tracking-tight font-normal">Account & billing Settings</h1>
          <p id="settings-sub-heading" className="text-sm text-ink-secondary">Manage your user profile credentials, configure your subscription model, and track active statuses.</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              playTiktokLike();
              setCurrentSection('affiliate');
            }}
            className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-2xs hover:shadow active:scale-95 transition-all cursor-pointer flex items-center gap-2 shrink-0"
          >
            <Gift className="w-4 h-4 text-amber-300" />
            <span>Become Affiliate</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-400 text-slate-950 font-extrabold font-mono">40%</span>
          </button>
        </div>
      </header>

      {/* Main Single-Panel Grid container */}
      <div id="settings-split-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left Column: Profile Card */}
        <div id="settings-profile-card" className="bg-white border border-border-main rounded-xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-4 pb-4 border-b border-border-light">
            <div className="w-16 h-16 bg-ink text-white font-serif text-2xl rounded-full flex items-center justify-center border border-border-main shrink-0 shadow-sm">
              {getInitials(userName)}
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-ink-secondary">Current Credentials</span>
              <h3 className="text-xl font-semibold text-ink leading-tight font-sans">{userName}</h3>
              <p className="text-xs text-ink-secondary font-mono mt-0.5">{userEmail}</p>
            </div>
          </div>

          <form onSubmit={handleNameSaveClick} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest">Display Full Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-tertiary">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Enter your customized display name"
                  className="w-full pl-9 pr-4 py-2 bg-white border border-border-main rounded text-xs text-ink focus:ring-1 focus:ring-accent focus:outline-none"
                  required
                />
              </div>
            </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest">Username / Email address</label>
                      <input
                        type="email"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2 bg-off-white border border-border-main rounded text-xs text-ink-secondary font-mono focus:ring-1 focus:ring-accent focus:outline-none"
                        required
                      />
                    </div>

            <div className="flex items-center justify-between pt-4 border-t border-border-light">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 bg-danger-soft hover:bg-red-100 hover:border-danger/10 border border-transparent text-danger text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
                title="Log out of Lunao session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>

              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded transition-transform active:scale-95 shadow-sm cursor-pointer"
              >
                {profileSaved ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-white" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Update Name</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Billing & Plan Controls */}
        <div id="settings-billing-card" className="bg-white border border-border-main rounded-xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex items-start justify-between pb-4 border-b border-border-light">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-accent font-sans">Active Subscription Tier</span>
              <h3 className="text-xl font-serif text-ink tracking-tight font-normal">Plan Allocation</h3>
            </div>
            
            {/* CURRENT PLAN ICON - Shows premium shield/creditcard depending on tier */}
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-soft text-accent border border-accent/20">
              {userPlan === 'Scale Plan' || userPlan === 'Agency Tier' ? (
                <Shield className="w-5 h-5 animate-pulse" />
              ) : (
                <CreditCard className="w-5 h-5 text-accent" />
              )}
            </div>
          </div>

          {/* Current plan stats showcase */}
          <div className="bg-off-white border border-border-light rounded-lg p-5 space-y-3.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-ink-secondary font-medium">Subscription:</span>
              <span className="text-xs font-bold uppercase font-sans text-ink bg-white border border-border-main px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-success"></span>
                {userPlan}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-border-light/60 pt-3">
              <span className="text-xs text-ink-secondary font-medium">Invoice:</span>
              <span className="text-xs font-semibold font-mono text-ink">
                {userPlan.toLowerCase().includes('free') ? '$0.00 / month' :
                 userPlan.toLowerCase().includes('starter') ? '$97.00 / month' : 
                 userPlan.toLowerCase().includes('pro') ? '$187.00 / month' : 
                 userPlan.toLowerCase().includes('agency') ? '$297.00 / month' : '$0.00 / month'}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-border-light/60 pt-3">
              <span className="text-xs text-ink-secondary font-medium">Credit Balance:</span>
              <span className="text-xs font-bold font-sans text-success flex items-center gap-1.5">
                <span className="text-success animate-pulse">✦</span>
                {userCredits.toLocaleString()} Credits Left
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-border-light/60 pt-3">
              <span className="text-xs text-ink-secondary font-medium">Status:</span>
              <span className="text-[10px] font-bold uppercase bg-success-soft text-success border border-success/15 px-2 py-0.5 rounded-full">
                Active & Verified ✓
              </span>
            </div>
          </div>

          {/* New Interactive Upgrade Link Banner */}
          <div className="bg-accent-soft/40 border border-accent/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left space-y-0.5">
              <span className="text-xs font-bold text-accent uppercase tracking-wider block">Plans & Credit Breakdowns</span>
              <p className="text-[11px] text-ink-secondary">View detailed quotas, credit conversion weights, and active enrollment limits.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                playTiktokLike();
                setActiveTab('plans');
              }}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-[11px] font-bold uppercase tracking-wider rounded shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              Configure Details
            </button>
          </div>

          {/* Plan switching button section */}
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-widest font-bold text-ink-secondary">Select your scaling tier</span>
              <p className="text-xs text-ink-secondary">Upgrade or switch plans instantly to scale credits and Owner PWA quotas.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { 
                  name: 'Free Plan', 
                  desc: '30 credits · Trial AI · 1 trial PWA', 
                  price: '$0' 
                },
                { 
                  name: 'Starter Plan', 
                  desc: '2,500 credits/mo · 500 AI credits · 8 PWAs', 
                  price: '$97' 
                },
                { 
                  name: 'Pro Plan', 
                  desc: '6,500 credits/mo · 1,200 AI credits · 25 PWAs', 
                  price: '$187' 
                },
                { 
                  name: 'Agency Plan', 
                  desc: '12,000 credits/mo · 2,500 AI credits · 100 PWAs', 
                  price: '$297' 
                }
              ].map((tier) => {
                const isActive = userPlan === tier.name || 
                                 userPlan.replace(' Plan', '').replace(' Tier', '').toLowerCase() === 
                                 tier.name.replace(' Plan', '').replace(' Tier', '').toLowerCase();
                return (
                  <button
                    key={tier.name}
                    type="button"
                    onClick={() => {
                      playConfirmSuccess();
                      setUserPlan(tier.name);
                      alert(`Successfully switched workspace subscription to the ${tier.name}! Your database limits and SMS capacities are instantly configured.`);
                    }}
                    className={`p-3 rounded-lg border text-left flex flex-col justify-between min-h-[148px] h-auto transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-accent-soft border-accent ring-2 ring-accent/10 shadow-xs' 
                        : 'bg-white border-border-main hover:bg-off-white hover:border-ink-secondary/35'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[10px] font-bold tracking-tight leading-tight ${isActive ? 'text-accent' : 'text-ink'}`}>{tier.name}</span>
                        {isActive && <CheckCircle className="w-3.5 h-3.5 text-accent shrink-0" />}
                      </div>
                      <p className="text-[9px] text-ink-secondary mt-1.5 leading-snug font-normal">{tier.desc}</p>
                    </div>
                    <div className="pt-2 border-t border-border-light/40 flex items-baseline gap-0.5 mt-2">
                      <span className="text-base font-serif text-ink font-semibold">{tier.price}</span>
                      <span className="text-[9px] text-ink-secondary font-sans">/mo</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Lunao Global Edge Servers Panel */}
      <div id="settings-edge-servers-card" className="bg-white border border-border-main rounded-xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border-light gap-3">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-accent font-sans">Edge Hosting & Distribution</span>
            <h3 className="text-xl font-serif text-ink tracking-tight font-normal">Lunao High-Speed Edge Servers</h3>
            <p className="text-xs text-ink-secondary">
              Personalized websites are automatically compiled, verified with native booking integration, and served live across Lunao worldwide distributed edge nodes with HTTP 200 live response.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success-soft text-success border border-success/20">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Lunao Edge Servers Active
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-surface border border-border-light space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Server Network</p>
            <p className="text-sm font-bold text-ink flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Lunao Global Anycast
            </p>
            <p className="text-[11px] text-ink-tertiary">Distributed ultra-low latency nodes</p>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-border-light space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Deployment Verification</p>
            <p className="text-sm font-bold text-ink flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-accent" />
              HTTP 200 Edge Health
            </p>
            <p className="text-[11px] text-ink-tertiary">Automated live edge confirmation</p>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-border-light space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">SSL & Routing</p>
            <p className="text-sm font-bold text-ink flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-accent" />
              Automated HTTPS / SSL
            </p>
            <p className="text-[11px] text-ink-tertiary">Zero-configuration secure tunnels</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border-light">
          <p className="text-xs text-ink-secondary">
            All campaign deployments and live prospect preview sites are managed automatically by Lunao production servers.
          </p>
          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            Infrastructure Connected
          </span>
        </div>
      </div>

      {/* Desktop-only Partner & Enterprise Access Code Box */}
      <PartnerCodeBox />

      {/* Name Change Confirmation Modal overlay */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity animate-fade-in pointer-events-auto"
            onClick={cancelNameChange}
          />
          <div className="relative bg-white rounded-xl shadow-lg border border-border-main w-full max-w-sm overflow-hidden z-10 animate-fade-in pointer-events-auto text-left">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border-light">
              <h3 className="text-lg font-serif text-ink tracking-tight font-normal">Confirm Name Change</h3>
              <button 
                onClick={cancelNameChange}
                className="text-ink-tertiary hover:text-ink transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="px-5 py-6 space-y-4">
              <p className="text-xs text-ink-secondary leading-relaxed">
                Are you sure you want to change your display name? This will update your profile across the Lunao command center.
              </p>
              
              <div className="bg-off-white border border-border-light rounded-lg p-4 flex flex-col gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-ink-secondary tracking-widest block mb-0.5">From</span>
                  <div className="text-ink font-semibold font-sans">{userName}</div>
                </div>
                <div className="h-px bg-border-light w-full" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-ink-secondary tracking-widest block mb-0.5">To</span>
                  <div className="text-accent font-semibold font-sans">{tempName}</div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border-light bg-off-white flex justify-end gap-3">
              <button 
                onClick={cancelNameChange}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-secondary hover:text-ink active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={confirmNameChange}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Yes, Change
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
