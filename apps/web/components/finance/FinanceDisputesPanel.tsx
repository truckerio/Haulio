"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { formatDate as formatDate24 } from "@/lib/date-time";

type ARCaseStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type ARCaseType =
  | "DISPUTE"
  | "SHORT_PAY"
  | "MISSING_DOCS"
  | "EDI_REJECT"
  | "FACTORING_REJECT"
  | "DUPLICATE_INVOICE"
  | "RATE_DISPUTE";

type ARCaseComment = {
  id: string;
  body: string;
  createdAt: string;
  createdBy?: { id: string; name: string | null; email: string } | null;
};

type ARCaseRow = {
  id: string;
  type: ARCaseType;
  status: ARCaseStatus;
  title: string;
  summary: string | null;
  ownerUserId: string | null;
  slaDueAt: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ownerUser?: { id: string; name: string | null; email: string } | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  load?: { id: string; loadNumber: string; status: string } | null;
  invoice?: { id: string; invoiceNumber: string; status: string } | null;
  comments?: ARCaseComment[];
};

function statusTone(status: ARCaseStatus) {
  if (status === "RESOLVED" || status === "CLOSED") return "success" as const;
  if (status === "IN_PROGRESS") return "warning" as const;
  return "neutral" as const;
}

function formatDate(value: string | null | undefined) {
  return formatDate24(value ?? null, "-");
}

function caseTypeLabel(type: ARCaseType) {
  return type
    .toLowerCase()
    .split("_")
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(" ");
}

