"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { createId } from "@/lib/uuid";

type ImportType = "drivers" | "employees" | "trucks" | "trailers" | "tms_load_sheet";

type PreviewRow = {
  rowNumber: number;
  data: Record<string, string>;
  warnings: string[];
  errors: string[];
};

type PreviewResponse = {
  columns: string[];
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number; warnings: number };
  headerWarnings?: string[];
  mapping?: Record<string, string>;
  learnedHeaders?: string[];
  allowedFields?: string[];
};

type CommitResponse = {
  created: Array<{ rowNumber: number; id: string; email?: string; phone?: string }>;
  updated: Array<{ rowNumber: number; id: string; email?: string; phone?: string }>;
  skipped: Array<{ rowNumber: number; reason: string }>;
  errors: Array<{ rowNumber: number; errors: string[] }>;
  warnings?: Array<{ rowNumber: number; warnings: string[] }>;
  headerWarnings?: string[];
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
  const [importId] = useState(() => createId());
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  const hasValidRows = preview ? preview.summary.valid > 0 : false;

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = type === "tms_load_sheet" ? "tms-load-sheet-template.csv" : `${type}-template.csv`;
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
      setColumnMapping({});
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
        body: JSON.stringify({ type, csvText, mapping: columnMapping }),
      });
      setPreview(data);
      if (data.mapping) {
        setColumnMapping(data.mapping);
      }
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
        body: JSON.stringify({ type, csvText, importId, mapping: columnMapping }),
      });
      setResult(data);
      onImported?.(data);
      if (preview?.columns?.length && type !== "tms_load_sheet") {
        const mappingEntries = Object.entries(columnMapping).filter(([, value]) => value);
        if (mappingEntries.length > 0) {
          apiFetch("/learning/import-mapping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ headers: preview.columns, mapping: columnMapping }),
          }).catch(() => null);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const previewRows = useMemo(() => preview?.rows.slice(0, 20) ?? [], [preview]);

  const placeholderByType: Record<ImportType, string> = {
    employees: "email,role,name,phone,timezone",
    drivers: "name,phone,license,payRatePerMile,licenseExpiresAt,medCardExpiresAt",
    trucks: "unit,vin,plate,plateState,status",
    trailers: "unit,type,plate,plateState,status",
    tms_load_sheet:
      "Load,Trip,Status,Customer,Cust Ref,Unit,Trailer,As Wgt,Total Rev,PU Date F,PU Time F,PU Time T,Shipper,Ship City,Ship St,Del Date F,Del Time T,Consignee,Cons City,Cons St,Sales,Drop Name,Load Notes,Inv Date,Del Date T,Type",
  };

  const fieldOptionsByType: Record<ImportType, string[]> = {
    employees: ["email", "role", "name", "phone", "timezone"],
    drivers: ["name", "phone", "license", "payRatePerMile", "licenseExpiresAt", "medCardExpiresAt"],
    trucks: ["unit", "vin", "plate", "plateState", "status"],
    trailers: ["unit", "type", "plate", "plateState", "status"],
    tms_load_sheet: [],
  };

  return (
    <Card className="space-y-4">
      <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{title}</div>
      <div className="text-sm text-[color:var(--color-text-muted)]">{description}</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={downloadTemplate}>Download template</Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <FormField label="Upload CSV" htmlFor="importCsv" hint="Upload a CSV file from the template">
          <Input type="file" accept=".csv" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </FormField>
        <FormField label="Or paste CSV" htmlFor="csvPaste" hint="Paste rows directly if needed">
          <Textarea
            id="csvPaste"
            className="h-32"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreview(null);
              setResult(null);
              setError(null);
              setColumnMapping({});
            }}
            placeholder={placeholderByType[type]}
          />
        </FormField>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={runPreview} disabled={!csvText || loading}>Preview</Button>
        <Button onClick={runImport} disabled={!hasValidRows || loading}>Import</Button>
        {result?.errors?.length ? <Button variant="secondary" onClick={downloadErrors}>Download errors CSV</Button> : null}
      </div>
      {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
      {preview ? (
        <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-3 text-sm">
          {preview.headerWarnings?.length ? (
            <div className="mb-2 rounded-[var(--radius-control)] border border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-soft)]/70 px-3 py-2 text-xs text-[color:var(--color-warning)]">
              {preview.headerWarnings.join(" · ")}
            </div>
          ) : null}
          {type !== "tms_load_sheet" && preview.columns.length > 0 ? (
            <div className="mb-4 space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Column mapping</div>
              <div className="grid gap-2">
                {preview.columns.map((header) => (
                  <div key={header} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white px-3 py-2">
                    <div className="text-xs text-[color:var(--color-text-muted)]">{header}</div>
                    {preview.learnedHeaders?.includes(header) ? (
                      <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                    ) : null}
                    <div className="min-w-[180px] flex-1">
                      <Select
                        value={columnMapping[header] ?? ""}
                        onChange={(event) =>
                          setColumnMapping((prev) => ({ ...prev, [header]: event.target.value }))
                        }
                      >
                        <option value="">Ignore column</option>
                        {fieldOptionsByType[type].map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
            Preview: {preview.summary.valid} valid / {preview.summary.invalid} invalid / {preview.summary.warnings} warnings
          </div>
          <div className="grid gap-2">
            {previewRows.map((row) => (
              <div key={row.rowNumber} className="rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-white px-3 py-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">Row {row.rowNumber}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {Object.entries(row.data).map(([key, value]) => (
                    <span key={key} className="mr-2">{key}: {value || "-"}</span>
                  ))}
                </div>
                {row.warnings.length > 0 ? (
                  <div className="text-xs text-[color:var(--color-warning)]">Warnings: {row.warnings.join(", ")}</div>
                ) : null}
                {row.errors.length > 0 ? <div className="text-xs text-[color:var(--color-danger)]">Errors: {row.errors.join(", ")}</div> : null}
              </div>
            ))}
            {preview.rows.length > previewRows.length ? (
              <div className="text-xs text-[color:var(--color-text-muted)]">Showing first {previewRows.length} rows.</div>
            ) : null}
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-3 text-sm">
          Imported {result.created.length} created · {result.updated.length} updated · {result.skipped.length} skipped · {result.errors.length} errors ·{" "}
          {(result.warnings?.reduce((sum, row) => sum + row.warnings.length, 0) ?? 0) + (result.headerWarnings?.length ?? 0)} warnings
        </div>
      ) : null}
    </Card>
  );
}
