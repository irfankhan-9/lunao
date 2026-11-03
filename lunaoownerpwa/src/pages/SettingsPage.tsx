import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Layers,
  KeyRound,
  LogOut,
  Check,
  Mail,
  CheckCircle2,
  AlertCircle,
  Save,
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
    updateBusiness,
    logout,
  } = useBusiness();
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const [ownerEmail, setOwnerEmail] = useState(business?.email || '');
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailSavedSuccess, setEmailSavedSuccess] = useState(false);

  useEffect(() => {
    if (business?.email !== undefined) {
      setOwnerEmail(business.email || '');
    }
  }, [business?.email]);

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerEmail.trim()) return;
    setIsSavingEmail(true);
    try {
      soundEffects.playSuccess();
      await updateBusiness({ email: ownerEmail.trim() });
      setEmailSavedSuccess(true);
      setTimeout(() => setEmailSavedSuccess(false), 3000);
    } catch {
      soundEffects.playError();
    } finally {
      setIsSavingEmail(false);
    }
  };

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



      {/* Owner Notification Email Configuration */}
      <div className="p-5 md:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Mail className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Owner Notification Email
              </h3>
              <p className="text-[11px] text-slate-500">
                Receive instant email alerts whenever a new appointment or customer booking is submitted
              </p>
            </div>
          </div>
          {business?.email ? (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Alerts Active
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              Email Not Set
            </span>
          )}
        </div>

        <form onSubmit={handleSaveEmail} className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">
              Notification Delivery Address
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="email"
                required
                placeholder="e.g. owner@yourbusiness.com"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="flex-1 h-10 px-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="h-10 px-4 whitespace-nowrap text-xs"
                disabled={isSavingEmail}
                leftIcon={emailSavedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              >
                {isSavingEmail ? 'Saving...' : emailSavedSuccess ? 'Saved' : 'Save Email'}
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Note: For website booking forms that do not ask customers for an email address, booking notifications are dispatched strictly to this owner email address.
          </p>
        </form>
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
