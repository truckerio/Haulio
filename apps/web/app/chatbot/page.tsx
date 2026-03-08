"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useUser } from "@/components/auth/user-context";
import { extractEntityRows } from "@/components/chatbot/chatbot-result-utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { isChatbotEnabledForOrgClient } from "@/lib/chatbot-access";
import { getRoleNoAccessCta } from "@/lib/capabilities";
import { toast } from "@/lib/toast";

type ChatContext = {
  load_id?: string;
  shipment_id?: string;
  trip_id?: string;
  stop_id?: string;
  doc_id?: string;
};

type ChatAction = {
  key: string;
  title: string;
  category: string;
  status: string;
  allowed: boolean;
  message?: string | null;
  reason_code?: string | null;
  result?: Record<string, unknown> | null;
};

type ChatResponse = {
  ok: boolean;
  intent: string;
  summary: string;
  blockers: string[];
  actions: ChatAction[];
  metadata?: Record<string, unknown>;
};

type ChatCapabilities = {
  ok: boolean;
  intents: string[];
  command_keys: string[];
};

type ChatEntry = {
  id: string;
  message: string;
  payload: {
    execute: boolean;
    dry_run: boolean;
    context: ChatContext;
  };
  response: ChatResponse;
};

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function buildIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `web-chat-${crypto.randomUUID()}`;
  }
  return `web-chat-${Date.now()}`;
}

function toTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "done") return "success";
  if (status === "blocked" || status === "error") return "danger";
  if (status === "dry_run") return "warning";
  return "neutral";
}

