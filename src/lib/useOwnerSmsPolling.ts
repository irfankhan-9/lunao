// src/lib/useOwnerSmsPolling.ts
// Polls GET /api/owner/sms every 3 seconds, and merges local SMS campaigns
// from localStorage (lunao_campaigns) so that client-side SMS campaign runs
// instantly populate the Messaging section and filters. Strictly deduplicates rows.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSpecialModeActive,
  getSpecialModeSmsRows,
} from '../specialModes/modeManager';
import { sendUgcSimulatedOneOffSms } from '../specialModes/UgcSandboxEngine';

export interface OwnerSmsRow {
  id: number;
  campaignId: string | null;
  leadId: number | null;
  ownerKey: string | null;
  toNumber: string;
  fromNumber: string | null;
  body: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'simulated' | 'reply' | string;
  direction?: 'inbound' | 'outbound';
  isReply?: boolean;
  telnyxId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  segmentCount: number;
  costCredits: number;
  refunded: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Options {
  ownerKey?: string;
  intervalMs?: number;
  timeoutMs?: number;
  limit?: number;
}

interface PollingState {
  sms: OwnerSmsRow[];
  loading: boolean;
  error: string | null;
  isPolling: boolean;
  lastPolledAt: number | null;
  forceRefresh: () => void;
  sendOneOff: (to: string, text: string, leadName?: string) => Promise<OwnerSmsRow | null>;
}

const API_BASE = '';

function normalizePhone(p: string | undefined | null): string {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

export function useOwnerSmsPolling(opts: Options = {}): PollingState {
  const { ownerKey = 'dashboard', intervalMs = 3000, limit = 500 } = opts;
  const [sms, setSms] = useState<OwnerSmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<boolean>(false);

  // Helper to read local localStorage campaign SMS leads and synthesize OwnerSmsRow[]
  const getLocalCampaignSmsRows = (): OwnerSmsRow[] => {
    if (isSpecialModeActive()) {
      return getSpecialModeSmsRows(ownerKey);
    }
    const synthesizedRows: OwnerSmsRow[] = [];
    try {
      const raw = localStorage.getItem('lunao_campaigns');
      if (raw) {
        const camps = JSON.parse(raw);
        if (Array.isArray(camps)) {
          for (const camp of camps) {
            if (camp.type === 'sms' && Array.isArray(camp.smsLeads)) {
              for (const lead of camp.smsLeads) {
                synthesizedRows.push({
                  id: Number(String(lead.leadId || '').replace(/\D/g, '')) || Math.abs(hashCode((lead.phone || '') + (lead.sentAt || ''))),
                  campaignId: camp.id,
                  leadId: null,
                  ownerKey,
                  toNumber: normalizePhone(lead.phone || ''),
                  fromNumber: camp.smsPhoneUsed || '',
                  body: lead.smsText || 'Automated SMS proposal from Lunao',
                  status: lead.status || 'queued',
                  direction: 'outbound',
                  telnyxId: lead.telnyxId || null,
                  errorCode: lead.errorCode || null,
                  errorMessage: lead.smsError || lead.errorMessage || null,
                  segmentCount: 1,
                  costCredits: 2,
                  refunded: false,
                  createdAt: lead.sentAt ? (new Date(lead.sentAt).getTime() || Date.now()) : Date.now(),
                  updatedAt: Date.now(),
                });
              }
            }
          }
        }
      }
    } catch {}

    // Also read incoming replies stored on local businesses
    try {
      const rawBiz = localStorage.getItem('lunao_businesses');
      const bizList = rawBiz ? JSON.parse(rawBiz) : [];
      if (Array.isArray(bizList)) {
        for (const biz of bizList) {
          if (Array.isArray(biz.smsHistory)) {
            for (const msg of biz.smsHistory) {
              if (msg.type === 'incoming' || msg.direction === 'inbound') {
                synthesizedRows.push({
                  id: Math.abs(hashCode((biz.phone || '') + (msg.text || '') + (msg.timestamp || ''))),
                  campaignId: null,
                  leadId: null,
                  ownerKey,
                  toNumber: normalizePhone(biz.phone || ''),
                  fromNumber: biz.senderNumber || '',
                  body: msg.text || 'Reply received',
                  status: 'reply',
                  direction: 'inbound',
                  isReply: true,
                  telnyxId: null,
                  errorCode: null,
                  errorMessage: null,
                  segmentCount: 1,
                  costCredits: 0,
                  refunded: false,
                  createdAt: msg.timestamp ? (new Date(msg.timestamp).getTime() || Date.now() - 3600000) : Date.now() - 3600000,
                  updatedAt: Date.now(),
                });
              }
            }
          }
        }
      }
    } catch {}

    return synthesizedRows;
  };

  const fetchOnce = useCallback(async (): Promise<OwnerSmsRow[] | null> => {
    if (inflightRef.current) return null;
    inflightRef.current = true;
    try {
      const qs = new URLSearchParams({ ownerKey, limit: String(limit) });
      const r = await fetch(`${API_BASE}/api/owner/sms?${qs.toString()}`, { credentials: 'include' });
      
      const localRows = getLocalCampaignSmsRows();

      if (!r.ok) {
        setError(null);
        return localRows;
      }

      const data = await r.json().catch(() => ({}));
      const serverRows = (Array.isArray(data?.sms) ? data.sms : []) as OwnerSmsRow[];

      // Merge server rows and local campaign rows with strict deduplication by normalized phone & message body
      const byKey = new Map<string, OwnerSmsRow>();
      for (const row of [...serverRows, ...localRows]) {
        const normPhone = normalizePhone(row.toNumber) || 'unknown';
        const cleanBody = String(row.body || '').trim().toLowerCase();
        const uniqueKey = row.telnyxId
          ? `tx_${row.telnyxId}`
          : `${normPhone}_${cleanBody}`;
        
        if (!byKey.has(uniqueKey)) {
          byKey.set(uniqueKey, { ...row, toNumber: normPhone });
        } else {
          const existing = byKey.get(uniqueKey)!;
          if (row.status === 'delivered' || row.status === 'failed' || (existing.status !== 'delivered' && row.status === 'sent')) {
            byKey.set(uniqueKey, { ...existing, ...row, toNumber: normPhone, createdAt: Math.max(existing.createdAt, row.createdAt) });
          }
        }
      }

      setError(null);
      return Array.from(byKey.values());
    } catch {
      return getLocalCampaignSmsRows();
    } finally {
      inflightRef.current = false;
    }
  }, [ownerKey, limit]);

  const reconcile = useCallback((rows: OwnerSmsRow[]) => {
    setSms((_prev) => {
      const byId = new Map<string, OwnerSmsRow>();
      for (const r of rows) {
        const normPhone = normalizePhone(r.toNumber) || 'unknown';
        const cleanBody = String(r.body || '').trim().toLowerCase();
        const uniqueKey = r.telnyxId
          ? `tx_${r.telnyxId}`
          : `${normPhone}_${cleanBody}`;
        
        if (!byId.has(uniqueKey)) {
          byId.set(uniqueKey, { ...r, toNumber: normPhone });
        } else {
          const existing = byId.get(uniqueKey)!;
          if (r.status === 'delivered' || r.status === 'failed' || (existing.status !== 'delivered' && r.status === 'sent')) {
            byId.set(uniqueKey, { ...existing, ...r, toNumber: normPhone, createdAt: Math.max(existing.createdAt, r.createdAt) });
          }
        }
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
      return merged;
    });
  }, []);

  const tick = useCallback(async () => {
    const rows = await fetchOnce();
    setLastPolledAt(Date.now());
    if (rows) reconcile(rows);

    setIsPolling(false);
    timerRef.current = setTimeout(tick, intervalMs);
  }, [fetchOnce, reconcile, intervalMs]);

  useEffect(() => {
    let cancelled = false;
    setIsPolling(true);
    (async () => {
      const rows = await fetchOnce();
      if (cancelled) return;
      setLastPolledAt(Date.now());
      if (rows) reconcile(rows);
      setLoading(false);
      timerRef.current = setTimeout(tick, intervalMs);
    })();

    const handleDispatched = (e: Event) => {
      const custom = e as CustomEvent<OwnerSmsRow>;
      if (custom.detail) {
        setSms((prev) => {
          const normPhone = normalizePhone(custom.detail.toNumber) || 'unknown';
          const cleanBody = String(custom.detail.body || '').trim().toLowerCase();
          const customKey = custom.detail.telnyxId
            ? `tx_${custom.detail.telnyxId}`
            : `${normPhone}_${cleanBody}`;

          const byKey = new Map<string, OwnerSmsRow>();
          byKey.set(customKey, { ...custom.detail, toNumber: normPhone });

          for (const r of prev) {
            const rNorm = normalizePhone(r.toNumber) || 'unknown';
            const rBody = String(r.body || '').trim().toLowerCase();
            const key = r.telnyxId ? `tx_${r.telnyxId}` : `${rNorm}_${rBody}`;
            if (!byKey.has(key)) {
              byKey.set(key, { ...r, toNumber: rNorm });
            }
          }
          return Array.from(byKey.values()).sort((a, b) => b.createdAt - a.createdAt);
        });
        setTimeout(() => {
          fetchOnce().then((rows) => {
            if (rows) reconcile(rows);
          });
        }, 600);
      }
    };

    const handleStatusUpdated = (e: Event) => {
      const custom = e as CustomEvent<{ telnyxId?: string; phone?: string; status: string; errorMessage?: string; errorCode?: string }>;
      if (custom.detail) {
        setSms((prev) =>
          prev.map((r) => {
            const matchTelnyx = custom.detail.telnyxId && r.telnyxId === custom.detail.telnyxId;
            const matchPhone = custom.detail.phone && (normalizePhone(r.toNumber) === normalizePhone(custom.detail.phone));
            if (matchTelnyx || matchPhone) {
              return {
                ...r,
                status: custom.detail.status as any,
                errorMessage: custom.detail.errorMessage ?? r.errorMessage,
                errorCode: custom.detail.errorCode ?? r.errorCode,
                updatedAt: Date.now(),
              };
            }
            return r;
          })
        );
      }
    };

    window.addEventListener('lunao_sms_dispatched', handleDispatched);
    window.addEventListener('lunao_sms_status_updated', handleStatusUpdated);

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener('lunao_sms_dispatched', handleDispatched);
      window.removeEventListener('lunao_sms_status_updated', handleStatusUpdated);
    };
  }, [fetchOnce, reconcile, intervalMs]);

  const forceRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    tick();
  }, [tick]);

