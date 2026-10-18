import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  ChevronDown,
  Building2,
  Smartphone,
  Check,
  LogOut,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Calendar,
  Mail,
  Bot,
  CheckCheck,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { Monogram } from '../ui/Monogram';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { soundEffects } from '../../utils/soundEffects';
import { tenantDataService } from '../../services/tenantDataService';
import { ActivityEvent } from '../../types';

export const TopHeader: React.FC = () => {
  const {
    business,
    availableDemoProfiles,
    switchTenantByCode,
    logout,
    setActiveSection,
    showToast,
  } = useBusiness();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(3);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Load activities whenever business changes
  useEffect(() => {
    let isMounted = true;
    const loadActs = async () => {
      const data = await tenantDataService.getActivities(business.id);
      if (isMounted) {
        setActivities(data.slice(0, 5));
      }
    };
    loadActs();
    return () => {
      isMounted = false;
    };
  }, [business.id]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearNotifications = () => {
    soundEffects.playSuccess();
    setUnreadCount(0);
    showToast('All notifications marked as read');
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'booking_created':
        return <Calendar className="w-3.5 h-3.5 text-emerald-600" />;
      case 'email_sent':
        return <Mail className="w-3.5 h-3.5 text-blue-600" />;
      case 'ai_receptionist':
        return <Bot className="w-3.5 h-3.5 text-purple-600" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-emerald-600" />;
    }
  };

  const handleActivityClick = (type: string) => {
    setShowNotifications(false);
    if (type.includes('booking')) {
      setActiveSection('bookings');
    } else {
      setActiveSection('automations');
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 md:px-6 flex items-center justify-between">
      {/* Left: Business Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative cursor-pointer" onClick={() => setActiveSection('settings')}>
          <Monogram name={business.name} size="md" logoUrl={business.logoUrl} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm md:text-base font-semibold text-slate-900 truncate tracking-tight">
              {business.name}
            </h1>
            <span className="hidden sm:inline-flex text-[10px] font-medium tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Owner Portal
            </span>
          </div>
          <p className="text-xs text-slate-500 truncate hidden xs:block">
            {business.niche} • {business.city}
          </p>
        </div>
      </div>

      {/* Right: Tenant Switcher, PWA button, Notifications, Logout */}
      <div className="flex items-center gap-2">
        {/* Switch Owner Code Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => {
              soundEffects.playButtonClick();
              setIsMenuOpen((prev) => !prev);
            }}
            className="flex items-center gap-1.5 h-8 md:h-9 px-2.5 md:px-3 text-xs font-medium rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 shadow-xs hover:bg-slate-50 transition"
            title="Switch Owner Code"
          >
            <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline max-w-[110px] md:max-w-[140px] truncate">
              {business.name}
            </span>
            <span className="sm:hidden text-[11px]">Business</span>
            <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
          </button>

          {isMenuOpen && (
            <div className="fixed inset-x-4 top-20 w-auto max-w-sm mx-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 rounded-2xl bg-white border border-slate-200 shadow-2xl sm:shadow-xl p-3 sm:p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Business Accounts
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold">
                    Active Workspace
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Current: <span className="font-bold text-slate-800">{business.name}</span>
                </p>
              </div>

              <div className="space-y-1">
                {availableDemoProfiles.map((profile) => {
                  const isCurrent = business.name === profile.name;
                  return (
                    <button
                      key={profile.code}
                      onClick={async () => {
                        await switchTenantByCode(profile.code);
                        setIsMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition ${
                        isCurrent
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isCurrent ? 'bg-emerald-600' : 'bg-slate-300'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium truncate">{profile.name}</p>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">
                            {profile.niche} • {profile.city}
                          </p>
                        </div>
                      </div>
                      {isCurrent && (
                        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Logout & switch action */}
              <div className="mt-2 pt-2 border-t border-slate-100 px-1 flex items-center justify-between">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    logout();
                  }}
                  className="w-full py-2 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PWA Install Button */}
        {isInstallable && !isInstalled && (
          <button
            onClick={() => install()}
            className="hidden md:flex items-center gap-1.5 h-8 md:h-9 px-3 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-emerald-800 hover:border-emerald-300 shadow-xs transition"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
            <span>Install App</span>
          </button>
        )}

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              soundEffects.playButtonClick();
              setShowNotifications((prev) => !prev);
            }}
            className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-white animate-pulse" />
            )}
          </button>

          {showNotifications && (
            <div className="fixed inset-x-4 top-20 w-auto max-w-sm mx-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-88 rounded-2xl bg-white border border-slate-200 shadow-2xl sm:shadow-xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 max-h-[82vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Notifications & Alerts
                  </span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleClearNotifications}
                    className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCheck className="w-3 h-3" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Live Status Card */}
              <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                  <span className="text-[11px] font-semibold text-emerald-950">
                    AI Front Desk & Automations
                  </span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                  Live & Active
                </span>
              </div>

              {/* Activity List */}
              <div className="mt-2.5 space-y-1.5">
                {activities.length > 0 ? (
                  activities.map((act) => (
                    <button
                      key={act.id}
                      onClick={() => handleActivityClick(act.type)}
                      className="w-full p-2.5 rounded-xl bg-slate-50/70 hover:bg-emerald-50/40 border border-slate-200/70 hover:border-emerald-200 text-left transition-all flex items-start gap-2.5 cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                        {getActivityIcon(act.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {act.title}
                          </p>
                          <span className="text-[10px] text-slate-600 shrink-0 font-medium">
                            {act.timestamp}
                          </span>
                        </div>
                        {act.description && (
                          <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                            {act.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center">
                    <Check className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                    <p className="text-xs font-medium text-slate-700">All caught up!</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">No unread notifications at this time.</p>
                  </div>
                )}
              </div>

              {/* Quick Navigation Footer */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-1.5 text-center">
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    setActiveSection('bookings');
                  }}
                  className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700 transition cursor-pointer"
                >
                  View Bookings
                </button>
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    setActiveSection('automations');
                  }}
                  className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700 transition cursor-pointer"
                >
                  View Automations
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Sign Out Action */}
        <button
          onClick={() => {
            soundEffects.playButtonClick();
            logout();
          }}
          className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
          title="Sign Out / Switch Business"
          aria-label="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
