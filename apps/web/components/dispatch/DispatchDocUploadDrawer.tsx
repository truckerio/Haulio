"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { toast } from "@/lib/toast";

type DispatchDocType = "POD" | "BOL" | "RATECON" | "RATE_CONFIRMATION";

type StopOption = {
  id: string;
  type: string;
  sequence?: number | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
};

function stopLabel(stop: StopOption) {
  const location = [stop.city, stop.state].filter(Boolean).join(", ") || stop.name || "Unknown";
  return `${stop.sequence ?? "-"} · ${stop.type} · ${location}`;
}

export function DispatchDocUploadDrawer({
  open,
  loadId,
  loadNumber,
  onClose,
  onUploaded,
}: {
  open: boolean;
  loadId: string | null;
  loadNumber?: string | null;
  onClose: () => void;
  onUploaded: (payload: { loadId: string; docType: DispatchDocType; stopId?: string | null }) => void;
}) {
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [docType, setDocType] = useState<DispatchDocType>("POD");
  const [stopId, setStopId] = useState("");
  const [stops, setStops] = useState<StopOption[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !loadId) return;
    let active = true;
    setLoadingContext(true);
    setContextError(null);
    setError(null);
    setFile(null);
    setStopId("");
    apiFetch<{ load: { stops?: StopOption[] } }>(`/loads/${loadId}/dispatch-detail`)
      .then((response) => {
        if (!active) return;
        setStops(response.load?.stops ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setStops([]);
        setContextError((err as Error).message || "Unable to load stop context.");
      })
      .finally(() => {
        if (active) setLoadingContext(false);
      });
    return () => {
      active = false;
    };
  }, [loadId, open]);

  if (!open || !loadId) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/20 sm:items-stretch">
      <div className="flex h-[92dvh] w-full flex-col bg-white shadow-[var(--shadow-subtle)] sm:h-full sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-[color:var(--color-divider)] px-4 py-4 sm:px-5">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Documents</div>
            <div className="text-lg font-semibold text-ink">Upload to load {loadNumber ?? loadId}</div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
              Upload POD/BOL without leaving Dispatch. Filters and scroll position are preserved.
            </div>
            {contextError ? <div className="text-sm text-[color:var(--color-warning)]">{contextError}</div> : null}
            <FormField label="Document type" htmlFor="dispatchDocType">
              <Select
                id="dispatchDocType"
                value={docType}
                onChange={(event) => setDocType(event.target.value as DispatchDocType)}
                disabled={submitting}
              >
                <option value="POD">POD</option>
                <option value="BOL">BOL</option>
                <option value="RATECON">Rate confirmation</option>
                <option value="RATE_CONFIRMATION">Rate confirmation (legacy)</option>
              </Select>
            </FormField>
            <FormField label="Stop context" htmlFor="dispatchDocStop" hint="Optional">
              <Select id="dispatchDocStop" value={stopId} onChange={(event) => setStopId(event.target.value)} disabled={submitting || loadingContext}>
                <option value="">No stop selected</option>
                {stops.map((stop) => (
                  <option key={stop.id} value={stop.id}>
                    {stopLabel(stop)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="File" htmlFor="dispatchDocFile">
              <Input
                id="dispatchDocFile"
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={submitting}
              />
            </FormField>
            {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
            <div className="flex items-center gap-2">
              <Button
                disabled={submitting || !file}
                onClick={async () => {
                  if (!file) {
                    setError("Choose a file first.");
                    return;
                  }
                  setSubmitting(true);
                  setError(null);
                  try {
                    const form = new FormData();
                    form.set("type", docType);
                    form.set("file", file);
                    if (stopId) {
                      form.set("stopId", stopId);
                    }
                    await apiFetch<{ doc: { id: string } }>(`/loads/${loadId}/docs`, {
                      method: "POST",
                      body: form,
                    });
                    onUploaded({ loadId, docType, stopId: stopId || null });
                    onClose();
                  } catch (err) {
                    const message = (err as Error).message || "Upload failed.";
                    setError(message);
                    toast.error(message);
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? "Uploading…" : "Upload document"}
              </Button>
              <Button variant="secondary" disabled={submitting} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
