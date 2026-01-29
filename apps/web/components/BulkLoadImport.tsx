"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { CheckboxField } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/api";

export function BulkLoadImport({ onImported }: { onImported: () => void }) {
  const [loadsFile, setLoadsFile] = useState<File | null>(null);
  const [stopsFile, setStopsFile] = useState<File | null>(null);
  const [wipeLoads, setWipeLoads] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const runImport = async () => {
    setError(null);
    setResult(null);
    if (!loadsFile || !stopsFile) {
      setError("Please upload both loads.csv and stops.csv.");
      return;
    }
    const body = new FormData();
    body.append("loads", loadsFile);
    body.append("stops", stopsFile);
    if (wipeLoads) body.append("wipe", "true");
    try {
      const data = await apiFetch<{
        createdLoads: number;
        skippedLoads: number;
        createdStops: number;
        skippedStops: number;
      }>("/admin/import/loads", { method: "POST", body });
      setResult(
        `Imported ${data.createdLoads} loads / ${data.createdStops} stops. Skipped ${data.skippedLoads} loads / ${data.skippedStops} stops.`
      );
      setLoadsFile(null);
      setStopsFile(null);
      setWipeLoads(false);
      onImported();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="text-sm uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Bulk load import</div>
      <div className="text-sm text-[color:var(--color-text-muted)]">
        Upload the CSV templates. Loads can include miles. Stops should follow yard → yard → consignee pattern.
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <FormField label="Loads CSV" htmlFor="loadsCsv" hint="Upload the loads.csv template">
          <Input
            id="loadsCsv"
            type="file"
            accept=".csv"
            onChange={(e) => setLoadsFile(e.target.files?.[0] ?? null)}
          />
        </FormField>
        <FormField label="Stops CSV" htmlFor="stopsCsv" hint="Upload the stops.csv template">
          <Input
            id="stopsCsv"
            type="file"
            accept=".csv"
            onChange={(e) => setStopsFile(e.target.files?.[0] ?? null)}
          />
        </FormField>
      </div>
      <CheckboxField
        id="wipeLoads"
        label="Wipe existing loads before import"
        checked={wipeLoads}
        onChange={(e) => setWipeLoads(e.target.checked)}
      />
      {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
      {result ? <div className="text-sm text-[color:var(--color-success)]">{result}</div> : null}
      <Button onClick={runImport}>Import CSV</Button>
    </Card>
  );
}
