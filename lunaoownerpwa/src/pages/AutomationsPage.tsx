import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  ArrowRight,
  Clock,
  Mail,
  CheckCircle2,
  Calendar,
  Star,
  Send,
  RefreshCw,
  Sliders,
  Eye,
  AlertCircle,
  Users,
  ShieldCheck,
  ChevronRight,
  MessageSquare,
  Workflow,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { Automation, Customer, EmailActivityRecord, ConnectedEmailAccount } from '../types';
import { automationService } from '../services/automationService';
import { customerService } from '../services/customerService';
import { emailService } from '../services/emailService';
import { emailAuthService } from '../services/emailAuthService';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { ConnectedEmailBanner } from '../components/ui/ConnectedEmailBanner';
import { soundEffects } from '../utils/soundEffects';

export const AutomationsPage: React.FC = () => {
  const { business, showToast } = useBusiness();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAuto, setSelectedAuto] = useState<Automation | null>(null);
  const [activeTab, setActiveTab] = useState<'timing' | 'template' | 'preview'>('timing');
  const [isLoading, setIsLoading] = useState(true);

  // Email authentication state
  const [connectedAccount, setConnectedAccount] = useState<ConnectedEmailAccount | null>(null);

  // Form states for the selected automation
  const [timingValue, setTimingValue] = useState<number>(24);
  const [timingUnit, setTimingUnit] = useState<'hours' | 'days'>('hours');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState<string>('');

  // Reactivation Quick Run Modal state
  const [showReactivationModal, setShowReactivationModal] = useState(false);
  const [inactiveThreshold, setInactiveThreshold] = useState<number>(30);
  const [eligibleCustomers, setEligibleCustomers] = useState<Customer[]>([]);
  const [isRunningReactivation, setIsRunningReactivation] = useState(false);

  // Activity stream state
  const [recentSentEmails, setRecentSentEmails] = useState<EmailActivityRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const [list, activities, allCustomers, account] = await Promise.all([
        automationService.getAutomations(),
        emailService.getEmailActivity(),
        customerService.getCustomersWithEmail(),
        emailAuthService.getConnectedAccount(),
      ]);

      if (isMounted) {
        setAutomations(list);
        setRecentSentEmails(activities.slice(0, 5));
        setEligibleCustomers(allCustomers);
        setConnectedAccount(account);
        setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [business.id]);

  const handleReauthEmail = async () => {
    try {
      soundEffects.playButtonClick();
      const updated = await emailAuthService.reauthenticateAccount();
      setConnectedAccount(updated);
      soundEffects.playSuccess();
      showToast(`Gmail account ${updated.email} re-authenticated successfully!`);
    } catch {
      showToast('Re-authentication failed');
    }
  };

  const handleConnectEmail = async (emailAddr: string) => {
    try {
      soundEffects.playButtonClick();
      const updated = await emailAuthService.connectAccount(emailAddr);
      setConnectedAccount(updated);
      soundEffects.playSuccess();
      showToast(`Connected ${updated.email} for automated notifications`);
    } catch {
      showToast('Connection failed');
    }
  };

  const handleDisconnectEmail = async () => {
    try {
      soundEffects.playButtonClick();
      const updated = await emailAuthService.disconnectAccount();
      setConnectedAccount(updated);
      showToast('Email account disconnected');
    } catch {
      showToast('Disconnection failed');
    }
  };

  const handleToggleExpiry = async () => {
    try {
      soundEffects.playButtonClick();
      const updated = await emailAuthService.toggleSimulatedExpiry();
      setConnectedAccount(updated);
      if (updated.status === 'expired') {
        showToast('Simulated session expiration: Token expired');
      } else {
        showToast('Session restored: Token active');
      }
    } catch {
      showToast('Toggle failed');
    }
  };

  // When opening an automation in the drawer, populate its local edit state
  const handleOpenDrawer = (auto: Automation) => {
    soundEffects.playButtonClick();
    setSelectedAuto(auto);
    setActiveTab('timing');
    setTimingValue(auto.timing.value);
    setTimingUnit(auto.timing.unit === 'days' ? 'days' : 'hours');
    setEmailSubject(auto.emailSubject || '');
    setEmailBody(auto.emailBody || '');
    setTestEmail(connectedAccount?.email || business.email);
  };

  const handleToggle = async (id: string, currentEnabled: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      soundEffects.playButtonClick();
      const updated = await automationService.toggleAutomation(id, !currentEnabled);
      setAutomations((prev) => prev.map((a) => (a.id === id ? updated : a)));
      if (selectedAuto && selectedAuto.id === id) {
        setSelectedAuto(updated);
      }
      showToast(`${updated.name} is now ${updated.enabled ? 'Active' : 'Paused'}`);
    } catch {
      showToast('Error updating automation');
    }
  };

  const handleSaveTiming = async () => {
    if (!selectedAuto) return;
    setIsSaving(true);
    try {
      soundEffects.playSuccess();
      const updated = await automationService.updateTiming(selectedAuto.id, {
        value: Number(timingValue) || 1,
        unit: timingUnit,
      });
      setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setSelectedAuto(updated);
      showToast('Automation timing schedule updated');
    } catch {
      showToast('Failed to update timing');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!selectedAuto) return;
    if (!emailSubject.trim() || !emailBody.trim()) {
      showToast('Subject and email body cannot be empty');
      return;
    }
    setIsSaving(true);
    try {
      soundEffects.playSuccess();
      const updated = await automationService.updateEmailTemplate(selectedAuto.id, {
        emailSubject,
        emailBody,
      });
      setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setSelectedAuto(updated);
      showToast('Email message template saved');
    } catch {
      showToast('Failed to save email template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!selectedAuto) return;
    if (connectedAccount?.status === 'expired') {
      showToast('Cannot send: Gmail authentication session is expired. Please re-authenticate.');
      return;
    }
    setIsTesting(true);
    try {
      const res = await automationService.testDispatchAutomation(
        selectedAuto.id,
        business,
        testEmail || connectedAccount?.email || business.email
      );
      if (res.success) {
        showToast(`Test email sent: "${res.subject}"`);
        const updatedActivities = await emailService.getEmailActivity();
        setRecentSentEmails(updatedActivities.slice(0, 5));
      }
    } catch {
      showToast('Failed to send test email');
    } finally {
      setIsTesting(false);
    }
  };

  const handleTriggerReactivationBroadcast = async () => {
    if (connectedAccount?.status === 'expired') {
      showToast('Cannot send broadcast: Email session is expired. Please re-authenticate.');
      return;
    }
    setIsRunningReactivation(true);
    try {
      const res = await automationService.triggerReactivationNow(business, inactiveThreshold);
      showToast(`Sent re-booking emails to ${res.sentCount} past clients`);
      setShowReactivationModal(false);

      // Refresh list & activities
      const [list, activities] = await Promise.all([
        automationService.getAutomations(),
        emailService.getEmailActivity(),
      ]);
      setAutomations(list);
      setRecentSentEmails(activities.slice(0, 5));
    } catch {
      showToast('Failed to send reactivation emails');
    } finally {
      setIsRunningReactivation(false);
    }
  };

  const insertVariable = (variable: string) => {
    setEmailBody((prev) => `${prev} ${variable}`);
  };

  // Live rendered preview helper
  const renderPreviewContent = (templateText: string) => {
    return templateText
      .replace(/\{\{customer_name\}\}/g, 'Marcus Vance')
      .replace(/\{\{service\}\}/g, 'Signature Service')
      .replace(/\{\{date\}\}/g, 'Sep 10, 2026')
      .replace(/\{\{time\}\}/g, '11:00 AM')
      .replace(/\{\{business_name\}\}/g, business.name)
      .replace(/\{\{address\}\}/g, business.address)
      .replace(/\{\{phone\}\}/g, business.phone)
      .replace(/\{\{website_url\}\}/g, business.websiteUrl);
  };

  const activeCount = automations.filter((a) => a.enabled).length;
  const totalDelivered = automations.reduce((acc, a) => acc + (a.executionCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Automated Follow-ups
            </h2>
            <Badge variant="accent" size="sm">
              {activeCount} of {automations.length} Active
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-2xl">
            Real transactional email automations for instant confirmations, scheduled reminders, post-visit feedback, and customer re-booking.
          </p>
        </div>

        {/* Quick Reactivation Action */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="w-3.5 h-3.5 text-emerald-600" />}
            onClick={() => setShowReactivationModal(true)}
          >
            Send Re-booking Broadcast
          </Button>
        </div>
      </div>

      {/* Connected Email Account Status Card */}
      <ConnectedEmailBanner
        account={connectedAccount}
        onReauth={handleReauthEmail}
        onConnect={handleConnectEmail}
        onDisconnect={handleDisconnectEmail}
        onToggleTestExpiry={handleToggleExpiry}
      />

      {/* Overview Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Active Workflows
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-slate-900">{activeCount}</span>
            <span className="text-xs text-slate-500">/ {automations.length} enabled</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Emails Delivered
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-emerald-600">{totalDelivered}</span>
            <span className="text-xs text-slate-500">confirmed delivered</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Sender Account
          </span>
          <div className="flex items-baseline gap-1.5 mt-1 truncate">
            <span className="text-xs font-bold text-slate-900 truncate">
              {connectedAccount?.email ? connectedAccount.email.split('@')[0] : 'Relay'}
            </span>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${
                connectedAccount?.status === 'expired'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {connectedAccount?.status === 'expired' ? 'Expired' : 'Verified'}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Delivery Protocol
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-sm font-semibold text-slate-900">Gmail API / Relay</span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
              TLS 1.3
            </span>
          </div>
        </div>
      </div>

      {/* Grid of 4 Production Automations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {automations.map((auto) => {
          const waitStep = auto.steps.find((s) => s.type === 'wait');
          const isInstant = auto.timing.timingType === 'instant';
          const isReactivation = auto.templateId === 'customer_reactivation';

          return (
            <div
              key={auto.id}
              onClick={() => handleOpenDrawer(auto)}
              className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-sm transition cursor-pointer flex flex-col justify-between group shadow-2xs relative"
            >
              <div>
                {/* Card Header & Switch */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-xl border ${
                        auto.enabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {isInstant ? (
                        <CalendarCheck className="w-4 h-4" />
                      ) : isReactivation ? (
                        <RefreshCw className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-800 transition">
                          {auto.name}
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {auto.description}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    onClick={(e) => handleToggle(auto.id, auto.enabled, e)}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      auto.enabled ? 'bg-emerald-600' : 'bg-slate-200'
                    }`}
                    aria-label="Toggle automation status"
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform shadow-xs ${
                        auto.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Timing Badge & Capability Tag */}
                <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {isInstant && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 text-slate-700 border border-slate-200/80 font-medium">
                      <CalendarCheck className="w-3.5 h-3.5 text-slate-500" />
                      Instant Confirmation (0s Delay)
                    </span>
                  )}
                  {auto.templateId === 'appointment_reminder' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 text-slate-700 border border-slate-200/80 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      Sent {auto.timing.value} Hours Before Booking
                    </span>
                  )}
                  {auto.templateId === 'post_appointment_followup' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 text-slate-700 border border-slate-200/80 font-medium">
                      <Star className="w-3.5 h-3.5 text-slate-500" />
                      Sent {auto.timing.value} {auto.timing.unit} After Service (Review Request)
                    </span>
                  )}
                  {isReactivation && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 text-slate-700 border border-slate-200/80 font-medium">
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                      Targets Inactive Clients ({auto.timing.value}d) + Re-booking Invite
                    </span>
                  )}
                </div>

                {/* Trigger -> Wait -> Action Flow Pipeline */}
                <div className="mt-3.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200 flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Trigger
                    </span>
                    <span className="text-slate-800 font-medium truncate block mt-0.5 text-[11px]">
                      {auto.trigger}
                    </span>
                  </div>

                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Delay
                    </span>
                    <span className="text-slate-800 font-medium truncate block mt-0.5 text-[11px]">
                      {waitStep?.label || 'Immediate'}
                    </span>
                  </div>

                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Action
                    </span>
                    <span className="text-slate-800 font-medium truncate block mt-0.5 text-[11px]">
                      Send Email
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer & Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{auto.executionCount} delivered</span>
                </div>

                <div className="flex items-center gap-2">
                  {isReactivation && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowReactivationModal(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 transition text-[11px] flex items-center gap-1"
                    >
                      <Send className="w-3 h-3 text-slate-500" />
                      Run Now
                    </button>
                  )}
                  <span className="text-emerald-700 font-semibold group-hover:underline flex items-center gap-0.5">
                    Configure
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity Log */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Recent Email Activity Log
            </h3>
          </div>
          <Badge variant="neutral" size="sm">
            Transactional Mail Relay
          </Badge>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {recentSentEmails.map((record) => (
            <div key={record.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">
                    {record.subject}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    To: {record.recipientName} ({record.recipientEmail}) • {record.templateName}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[11px] text-slate-400 block">{record.sentAt}</span>
                <span className="text-[10px] font-medium text-emerald-700 uppercase">
                  {record.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Automation Configuration Drawer / Modal */}
      {selectedAuto && (
        <BottomSheet
          isOpen={!!selectedAuto}
          onClose={() => setSelectedAuto(null)}
          title={selectedAuto.name}
          subtitle="Configure Timing, Email Content & Testing"
        >
          <div className="space-y-4 text-xs">
            {/* Status & Quick Toggle */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-slate-800 font-semibold">Workflow Status</p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  {selectedAuto.enabled
                    ? 'Active — Sends automatically when triggered'
                    : 'Paused — No emails will be sent'}
                </p>
              </div>
              <Button
                variant={selectedAuto.enabled ? 'outline' : 'primary'}
                size="sm"
                onClick={() => handleToggle(selectedAuto.id, selectedAuto.enabled)}
              >
                {selectedAuto.enabled ? 'Pause Workflow' : 'Activate Workflow'}
              </Button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 gap-2">
              <button
                onClick={() => setActiveTab('timing')}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === 'timing'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Timing & Schedule
              </button>
              <button
                onClick={() => setActiveTab('template')}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === 'template'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email Template
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === 'preview'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Live Preview & Test
              </button>
            </div>

            {/* TAB 1: TIMING & SCHEDULE */}
            {activeTab === 'timing' && (
              <div className="space-y-4">
                {/* 1. Instant Booking Confirmation (Fixed Instant) */}
                {selectedAuto.timing.timingType === 'instant' && (
                  <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold">
                      <CalendarCheck className="w-4 h-4 text-emerald-600" />
                      <span>Instant Booking Confirmation</span>
                    </div>
                    <p className="text-slate-700 text-xs leading-relaxed">
                      Booking confirmations are sent immediately upon appointment creation.
                      This guarantees that your client receives their booking summary and calendar invite right away with zero delay.
                    </p>
                    <div className="pt-2 text-[11px] text-emerald-900 font-medium">
                      ✓ Timing sends automatically upon booking. You can enable or disable this workflow anytime above.
                    </div>
                  </div>
                )}

                {/* 2. Appointment Reminder (Configurable Hours Before) */}
                {selectedAuto.templateId === 'appointment_reminder' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Send Schedule (Hours Before Booking)
                      </label>
                      <p className="text-[11px] text-slate-500 mb-2">
                        Choose exactly how many hours ahead of the scheduled appointment time the reminder email should be sent.
                      </p>

                      {/* Preset Chips */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {[1, 2, 3, 6, 12, 24, 48, 72].map((hrs) => (
                          <button
                            key={hrs}
                            type="button"
                            onClick={() => setTimingValue(hrs)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              timingValue === hrs
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {hrs === 24 ? '24 Hours (1 Day)' : hrs === 48 ? '48 Hours (2 Days)' : `${hrs} Hours`}
                          </button>
                        ))}
                      </div>

                      {/* Custom input */}
                      <div className="flex items-center gap-2 max-w-xs">
                        <input
                          type="number"
                          min={1}
                          max={168}
                          value={timingValue}
                          onChange={(e) => setTimingValue(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-24 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-emerald-500"
                        />
                        <span className="text-xs font-medium text-slate-700">
                          Hours before appointment
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                      <strong>Schedule Logic:</strong> For an appointment booked on Friday at 2:00 PM, the reminder will automatically send on {timingValue === 24 ? 'Thursday at 2:00 PM (24h prior)' : `${timingValue} hours prior`}.
                    </div>

                    <Button
                      variant="primary"
                      className="w-full mt-2"
                      onClick={handleSaveTiming}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Apply Reminder Timing'}
                    </Button>
                  </div>
                )}

                {/* 3. Post-Appointment Follow-up (Configurable Hours / Days After) */}
                {selectedAuto.templateId === 'post_appointment_followup' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Follow-up Timing (After Appointment Completion)
                      </label>
                      <p className="text-[11px] text-slate-500 mb-2">
                        Set when to send the post-service check-in and review request after the client’s appointment concludes.
                      </p>

                      {/* Preset Chips */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {[
                          { val: 1, unit: 'hours' as const, label: '1 Hour' },
                          { val: 2, unit: 'hours' as const, label: '2 Hours' },
                          { val: 4, unit: 'hours' as const, label: '4 Hours' },
                          { val: 1, unit: 'days' as const, label: '1 Day Later' },
                          { val: 2, unit: 'days' as const, label: '2 Days Later' },
                          { val: 3, unit: 'days' as const, label: '3 Days Later' },
                        ].map((item) => (
                          <button
                            key={`${item.val}-${item.unit}`}
                            type="button"
                            onClick={() => {
                              setTimingValue(item.val);
                              setTimingUnit(item.unit);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              timingValue === item.val && timingUnit === item.unit
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      {/* Custom input with unit selector */}
                      <div className="flex items-center gap-2 max-w-sm">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={timingValue}
                          onChange={(e) => setTimingValue(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-emerald-500"
                        />
                        <select
                          value={timingUnit}
                          onChange={(e) => setTimingUnit(e.target.value as 'hours' | 'days')}
                          className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:border-emerald-500"
                        >
                          <option value="hours">Hours after appointment</option>
                          <option value="days">Days after appointment</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                      <strong>Review Request Logic:</strong> Delivers your thank-you note and invites honest feedback {timingValue} {timingUnit} after the service ends.
                    </div>

                    <Button
                      variant="primary"
                      className="w-full mt-2"
                      onClick={handleSaveTiming}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Apply Follow-up Timing'}
                    </Button>
                  </div>
                )}

                {/* 4. Customer Reactivation (Configurable Inactivity Days) */}
                {selectedAuto.templateId === 'customer_reactivation' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Inactivity Threshold (Days Without Booking)
                      </label>
                      <p className="text-[11px] text-slate-500 mb-2">
                        Clients who haven’t scheduled an appointment within this timeframe will be invited to re-book.
                      </p>

                      {/* Presets */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {[30, 45, 60, 90].map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => setTimingValue(days)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              timingValue === days
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {days} Days
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 max-w-xs">
                        <input
                          type="number"
                          min={7}
                          max={365}
                          value={timingValue}
                          onChange={(e) => setTimingValue(Math.max(7, parseInt(e.target.value) || 30))}
                          className="w-24 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-emerald-500"
                        />
                        <span className="text-xs font-medium text-slate-700">
                          Days since last appointment
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-800 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">On-Demand Re-booking Broadcast</p>
                        <p className="text-slate-500 mt-0.5">
                          You can also trigger re-booking emails to all eligible past clients immediately.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setShowReactivationModal(true);
                        }}
                      >
                        Send Now
                      </Button>
                    </div>

                    <Button
                      variant="primary"
                      className="w-full mt-2"
                      onClick={handleSaveTiming}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Apply Reactivation Threshold'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: EMAIL TEMPLATE */}
            {activeTab === 'template' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Email Subject Line
                  </label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-emerald-500"
                    placeholder="Subject line..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-800">
                      Message Content (Template Body)
                    </label>
                    <span className="text-[10px] text-slate-400">Supports text & tokens</span>
                  </div>
                  <textarea
                    rows={7}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-emerald-500 font-mono"
                    placeholder="Email body text..."
                  />
                </div>

                {/* Variable Tokens Chips */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                    Click to insert dynamic variables:
                  </span>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    {[
                      '{{customer_name}}',
                      '{{service}}',
                      '{{date}}',
                      '{{time}}',
                      '{{business_name}}',
                      '{{address}}',
                      '{{phone}}',
                      '{{website_url}}',
                    ].map((tok) => (
                      <button
                        key={tok}
                        type="button"
                        onClick={() => insertVariable(tok)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-mono text-[10px] border border-slate-200 transition"
                      >
                        + {tok}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full mt-2"
                  onClick={handleSaveTemplate}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Email Template'}
                </Button>
              </div>
            )}

            {/* TAB 3: LIVE PREVIEW & TEST */}
            {activeTab === 'preview' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="border-b border-slate-200 pb-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Subject Line
                    </span>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">
                      {renderPreviewContent(emailSubject || selectedAuto.emailSubject)}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Rendered Email Preview
                    </span>
                    <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 whitespace-pre-line leading-relaxed font-sans shadow-2xs">
                      {renderPreviewContent(emailBody || selectedAuto.emailBody)}
                    </div>
                  </div>
                </div>

                {/* Send Test Email */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="text-xs font-semibold text-slate-800">
                    Send Test Email
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Send a real test version to verify email formatting and delivery.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="recipient@example.com"
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:border-emerald-500"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleTestSend}
                      disabled={isTesting}
                      leftIcon={<Send className="w-3 h-3 text-emerald-600" />}
                    >
                      {isTesting ? 'Sending...' : 'Send Test'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {/* Customer Reactivation Broadcast Modal */}
      {showReactivationModal && (
        <BottomSheet
          isOpen={showReactivationModal}
          onClose={() => setShowReactivationModal(false)}
          title="Customer Re-booking Broadcast"
          subtitle="Re-engage previous clients with open appointment invites"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <RefreshCw className="w-4 h-4 text-slate-700" />
                <span>Reactivation Outreach Campaign</span>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed">
                Scan your verified client roster and send personalized re-booking invitations with direct calendar links to clients who haven't visited in {inactiveThreshold} days.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Inactivity Filter Threshold
              </label>
              <div className="flex items-center gap-2">
                {[15, 30, 45, 60].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setInactiveThreshold(days)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      inactiveThreshold === days
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
            </div>

            {/* Target Client Preview */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Target Clients ({eligibleCustomers.length} Available)
                </span>
                <Badge variant="neutral" size="sm">
                  Ready to Send
                </Badge>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {eligibleCustomers.slice(0, 5).map((cust) => (
                  <div
                    key={cust.id}
                    className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{cust.name}</span>
                      <span className="text-slate-500 ml-1.5">({cust.email})</span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {cust.bookingCount} past bookings
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowReactivationModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleTriggerReactivationBroadcast}
                disabled={isRunningReactivation}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                {isRunningReactivation ? 'Sending...' : 'Send Re-booking Broadcast'}
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};