export default function ChatbotPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, org, workflow, loading, capabilities } = useUser();
  const fallback = useMemo(() => getRoleNoAccessCta(user?.role), [user?.role]);
  const canUseChatbot =
    Boolean(capabilities.canonicalRole) && isChatbotEnabledForOrgClient(org?.id, workflow.chatbotEnabled);

  const [capabilitySnapshot, setCapabilitySnapshot] = useState<ChatCapabilities | null>(null);
  const [message, setMessage] = useState("");
  const [execute, setExecute] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [context, setContext] = useState<ChatContext>({
    load_id: searchParams.get("loadId") || undefined,
    shipment_id: searchParams.get("shipmentId") || undefined,
    trip_id: searchParams.get("tripId") || undefined,
    stop_id: searchParams.get("stopId") || undefined,
    doc_id: searchParams.get("docId") || undefined,
  });
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || canUseChatbot) return;
    router.replace(fallback.href);
  }, [canUseChatbot, fallback.href, loading, router]);

  useEffect(() => {
    if (loading || !canUseChatbot) return;
    let active = true;
    apiFetch<ChatCapabilities>("/chatbot/capabilities")
      .then((payload) => {
        if (!active) return;
        setCapabilitySnapshot(payload);
      })
      .catch((error) => {
        if (!active) return;
        toast.error((error as Error).message || "Unable to load chatbot capabilities.");
      });
    return () => {
      active = false;
    };
  }, [canUseChatbot, loading]);

  const quickPrompts = useMemo(
    () => [
      "Show load detail for load WR-LTL-6001A",
      "Review shipment detail for shipment WR-LTL-6001A",
      "Verify document doc cmmejo-example",
      "Create dispatch pack note for load WR-LTL-6001A",
    ],
    []
  );

  const submit = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      toast.error("Enter a message first.");
      return;
    }
    const payload = {
      message: trimmedMessage,
      context: Object.fromEntries(Object.entries(context).filter(([, value]) => Boolean(value))),
      execute,
      dry_run: dryRun,
      idempotency_key: buildIdempotencyKey(),
    };

    try {
      setBusy(true);
      const response = await apiFetch<ChatResponse>("/chatbot/assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setHistory((previous) => [
        {
          id: `${Date.now()}`,
          message: trimmedMessage,
          payload: { execute, dry_run: dryRun, context: payload.context as ChatContext },
          response,
        },
        ...previous,
      ]);
    } catch (error) {
      toast.error((error as Error).message || "Chat request failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Chatbot" subtitle="Hybrid assistant for dispatch + finance workflows" hideHeader hideTopActivityTrigger>
        <Card className="text-sm text-[color:var(--color-text-muted)]">Checking access...</Card>
      </AppShell>
    );
  }

  if (!canUseChatbot) {
    return (
      <AppShell title="Chatbot" subtitle="Hybrid assistant for dispatch + finance workflows" hideHeader hideTopActivityTrigger>
        <Card className="text-sm text-[color:var(--color-text-muted)]">Redirecting...</Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Chatbot" subtitle="Hybrid assistant for dispatch + finance workflows" hideHeader hideTopActivityTrigger>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)]">
        <Card className="space-y-3 !p-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Assistant prompt</h2>
            <p className="text-xs text-[color:var(--color-text-muted)]">
              Use plain language. The assistant can read details and draft command actions.
            </p>
          </div>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Example: Show shipment detail for shipment WR-LTL-6001A and verify missing POD"
            className="min-h-[7rem]"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={context.load_id ?? ""}
              onChange={(event) => setContext((previous) => ({ ...previous, load_id: event.target.value || undefined }))}
              placeholder="load_id"
            />
            <Input
              value={context.shipment_id ?? ""}
              onChange={(event) =>
                setContext((previous) => ({ ...previous, shipment_id: event.target.value || undefined }))
              }
              placeholder="shipment_id"
            />
            <Input
              value={context.trip_id ?? ""}
              onChange={(event) => setContext((previous) => ({ ...previous, trip_id: event.target.value || undefined }))}
              placeholder="trip_id"
            />
            <Input
              value={context.stop_id ?? ""}
              onChange={(event) => setContext((previous) => ({ ...previous, stop_id: event.target.value || undefined }))}
              placeholder="stop_id"
            />
            <Input
              value={context.doc_id ?? ""}
              onChange={(event) => setContext((previous) => ({ ...previous, doc_id: event.target.value || undefined }))}
              placeholder="doc_id"
              className="sm:col-span-2"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-muted)]">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={execute}
                onChange={(event) => setExecute(event.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--color-divider)]"
              />
              Execute actions
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(event) => setDryRun(event.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--color-divider)]"
              />
              Dry run
            </label>
            {execute && !dryRun ? (
              <StatusChip label="LIVE COMMANDS" tone="warning" />
            ) : (
              <StatusChip label="SAFE PREVIEW" tone="neutral" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setMessage(prompt)}
                className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 text-xs text-[color:var(--color-text-muted)] transition hover:bg-[color:var(--color-bg-muted)]"
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-end">
            <Button onClick={submit} disabled={busy}>
              {busy ? "Running..." : "Run assistant"}
            </Button>
          </div>
        </Card>

        <Card className="space-y-3 !p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">Responses</h2>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {capabilitySnapshot?.intents?.length ?? 0} intents
            </div>
          </div>
          {history.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--color-divider)] px-3 py-4 text-sm text-[color:var(--color-text-muted)]">
              No responses yet. Run the assistant from the left panel.
            </div>
          ) : null}
          <div className="space-y-3 overflow-y-auto pr-1">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-3">
                <div className="text-sm font-medium text-ink">{entry.message}</div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  Intent: <span className="font-medium text-ink">{entry.response.intent}</span> · Execute:{" "}
                  {entry.payload.execute ? "Yes" : "No"} · Dry run: {entry.payload.dry_run ? "Yes" : "No"}
                </div>
                <div className="mt-2 rounded-[var(--radius-control)] bg-[color:var(--color-bg-muted)] px-2 py-1 text-sm text-ink">
                  {entry.response.summary}
                </div>
                {entry.response.blockers.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {entry.response.blockers.map((blocker) => (
                      <div
                        key={blocker}
                        className="rounded-[var(--radius-control)] border border-[color:var(--color-danger)]/20 bg-[color:var(--color-danger)]/5 px-2 py-1 text-xs text-[color:var(--color-danger)]"
                      >
                        {blocker}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 space-y-2">
                  {entry.response.actions.map((action) => (
                    <div key={action.key} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{action.title}</span>
                        <StatusChip label={action.status.toUpperCase()} tone={toTone(action.status)} />
                        <span className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-subtle)]">
                          {action.category}
                        </span>
                        {action.allowed ? null : <StatusChip label="NOT ALLOWED" tone="danger" />}
                      </div>
                      {action.message ? (
                        <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{action.message}</div>
                      ) : null}
                      {action.reason_code ? (
                        <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-subtle)]">
                          {action.reason_code}
                        </div>
                      ) : null}
                      {action.result ? (
                        <pre className="mt-2 max-h-40 overflow-auto rounded-[var(--radius-control)] bg-[color:var(--color-bg-muted)] p-2 text-[11px] text-[color:var(--color-text-muted)]">
                          {compactJson(action.result)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
                {extractEntityRows(entry.response.actions, 20).length > 0 ? (
                  <div className="mt-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-2">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-subtle)]">
                      Matched records
                    </div>
                    <div className="grid gap-1">
                      {extractEntityRows(entry.response.actions, 20).map((row) => (
                        <button
                          key={`${entry.id}:${row.entity}:${row.id}`}
                          type="button"
                          onClick={() => router.push(row.href)}
                          className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white px-2 py-1 text-left hover:bg-[color:var(--color-bg-muted)]"
                        >
                          <div className="text-xs font-medium text-ink">{row.primary}</div>
                          <div className="text-[11px] text-[color:var(--color-text-muted)]">{row.secondary}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
