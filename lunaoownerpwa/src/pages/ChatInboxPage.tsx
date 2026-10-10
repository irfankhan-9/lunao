import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Bot,
  User,
  CalendarCheck,
  Phone,
  Mail,
  ChevronLeft,
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { Conversation } from '../types';
import { chatService } from '../services/chatService';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { soundEffects } from '../utils/soundEffects';

export const ChatInboxPage: React.FC = () => {
  const { business, setActiveSection } = useBusiness();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [, setIsLoading] = useState(true);

  // Every time user navigates to the Inquiries section, ensure it starts on the home list
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const list = await chatService.getConversations();
      if (isMounted) {
        setConversations(list);
        setSelectedId(''); // Always start on home / list view
        setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [business.id]);

  const activeConversation = conversations.find((c) => c.id === selectedId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            Front Desk Transcripts
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Real visitor interactions and appointment bookings recorded live
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="accent" size="sm">
            Read-Only Audit Mode
          </Badge>
        </div>
      </div>

      {/* Main Dual-Pane Chat Layout */}
      {conversations.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-6 h-6" />}
          title="No conversations yet"
          description="Transcripts of client inquiries from your website front desk will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[720px] max-h-[80vh]">
          {/* Left Column: Conversation Sessions List */}
          <div
            className={`lg:col-span-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col overflow-hidden ${
              selectedId ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="text-xs font-semibold text-slate-800">
                Visitor Dialogues
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {conversations.length} total
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {conversations.map((conv) => {
                const isSelected = conv.id === selectedId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      soundEffects.playButtonClick();
                      setSelectedId(conv.id);
                    }}
                    className={`w-full p-3 rounded-xl text-left transition border ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-300 shadow-2xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`text-xs font-semibold truncate ${
                          isSelected ? 'text-emerald-900' : 'text-slate-900'
                        }`}
                      >
                        {conv.customerIdentifier}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                        {conv.timestamp}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-1">
                      {conv.lastMessage}
                    </p>

                    {conv.resultingBookingId && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
                        <CalendarCheck className="w-3 h-3" />
                        <span>Appointment Scheduled</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Conversation Transcript */}
          <div
            className={`lg:col-span-8 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col overflow-hidden ${
              !selectedId ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {activeConversation ? (
              <>
                {/* Transcript Header */}
                <div className="p-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => {
                        soundEffects.playButtonClick();
                        setSelectedId('');
                      }}
                      className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:text-slate-900 bg-white border border-slate-200"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-slate-900 truncate">
                          {activeConversation.customerIdentifier}
                        </h3>
                        {activeConversation.resultingBookingId && (
                          <Badge variant="success" size="sm">
                            Booking Confirmed
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {activeConversation.customerPhone || 'Anonymous Web Visitor'}
                        {activeConversation.customerEmail &&
                          ` • ${activeConversation.customerEmail}`}
                      </p>
                    </div>
                  </div>

                  {/* Actions if contact info is present */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeConversation.customerPhone && (
                      <a
                        href={`tel:${activeConversation.customerPhone.replace(/[^0-9]/g, '')}`}
                        className="p-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs"
                        title="Call Customer"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-700" />
                      </a>
                    )}
                    {activeConversation.customerEmail && (
                      <a
                        href={`mailto:${activeConversation.customerEmail}`}
                        className="p-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition shadow-2xs"
                        title="Email Customer"
                      >
                        <Mail className="w-3.5 h-3.5 text-emerald-700" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Booking Result Banner if applicable */}
                {activeConversation.resultingBookingId && (
                  <div className="mx-4 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        This dialogue scheduled appointment #
                        {activeConversation.resultingBookingId}
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveSection('bookings')}
                      className="text-[11px] font-semibold underline hover:text-emerald-950"
                    >
                      View Booking
                    </button>
                  </div>
                )}

                {/* Messages Body */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3.5 overscroll-contain bg-white">
                  {activeConversation.messages.map((msg) => {
                    const isAi = msg.sender === 'ai';
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[85%] ${
                          isAi ? 'ml-auto flex-row-reverse' : 'mr-auto'
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                            isAi
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {isAi ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                        </div>

                        {/* Bubble */}
                        <div
                          className={`p-3 rounded-2xl text-xs leading-relaxed ${
                            isAi
                              ? 'bg-emerald-50 border border-emerald-200 text-slate-800 rounded-tr-xs'
                              : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500 mb-1">
                            <span className="font-semibold text-slate-700">
                              {isAi ? `${business.name} Front Desk` : 'Visitor'}
                            </span>
                            <span className="font-mono">{msg.timestamp}</span>
                          </div>
                          <p>{msg.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Read-Only Notice */}
                <div className="p-3 border-t border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                  <span>
                    Audit Mode • Front Desk automatically handles client inquiries using your configured business policies
                  </span>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                Select a chat session on the left to view the transcript
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
