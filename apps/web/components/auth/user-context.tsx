"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export type CurrentUser = {
  id: string;
  role: "ADMIN" | "DISPATCHER" | "BILLING" | "DRIVER" | string;
  permissions?: string[];
  name?: string | null;
  email?: string | null;
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
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [org, setOrg] = useState<{ id: string; name: string; companyDisplayName?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ user: CurrentUser; org?: { id: string; name: string; companyDisplayName?: string | null } | null }>(
        "/auth/me"
      );
      setUser(data.user ?? null);
      setOrg(data.org ?? null);
      setError(null);
    } catch (err) {
      setUser(null);
      setOrg(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
