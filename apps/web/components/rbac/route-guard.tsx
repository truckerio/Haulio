"use client";

import { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { useUser } from "@/components/auth/user-context";
import { NoAccess } from "@/components/rbac/no-access";

export function RouteGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: ReactNode;
}) {
  const { user, loading } = useUser();

  if (loading) {
    return <EmptyState title="Checking access..." />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return <NoAccess />;
  }

  return <>{children}</>;
}
