// src/contexts/GateContext.tsx
//
// v2 replaces the email/Google auth system with a single hardcoded password
// gate (server/lib/siteGate.js). The dashboard is locked until the visitor
// proves they know the password; the server sets a signed cookie that lasts
// 12 hours, so reloading the page or returning tomorrow keeps them signed in.
//
// This context just mirrors the gate state into the React tree and exposes
// a logout helper. It does NOT own a token in JS — the cookie is httpOnly.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface GateContextValue {
  unlocked: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const GateContext = createContext<GateContextValue | null>(null);

export function GateProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const refresh = useCallback(async () => {
    // For localhost development: skip the gate check and unlock directly.
    if (isLocalhost) {
      setUnlocked(true);
      return;
    }

    try {
      const r = await fetch('/api/site-gate/status', { credentials: 'include' });
      if (!r.ok) {
        setUnlocked(false);
        return;
      }
      const data = await r.json().catch(() => ({}));
      setUnlocked(Boolean(data?.authenticated));
    } catch {
      // Offline / weird — assume locked. The gate middleware on the server
      // is the real source of truth.
      setUnlocked(false);
    }
  }, [isLocalhost]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/site-gate/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore — best effort
    }
    setUnlocked(false);
  }, []);

  return (
    <GateContext.Provider value={{ unlocked, loading, refresh, logout }}>
      {children}
    </GateContext.Provider>
  );
}

export function useGate() {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error('useGate must be used inside <GateProvider>');
  return ctx;
}
