"use client";

import { UserProvider } from "@/components/auth/user-context";
import { RouteGuard } from "@/components/rbac/route-guard";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <RouteGuard allowedRoles={["DRIVER"]}>{children}</RouteGuard>
    </UserProvider>
  );
}
