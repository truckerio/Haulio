"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailWorkspaceShell } from "@/components/detail-workspace/detail-workspace-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchDetailWorkspaceModel } from "@/lib/detail-workspace/model";
import type { DetailWorkspaceModel } from "@/lib/detail-workspace/types";

export default function LoadDetailsPage() {
  const params = useParams();
  const loadId = params?.id as string | undefined;
  const [model, setModel] = useState<DetailWorkspaceModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadId) return;
    let active = true;
    setLoading(true);
    fetchDetailWorkspaceModel("load", loadId)
      .then((payload) => {
        if (!active) return;
        setModel(payload);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError((err as Error).message || "Failed to load load detail.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadId]);

  return (
    <AppShell
      title="Load Detail"
      subtitle="Command-first detail cockpit"
      hideHeader
      mainClassName="flex-1 min-h-0 min-w-0 overflow-hidden lg:h-screen"
      contentClassName="h-full overflow-hidden space-y-0 px-2 pb-2 pt-2 sm:px-2 sm:pb-2 sm:pt-2 lg:px-3 lg:pb-3 lg:pt-2"
    >
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <EmptyState title="Loading load detail..." /> : null}
      {!loading && model ? (
        <DetailWorkspaceShell
          model={model}
          onRefresh={async () => {
            const payload = await fetchDetailWorkspaceModel("load", loadId!);
            setModel(payload);
          }}
        />
      ) : null}
      {!loading && !model && !error ? <EmptyState title="Load not found" /> : null}
    </AppShell>
  );
}
