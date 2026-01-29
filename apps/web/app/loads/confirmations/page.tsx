"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export default function LoadConfirmationsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocs = async () => {
    const data = await apiFetch<{ docs: any[] }>("/load-confirmations");
    setDocs(data.docs);
  };

  useEffect(() => {
    loadDocs().catch((err) => setError((err as Error).message));
  }, []);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const body = new FormData();
    Array.from(files).forEach((file) => body.append("files", file));
    try {
      await apiFetch<{ docs: any[] }>("/load-confirmations/upload", { method: "POST", body });
      await loadDocs();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell title="Load Confirmations" subtitle="Upload confirmations and create loads">
      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Upload confirmations</div>
        <FormField label="Upload load confirmations" htmlFor="loadConfirmationFiles" hint="PDF or image files. Extraction runs automatically.">
          <Input
            type="file"
            multiple
            accept="application/pdf,image/*"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </FormField>
        {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
      </Card>

      <Card className="space-y-4">
        <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Uploads</div>
        {docs.length === 0 ? <div className="text-sm text-[color:var(--color-text-muted)]">No confirmations yet.</div> : null}
        <div className="grid gap-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 px-4 py-3"
            >
              <div>
                <div className="text-sm font-semibold">{doc.filename}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">{doc.status} · {new Date(doc.createdAt).toLocaleString()}</div>
                {doc.errorMessage ? <div className="text-xs text-[color:var(--color-danger)]">{doc.errorMessage}</div> : null}
                {doc.createdLoadId ? (
                  <div className="text-xs text-[color:var(--color-success)]">Created load: {doc.createdLoadId}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {doc.createdLoadId ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => (window.location.href = `/loads/${doc.createdLoadId}`)}
                  >
                    View load
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => (window.location.href = `/loads/confirmations/${doc.id}`)} disabled={uploading}>
                  Review
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
