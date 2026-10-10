import React from 'react';
import {
  Bot,
  Globe,
  Workflow,
  Mail,
  Settings,
  X,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { NavSection } from '../../types';
import { soundEffects } from '../../utils/soundEffects';

interface MoreDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MoreDrawer: React.FC<MoreDrawerProps> = ({ isOpen, onClose }) => {
  const {
    business,
    activeSection,
    setActiveSection,
    availableDemoProfiles,
    switchTenantByCode,
    logout,
  } = useBusiness();

  if (!isOpen) return null;

  const secondaryNavItems: {
    id: NavSection;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'ai_receptionist',
      label: 'AI Receptionist',
      sublabel: 'Operating hours, policies, & booking guidance',
      icon: <Bot className="w-5 h-5 text-emerald-700" />,
    },
    {
      id: 'website',
      label: 'Business Website',
      sublabel: 'Live preview, content updates, & publishing',
      icon: <Globe className="w-5 h-5 text-emerald-700" />,
    },
    {
      id: 'automations',
      label: 'Automations',
      sublabel: 'Reminders, booking confirmations, & follow-ups',
      icon: <Workflow className="w-5 h-5 text-emerald-700" />,
    },
    {
      id: 'email',
      label: 'Email Center',
      sublabel: 'Client confirmations, notices, & delivery log',
      icon: <Mail className="w-5 h-5 text-emerald-700" />,
    },
    {
      id: 'settings',
      label: 'Business Settings',
      sublabel: 'Profile, contact info, and integrations',
      icon: <Settings className="w-5 h-5 text-slate-600" />,
    },
  ];

  const handleSelect = (id: NavSection) => {
    setActiveSection(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative z-10 w-full bg-white border-t border-slate-200 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-200">
        {/* Grab Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">More Tools & Management</h3>
            <p className="text-[11px] text-slate-500">
              {business.name} • {business.city}
            </p>
          </div>
          <button
            onClick={() => {
              soundEffects.playButtonClick();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List of items */}
        <div className="p-4 space-y-1.5 overflow-y-auto overscroll-contain">
          {secondaryNavItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border transition text-left ${
                  isActive
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 tracking-tight">
                      {item.label}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {item.sublabel}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
              </button>
            );
          })}

          {/* Quick Business Switcher */}
          <div className="pt-3 mt-2 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">
              Switch Business Profile
            </p>
            <div className="grid grid-cols-2 gap-2">
              {availableDemoProfiles.map((p) => {
                const isCurrent = business.name === p.name;
                return (
                  <button
                    key={p.code}
                    onClick={async () => {
                      soundEffects.playButtonClick();
                      await switchTenantByCode(p.code);
                      onClose();
                    }}
                    className={`p-2.5 rounded-xl text-left border text-xs transition ${
                      isCurrent
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50/50 hover:border-emerald-200'
                    }`}
                  >
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{p.niche} • {p.city}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sign Out Button */}
          <div className="pt-2">
            <button
              onClick={() => {
                soundEffects.playButtonClick();
                onClose();
                logout();
              }}
              className="w-full py-2.5 px-3 text-xs font-medium text-rose-600 bg-rose-50/80 hover:bg-rose-100/80 border border-rose-200 rounded-xl flex items-center justify-center gap-2 transition"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