  const sendOneOff = useCallback(async (to: string, text: string, leadName?: string): Promise<OwnerSmsRow | null> => {
    const normPhone = normalizePhone(to);
    try {
      const r = await fetch(`${API_BASE}/api/owner/sms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: normPhone, text, leadName, ownerKey }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        const simulatedRow: OwnerSmsRow = {
          id: Date.now(),
          campaignId: null,
          leadId: null,
          ownerKey,
          toNumber: normPhone,
          fromNumber: null,
          body: text,
          status: 'delivered',
          telnyxId: 'tx_sim_' + Math.random().toString(36).substring(2, 9),
          errorCode: null,
          errorMessage: null,
          segmentCount: 1,
          costCredits: 3,
          refunded: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setSms(prev => [simulatedRow, ...prev]);
        return simulatedRow;
      }
      forceRefresh();
      return {
        id: data.smsId || Date.now(),
        campaignId: null,
        leadId: null,
        ownerKey,
        toNumber: normPhone,
        fromNumber: null,
        body: text,
        status: data.status || 'delivered',
        telnyxId: data.telnyxId || null,
        errorCode: null,
        errorMessage: null,
        segmentCount: 1,
        costCredits: 3,
        refunded: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch {
      const simulatedRow: OwnerSmsRow = {
        id: Date.now(),
        campaignId: null,
        leadId: null,
        ownerKey,
        toNumber: normPhone,
        fromNumber: null,
        body: text,
        status: 'delivered',
        telnyxId: 'tx_sim_' + Math.random().toString(36).substring(2, 9),
        errorCode: null,
        errorMessage: null,
        segmentCount: 1,
        costCredits: 3,
        refunded: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSms(prev => [simulatedRow, ...prev]);
      return simulatedRow;
    }
  }, [ownerKey, forceRefresh]);

  return { sms, loading, error, isPolling, lastPolledAt, forceRefresh, sendOneOff };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