export function FinanceDisputesPanel() {
  const { user, capabilities } = useUser();
  const canMutate = capabilities.canBillActions;
  const canAccess = capabilities.canAccessFinance;
  const [rows, setRows] = useState<ARCaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ARCaseStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<ARCaseType | "">("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    type: "DISPUTE" as ARCaseType,
    title: "",
    summary: "",
    loadId: "",
    invoiceId: "",
  });

  const loadCases = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      const data = await apiFetch<{ cases: ARCaseRow[] }>(`/finance/ar-cases${params.toString() ? `?${params.toString()}` : ""}`);
      setRows(data.cases ?? []);
      if (!selectedId && (data.cases?.length ?? 0) > 0) {
        setSelectedId(data.cases[0]?.id ?? null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canAccess, selectedId, statusFilter, typeFilter]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 2500);
    return () => window.clearTimeout(timer);
  }, [note]);

  const filteredRows = useMemo(() => {
    const token = search.trim().toLowerCase();
    if (!token) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.title,
        row.summary ?? "",
        row.load?.loadNumber ?? "",
        row.invoice?.invoiceNumber ?? "",
        row.ownerUser?.name ?? "",
        row.ownerUser?.email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(token);
    });
  }, [rows, search]);

  const selected = useMemo(() => filteredRows.find((row) => row.id === selectedId) ?? null, [filteredRows, selectedId]);

  const counters = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let resolved = 0;
    for (const row of rows) {
      if (row.status === "OPEN") open += 1;
      if (row.status === "IN_PROGRESS") inProgress += 1;
      if (row.status === "RESOLVED" || row.status === "CLOSED") resolved += 1;
    }
    return { open, inProgress, resolved };
  }, [rows]);

  const createCase = async () => {
    if (!canMutate || !createForm.title.trim()) return;
    setActionBusy("create");
    setError(null);
    try {
      await apiFetch("/finance/ar-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: createForm.type,
          title: createForm.title.trim(),
          summary: createForm.summary.trim() || undefined,
          loadId: createForm.loadId.trim() || undefined,
          invoiceId: createForm.invoiceId.trim() || undefined,
        }),
      });
      setCreateForm({
        type: "DISPUTE",
        title: "",
        summary: "",
        loadId: "",
        invoiceId: "",
      });
      setNote("AR case created.");
      await loadCases();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const updateStatus = async (status: ARCaseStatus) => {
    if (!canMutate || !selected) return;
    setActionBusy(`status:${status}`);
    setError(null);
    try {
      await apiFetch(`/finance/ar-cases/${selected.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setNote(`Case moved to ${status.replace("_", " ")}.`);
      await loadCases();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const addComment = async () => {
    if (!canMutate || !selected || !commentBody.trim()) return;
    setActionBusy("comment");
    setError(null);
    try {
      await apiFetch(`/finance/ar-cases/${selected.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      setCommentBody("");
      setNote("Comment added.");
      await loadCases();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  if (!canAccess) return null;

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}
      {note ? <div className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">{note}</div> : null}

      <Card className="space-y-3 !p-3 sm:!p-4">
        <SectionHeader title="Disputes & AR Cases" subtitle="Track short-pay, doc disputes, and factoring rejects in one queue." />
        <div className="grid gap-2 sm:grid-cols-5">
          <FormField label="Status" htmlFor="arCaseStatusFilter">
            <Select id="arCaseStatusFilter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ARCaseStatus | "")}>
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </Select>
          </FormField>
          <FormField label="Type" htmlFor="arCaseTypeFilter">
            <Select id="arCaseTypeFilter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ARCaseType | "")}>
              <option value="">All</option>
              <option value="DISPUTE">Dispute</option>
              <option value="SHORT_PAY">Short Pay</option>
              <option value="MISSING_DOCS">Missing Docs</option>
              <option value="EDI_REJECT">EDI Reject</option>
              <option value="FACTORING_REJECT">Factoring Reject</option>
              <option value="RATE_DISPUTE">Rate Dispute</option>
              <option value="DUPLICATE_INVOICE">Duplicate Invoice</option>
            </Select>
          </FormField>
          <FormField label="Search" htmlFor="arCaseSearch">
            <Input id="arCaseSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Case, load #, invoice #" />
          </FormField>
          <div className="flex items-end">
            <Button variant="secondary" onClick={loadCases} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 pb-1 text-xs text-[color:var(--color-text-muted)]">
            <StatusChip label={`Open ${counters.open}`} tone="neutral" />
            <StatusChip label={`In progress ${counters.inProgress}`} tone="warning" />
            <StatusChip label={`Resolved ${counters.resolved}`} tone="success" />
          </div>
        </div>
        {!canMutate ? (
          <div className="text-xs text-[color:var(--color-text-muted)]">
            Read-only mode: dispatch roles can review case details and handoff status while Billing/Admin manages resolution.
          </div>
        ) : null}
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Case Queue" subtitle={`${filteredRows.length} case(s)`} />
          {filteredRows.length === 0 ? (
            <EmptyState title={loading ? "Loading cases..." : "No cases in this scope"} />
          ) : (
            <div className="overflow-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
                  <tr>
                    <th className="px-2 py-2 text-left">Case</th>
                    <th className="px-2 py-2 text-left">Load / Invoice</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-[color:var(--color-divider)] ${selectedId === row.id ? "bg-[color:var(--color-bg-muted)]" : "hover:bg-[color:var(--color-bg-muted)]"}`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-2 py-2 align-top">
                        <div className="font-medium text-ink">{row.title}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">{caseTypeLabel(row.type)}</div>
                      </td>
                      <td className="px-2 py-2 align-top text-xs text-[color:var(--color-text-muted)]">
                        <div>{row.load?.loadNumber ? `Load ${row.load.loadNumber}` : "No load link"}</div>
                        <div>{row.invoice?.invoiceNumber ? `Inv ${row.invoice.invoiceNumber}` : "No invoice link"}</div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <StatusChip label={row.status.replace("_", " ")} tone={statusTone(row.status)} />
                      </td>
                      <td className="px-2 py-2 align-top text-xs text-[color:var(--color-text-muted)]">{formatDate(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Case Detail" subtitle={selected ? selected.id : "Select a case"} />
          {!selected ? (
            <EmptyState title="Select a case to review timeline and actions." />
          ) : (
            <>
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={selected.status.replace("_", " ")} tone={statusTone(selected.status)} />
                  <StatusChip label={caseTypeLabel(selected.type)} tone="neutral" />
                </div>
                <div className="mt-2 font-medium text-ink">{selected.title}</div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  Owner: {selected.ownerUser?.name ?? selected.ownerUser?.email ?? "Unassigned"} · Created by {selected.createdBy?.name ?? selected.createdBy?.email ?? "-"} on {formatDate(selected.createdAt)}
                </div>
                {selected.summary ? <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">{selected.summary}</div> : null}
                <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                  {selected.load?.loadNumber ? `Load ${selected.load.loadNumber}` : "No load"} · {selected.invoice?.invoiceNumber ? `Invoice ${selected.invoice.invoiceNumber}` : "No invoice"}
                </div>
              </div>

              {canMutate ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => updateStatus("IN_PROGRESS")} disabled={actionBusy !== null || selected.status === "IN_PROGRESS"}>
                    Start
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => updateStatus("RESOLVED")} disabled={actionBusy !== null || selected.status === "RESOLVED"}>
                    Resolve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => updateStatus("CLOSED")} disabled={actionBusy !== null || selected.status === "CLOSED"}>
                    Close
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus("OPEN")} disabled={actionBusy !== null || selected.status === "OPEN"}>
                    Reopen
                  </Button>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-sm font-medium text-ink">Timeline</div>
                {selected.comments && selected.comments.length > 0 ? (
                  <div className="space-y-2">
                    {selected.comments.map((comment) => (
                      <div key={comment.id} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] px-2 py-1.5 text-xs">
                        <div className="text-[color:var(--color-text-muted)]">
                          {comment.createdBy?.name ?? comment.createdBy?.email ?? "User"} · {formatDate(comment.createdAt)}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-ink">{comment.body}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No comments yet." />
                )}
              </div>

              {canMutate ? (
                <div className="space-y-2">
                  <FormField label="Add comment" htmlFor="arCaseComment">
                    <Textarea id="arCaseComment" rows={3} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} />
                  </FormField>
                  <Button size="sm" onClick={addComment} disabled={actionBusy !== null || !commentBody.trim()}>
                    {actionBusy === "comment" ? "Saving..." : "Add comment"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>

      {canMutate ? (
        <Card className="space-y-3 !p-3 sm:!p-4">
          <SectionHeader title="Create AR Case" subtitle="Open a new dispute, short-pay, or missing-doc case from finance." />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <FormField label="Type" htmlFor="createArCaseType">
              <Select
                id="createArCaseType"
                value={createForm.type}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, type: event.target.value as ARCaseType }))}
              >
                <option value="DISPUTE">Dispute</option>
                <option value="SHORT_PAY">Short pay</option>
                <option value="MISSING_DOCS">Missing docs</option>
                <option value="EDI_REJECT">EDI reject</option>
                <option value="FACTORING_REJECT">Factoring reject</option>
                <option value="RATE_DISPUTE">Rate dispute</option>
                <option value="DUPLICATE_INVOICE">Duplicate invoice</option>
              </Select>
            </FormField>
            <FormField label="Title" htmlFor="createArCaseTitle">
              <Input id="createArCaseTitle" value={createForm.title} onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))} />
            </FormField>
            <FormField label="Load ID (optional)" htmlFor="createArCaseLoadId">
              <Input id="createArCaseLoadId" value={createForm.loadId} onChange={(event) => setCreateForm((prev) => ({ ...prev, loadId: event.target.value }))} />
            </FormField>
            <FormField label="Invoice ID (optional)" htmlFor="createArCaseInvoiceId">
              <Input id="createArCaseInvoiceId" value={createForm.invoiceId} onChange={(event) => setCreateForm((prev) => ({ ...prev, invoiceId: event.target.value }))} />
            </FormField>
            <div className="flex items-end">
              <Button onClick={createCase} disabled={actionBusy !== null || !createForm.title.trim()}>
                {actionBusy === "create" ? "Creating..." : "Create case"}
              </Button>
            </div>
          </div>
          <FormField label="Summary (optional)" htmlFor="createArCaseSummary">
            <Textarea id="createArCaseSummary" rows={3} value={createForm.summary} onChange={(event) => setCreateForm((prev) => ({ ...prev, summary: event.target.value }))} />
          </FormField>
        </Card>
      ) : null}

      <div className="text-xs text-[color:var(--color-text-muted)]">
        Signed in as {user?.email ?? "unknown"}.
      </div>
    </div>
  );
}

