import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabaseClient } from '../lib/supabaseClient';
import { setVibeCreditBalance } from '../lib/vibeCredits';

export interface AuthUser {
  id: string;
  ownerKey: string;
  email: string;
  name: string;
  picture?: string;
}

interface GateContextValue {
  unlocked: boolean;
  loading: boolean;
  user: AuthUser | null;
  signInWithGoogle: () => Promise<AuthUser>;
  signInWithSupabaseGoogle: () => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const GateContext = createContext<GateContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('lunao_auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.ownerKey && (parsed.email || parsed.id)) {
      return parsed as AuthUser;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function GateProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [unlocked, setUnlocked] = useState<boolean>(() => Boolean(readStoredUser()));
  const [loading, setLoading] = useState<boolean>(true);

  const applyAuthenticatedSession = useCallback(
    (
      authUser: AuthUser,
      planInput?: string,
      userCreditsInput?: number,
      vibeCreditsInput?: number
    ) => {
      const ownerKey = authUser.ownerKey;
      try {
        const updatedAuthUser: AuthUser = {
          ...authUser,
          credits: resolvedCredits,
        };
        localStorage.setItem('lunao_auth_user', JSON.stringify(updatedAuthUser));
        localStorage.setItem('lunao_owner_key', ownerKey);
        localStorage.setItem('lunao_auth_token', ownerKey);
        localStorage.setItem('lunao_unlocked', 'true');

        const resolvedPlan =
          planInput ||
          localStorage.getItem(`lunao_u_${ownerKey}_plan`) ||
          'Free Plan';
        localStorage.setItem(`lunao_u_${ownerKey}_plan`, resolvedPlan);
        localStorage.setItem('lunao_user_plan', resolvedPlan);

        const resolvedCredits =
          typeof userCreditsInput === 'number'
            ? userCreditsInput
            : parseInt(
                localStorage.getItem(`lunao_u_${ownerKey}_credits`) ||
                localStorage.getItem('lunao_user_credits') ||
                '30',
                10
              );
        localStorage.setItem(`lunao_u_${ownerKey}_credits`, String(resolvedCredits));
        localStorage.setItem('lunao_user_credits', String(resolvedCredits));

        const isFree = resolvedPlan.toLowerCase().includes('free');
        const resolvedVibe = isFree
          ? 0
          : typeof vibeCreditsInput === 'number'
            ? vibeCreditsInput
            : parseFloat(localStorage.getItem(`lunao_u_${ownerKey}_vibe_credits`) || '0');
        setVibeCreditBalance(resolvedVibe);

        window.dispatchEvent(
          new CustomEvent('lunao_auth_changed', {
            detail: {
              user: authUser,
              plan: resolvedPlan,
              userCredits: resolvedCredits,
              vibeCredits: resolvedVibe,
            },
          })
        );
      } catch {
        /* ignore storage errors */
      }
      setUser(authUser);
      setUnlocked(true);
      setLoading(false);
    },
    []
  );

  const refresh = useCallback(async () => {
    const stored = readStoredUser();
    if (!stored) {
      setUser(null);
      setUnlocked(false);
      return;
    }

    try {
      localStorage.setItem('lunao_owner_key', stored.ownerKey);
      localStorage.setItem('lunao_auth_token', stored.ownerKey);
    } catch {}

    setUser(stored);
    setUnlocked(true);

    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'x-owner-key': stored.ownerKey,
          Authorization: `Bearer ${stored.ownerKey}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data.user) {
          const mergedUser: AuthUser = {
            id: data.user.id || stored.id,
            ownerKey: data.user.ownerKey || stored.ownerKey,
            email: data.user.email || stored.email,
            name: data.user.name || stored.name,
            picture: data.user.picture || stored.picture,
            credits: typeof data.userCredits === 'number' ? data.userCredits : undefined,
          };
          applyAuthenticatedSession(
            mergedUser,
            data.plan,
            data.userCredits,
            data.vibeCredits
          );
        }
      }
    } catch {
      // Keep local stored session when offline
    }
  }, [applyAuthenticatedSession]);

  // Listen to Supabase Auth state changes
  useEffect(() => {
    const hydrateAndApplySession = async (authUser: AuthUser) => {
      let serverCredits: number | undefined = undefined;
      let serverPlan: string | undefined = undefined;
      let serverVibe: number | undefined = undefined;

      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            'x-owner-key': authUser.ownerKey,
            Authorization: `Bearer ${authUser.ownerKey}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.ok) {
            if (typeof data.userCredits === 'number') serverCredits = data.userCredits;
            if (data.plan) serverPlan = data.plan;
            if (typeof data.vibeCredits === 'number') serverVibe = data.vibeCredits;
          }
        }
      } catch {}

      const mergedUser: AuthUser = {
        ...authUser,
        credits: typeof serverCredits === 'number' ? serverCredits : authUser.credits,
      };
      applyAuthenticatedSession(mergedUser, serverPlan, serverCredits, serverVibe);
    };

    (async () => {
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (data?.session?.user) {
          const sbUser = data.session.user;
          const email = sbUser.email || 'user@lunao.app';
          const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email.split('@')[0];
          const picture = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || '';
          const ownerKey = `user_${sbUser.id || email.replace(/[^a-zA-Z0-9]/g, '_')}`;

          const authUser: AuthUser = {
            id: sbUser.id,
            ownerKey,
            email,
            name,
            picture,
          };
          await hydrateAndApplySession(authUser);
        } else {
          await refresh();
        }
      } catch {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        const sbUser = session.user;
        const email = sbUser.email || 'user@lunao.app';
        const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email.split('@')[0];
        const picture = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || '';
        const ownerKey = `user_${sbUser.id || email.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const authUser: AuthUser = {
          id: sbUser.id,
          ownerKey,
          email,
          name,
          picture,
        };
        await hydrateAndApplySession(authUser);

        if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [applyAuthenticatedSession, refresh]);

  // Trigger Supabase Google OAuth Flow
  const signInWithSupabaseGoogle = useCallback(async (): Promise<void> => {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      throw error;
    }
  }, []);

  // Standard 1-tap Google / Supabase User sign-in (Strictly real account OAuth)
  const signInWithGoogle = useCallback(async (): Promise<AuthUser> => {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      throw new Error(error.message || 'Unable to connect to Google account. Please verify credentials and try again.');
    }
    if (data?.url) {
      window.location.href = data.url;
    }
    return new Promise(() => {});
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabaseClient.auth.signOut();
    } catch {}
    try {
      await fetch('/api/site-gate/logout', { method: 'POST', credentials: 'include' });
    } catch {}

    try {
      localStorage.removeItem('lunao_auth_user');
      localStorage.removeItem('lunao_unlocked');
      localStorage.removeItem('lunao_auth_token');
      localStorage.removeItem('lunao_owner_key');
      localStorage.removeItem('lunao_user_plan');
      localStorage.removeItem('lunao_user_credits');
      localStorage.removeItem('lunao_vibe_credits');
      localStorage.removeItem('lunao_custom_templates');
    } catch {}

    setUser(null);
    setUnlocked(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lunao_auth_changed', { detail: { user: null } }));
    }
  }, []);

  return (
    <GateContext.Provider value={{ unlocked, loading, user, signInWithGoogle, signInWithSupabaseGoogle, refresh, logout }}>
      {children}
    </GateContext.Provider>
  );
}

export function useGate() {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error('useGate must be used inside <GateProvider>');
  return ctx;
}
