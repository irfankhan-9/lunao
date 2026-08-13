import React from 'react';
import { SidebarTab } from '../types';
import { 
  Home, 
  Megaphone, 
  LayoutTemplate, 
  Building2, 
  Settings,
  CreditCard,
  Code2
} from 'lucide-react';
import { playSoftTap, playTiktokLike } from '../utils/audio';


interface SidebarProps {
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  userName: string;
  userEmail: string;
  userPlan: string;
  userCredits: number;
  className?: string;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab,
  userName,
  userEmail,
  userPlan,
  userCredits,
  className = '',
  onCloseMobile
}) => {
  const planNameStr = typeof userPlan === 'string' ? userPlan.replace(' Plan', '') : 'Growth';
  const userQuotaLeft = userCredits;

  const menuItems = [
    { id: 'dashboard' as SidebarTab, label: 'Dashboard', icon: Home },
    { id: 'campaigns' as SidebarTab, label: 'Launch', icon: Megaphone },
    { id: 'templates' as SidebarTab, label: 'Templates', icon: LayoutTemplate },
    { id: 'editor' as SidebarTab, label: 'Site Editor', icon: Code2 },
    { id: 'plans' as SidebarTab, label: 'Plans & Credits', icon: CreditCard },
    { id: 'settings' as SidebarTab, label: 'Settings', icon: Settings },
  ];

  // Dynamically calculate user initials based on typed name
  const getInitials = (name: string) => {
    return name
      .trim()
      .split(/\s+/)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';
  };

  return (
    <aside id="sidebar-container" className={`w-[260px] bg-white border-r border-[#E4E2DC] flex flex-col h-screen sticky top-0 shrink-0 z-10 selection:bg-accent-soft text-left ${className}`}>
      {/* Brand logo */}
      <div id="brand-logo-area" className="p-6 border-b border-border-light flex items-center gap-3">
        {/* Geometric Mark: 12deg rotated square */}
        <div id="logo-geometric-icon" className="w-8 h-8 bg-accent rounded-sm rotate-[12deg] flex items-center justify-center shadow-sm">
          <div className="w-3.5 h-3.5 bg-white rounded-xs -rotate-[12deg]"></div>
        </div>
        <div id="logo-text-title" className="flex flex-col">
          <span className="text-xl font-bold font-sans tracking-tight text-ink leading-tight">Lunao</span>
        </div>
      </div>

      {/* Navigation menu */}
      <nav id="navigation-root-container" className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              id={`nav-link-${item.id}`}
              key={item.id}
              onClick={() => {
                if (onCloseMobile) {
                  playTiktokLike();
                  onCloseMobile();
                } else {
                  playSoftTap();
                }
                setActiveTab(item.id);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all duration-150 relative cursor-pointer ${
                isActive 
                  ? 'bg-accent-soft text-accent border-l-3 border-accent pl-3' 
                  : 'text-ink-secondary hover:bg-off-white hover:text-ink'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-ink-secondary'}`} />
              <span className="font-sans leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User avatar block */}
      <div id="user-profile-anchor" className="p-4 border-t border-border-main bg-off-white m-3 rounded-lg flex items-center gap-3">
        {/* Initials circle */}
        <div id="profile-avatar-initials" className="w-10 h-10 bg-ink text-white font-sans font-medium text-sm rounded-full flex items-center justify-center border border-border-main shrink-0">
          {getInitials(userName)}
        </div>
        <div id="profile-user-info" className="flex flex-col min-w-0">
          <span className="text-sm font-semibold font-sans text-ink truncate leading-tight">{userName}</span>
          <span className="text-[11px] font-sans text-ink-secondary truncate mb-1">{userEmail}</span>
          <div className="flex flex-col gap-1 items-start">
            <span 
              onClick={() => { playSoftTap(); setActiveTab('plans'); }}
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-soft text-accent hover:bg-accent hover:text-white transition-all cursor-pointer shadow-3xs"
              title="Manage subscription & views limits"
            >
              {userPlan}
            </span>
            <span className="text-[10px] uppercase font-bold text-ink-secondary whitespace-nowrap">
              <span className="text-success mr-1">✦</span>
              {userQuotaLeft.toLocaleString()} Credits
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
