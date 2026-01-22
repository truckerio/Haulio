"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type ImportType = "drivers" | "employees";

type PreviewRow = {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
};

type PreviewResponse = {
  columns: string[];
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number };
};

type CommitResponse = {
  created: Array<{ rowNumber: number; id: string; email?: string; phone?: string }>;
  updated: Array<{ rowNumber: number; id: string; email?: string; phone?: string }>;
  skipped: Array<{ rowNumber: number; reason: string }>;
  errors: Array<{ rowNumber: number; errors: string[] }>;
};

export function ImportWizard({
  type,
  title,
  description,
  templateCsv,
  onImported,
}: {
  type: ImportType;
  title: string;
  description: string;
  templateCsv: string;
  onImported?: (result: CommitResponse) => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importId] = useState(() => crypto.randomUUID());

  const hasValidRows = preview ? preview.summary.valid > 0 : false;

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadErrors = () => {
    if (!result || result.errors.length === 0) return;
    const lines = ["rowNumber,error"];
    for (const row of result.errors) {
      lines.push(`${row.rowNumber},"${row.errors.join("; ").replace(/\"/g, "\"\"")}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type}-errors.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ""));
      setPreview(null);
      setResult(null);
      setError(null);
    };
    reader.readAsText(file);
  };

  const runPreview = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<PreviewResponse>("/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, csvText }),
      });
      setPreview(data);
    } catch (err) {
      setError((err as Error).message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CommitResponse>("/imports/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, csvText, importId }),
      });
      setResult(data);
      onImported?.(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const previewRows = useMemo(() => preview?.rows.slice(0, 20) ?? [], [preview]);

  return (
    <Card className="space-y-4">
      <div className="text-sm uppercase tracking-widest text-black/50">{title}</div>
      <div className="text-sm text-black/60">{description}</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={downloadTemplate}>Download template</Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="text-sm">
          Upload CSV
          <input type="file" accept=".csv" className="mt-2 block w-full text-sm" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="text-sm">
          Or paste CSV
          <textarea
            className="mt-2 h-32 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="email,role,name,phone,timezone"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={runPreview} disabled={!csvText || loading}>Preview</Button>
        <Button onClick={runImport} disabled={!hasValidRows || loading}>Import</Button>
        {result?.errors?.length ? <Button variant="secondary" onClick={downloadErrors}>Download errors CSV</Button> : null}
      </div>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {preview ? (
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3 text-sm">
          <div className="mb-2 text-xs uppercase tracking-widest text-black/50">
            Preview: {preview.summary.valid} valid / {preview.summary.invalid} invalid
          </div>
          <div className="grid gap-2">
            {previewRows.map((row) => (
              <div key={row.rowNumber} className="rounded-xl border border-black/10 bg-white px-3 py-2">
                <div className="text-xs text-black/50">Row {row.rowNumber}</div>
                <div className="text-xs text-black/70">
                  {Object.entries(row.data).map(([key, value]) => (
                    <span key={key} className="mr-2">{key}: {value || "-"}</span>
                  ))}
                </div>
                {row.errors.length > 0 ? <div className="text-xs text-red-600">Errors: {row.errors.join(", ")}</div> : null}
              </div>
            ))}
            {preview.rows.length > previewRows.length ? (
              <div className="text-xs text-black/50">Showing first {previewRows.length} rows.</div>
            ) : null}
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3 text-sm">
          Imported {result.created.length} created · {result.updated.length} updated · {result.skipped.length} skipped · {result.errors.length} errors
        </div>
      ) : null}
    </Card>
  );
}
