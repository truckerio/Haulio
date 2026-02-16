"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";

export type CurrentUser = {
  id: string;
  role: "ADMIN" | "DISPATCHER" | "HEAD_DISPATCHER" | "BILLING" | "DRIVER" | string;
  permissions?: string[];
  canSeeAllTeams?: boolean;
  name?: string | null;
  email?: string | null;
  mfaEnabled?: boolean;
  mfaEnforced?: boolean;
};

type UserContextValue = {
  user: CurrentUser | null;
  org: { id: string; name: string; companyDisplayName?: string | null } | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [org, setOrg] = useState<{ id: string; name: string; companyDisplayName?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      // Don't hard-redirect from the UserProvider (it wraps public routes like /login and /setup).
      // Route protection is handled by middleware; here we just hydrate if a session exists.
      const data = await apiFetch<{
        user: CurrentUser;
        org?: { id: string; name: string; companyDisplayName?: string | null } | null;
      }>("/auth/me", { skipAuthRedirect: true });
      setUser(data.user ?? null);
      setOrg(data.org ?? null);
      setError(null);
    } catch (err) {
      setUser(null);
      setOrg(null);
      setError((err as Error).message || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // After login, the root layout can persist and keep stale null user/org state.
  // Re-hydrate when entering authenticated routes and we still have no user.
  useEffect(() => {
    const isPublicRoute =
      pathname === "/login" ||
      pathname === "/setup" ||
      pathname.startsWith("/setup/") ||
      pathname.startsWith("/accept-invite") ||
      pathname.startsWith("/invite") ||
      pathname.startsWith("/forgot") ||
      pathname.startsWith("/reset");
    if (isPublicRoute) return;
    if (!user) {
      refresh();
    }
  }, [pathname, user, refresh]);

  const value = useMemo(() => ({ user, org, loading, error, refresh }), [user, org, loading, error, refresh]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return (
    useContext(UserContext) ?? {
      user: null,
      org: null,
      loading: true,
      error: null,
      refresh: () => {},
    }
  );
}
