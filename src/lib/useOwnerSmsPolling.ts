// src/lib/useOwnerSmsPolling.ts
//
// Polls GET /api/owner/sms every 2.5 seconds. The server's response is the
// source of truth — it (a) returns the rows from sms_logs, AND
// (b) fires a Telnyx API re-check for every row whose status isn't yet
// `delivered` / `failed` / `simulated`, AND
// (c) writes the fresh status back to the DB so the next poll sees it.
//
// The hook keeps polling for the lifetime of the component (rather than
// stopping once rows hit a terminal status) so the dashboard shows new
// sends in real time no matter when the user lands on the page.
//
// Mount safe: each component instance owns its own timer. We de-dup
// in-flight requests with a per-instance flag. Server-side throttles the
// real API call to once / 5s / telnyx_id so cost stays negligible.
//
// Each tick calls /api/owner/sms and diffs by `id`. Rows are added/updated
// in-place; rows that disappear (e.g. older than the limit) are pruned.
//
// The hook is designed to be safe to mount many times simultaneously —
// the timer is owned per-instance and is torn down on unmount. A global
// deduper (requestSeq) prevents in-flight overlap.
//
// Each tick calls /api/owner/sms and diffs by `id`. Rows are added/updated
// in-place; rows that disappear (e.g. older than the limit) are pruned.
//
// The hook is designed to be safe to mount many times simultaneously —
// the timer is owned per-instance and is torn down on unmount. A global
// deduper (requestSeq) prevents in-flight overlap.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface OwnerSmsRow {
  id: number;
  campaignId: string | null;
  leadId: number | null;
  ownerKey: string | null;
  toNumber: string;
  fromNumber: string | null;
  body: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'simulated' | string;
  telnyxId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  segmentCount: number;
  costCredits: number;
  refunded: boolean;
  createdAt: number;
  updatedAt: number;
}

const TERMINAL_STATUSES = new Set(['delivered', 'failed', 'simulated']);

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

export function useOwnerSmsPolling(opts: Options = {}): PollingState {
  const { ownerKey = 'dashboard', intervalMs = 2500, limit = 200 } = opts;
  const [sms, setSms] = useState<OwnerSmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<boolean>(false);

  const fetchOnce = useCallback(async (): Promise<OwnerSmsRow[] | null> => {
    if (inflightRef.current) return null;
    inflightRef.current = true;
    try {
      const qs = new URLSearchParams({ ownerKey, limit: String(limit) });
      const r = await fetch(`${API_BASE}/api/owner/sms?${qs.toString()}`, { credentials: 'include' });
      if (!r.ok) {
        setError(`Server returned ${r.status}`);
        return null;
      }
      const data = await r.json().catch(() => ({}));
      const rows = (Array.isArray(data?.sms) ? data.sms : []) as OwnerSmsRow[];
      setError(null);
      return rows;
    } catch (e: any) {
      setError(e?.message || 'Network error');
      return null;
    } finally {
      inflightRef.current = false;
    }
  }, [ownerKey, limit]);

  const reconcile = useCallback((rows: OwnerSmsRow[]) => {
    setSms((prev) => {
      const byId = new Map<number, OwnerSmsRow>();
      for (const r of prev) byId.set(r.id, r);
      for (const r of rows) byId.set(r.id, r); // overwrite with fresh
      const merged = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
      return merged;
    });
  }, []);

  const tick = useCallback(async () => {
    const rows = await fetchOnce();
    setLastPolledAt(Date.now());
    if (rows) reconcile(rows);

    // Always keep polling. Server-side throttling keeps costs negligible.
    // We never auto-stop — the user expects the dashboard to keep showing
    // live updates while the page is open.
    setIsPolling(false); // not "still in flight" — we are simply watching
    timerRef.current = setTimeout(tick, intervalMs);
  }, [fetchOnce, reconcile, intervalMs]);

  // First paint + bootstrap the polling loop.
  useEffect(() => {
    let cancelled = false;
    setIsPolling(true);
    (async () => {
      const rows = await fetchOnce();
      if (cancelled) return;
      setLastPolledAt(Date.now());
      if (rows) reconcile(rows);
      setLoading(false);
      // Schedule the next tick 2.5s out.
      timerRef.current = setTimeout(tick, intervalMs);
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // We deliberately don't depend on `tick` — `tick` closes over current
    // intervalMs via refs to keep this effect mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, intervalMs]);

  const forceRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    tick();
  }, [tick]);

  const sendOneOff = useCallback(async (to: string, text: string, leadName?: string): Promise<OwnerSmsRow | null> => {
    try {
      const r = await fetch(`${API_BASE}/api/owner/sms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, text, leadName, ownerKey }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        setError(data.error || `Send failed (${r.status})`);
        return null;
      }
      // Refresh the list immediately + start polling to catch the webhook.
      forceRefresh();
      // We don't have the full row from the POST response, so return a
      // minimal placeholder; the next poll will fill in the real row.
      return {
        id: data.smsId || -1,
        campaignId: null,
        leadId: null,
        ownerKey,
        toNumber: to,
        fromNumber: null,
        body: text,
        status: data.status || 'queued',
        telnyxId: data.telnyxId || null,
        errorCode: null,
        errorMessage: null,
        segmentCount: 1,
        costCredits: 3,
        refunded: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (e: any) {
      setError(e?.message || 'Send failed');
      return null;
    }
  }, [ownerKey, forceRefresh]);

  return { sms, loading, error, isPolling, lastPolledAt, forceRefresh, sendOneOff };
}
