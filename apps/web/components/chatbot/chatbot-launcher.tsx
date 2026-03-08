"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/components/auth/user-context";
import { extractEntityRows } from "@/components/chatbot/chatbot-result-utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { isChatbotEnabledForOrgClient } from "@/lib/chatbot-access";
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
  status: string;
  allowed: boolean;
  message?: string | null;
  result?: Record<string, unknown> | null;
};

type ChatResponse = {
  intent: string;
  summary: string;
  blockers: string[];
  actions: ChatAction[];
};

function buildIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `launcher-${crypto.randomUUID()}`;
  }
  return `launcher-${Date.now()}`;
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "done") return "success";
  if (status === "error" || status === "blocked") return "danger";
  if (status === "dry_run") return "warning";
  return "neutral";
}

const HIDDEN_PATH_PREFIXES = ["/login", "/setup", "/accept-invite", "/invite", "/forgot", "/reset"];

export function ChatbotLauncher() {
  const { capabilities, user, org, workflow } = useUser();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [execute, setExecute] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);

  const canUseChatbot =
    Boolean(user?.id || capabilities.canonicalRole) && isChatbotEnabledForOrgClient(org?.id, workflow.chatbotEnabled);
  const isHiddenRoute = HIDDEN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const resultRows = useMemo(() => extractEntityRows(lastResponse?.actions), [lastResponse]);

  const context = useMemo<ChatContext>(
    () => ({
      load_id: searchParams.get("loadId") || undefined,
      shipment_id: searchParams.get("shipmentId") || undefined,
      trip_id: searchParams.get("tripId") || undefined,
      stop_id: searchParams.get("stopId") || undefined,
      doc_id: searchParams.get("docId") || undefined,
    }),
    [searchParams]
  );

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (launcherRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  if (!canUseChatbot || isHiddenRoute) return null;

  const submit = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || busy) return;
    setBusy(true);
    try {
      const payload = {
        message: trimmedMessage,
        context: Object.fromEntries(Object.entries(context).filter(([, value]) => Boolean(value))),
        execute,
        dry_run: dryRun,
        idempotency_key: buildIdempotencyKey(),
      };
      const response = await apiFetch<ChatResponse>("/chatbot/assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setLastResponse(response);
    } catch (error) {
      toast.error((error as Error).message || "Chatbot request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[70]">
        <button
          ref={launcherRef}
          type="button"
          aria-label={open ? "Close chatbot" : "Open chatbot"}
          onClick={() => setOpen((value) => !value)}
          className="group relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-accent)] text-white shadow-[var(--shadow-card)] transition hover:-translate-y-[1px] hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4.5" y="5.5" width="15" height="11" rx="3" />
            <path d="M9 10.2h6M9 13h4" />
            <path d="M10 16.5v2l2-1.3 2 1.3v-2" />
          </svg>
          <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md bg-[color:var(--color-ink)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white opacity-0 shadow-[var(--shadow-subtle)] transition group-hover:opacity-100">
            Ask Haulio
          </span>
        </button>
      </div>
      {open ? (
        <div ref={panelRef} className="fixed bottom-20 right-4 z-[70] w-[min(26rem,calc(100vw-1.5rem))]">
          <Card className="space-y-3 !p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">Haulio Assistant</h3>
                <p className="text-xs text-[color:var(--color-text-muted)]">Ask from any page</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/chatbot" className="text-xs text-[color:var(--color-accent)] underline-offset-2 hover:underline">
                  Full screen
                </Link>
                <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask for shipment/trip/load details or command previews..."
              className="min-h-[5.5rem]"
            />
            <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-muted)]">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={execute}
                  onChange={(event) => setExecute(event.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--color-divider)]"
                />
                Execute
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
              <StatusChip label={execute && !dryRun ? "LIVE" : "PREVIEW"} tone={execute && !dryRun ? "warning" : "neutral"} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-h-4 text-[11px] text-[color:var(--color-text-subtle)]">
                {context.load_id || context.shipment_id || context.trip_id ? (
                  <>
                    Context: {context.load_id ? `load ${context.load_id}` : ""}
                    {context.shipment_id ? ` shipment ${context.shipment_id}` : ""}
                    {context.trip_id ? ` trip ${context.trip_id}` : ""}
                  </>
                ) : (
                  "No route context detected"
                )}
              </div>
              <Button size="sm" onClick={submit} disabled={busy || !message.trim()}>
                {busy ? "Running..." : "Ask"}
              </Button>
            </div>
            {lastResponse ? (
              <div className="space-y-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  Intent: <span className="font-medium text-ink">{lastResponse.intent}</span>
                </div>
                <div className="text-sm text-ink">{lastResponse.summary}</div>
                {lastResponse.blockers.length > 0 ? (
                  <div className="space-y-1">
                    {lastResponse.blockers.map((blocker) => (
                      <div
                        key={blocker}
                        className="rounded-[var(--radius-control)] border border-[color:var(--color-danger)]/20 bg-[color:var(--color-danger)]/5 px-2 py-1 text-xs text-[color:var(--color-danger)]"
                      >
                        {blocker}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="max-h-40 space-y-1 overflow-auto pr-1">
                  {lastResponse.actions.map((action) => (
                    <div
                      key={action.key}
                      className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white px-2 py-1"
                    >
                      <span className="truncate text-xs text-ink">{action.title}</span>
                      <StatusChip label={action.status.toUpperCase()} tone={statusTone(action.status)} />
                    </div>
                  ))}
                </div>
                {resultRows.length > 0 ? (
                  <div className="space-y-1 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white p-2">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-subtle)]">Matched records</div>
                    <div className="max-h-36 space-y-1 overflow-auto">
                      {resultRows.map((row) => (
                        <Link
                          key={`${row.entity}:${row.id}`}
                          href={row.href}
                          className="block rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1 hover:bg-[color:var(--color-bg-muted)]"
                        >
                          <div className="text-xs font-medium text-ink">{row.primary}</div>
                          <div className="text-[11px] text-[color:var(--color-text-muted)]">{row.secondary}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </>
  );
}
