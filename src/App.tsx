import { useState, useEffect } from 'react';
import { Home, Megaphone, LayoutTemplate, MessageSquare, Settings as SettingsIcon, CreditCard, Code2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Campaigns } from './components/Campaigns';
import { Templates } from './components/Templates';
import { Editor } from './components/Editor';
import { Settings } from './components/Settings';
import { Plans } from './components/Plans';
import { playTiktokLike, playSoftTap } from './utils/audio';
import { Landing } from './Landing';
import { GateProvider, useGate } from './contexts/GateContext';
import {
  initialCampaigns,
  initialBusinesses,
  initialTemplates,
  initialSmsLogs
} from './data';
import { SidebarTab, Campaign, Business, SmsLog, CampaignEmailLead, CampaignDeployedSite } from './types';

const ROUTE_STORAGE = 'lunao_route';

// ---------------------------------------------------------------------------
// ActiveCampaignRun: in-memory registry of campaigns currently being processed
// by the backend pipeline. The wizard pushes a row here the moment the server
// returns the campaignId, ticks the counters as SSE events stream in, and the
// user can click Stop to soft-cancel the run. Lifted to the App root so the
// wizard and the Active Campaigns card stay in sync without prop drilling.
// ---------------------------------------------------------------------------
export interface ActiveCampaignRun {
  id: string;
  kind: 'site-deploy' | 'email';
  name: string;
  niche: string;
  total: number;
  done: number;
  status: 'starting' | 'running' | 'cancelling' | 'cancelled' | 'completed';
  startedAt: number;
  errorMessage?: string;
  // Site-deploy fields
  deployedSites?: CampaignDeployedSite[];
  // Email fields
  sitesGenerated?: number;
  emailsSent?: number;
  emailsFailed?: number;
  accountsUsed?: number;
  emailLeads?: CampaignEmailLead[];
  // Dork (Auto Email Sender) fields — drives the Leads tile in the
  // floating progress toggle and the post-launch success card.
  leadSource?: 'csv' | 'dork';
  leadsFound?: number;
  leadsTarget?: number;
}

const readRoute = (): '/' | '/app' => {
  try {
    const r = localStorage.getItem(ROUTE_STORAGE);
    return r === '/app' ? '/app' : '/';
  } catch {
    return '/';
  }
};

const writeRoute = (route: '/' | '/app') => {
  try {
    if (route === '/app') localStorage.setItem(ROUTE_STORAGE, '/app');
    else localStorage.removeItem(ROUTE_STORAGE);
  } catch { /* noop */ }
};

// Root router: defers to GateProvider for the password-wall session.
export default function App() {
  return (
    <GateProvider>
      <AppRouter />
    </GateProvider>
  );
}

function AppRouter() {
  const { unlocked, loading } = useGate();
  const [route, setRoute] = useState<'/' | '/app'>(() => readRoute());

  useEffect(() => {
    writeRoute(route);
  }, [route]);

  // Once we know we're unlocked (cookie valid), force the route to /app so
  // a reload on /app stays on the dashboard. This handles the flow where
  // /site-gate redirects the browser to /app after a successful unlock.
  useEffect(() => {
    if (!loading && unlocked && route !== '/app') {
      setRoute('/app');
    }
  }, [loading, unlocked, route]);

  // Bounce /app back to / if the gate is locked. The Landing page renders a
  // "Continue to dashboard" button that flips to /app once the gate cookie
  // is set, so a reload after entering the password works seamlessly.
  useEffect(() => {
    if (route === '/app' && !unlocked) {
      setRoute('/');
    }
  }, [route, unlocked]);

  // While checking the session, show nothing (prevents flash of landing while authed).
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-off-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-ink-tertiary">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return <Landing />;
  }

  return <DashboardApp />;
}

