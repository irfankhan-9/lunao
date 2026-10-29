import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Globe,
  Workflow,
  Settings,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { NavSection } from '../../types';
import { Monogram } from '../ui/Monogram';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
  featureFlag?: 'booking' | 'chatbot' | 'email' | 'automations';
}

export const Sidebar: React.FC = () => {
  const { business, activeSection, setActiveSection, logout } = useBusiness();

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'bookings',
      label: 'Bookings',
      icon: <CalendarDays className="w-4 h-4" />,
      featureFlag: 'booking',
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'website',
      label: 'Business Website',
      icon: <Globe className="w-4 h-4" />,
    },
    {
      id: 'automations',
      label: 'Automations',
      icon: <Workflow className="w-4 h-4" />,
      featureFlag: 'automations',
    },
    {
      id: 'settings',
      label: 'Business Settings',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen shrink-0 bg-white border-r border-slate-200 sticky top-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-200">
        <Monogram name={business.name} size="sm" logoUrl={business.logoUrl} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tracking-tight text-slate-900 truncate" title={business.name}>
              {business.name}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            {business.niche} • {business.city}
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Workspace
        </div>

        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          const isEnabled = !item.featureFlag || business.features[item.featureFlag];

          if (!isEnabled) {
            return null;
          }

          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group relative ${
                isActive
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span
                className={`transition-colors shrink-0 ${
                  isActive ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-600'
                }`}
              >
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-600" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Live Website Link & Sign Out */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-2">
        <a
          href={business.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-emerald-50/50 border border-slate-200 text-slate-700 text-xs transition group shadow-xs"
        >
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate group-hover:text-emerald-800">
              View Public Website
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {business.websiteUrl.replace('https://', '')}
            </p>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-700 shrink-0 ml-2" />
        </a>

        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-600 text-xs font-medium transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Switch / Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
