"use client";

import { RouteGuard } from "@/components/rbac/route-guard";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard allowedRoles={["DRIVER"]}>{children}</RouteGuard>;
}