// The original dashboard tree lives here, unmodified.
function DashboardApp() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [bouncingTab, setBouncingTab] = useState<string | null>(null);
  // Optional scroll-to target id. When the dashboard's "Manage all
  // campaigns" link (or any other cross-tab jump) sets this before
  // switching tabs, the scroll effect below lands on the matching
  // element instead of resetting to the page top. One-shot — cleared
  // right after the scroll so a subsequent tab switch behaves normally.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  useEffect(() => {
    const mainEl = document.getElementById('main-content-flow');
    if (!mainEl) return;
    if (scrollTarget) {
      // Defer to the next frame so the newly-rendered tab has time to
      // mount its target element before we try to scroll to it.
      const id = scrollTarget;
      window.requestAnimationFrame(() => {
        // For Recent Campaigns, try to land directly on the matching
        // CARD (`rcard-<campaignId>`) before falling back to the section
        // anchor. The card-level target gives a clean "you arrived at
        // this campaign" feeling with the pulse ring centered on it.
        const isRcardCampaignView = id.startsWith('rcard-campaign-');
        const candidateId = isRcardCampaignView ? id : id;
        const targetEl = document.getElementById(candidateId) || document.getElementById(id);
        if (targetEl) {
          // Per-card targets (sd-card-*, rcard-<campaignId>) are individual
          // rows, so we center them in the viewport for a clean "you
          // arrived here" feeling. Section-level targets align to the top
          // so the heading + filter tabs are both visible above the fold.
          const isCard = candidateId.startsWith('sd-card-')
            || candidateId.startsWith('rcard-')
            || candidateId.startsWith('rcard-campaign-');
          targetEl.scrollIntoView({ behavior: 'smooth', block: isCard ? 'center' : 'start' });
          // Briefly highlight the target so the user sees where they
          // landed. The class is removed after the animation finishes.
          targetEl.classList.add('scroll-target-pulse');
          window.setTimeout(() => targetEl.classList.remove('scroll-target-pulse'), 1400);
        }
        mainEl.scrollTop = Math.max(0, mainEl.scrollTop - 80);
        setScrollTarget(null);
      });
    } else {
      mainEl.scrollTop = 0;
    }
  }, [activeTab, scrollTarget]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // One-click "View details" handler. Used by both the Dashboard's
  // Recent Campaign rows and the EmailCampaignWizard's celebration card.
  // Lands the user DIRECTLY on the matching card (`rcard-<id>`) inside
  // the Recent Campaigns section, centers it in the viewport, and
  // briefly pulses the card with the existing `scroll-target-pulse`
  // keyframe so they see exactly where they arrived.
  const handleViewCampaign = (campaignId: string) => {
    // Defer to the next frame so the Campaigns tab has time to mount
    // before we try to scroll to the card. This avoids the
    // "scroll target not found" race when the user is on Dashboard.
    window.requestAnimationFrame(() => {
      // Prefer the card-level target so we land exactly on the campaign
      // row. If the card isn't mounted yet (filtered list, etc.), the
      // App.tsx scroll effect falls back to the section anchor below.
      setScrollTarget(`rcard-${campaignId}`);
      // Safety fallback in case the campaign id doesn't match any card
      // (e.g. local optimistic id before server returns the real one):
      // schedule a second pass that targets the section so the user
      // still lands on the Recent Campaigns surface.
      window.setTimeout(() => {
        const stillTarget = document.getElementById('rcard-section');
        if (stillTarget && !document.getElementById(`rcard-${campaignId}`)) {
          setScrollTarget('rcard-section');
        }
      }, 400);
    });
    setActiveTab('campaigns');
  };

  // One-click "Edit outreach" handler. Used by Recent Campaign rows
  // (the pencil button on email rows). Stores the source campaign's
  // subject/body so the Campaigns tab's email sub-wizard picks them up
  // via the `initialEmailSubject`/`initialEmailBody` props below. We
  // also bump `initialEmailNonce` so the receiving effect re-fires
  // even when the user re-edits the same campaign (same string → no
  // identity change otherwise).
  const [editOutreachPayload, setEditOutreachPayload] = useState<{
    subject: string;
    body: string;
    nonce: number;
  } | null>(null);
  const handleEditOutreach = (camp: Campaign) => {
    const subject = (camp as any).emailSubject || '';
    const body = (camp as any).emailBody || '';
    setEditOutreachPayload({ subject, body, nonce: Date.now() });
    setActiveTab('campaigns');
    // Scroll to the email wizard area so the user sees the pre-filled
    // message without scrolling for it.
    setScrollTarget('sd-campaigns-card-strip');
  };

  const loadPersisted = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    const persisted = loadPersisted('lunao_campaigns', initialCampaigns);
    // Reconcile stale Site Deploy rows on load: any campaign with type
    // 'site-deploy' and a persisted result in localStorage is definitively
    // finished (Cloudflare has already responded). Promoting those rows to
    // 'Completed' prevents the dashboard from forever showing the
    // "deploying…" shimmer for campaigns the user ran in earlier sessions.
    let sdResults: Record<string, unknown> = {};
    try {
      sdResults = JSON.parse(localStorage.getItem('lunao_sd_results') || '{}') || {};
    } catch {
      sdResults = {};
    }
    return (persisted || []).map((c) => {
      if (c.type === 'site-deploy' && c.status === 'Active') {
        // Has persisted results → Cloudflare definitely finished it.
        if (sdResults[c.id]) return { ...c, status: 'Completed' as const };
        // No results AND the campaign is older than 10 minutes → the user
        // closed the tab mid-deploy. Flip to Crashed so the row stops
        // showing the forever-running spinner and the user can delete it.
        const created = c.createdAt ? Date.parse(c.createdAt) : 0;
        const tenMin = 10 * 60 * 1000;
        if (created && Date.now() - created > tenMin) {
          return { ...c, status: 'Crashed' as const, errorReason: 'Deploy interrupted (browser closed)' };
        }
      }
      if (c.type === 'email' && Array.isArray((c as any).deployedSites)) {
        // Migration: dedupe stale deployedSites persisted from before the
        // slug-based dedupe fix landed. Same lead appearing twice (once from
        // site:staged, once from send:sent, with different derived slugs)
        // would inflate the displayed "12 sites" count. Collapsing by slug
        // restores correctness for runs from older sessions.
        const bySlug = new Map<string, any>();
        for (const s of (c as any).deployedSites) {
          const k = s.slug ?? s.email ?? s.leadId ?? s.url;
          if (k) bySlug.set(k, s);
        }
        const deployedSites = Array.from(bySlug.values());
        if (deployedSites.length !== (c as any).deployedSites.length) {
          return { ...c, deployedSites, sitesGenerated: deployedSites.length } as any;
        }
      }
      return c;
    });
  });
  const [businesses, setBusinesses] = useState<Business[]>(() => loadPersisted('lunao_businesses', initialBusinesses));
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>(() => loadPersisted('lunao_sms_logs', initialSmsLogs));
  const [sharedNiche, setSharedNiche] = useState<string>('All');

  useEffect(() => {
    localStorage.setItem('lunao_campaigns', JSON.stringify(campaigns));
  }, [campaigns]);
  useEffect(() => {
    localStorage.setItem('lunao_businesses', JSON.stringify(businesses));
  }, [businesses]);
  useEffect(() => {
    localStorage.setItem('lunao_sms_logs', JSON.stringify(smsLogs));
  }, [smsLogs]);

  const [isNavMinimized, setIsNavMinimized] = useState(false);

  useEffect(() => {
    const mainEl = document.getElementById('main-content-flow');
    if (!mainEl) return;
    let lastScrollTop = 0;
    const handleScroll = () => {
      const currentScrollTop = mainEl.scrollTop;
      if (currentScrollTop > lastScrollTop + 12 && currentScrollTop > 60) {
        setIsNavMinimized(true);
      } else if (currentScrollTop < lastScrollTop - 8 || currentScrollTop <= 15) {
        setIsNavMinimized(false);
      }
      lastScrollTop = currentScrollTop;
    };
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, []);

  const [userName, setUserName] = useState<string>('Operator');
  const [userEmail, setUserEmail] = useState<string>('operator@lunao.local');
  const [userPlan, setUserPlan] = useState<string>(() => {
    return localStorage.getItem('lunao_user_plan') || 'Free Plan';
  });

  const [userCredits, setUserCredits] = useState<number>(() => {
    const cached = localStorage.getItem('lunao_user_credits');
    if (cached !== null) return parseInt(cached, 10);
    const defaultMap: Record<string, number> = {
      'Free Plan': 5, 'Starter Plan': 300, 'Growth Plan': 1000,
      'Pro Plan': 3000, 'Agency Plan': 7000,
    };
    return defaultMap[userPlan] || 5;
  });

  // -----------------------------------------------------------------------
  // Active Campaigns registry. Lifted here so the wizard in Campaigns.tsx
  // and the Active Campaigns progress card (also rendered inside Campaigns)
  // share one source of truth. Pure-state operations — no side effects —
  // so the wizard can call them freely without worrying about cascading
  // re-renders.
  // -----------------------------------------------------------------------
  const [activeCampaignRuns, setActiveCampaignRuns] = useState<ActiveCampaignRun[]>([]);

  const upsertActiveRun = (run: ActiveCampaignRun) => {
    setActiveCampaignRuns((prev) => {
      const idx = prev.findIndex((r) => r.id === run.id);
      if (idx === -1) return [run, ...prev];
      const next = prev.slice();
      next[idx] = { ...next[idx], ...run };
      return next;
    });
  };

  const updateActiveRun = (id: string, patch: Partial<ActiveCampaignRun>) => {
    setActiveCampaignRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

  const removeActiveRun = (id: string) => {
    setActiveCampaignRuns((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSetUserPlan = (plan: string) => {
    let normalized = plan;
    if (!plan.endsWith(' Plan') && !plan.endsWith(' Tier')) {
      normalized = `${plan} Plan`;
    }
    setUserPlan(normalized);
    localStorage.setItem('lunao_user_plan', normalized);

    const planClean = normalized.replace(' Plan', '').replace(' Tier', '');
    const defaultMap: Record<string, number> = {
      'Free': 5, 'Starter': 300, 'Growth': 1000, 'Pro': 3000, 'Agency': 7000,
    };
    const nextCredits = defaultMap[planClean] || 5;
    setUserCredits(nextCredits);
    localStorage.setItem('lunao_user_credits', nextCredits.toString());

    (async () => {
      try {
        const { getCredits } = await import('./lib/pipelineClient');
        const ownerKey = 'dashboard';
        const status = await getCredits(ownerKey, normalized);
        if (status.account) {
          setUserCredits(status.account.balance);
          localStorage.setItem('lunao_user_credits', String(status.account.balance));
        }
      } catch { /* silent */ }
    })();
  };

  const [telnyxKey, setTelnyxKey] = useState<string>(() => localStorage.getItem('lunao_telnyx_key') || '');
  const [telnyxPhone, setTelnyxPhone] = useState<string>(() => localStorage.getItem('lunao_telnyx_phone') || '');

  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  const addSmsLog = (newLogs: any[]) => {
    setSmsLogs(prev => [...newLogs, ...prev]);
  };

  return (
    <div id="lunao-saas-root-layout" className="flex flex-col md:flex-row bg-off-white h-screen text-ink overflow-hidden max-w-[1920px] mx-auto select-none selection:bg-accent-soft selection:text-accent">

      <header className="flex md:hidden h-14 w-full items-center justify-between px-6 bg-white/80 backdrop-blur-md border-b border-[#E4E2DC] sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6.5 h-6.5 bg-accent rounded-sm rotate-[12deg] flex items-center justify-center shadow-xs">
            <div className="w-3 h-3 bg-white rounded-xs -rotate-[12deg]"></div>
          </div>
          <span className="text-base font-bold font-sans tracking-tight text-ink leading-none">Lunao</span>
        </div>
        <div onClick={() => { playSoftTap(); setActiveTab('plans'); }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success text-[10px] font-bold border border-success/15 shadow-3xs cursor-pointer active:scale-95 transition-all">
          <span>✦</span>
          <span>{userCredits.toLocaleString()} Credits</span>
        </div>
      </header>

      <nav id="mobile-dock-saas" className={`fixed md:hidden bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-xl border border-[#E4E2DC]/80 shadow-[0_16px_40px_rgba(26,25,22,0.18)] overflow-hidden transition-[width,height,border-radius,box-shadow] duration-[400ms] ease-[cubic-bezier(0.25,1,0.3,1)] ${isNavMinimized ? 'h-[52px] w-[280px] rounded-[30px] shadow-[0_8px_32px_rgba(26,25,22,0.14)]' : 'h-[68px] w-[calc(100%-32px)] max-w-[420px] rounded-[24px]'}`}>
        <div className="absolute inset-x-0 bottom-0 h-10 w-full bg-gradient-to-t from-accent/10 to-transparent blur-lg opacity-50 -z-10 animate-pulse pointer-events-none" />
        {(() => {
          const tabsList = ['dashboard', 'campaigns', 'templates', 'editor', 'messages', 'plans', 'settings'];
          const activeIndex = tabsList.indexOf(activeTab);
          return (
            <div className="absolute top-1.5 bottom-1.5 bg-accent-soft/85 border border-accent/15 pointer-events-none spring-pill-transition shadow-[0_2px_12px_rgba(37,99,235,0.08)] transition-all duration-300" style={{ left: '6px', width: 'calc((100% - 12px) / 7)', borderRadius: isNavMinimized ? '9999px' : '16px', transform: `translateX(${activeIndex * 100}%)` }} />
          );
        })()}
        <div className="relative w-full h-full flex items-center px-1.5">
          {[
            { id: 'dashboard' as SidebarTab, label: 'Home', icon: Home },
            { id: 'campaigns' as SidebarTab, label: 'Launch', icon: Megaphone },
            { id: 'templates' as SidebarTab, label: 'Templates', icon: LayoutTemplate },
            { id: 'editor' as SidebarTab, label: 'Editor', icon: Code2 },
            { id: 'messages' as SidebarTab, label: 'Outreach', icon: MessageSquare },
            { id: 'plans' as SidebarTab, label: 'Plans', icon: CreditCard },
            { id: 'settings' as SidebarTab, label: 'Settings', icon: SettingsIcon },
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isBouncing = bouncingTab === item.id;
            return (
              <button key={item.id} id={`mobile-dock-btn-${item.id}`}
                onClick={() => { playTiktokLike(); setActiveTab(item.id); setBouncingTab(null); setTimeout(() => setBouncingTab(item.id), 15); }}
                className={`relative z-10 flex-1 flex flex-col items-center justify-center w-full h-full cursor-pointer outline-none transition-colors duration-300 ${isActive ? 'text-accent' : 'text-ink-secondary hover:text-ink'}`}
                aria-label={item.label}>
                <div className={`relative flex items-center justify-center transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isBouncing ? 'animate-whatsapp-bounce' : ''} ${isNavMinimized ? 'translate-y-0 scale-95' : '-translate-y-[8px] scale-100'}`}>
                  <Icon className={`transition-all duration-300 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'} ${isNavMinimized ? 'w-5 h-5' : 'w-[22px] h-[22px]'}`} />
                  {isActive && <span className="absolute -inset-1.5 rounded-full bg-accent/20 blur-[3px] -z-10 animate-ping opacity-60" />}
                </div>
                <div className={`absolute left-0 w-full flex items-center justify-center transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isNavMinimized ? 'bottom-2 opacity-0 translate-y-4 scale-50 pointer-events-none' : 'bottom-[9px] opacity-100 translate-y-0 scale-100'}`}>
                  <span className={`text-[10px] sm:text-[11px] font-sans transition-all duration-300 tracking-tight leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userName={userName} userEmail={userEmail} userPlan={userPlan} userCredits={userCredits} className="hidden md:flex" />

      <main id="main-content-flow" className="flex-1 overflow-y-auto h-[calc(100vh-56px)] md:h-screen p-6 md:p-12 relative flex flex-col justify-between">
        <div id="routed-module-wrapper" className="flex-1 pb-24 md:pb-16">
          <div className={activeTab === 'dashboard' ? 'block animate-fade-in' : 'hidden'}>
            <Dashboard
              campaigns={campaigns}
              setCampaigns={setCampaigns}
              setActiveTab={setActiveTab}
              setPreviewTemplateId={setPreviewTemplateId}
              businesses={businesses}
              setScrollTarget={setScrollTarget}
              onViewDetails={handleViewCampaign}
              onEditOutreach={handleEditOutreach}
            />
          </div>
          <div className={activeTab === 'campaigns' ? 'block animate-fade-in' : 'hidden'}>
            <Campaigns
              campaigns={campaigns}
              setCampaigns={setCampaigns}
              templates={initialTemplates}
              businesses={businesses}
              setBusinesses={setBusinesses}
              addSmsLog={addSmsLog}
              setActiveTab={setActiveTab}
              selectedNiche={sharedNiche === 'All' ? 'All' : sharedNiche}
              setSelectedNiche={setSharedNiche}
              userPlan={userPlan}
              userCredits={userCredits}
              setUserCredits={setUserCredits}
              telnyxKey={telnyxKey}
              telnyxPhone={telnyxPhone}
              setScrollTarget={setScrollTarget}
              activeCampaignRuns={activeCampaignRuns}
              upsertActiveRun={upsertActiveRun}
              updateActiveRun={updateActiveRun}
              removeActiveRun={removeActiveRun}
              initialEmailSubject={editOutreachPayload?.subject}
              initialEmailBody={editOutreachPayload?.body}
              initialEmailNonce={editOutreachPayload?.nonce}
            />
          </div>
          <div className={activeTab === 'templates' ? 'block animate-fade-in' : 'hidden'}>
            <Templates templates={initialTemplates} previewTemplateId={previewTemplateId} setPreviewTemplateId={setPreviewTemplateId} selectedNicheFilter={sharedNiche} setSelectedNicheFilter={setSharedNiche} setActiveTab={setActiveTab} />
          </div>
          <div className={activeTab === 'editor' ? 'block animate-fade-in' : 'hidden'}>
            <Editor active={activeTab === 'editor'} />
          </div>
          <div className={activeTab === 'settings' ? 'block animate-fade-in' : 'hidden'}>
            <Settings userName={userName} setUserName={setUserName} userEmail={userEmail} setUserEmail={setUserEmail} userPlan={userPlan} setUserPlan={handleSetUserPlan} userCredits={userCredits} telnyxKey={telnyxKey} setTelnyxKey={setTelnyxKey} telnyxPhone={telnyxPhone} setTelnyxPhone={setTelnyxPhone} setActiveTab={setActiveTab} />
          </div>
          <div className={activeTab === 'plans' ? 'block animate-fade-in' : 'hidden'}>
            <Plans setActiveTab={setActiveTab} setUserPlan={handleSetUserPlan} userPlan={userPlan} userCredits={userCredits} />
          </div>
        </div>

        <footer id="global-application-footer" className="section-border-top border-t border-border-main pt-6 mt-16 text-center text-[11px] font-sans text-ink-secondary flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 bg-accent rounded-full animate-pulse"></span>
            <span>All systems fully operational. API health connections 100%.</span>
          </div>
          <span>© 2026 Lunao Inc. Built to claim.</span>
        </footer>
      </main>
    </div>
  );
}
