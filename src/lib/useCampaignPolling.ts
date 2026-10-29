// src/lib/useCampaignPolling.ts
//
// Polls GET /api/campaigns/:id every 2.5s while the campaign is running,
// and (importantly) keeps polling for 60s AFTER the campaign status flips
// to 'completed' — that's when Telnyx is still busy finalizing real
// delivery receipts, and we want the per-lead status chips on the detail
// page to flip from "sent" -> "delivered" in real time.
//
// Each poll fires server-side re-check of every non-terminal sms_logs row
// (throttled to 1 Telnyx API hit per telnyx_id per 5s), so the dashboard
// is always in sync with Telnyx regardless of webhook delivery.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SmsLogRow {
  id: number;
  leadId: number | null;
  toNumber: string;
  fromNumber: string | null;
  body: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'simulated' | string;
  telnyxId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  segmentCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignLeadRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  city: string;
  siteUrl: string | null;
  smsStatus: 'pending' | 'queued' | 'sent' | 'delivered' | 'failed' | 'skipped' | 'simulated' | string;
  smsError: string | null;
  siteStatus: string;
}

export interface CampaignDetail {
  id: string;
  ownerKey: string;
  name: string;
  niche: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed' | string;
  totalLeads: number;
  sitesGenerated: number;
  smsSent: number;
  smsFailed: number;
  smsSkipped: number;
  startedAt: number;
  completedAt: number | null;
  smsTemplate: string | null;
  type: string;
}

export interface CampaignPollState {
  data: {
    campaign: CampaignDetail;
    leads: CampaignLeadRow[];
    sms: SmsLogRow[];
  } | null;
  loading: boolean;
  error: string | null;
  lastPolledAt: number | null;
  pollCount: number;
}

interface Options {
  enabled?: boolean;
  // Continue polling for this many seconds AFTER status flips to
  // 'completed', so users see final Telnyx delivery receipts roll in.
  tailMs?: number;
  intervalMs?: number;
}

export function useCampaignPolling(
  campaignId: string | null,
  opts: Options = {}
): CampaignPollState {
  const { enabled = true, tailMs = 120_000, intervalMs = 5000 } = opts;

  const [data, setData] = useState<CampaignPollState['data']>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPolledAt, setLastPolledAt] = useState<number | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const stoppedAtRef = useRef<number | null>(null);
  const inflightRef = useRef<boolean>(false);

  const fetchOnce = useCallback(async (): Promise<CampaignPollState['data'] | null> => {
    if (inflightRef.current) return null;
    if (!campaignId) return null;
    inflightRef.current = true;
    try {
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        setError(`Server returned ${res.status}`);
        return null;
      }
      const j = await res.json().catch(() => ({}));
      if (!j?.campaign) return null;
      setError(null);
      return { campaign: j.campaign, leads: j.leads || [], sms: j.sms || [] };
    } catch (e: any) {
      setError(e?.message || 'Network error');
      return null;
    } finally {
      inflightRef.current = false;
    }
  }, [campaignId]);

  const tick = useCallback(async () => {
    const fresh = await fetchOnce();
    if (cancelledRef.current) return;
    setPollCount((c) => c + 1);
    setLastPolledAt(Date.now());
    if (fresh) setData(fresh);

    // Decide whether to keep polling.
    if (!fresh) {
      timerRef.current = setTimeout(tick, intervalMs);
      return;
    }
    const status = String(fresh.campaign.status || '').toLowerCase();
    if (status === 'running' || status === 'starting') {
      stoppedAtRef.current = null;
      timerRef.current = setTimeout(tick, intervalMs);
      return;
    }
    // Campaign finished — keep polling for `tailMs` so final delivery
    // receipts have time to land in the DB.
    if (stoppedAtRef.current == null) stoppedAtRef.current = Date.now();
    if (Date.now() - stoppedAtRef.current < tailMs) {
      timerRef.current = setTimeout(tick, intervalMs);
    }
  }, [fetchOnce, intervalMs, tailMs]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled || !campaignId) return;
    setLoading(true);
    (async () => {
      const fresh = await fetchOnce();
      if (cancelledRef.current) return;
      setLastPolledAt(Date.now());
      if (fresh) setData(fresh);
      setLoading(false);
      timerRef.current = setTimeout(tick, intervalMs);
    })();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, enabled, intervalMs, tailMs]);

  return { data, loading, error, lastPolledAt, pollCount };
}
