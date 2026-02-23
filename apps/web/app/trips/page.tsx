"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { TripsWorkspace } from "@/components/dispatch/TripsWorkspace";

function TripsPageContent() {
  return (
    <AppShell title="Trips" subtitle="Planning and trip management">
      <TripsWorkspace />
    </AppShell>
  );
}

export default function TripsPage() {
  return (
    <Suspense fallback={null}>
      <TripsPageContent />
    </Suspense>
  );
}
