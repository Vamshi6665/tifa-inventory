import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { can as canDo, type Action } from '@/domain/permissions';
import type { InventoryItem, UserProfile } from '@/domain/types';
import { useData } from '@/data/DataProvider';
import { qk } from '@/data/keys';
import type { AuthUser } from '@/data/source';

interface AuthContext {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: AuthUser | null;
  profile: UserProfile | null;
  profileError: Error | null;
  can: (action: Action, item?: Pick<InventoryItem, 'category'>) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    data.getUser().then((u) => alive && setUser(u), () => alive && setUser(null));
    const off = data.onAuthChange((u) => {
      setUser(u);
      if (!u) {
        qc.clear(); // never leave one person's data cached for the next
        try {
          Object.keys(localStorage).filter((k) => k.startsWith('tifa.profile.')).forEach((k) => localStorage.removeItem(k));
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, [data, qc]);

  // The last known profile is kept on this device so the app can draw immediately on return;
  // it's revalidated straight away, and the database enforces access regardless of what the UI shows.
  const cacheKey = user ? `tifa.profile.${user.id}` : null;
  const profileQ = useQuery({
    queryKey: [...qk.me, user?.id],
    queryFn: async () => {
      const p = await data.getProfile();
      try {
        if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(p));
      } catch {
        /* storage full or blocked */
      }
      return p;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: () => {
      try {
        const raw = cacheKey ? localStorage.getItem(cacheKey) : null;
        return raw ? (JSON.parse(raw) as UserProfile) : undefined;
      } catch {
        return undefined;
      }
    },
  });

  const signOut = useCallback(async () => {
    await data.signOut();
    qc.clear();
  }, [data, qc]);

  const value = useMemo<AuthContext>(() => {
    const profile = profileQ.data ?? null;
    return {
      status: user === undefined || (user && !profileQ.data && profileQ.isPending) ? 'loading' : user ? 'signed-in' : 'signed-out',
      user: user ?? null,
      profile,
      profileError: profileQ.error,
      can: (action, item) => canDo(profile, action, item),
      signOut,
    };
  }, [user, profileQ.data, profileQ.isPending, profileQ.error, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
