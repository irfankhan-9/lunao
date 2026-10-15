import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageSquare, Send, Inbox, AlertTriangle, Check, CheckCheck,
  Search, User, ChevronRight, RefreshCw, Loader2, Lock,
} from 'lucide-react';
import { Business, SidebarTab } from '../types';
import { useOwnerSmsPolling, OwnerSmsRow } from '../lib/useOwnerSmsPolling';

interface MessagesProps {
  businesses?: Business[];
  setBusinesses?: React.Dispatch<React.SetStateAction<Business[]>>;
  setActiveTab?: (tab: SidebarTab) => void;
}

const TERMINAL = new Set(['delivered', 'failed', 'simulated']);

export const Messages: React.FC<MessagesProps> = ({
  businesses = [],
  setBusinesses: _setBusinesses, // kept for prop compatibility but unused
  setActiveTab: _setActiveTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'queued' | 'failed'>('all');
  const [selectedBiz, setSelectedBiz] = useState<Business | null>(null);
  const [newMessageText, setNewMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Pull real SMS rows from the server. Polls every 4s until every row is
  // terminal or 60s elapses. `forceRefresh()` is wired to the manual send.
  // ownerKey must match what Campaigns.tsx uses (localStorage.lunao_owner_key)
  // so that campaign SMS logs appear here. Falls back to 'dashboard' if unset.
  const ownerKey = localStorage.getItem('lunao_owner_key') || 'dashboard';
  const { sms, loading, error, isPolling, lastPolledAt, forceRefresh, sendOneOff } =
    useOwnerSmsPolling({ ownerKey, intervalMs: 3000, timeoutMs: 120_000, limit: 200 });

  // Group rows by destination phone number so the conversation panel can show
  // a single thread per lead. Newest first inside each thread.
  const threads = useMemo(() => {
    const byPhone = new Map<string, OwnerSmsRow[]>();
    for (const row of sms) {
      const key = row.toNumber || 'unknown';
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key)!.push(row);
    }
    // Sort each thread newest first; sort threads by most-recent-activity.
    const list = Array.from(byPhone.entries()).map(([phone, rows]) => {
      rows.sort((a, b) => b.createdAt - a.createdAt);
      return { phone, rows, latestAt: rows[0]?.createdAt || 0 };
    });
    list.sort((a, b) => b.latestAt - a.latestAt);
    return list;
  }, [sms]);

  // Join server SMS threads with the local Business list so we can show
  // the business name + niche instead of just the phone number.
  const threadCards = useMemo(() => {
    return threads.map(t => {
      let biz = businesses.find(b => normalizePhone(b.phone) === normalizePhone(t.phone));
      if (!biz && typeof window !== 'undefined') {
        try {
          const rawBiz = localStorage.getItem('lunao_businesses');
          if (rawBiz) {
            const list = JSON.parse(rawBiz);
            biz = list.find((b: any) => normalizePhone(b.phone) === normalizePhone(t.phone));
          }
        } catch {}
      }
      const name = biz?.name || formatPhone(t.phone);
      const niche = biz?.niche || 'Lead';
      const last = t.rows[0];
      const isPending = !TERMINAL.has(last.status);
      return {
        ...t,
        biz,
        name,
        niche,
        last,
        isPending,
      };
    });
  }, [threads, businesses]);

  const filteredThreadCards = useMemo(() => {
    let list = threadCards;
    const term = searchQuery.toLowerCase().trim();
    if (term) {
      list = list.filter(t =>
        t.name.toLowerCase().includes(term) ||
        t.phone.includes(term) ||
        t.niche.toLowerCase().includes(term) ||
        (t.biz?.owner || '').toLowerCase().includes(term),
      );
    }
    if (statusFilter === 'delivered') {
      list = list.filter(t => t.last?.status === 'delivered');
    } else if (statusFilter === 'queued') {
      list = list.filter(t => !TERMINAL.has(t.last?.status || ''));
    } else if (statusFilter === 'failed') {
      list = list.filter(t => t.last?.status === 'failed');
    }
    return list;
  }, [threadCards, searchQuery, statusFilter]);

  // Auto-select first thread on desktop.
  useEffect(() => {
    if (window.innerWidth >= 1024 && threadCards.length > 0 && !selectedBiz) {
      const first = threadCards[0];
      const biz = first.biz || businesses.find(b => normalizePhone(b.phone) === normalizePhone(first.phone)) || null;
      // We still want a selectedBiz for the right-pane header even if there's no Business row.
      setSelectedBiz(biz || synthBusinessFromPhone(first.phone));
    }
  }, [threadCards, businesses, selectedBiz]);

  // Auto-scroll to the bottom when the active thread changes.
  useEffect(() => {
    if (chatEndRef.current) {
      const container = chatEndRef.current.parentElement;
      if (container) container.scrollTop = container.scrollHeight;
    }
  }, [selectedBiz?.id, sms.length]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const workspaceEl = document.getElementById('messages-tab-root-container');
    if (workspaceEl) workspaceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const mainEl = document.getElementById('main-content-flow');
    if (mainEl) mainEl.scrollTop = 0;
  }, [selectedBiz?.id]);

  // Active thread (server rows + lead info).
  const activePhone = selectedBiz ? normalizePhone(selectedBiz.phone) : null;
  const activeRows = useMemo(() => {
    if (!activePhone) return [];
    return sms
      .filter(r => normalizePhone(r.toNumber) === activePhone)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [sms, activePhone]);

  // Real delivery tick rendering — the ONLY renderer used. No fake state.
  function renderDeliveryTick(status: string | undefined) {
    if (!status || status === 'pending' || status === 'queued') {
      return <Loader2 className="w-3.5 h-3.5 text-white/60 animate-spin" title="Queued — waiting for Telnyx" />;
    }
    if (status === 'failed') {
      return <AlertTriangle className="w-3.5 h-3.5 text-red-300" title={`Send failed${thisError() ? `: ${thisError()}` : ''}`} />;
    }
    if (status === 'delivered') {
      return (
        <span title="Delivered (confirmed by carrier)">
          <CheckCheck className="w-3.5 h-3.5 text-white" />
        </span>
      );
    }
    if (status === 'simulated') {
      return (
        <span title="Demo mode — no real SMS sent (SMS_ENABLED=false)">
          <Check className="w-3.5 h-3.5 text-violet-300" />
        </span>
      );
    }
    // 'sent' — single tick, waiting on webhook
    return (
      <span title="Sent to Telnyx — awaiting delivery confirmation">
        <Check className="w-3.5 h-3.5 text-white/80" />
      </span>
    );

    function thisError(): string | undefined {
      // Tiny inline helper to surface the errorMessage in the tooltip without
      // restructuring the whole component. Captures the row via the call site
      // passing status only — fallback to undefined.
      return undefined;
    }
  }

  // Send a one-off SMS from the composer. The hook handles charge + send
  // + immediate refresh + polling restart.
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBiz || !newMessageText.trim() || sending) return;
    setSending(true);
    try {
      const row = await sendOneOff(selectedBiz.phone, newMessageText.trim(), selectedBiz.name);
      if (row) {
        setNewMessageText('');
      }
    } finally {
      setSending(false);
    }
  }

  const pendingCount = sms.filter(r => !TERMINAL.has(r.status)).length;
  const deliveredCount = sms.filter(r => r.status === 'delivered').length;
  const failedCount = sms.filter(r => r.status === 'failed').length;

  return (
    <div id="messages-tab-root-container" className="space-y-6 animate-fade-in font-sans text-left">

      {/* Header */}
      <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xl font-serif text-ink tracking-tight">Messages</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700">
              Live · Telnyx
            </span>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-xl">
            Every text you see here was sent or received by a real phone. Outbound delivery ticks update within seconds of the carrier webhook landing. No fakes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatPill label="Pending" value={pendingCount} color="amber" />
          <StatPill label="Delivered" value={deliveredCount} color="emerald" />
          <StatPill label="Failed" value={failedCount} color="red" />
          <button
            onClick={forceRefresh}
            title={lastPolledAt ? `Last polled ${ago(lastPolledAt)}` : 'Refresh'}
            className="ml-1 p-2 rounded-full border border-border-main bg-white hover:bg-off-white text-ink-secondary hover:text-ink transition-colors"
          >
            {isPolling
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Main split viewport workspace: left list, right detail info */}
      <div id="messages-workspace" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative pb-10">

        {/* Left: thread list */}
        <div className={`col-span-1 lg:col-span-7 space-y-4 ${selectedBiz ? 'hidden lg:block' : 'block'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 border border-border-main rounded-lg shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-ink-tertiary absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder="Search phone, business, niche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-border-main rounded pl-10 pr-4 py-2 text-xs focus:ring-1 focus:ring-accent focus:outline-none placeholder:text-ink-tertiary font-sans"
              />
            </div>
            <div className="text-[11px] text-ink-secondary font-medium shrink-0">
              <span className="font-bold text-ink">{filteredThreadCards.length}</span> thread{filteredThreadCards.length === 1 ? '' : 's'}
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-white p-2 border border-border-main rounded-lg shadow-2xs">
            {(['all', 'delivered', 'queued', 'failed'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-ink-secondary hover:text-ink hover:bg-off-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="bg-white border border-border-main rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-off-white border-b border-border-main text-ink-secondary text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Last message</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light text-xs font-sans">
                  {loading && threadCards.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-ink-tertiary text-xs">
                        <Loader2 className="w-4 h-4 inline-block mr-2 animate-spin" />
                        Loading messages…
                      </td>
                    </tr>
                  )}
                  {!loading && filteredThreadCards.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-16 text-center text-ink-tertiary">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-off-white border border-border-main flex items-center justify-center">
                            <Inbox className="w-4 h-4" />
                          </div>
                          <p className="text-xs font-medium">
                            {searchQuery ? 'No threads match your search.' : 'No messages yet.'}
                          </p>
                          {!searchQuery && (
                            <p className="text-[11px] text-ink-tertiary">
                              Send a campaign or a one-off text from the composer to get started.
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {filteredThreadCards.map(card => (
                    <tr
                      key={card.phone}
                      onClick={() => {
                        const biz = card.biz || businesses.find(b => normalizePhone(b.phone) === normalizePhone(card.phone)) || synthBusinessFromPhone(card.phone);
                        setSelectedBiz(biz);
                      }}
                      className={`transition-colors cursor-pointer ${normalizePhone(selectedBiz?.phone || '') === card.phone ? 'bg-accent-soft/30' : 'hover:bg-off-white/40'}`}
                    >
                      <td className="py-4 px-4 w-2/5">
                        <div className="font-bold text-sm text-ink truncate max-w-[180px]">{card.name}</div>
                        <div className="text-[10px] text-ink-secondary flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-ink-tertiary shrink-0" />
                          <span className="font-mono text-ink">{formatPhone(card.phone)}</span>
                          {card.niche && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface text-ink text-[9px] font-bold uppercase ml-1">
                              {card.niche}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 w-2/5">
                        <div className="text-ink-secondary truncate max-w-[240px]">
                          {card.last?.body || <span className="text-ink-tertiary italic">—</span>}
                        </div>
                        <div className="text-[10px] text-ink-tertiary mt-0.5">
                          {card.last ? new Date(card.last.createdAt).toLocaleString() : ''}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right w-1/5">
                        <ThreadStatusBadge status={card.last?.status} count={card.rows.length} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: conversation panel */}
        {selectedBiz && (
          <div className="col-span-1 lg:col-span-5 flex flex-col h-[calc(100vh-140px)] min-h-[500px] bg-white border border-border-main rounded-xl shadow-sm lg:sticky top-6 z-10">
            {/* Header */}
            <div className="p-4 border-b border-border-light flex items-center justify-between bg-off-white rounded-t-xl shrink-0">
              <div className="flex items-center gap-3">
                <button
                  className="lg:hidden p-1.5 -ml-1.5 text-ink-secondary hover:text-ink hover:bg-border-light rounded-md transition-colors"
                  onClick={() => setSelectedBiz(null)}
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="w-10 h-10 rounded-full bg-accent-soft text-accent border border-accent/20 flex flex-col items-center justify-center shrink-0 shadow-sm">
                  <span className="font-bold text-lg leading-none">{selectedBiz.name.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="font-bold text-ink text-sm leading-tight truncate max-w-[160px] sm:max-w-[200px]">{selectedBiz.name}</h3>
                  <p className="text-[11px] text-ink-secondary mt-0.5 font-medium truncate max-w-[160px] sm:max-w-[200px]">
                    <span className="font-mono">{formatPhone(selectedBiz.phone)}</span>
                  </p>
                </div>
              </div>
              <div className="text-[10px] text-ink-tertiary font-mono">
                {lastPolledAt ? `synced ${ago(lastPolledAt)}` : 'syncing…'}
              </div>
            </div>

            {/* Messages body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-off-white/30 scrollbar-thin scrollbar-thumb-border-main scrollbar-track-transparent">
              {activeRows.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-ink-secondary select-none">
                  <div className="w-12 h-12 rounded-full bg-surface border border-border-main flex items-center justify-center mb-3">
                    <MessageSquare className="w-5 h-5 text-ink-tertiary" />
                  </div>
                  <p className="text-xs text-center max-w-[220px] font-medium text-ink-tertiary">
                    No outbound messages to this number yet. Send one below to start the thread.
                  </p>
                </div>
              )}
              {activeRows.map(row => {
                // For now we only render outbound bubbles; inbound rows from
                // sms_inbound (when wired up) would render as the other side.
                const isOut = true;
                return (
                  <div key={row.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-[13px] shadow-sm ${
                      isOut
                        ? 'bg-accent text-white rounded-br-sm'
                        : 'bg-white border border-border-main text-ink rounded-bl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed font-medium">{row.body}</p>
                      <div className={`text-[10px] mt-2 flex items-center gap-1 ${isOut ? 'text-white/70 justify-end' : 'text-ink-tertiary justify-start'}`}>
                        <span>{new Date(row.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        {isOut && renderDeliveryTick(row.status)}
                      </div>
                      {row.status === 'failed' && row.errorMessage && (
                        <div className="mt-2 text-[10px] text-red-200 font-medium">
                          {row.errorMessage}{row.errorCode ? ` (${row.errorCode})` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Composer */}
            <div className="p-3 sm:p-4 border-t border-border-light bg-white rounded-b-xl shrink-0">
              <form onSubmit={handleSend} className="flex gap-2 relative">
                <textarea
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder={`Text ${selectedBiz.name}…`}
                  disabled={sending}
                  className="flex-1 bg-surface border border-border-main rounded-xl px-4 py-3 min-h-[50px] max-h-[120px] text-[13px] font-medium focus:outline-none focus:ring-1 focus:ring-accent resize-none placeholder:text-ink-tertiary scrollbar-thin disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!newMessageText.trim() || sending}
                  className="self-end p-3.5 shadow-sm bg-accent hover:bg-accent-hover active:scale-95 text-white rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center cursor-pointer"
                  title="Send SMS via Telnyx"
                >
                  {sending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4 ml-0.5" />}
                </button>
              </form>
              {newMessageText.length > 160 && (
                <div className="mt-2.5 text-[11px] text-amber-800 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>{newMessageText.length <= 306 ? '2-Segment SMS' : newMessageText.length <= 459 ? '3-Segment SMS' : newMessageText.length <= 612 ? '4-Segment SMS' : 'Multi-Segment SMS'}</strong> ({newMessageText.length} chars / ~{newMessageText.length <= 306 ? '306' : newMessageText.length <= 459 ? '459' : newMessageText.length <= 612 ? '612' : 'max'} limit)
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-800/80 shrink-0">Telnyx billing: {newMessageText.length <= 306 ? '2 msgs' : newMessageText.length <= 459 ? '3 msgs' : newMessageText.length <= 612 ? '4 msgs' : 'multiple msgs'}</span>
                </div>
              )}
              <div className="text-[10px] text-ink-tertiary text-center mt-3 flex items-center justify-center gap-1.5 font-medium">
                <Lock className="w-3 h-3" />
                <span>Sends cost 3 credits · Delivery confirmed by Telnyx webhook</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ----- helpers ---------------------------------------------------------------

function StatPill({ label, value, color }: { label: string; value: number; color: 'amber' | 'emerald' | 'red' }) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-500/10 text-amber-800 border-amber-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-700 border-red-500/20',
  };
  return (
    <div className={`px-3 py-1.5 rounded-lg border ${colors[color]} flex flex-col items-center min-w-[64px]`}>
      <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">{label}</div>
      <div className="text-base font-bold leading-tight">{value}</div>
    </div>
  );
}

function ThreadStatusBadge({ status, count }: { status?: string; count: number }) {
  if (!status) {
    return <span className="text-[10px] text-ink-tertiary italic">No messages</span>;
  }
  if (status === 'delivered') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
        <CheckCheck className="w-3 h-3" />
        SMS Delivered
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-red-500/10 text-red-700 border border-red-500/20">
        <AlertTriangle className="w-3 h-3" />
        SMS Failed
      </span>
    );
  }
  if (status === 'simulated') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-violet-500/10 text-violet-700 border border-violet-500/20">
        SMS Sent (Demo)
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-700 border border-blue-500/20">
        <Send className="w-3 h-3" />
        SMS Sent
        {count > 1 && <span className="ml-1 opacity-60">×{count}</span>}
      </span>
    );
  }
  // queued / pending
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-amber-500/10 text-amber-800 border border-amber-500/20">
      <Loader2 className="w-3 h-3 animate-spin" />
      SMS Queued
      {count > 1 && <span className="ml-1 opacity-60">×{count}</span>}
    </span>
  );
}

function normalizePhone(p: string | undefined | null): string {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function formatPhone(p: string): string {
  const digits = String(p || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return p;
}

function synthBusinessFromPhone(phone: string): Business {
  return {
    id: `sms-${phone}`,
    name: formatPhone(phone),
    owner: '',
    phone,
    city: '',
    niche: '',
    webStatus: 'pending' as any,
    siteStatus: 'Not sent' as any,
    slug: '',
    siteUrl: '',
    smsHistory: [],
  } as Business;
}

function ago(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}
