import React, { useState } from 'react';
import {
  Bot,
  BookOpen,
  Calendar,
  MessageSquare,
  Plus,
  Trash2,
  Save,
  Send,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { FAQItem } from '../types';
import { soundEffects } from '../utils/soundEffects';

export const AIReceptionistPage: React.FC = () => {
  const { business, updateAISettings } = useBusiness();
  const [activeTab, setActiveTab] = useState<'knowledge' | 'booking' | 'behavior' | 'preview'>('knowledge');

  // Local Form State initialized from business.aiSettings
  const [enabled, setEnabled] = useState(business.aiSettings.enabled);
  const [greeting, setGreeting] = useState(business.aiSettings.greeting);
  const [tone, setTone] = useState(business.aiSettings.tone);
  const [description, setDescription] = useState(business.aiSettings.businessDescription);
  const [hours, setHours] = useState(business.aiSettings.businessHours);
  const [location, setLocation] = useState(business.aiSettings.locationDetails);
  const [policies, setPolicies] = useState(business.aiSettings.policies);
  const [faqs, setFaqs] = useState<FAQItem[]>(business.aiSettings.faqs);
  const [bookingEnabled, setBookingEnabled] = useState(business.aiSettings.bookingEnabled);
  const [bookingInstructions, setBookingInstructions] = useState(business.aiSettings.bookingInstructions);
  const [confirmationBehavior, setConfirmationBehavior] = useState(business.aiSettings.confirmationBehavior);
  const [doNotClaim, setDoNotClaim] = useState(business.aiSettings.doNotClaim);
  const [escalationGuidance, setEscalationGuidance] = useState(business.aiSettings.escalationGuidance);

  // Preview interactive simulation
  const [previewInput, setPreviewInput] = useState('');
  const [previewMessages, setPreviewMessages] = useState<
    { id: string; sender: 'user' | 'ai'; text: string }[]
  >([
    {
      id: 'p-1',
      sender: 'ai',
      text: greeting,
    },
  ]);

  const handleSaveAll = () => {
    soundEffects.playSuccess();
    updateAISettings({
      enabled,
      greeting,
      tone,
      businessDescription: description,
      businessHours: hours,
      locationDetails: location,
      policies,
      faqs,
      bookingEnabled,
      bookingInstructions,
      confirmationBehavior,
      doNotClaim,
      escalationGuidance,
    });
  };

  const handleAddFaq = () => {
    soundEffects.playButtonClick();
    setFaqs([
      ...faqs,
      {
        id: `faq-${Date.now()}`,
        question: 'What is your refund or deposit policy?',
        answer: 'Deposits are refundable up to 24 hours prior to scheduled appointment time.',
      },
    ]);
  };

  const handleRemoveFaq = (id: string) => {
    soundEffects.playButtonClick();
    setFaqs(faqs.filter((f) => f.id !== id));
  };

  const handleSendPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewInput.trim()) return;

    soundEffects.playButtonClick();
    const userText = previewInput.trim();
    const userMsg = { id: `u-${Date.now()}`, sender: 'user' as const, text: userText };

    let aiResponse = `Regarding "${userText}": `;
    if (userText.toLowerCase().includes('hour') || userText.toLowerCase().includes('open')) {
      aiResponse = `Our business hours are: ${hours}. Would you like to schedule an appointment during these times?`;
    } else if (userText.toLowerCase().includes('book') || userText.toLowerCase().includes('appointment')) {
      aiResponse = `I can help you reserve a time. ${bookingInstructions} What date and service would you prefer?`;
    } else if (userText.toLowerCase().includes('parking') || userText.toLowerCase().includes('location') || userText.toLowerCase().includes('where')) {
      aiResponse = `We are located at ${business.address}, ${business.city}. ${location}`;
    } else {
      aiResponse = `Thank you for reaching out! ${description.slice(0, 120)}... Would you like to schedule a visit?`;
    }

    setPreviewMessages((prev) => [
      ...prev,
      userMsg,
      { id: `ai-${Date.now() + 1}`, sender: 'ai', text: aiResponse },
    ]);
    setPreviewInput('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Front Desk Configuration
            </h2>
            <Badge variant="accent" size="sm">
              Configured for {business.name}
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Configure how your front desk assistant answers questions and schedules appointments for clients
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Save className="w-4 h-4" />}
          onClick={handleSaveAll}
        >
          Save Configuration
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'knowledge', label: 'Business Details', icon: <BookOpen className="w-4 h-4" /> },
          { id: 'booking', label: 'Booking Rules', icon: <Calendar className="w-4 h-4" /> },
          { id: 'behavior', label: 'Speaking Tone', icon: <MessageSquare className="w-4 h-4" /> },
          { id: 'preview', label: 'Interactive Simulator', icon: <Bot className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              soundEffects.playTabSwitch();
              setActiveTab(tab.id as typeof activeTab);
            }}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition min-h-[40px] ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Business Details */}
      {activeTab === 'knowledge' && (
        <div className="space-y-4 max-w-3xl">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Operating Information
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Company Description & Offerings
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 leading-relaxed resize-none shadow-2xs"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Standard Working Hours
                </label>
                <textarea
                  rows={2}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 resize-none shadow-2xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Parking & Arrival Instructions
                </label>
                <textarea
                  rows={2}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 resize-none shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cancellation & Arrival Policy
              </label>
              <input
                type="text"
                value={policies}
                onChange={(e) => setPolicies(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Booking Rules */}
      {activeTab === 'booking' && (
        <div className="space-y-4 max-w-3xl">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Allow Scheduling in Chat
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  When enabled, the assistant collects client contact info and schedules slots directly into your calendar.
                </p>
              </div>
              <input
                type="checkbox"
                checked={bookingEnabled}
                onChange={(e) => setBookingEnabled(e.target.checked)}
                className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Booking Guidance
              </label>
              <textarea
                rows={3}
                value={bookingInstructions}
                onChange={(e) => setBookingInstructions(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 resize-none shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Confirmation Notice
              </label>
              <input
                type="text"
                value={confirmationBehavior}
                onChange={(e) => setConfirmationBehavior(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Receptionist Tone & Guardrails */}
      {activeTab === 'behavior' && (
        <div className="space-y-4 max-w-3xl">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Communication Voice
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Response Tone
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['professional', 'warm', 'friendly', 'concise'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={`p-2.5 rounded-xl border text-xs font-medium capitalize transition ${
                      tone === t
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Opening Greeting
              </label>
              <textarea
                rows={2}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 resize-none shadow-2xs"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-4">
              <h4 className="text-xs font-semibold text-slate-800">
                Guardrails & Hand-off
              </h4>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Statements the Front Desk Must Never Claim
                </label>
                <textarea
                  rows={2}
                  value={doNotClaim}
                  onChange={(e) => setDoNotClaim(e.target.value)}
                  className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 resize-none shadow-2xs"
                  placeholder="e.g. Never promise unverified discounts or medical diagnosis."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  When to Direct Callers to Phone Staff
                </label>
                <input
                  type="text"
                  value={escalationGuidance}
                  onChange={(e) => setEscalationGuidance(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Interactive Live Test Preview */}
      {activeTab === 'preview' && (
        <div className="max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[520px]">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-600" />
              <span className="text-xs font-semibold text-slate-900">
                Front Desk Simulator ({tone} tone)
              </span>
            </div>
            <button
              onClick={() =>
                setPreviewMessages([
                  {
                    id: 'p-1',
                    sender: 'ai',
                    text: greeting,
                  },
                ])
              }
              className="text-[11px] text-slate-500 hover:text-slate-800"
            >
              Reset Dialogue
            </button>
          </div>

          {/* Transcript */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-white">
            {previewMessages.map((m) => {
              const isAi = m.sender === 'ai';
              return (
                <div
                  key={m.id}
                  className={`flex gap-2.5 max-w-[85%] ${
                    isAi ? 'mr-auto' : 'ml-auto flex-row-reverse'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] shrink-0 font-bold ${
                      isAi
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isAi ? 'Desk' : 'You'}
                  </div>
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      isAi
                        ? 'bg-emerald-50 border border-emerald-200 text-slate-800'
                        : 'bg-slate-100 border border-slate-200 text-slate-900'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Box */}
          <form
            onSubmit={handleSendPreview}
            className="p-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask a customer question (e.g. 'What are your hours today?')..."
              value={previewInput}
              onChange={(e) => setPreviewInput(e.target.value)}
              className="flex-1 h-9 px-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
            />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              leftIcon={<Send className="w-3.5 h-3.5" />}
            >
              Send
            </Button>
          </form>
        </div>
      )}
    </div>
  );
};
