import React from 'react';
import {
  Smartphone,
  Layers,
  KeyRound,
  LogOut,
  Check,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { Button } from '../components/ui/Button';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { soundEffects } from '../utils/soundEffects';

export const SettingsPage: React.FC = () => {
  const {
    business,
    availableDemoProfiles,
    switchTenantByCode,
    logout,
  } = useBusiness();
  const { isInstallable, isInstalled, install } = usePWAInstall();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Business Settings
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Manage your operating identity, business profile, and platform integrations
          </p>
        </div>
      </div>

      {/* Business Profile Status Banner */}
      <div className="p-5 rounded-2xl bg-white border-2 border-emerald-500/80 shadow-md shadow-emerald-700/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Active Business Profile
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Active Workspace
              </span>
            </div>
            <p className="text-lg font-bold tracking-tight text-slate-900 mt-0.5">
              {business.name}
            </p>
            <p className="text-xs text-slate-500">
              {business.niche} • {business.city}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-slate-700 bg-white border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            onClick={logout}
            leftIcon={<LogOut className="w-3.5 h-3.5 text-slate-500" />}
          >
            Sign Out
          </Button>
        </div>
      </div>



      {/* Switch Owner Business Account */}
      <div className="p-5 md:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
          <Layers className="w-5 h-5 text-slate-600" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Switch Business Profile
            </h3>
            <p className="text-[11px] text-slate-500">
              Seamlessly switch between different demo business accounts
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {availableDemoProfiles.map((p) => {
            const isCurrent = business.name === p.name;
            return (
              <button
                key={p.code}
                onClick={() => switchTenantByCode(p.code)}
                className={`p-3.5 rounded-xl border text-left transition flex items-center justify-between ${
                  isCurrent
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-1 ring-emerald-500'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{p.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {p.niche} • {p.city}
                  </p>
                </div>
                {isCurrent && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>



      {/* PWA & Mobile Installation Info */}
      <div className="p-5 md:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
          <Smartphone className="w-5 h-5 text-emerald-700" />
          <h3 className="text-sm font-semibold text-slate-900">
            Mobile Device Installation
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-semibold text-slate-800">
              {isInstalled
                ? 'Installed on Device (PWA Mode Active)'
                : isInstallable
                ? 'Ready for Home Screen Installation'
                : 'Web Application Manifest Active'}
            </p>
            <p className="text-slate-500 mt-0.5">
              Install to access your owner portal directly from your home screen with fast offline caching.
            </p>
          </div>

          {isInstallable && !isInstalled && (
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Smartphone className="w-3.5 h-3.5" />}
              onClick={() => install()}
            >
              Install App
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
