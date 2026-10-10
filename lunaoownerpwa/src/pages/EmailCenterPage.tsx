import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  FileText,
  Users,
  Clock,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { EmailActivityRecord, EmailTemplate, Customer, ConnectedEmailAccount } from '../types';
import { emailService } from '../services/emailService';
import { customerService } from '../services/customerService';
import { emailAuthService } from '../services/emailAuthService';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConnectedEmailBanner } from '../components/ui/ConnectedEmailBanner';
import { BottomSheet } from '../components/ui/BottomSheet';
import { soundEffects } from '../utils/soundEffects';

export const EmailCenterPage: React.FC = () => {
  const { business, isDemoMode, showToast } = useBusiness();
  const [activeTab, setActiveTab] = useState<'compose' | 'templates' | 'customers' | 'activity'>('compose');

  const [records, setRecords] = useState<EmailActivityRecord[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [emailCustomers, setEmailCustomers] = useState<Customer[]>([]);
  const [connectedAccount, setConnectedAccount] = useState<ConnectedEmailAccount | null>(null);

  // Compose state
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('all');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Template Manager Modal State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState('Outreach');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const [recs, temps, custs, account] = await Promise.all([
        emailService.getEmailActivity(),
        emailService.getEmailTemplates(),
        customerService.getCustomersWithEmail(),
        emailAuthService.getConnectedAccount(),
      ]);
      if (isMounted) {
        setRecords(recs);
        setTemplates(temps);
        setEmailCustomers(custs);
        setConnectedAccount(account);

        if (temps.length > 0) {
          setSubject(temps[0].subject);
          setBody(temps[0].body);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [business.id]);

  const handleReauthEmail = async () => {
    try {
      const updated = await emailAuthService.reauthenticateAccount();
      setConnectedAccount(updated);
      showToast(`Gmail account ${updated.email} re-authenticated successfully!`);
    } catch {
      showToast('Re-authentication failed');
    }
  };

  const handleConnectEmail = async (emailAddr: string) => {
    try {
      const updated = await emailAuthService.connectAccount(emailAddr);
      setConnectedAccount(updated);
      showToast(`Connected ${updated.email} for email outreach`);
    } catch {
      showToast('Connection failed');
    }
  };

  const handleDisconnectEmail = async () => {
    try {
      const updated = await emailAuthService.disconnectAccount();
      setConnectedAccount(updated);
      showToast('Email account disconnected');
    } catch {
      showToast('Disconnection failed');
    }
  };

  const handleToggleExpiry = async () => {
    try {
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

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSubject(template.subject);
    setBody(template.body);
    setActiveTab('compose');
    showToast(`Loaded template: ${template.name}`);
  };

  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTplName('');
    setTplCategory('Outreach');
    setTplSubject('');
    setTplBody('Hello [Customer Name],\n\n\n\nWarm regards,\n' + business.name);
    setIsTemplateModalOpen(true);
  };

  const handleOpenEditTemplate = (tpl: EmailTemplate) => {
    setEditingTemplate(tpl);
    setTplName(tpl.name);
    setTplCategory(tpl.category);
    setTplSubject(tpl.subject);
    setTplBody(tpl.body);
    setIsTemplateModalOpen(true);
  };

  const handleInsertTag = (tag: string) => {
    setTplBody((prev) => prev + ` ${tag} `);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim() || !tplSubject.trim() || !tplBody.trim()) {
      showToast('Please fill in template name, subject, and message body.');
      return;
    }

    setIsSavingTemplate(true);
    try {
      if (editingTemplate) {
        const updated = await emailService.updateEmailTemplate(editingTemplate.id, {
          name: tplName.trim(),
          category: tplCategory.trim() || 'General',
          subject: tplSubject.trim(),
          body: tplBody.trim(),
        });
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingTemplate.id ? updated : t))
        );
        showToast(`Template "${updated.name}" updated successfully`);
      } else {
        const created = await emailService.createEmailTemplate({
          name: tplName.trim(),
          category: tplCategory.trim() || 'Custom',
          subject: tplSubject.trim(),
          body: tplBody.trim(),
        });
        setTemplates((prev) => [created, ...prev]);
        showToast(`New template "${created.name}" created`);
      }
      setIsTemplateModalOpen(false);
    } catch {
      showToast('Error saving template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (tplId: string, name: string) => {
    try {
      await emailService.deleteEmailTemplate(tplId);
      setTemplates((prev) => prev.filter((t) => t.id !== tplId));
      showToast(`Template "${name}" deleted`);
    } catch {
      showToast('Error deleting template');
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connectedAccount?.status === 'expired') {
      showToast('Cannot send: Gmail authentication session is expired. Please re-authenticate.');
      return;
    }

    if (!subject.trim() || !body.trim()) {
      showToast('Subject and email content cannot be empty');
      return;
    }

    setIsSending(true);
    try {
      const recipientEmails: string[] = [];
      const recipientNames: string[] = [];
      let targetDisplay = '';

      if (selectedRecipientId === 'all') {
        emailCustomers.forEach((c) => {
          if (c.email) {
            recipientEmails.push(c.email);
            recipientNames.push(c.name);
          }
        });
        targetDisplay = `All Clients (${recipientEmails.length} recipients)`;
      } else {
        const found = emailCustomers.find((c) => c.id === selectedRecipientId);
        if (found && found.email) {
          recipientEmails.push(found.email);
          recipientNames.push(found.name);
          targetDisplay = `${found.name} <${found.email}>`;
        }
      }

      await emailService.sendEmail({
        recipientNames,
        recipientEmails,
        subject,
        body,
        templateName: 'Direct Outreach',
      });

      const updatedRecs = await emailService.getEmailActivity();
      setRecords(updatedRecs);

      showToast(`Email sent to ${targetDisplay}`);
      setActiveTab('activity');
    } catch {
      showToast('Error sending email');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Email Notifications & Outreach
            </h2>
            <Badge variant="accent" size="sm">
              {emailCustomers.length} Verified Recipients
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Send client confirmations, appointment reminders, and follow-up notices
          </p>
        </div>

        {isDemoMode && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Test Mode: Delivery activity logged safely</span>
          </div>
        )}
      </div>

      {/* Connected Email Banner */}
      <ConnectedEmailBanner
        account={connectedAccount}
        onReauth={handleReauthEmail}
        onConnect={handleConnectEmail}
        onDisconnect={handleDisconnectEmail}
        onToggleTestExpiry={handleToggleExpiry}
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'compose', label: 'Compose Message', icon: <Send className="w-4 h-4" /> },
          { id: 'templates', label: `Templates (${templates.length})`, icon: <FileText className="w-4 h-4" /> },
          { id: 'customers', label: 'Recipients List', icon: <Users className="w-4 h-4" /> },
          { id: 'activity', label: 'Delivery Log', icon: <Clock className="w-4 h-4" /> },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              soundEffects.playTabSwitch();
              setActiveTab(t.id as typeof activeTab);
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition ${
              activeTab === t.id
                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab: Compose */}
      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Side */}
          <form
            onSubmit={handleSendEmail}
            className="lg:col-span-7 space-y-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Recipients *
              </label>
              {emailCustomers.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                  No clients currently have email addresses on file.
                </div>
              ) : (
                <select
                  value={selectedRecipientId}
                  onChange={(e) => setSelectedRecipientId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
                >
                  <option value="all">
                    All Clients with Email ({emailCustomers.length} recipients)
                  </option>
                  {emailCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Subject Line *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Appointment Confirmation"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  Message Content *
                </label>
                <button
                  type="button"
                  onClick={() => setActiveTab('templates')}
                  className="text-[11px] text-emerald-700 font-semibold hover:underline"
                >
                  Choose from templates
                </button>
              </div>
              <textarea
                rows={8}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 resize-none font-sans leading-relaxed shadow-2xs"
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Personalization tags like [Customer Name] populate automatically.
              </span>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSending || emailCustomers.length === 0 || connectedAccount?.status === 'expired'}
                leftIcon={<Send className="w-4 h-4" />}
              >
                {isSending ? 'Sending...' : 'Send Message'}
              </Button>
            </div>
          </form>

          {/* Live Email Mock Preview Side */}
          <div className="lg:col-span-5 space-y-3">
            <span className="text-xs font-semibold text-slate-800 block">
              Recipient Inbox Preview
            </span>
            <div className="rounded-2xl bg-white text-slate-900 shadow-md overflow-hidden border border-slate-200 text-xs">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800 text-xs">
                    From: {business.name} &lt;{connectedAccount?.email || `notifications@${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`}&gt;
                  </p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Subject: {subject || '(No subject provided)'}
                  </p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                    {business.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-xs">
                      {business.name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {business.address}, {business.city}
                    </p>
                  </div>
                </div>

                <div className="text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[140px] text-xs">
                  {body || 'Type your message to preview how it will appear in client mail apps.'}
                </div>

                <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-500 text-center">
                  Questions? Call {business.phone} • {business.websiteUrl}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Email Templates Library
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Create new templates or customize existing automated & outreach emails
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreateTemplate}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              New Template
            </Button>
          </div>

          {templates.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-6 h-6" />}
              title="No email templates found"
              description="Create a new custom email template to quickly draft outreach messages."
              actionLabel="Create First Template"
              onAction={handleOpenCreateTemplate}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between hover:border-emerald-200 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-slate-900">
                        {tpl.name}
                      </h4>
                      <Badge variant="neutral" size="sm">
                        {tpl.category}
                      </Badge>
                    </div>
                    <p className="text-xs font-semibold text-emerald-800 mb-1.5">
                      Subject: {tpl.subject}
                    </p>
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-line bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-sans">
                      {tpl.body}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenEditTemplate(tpl)}
                        leftIcon={<Pencil className="w-3.5 h-3.5" />}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                        leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}
                        className="text-rose-600 hover:bg-rose-50"
                      >
                        Delete
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSelectTemplate(tpl)}
                    >
                      Use Template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Customers with Email */}
      {activeTab === 'customers' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium">
            Showing verified client records with recorded email addresses.
          </div>

          <div className="space-y-2">
            {emailCustomers.map((cust) => (
              <div
                key={cust.id}
                className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-900">{cust.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{cust.email}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedRecipientId(cust.id);
                    setActiveTab('compose');
                  }}
                >
                  Compose To Client
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Activity Log */}
      {activeTab === 'activity' && (
        <div className="space-y-3">
          {records.length === 0 ? (
            <EmptyState
              icon={<Mail className="w-6 h-6" />}
              title="No emails sent yet"
              description="Emails sent from your owner portal or automations will be logged here."
            />
          ) : (
            <div className="space-y-2">
              {records.map((rec) => (
                <div
                  key={rec.id}
                  className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {rec.subject}
                      </p>
                      <Badge
                        variant={rec.status === 'delivered' ? 'success' : 'neutral'}
                        size="sm"
                      >
                        {rec.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      To: {rec.recipientName} ({rec.recipientEmail})
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 font-mono">
                    {rec.sentAt}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BottomSheet Modal for Creating / Editing Email Templates */}
      {isTemplateModalOpen && (
        <BottomSheet
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          title={editingTemplate ? 'Edit Email Template' : 'Create New Email Template'}
          subtitle={
            editingTemplate
              ? `Editing "${editingTemplate.name}"`
              : 'Save reusable templates for outreach, reminders, and confirmations'
          }
        >
          <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">
                Template Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Booking Confirmation & Preparation"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1 font-medium">
                  Category Tag
                </label>
                <select
                  value={tplCategory}
                  onChange={(e) => setTplCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
                >
                  <option value="Direct Outreach">Direct Outreach</option>
                  <option value="Booking Confirmation">Booking Confirmation</option>
                  <option value="Appointment Reminder">Appointment Reminder</option>
                  <option value="Follow Up">Follow Up</option>
                  <option value="Seasonal / Promo">Seasonal / Promo</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-medium">
                  Default Subject Line *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Important update regarding your visit"
                  value={tplSubject}
                  onChange={(e) => setTplSubject(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-700 font-medium">
                  Email Message Body *
                </label>
                <span className="text-[11px] text-slate-500">Insert tag helper</span>
              </div>

              {/* Tag helpers */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {[
                  '[Customer Name]',
                  '[Business Name]',
                  '[Service]',
                  '[Date]',
                  '[Time]',
                  '[Phone]',
                  '[Website]',
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleInsertTag(tag)}
                    className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-mono transition"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              <textarea
                required
                rows={7}
                placeholder="Write your email template body here..."
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs font-sans resize-y leading-relaxed"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTemplateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSavingTemplate}
              >
                {editingTemplate ? 'Update Template' : 'Create Template'}
              </Button>
            </div>
          </form>
        </BottomSheet>
      )}
    </div>
  );
};
