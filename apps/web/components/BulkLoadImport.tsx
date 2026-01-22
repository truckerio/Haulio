"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      <div className="text-sm uppercase tracking-widest text-black/50">Bulk load import</div>
      <div className="text-sm text-black/60">
        Upload the CSV templates. Loads can include miles. Stops should follow yard → yard → delivery pattern.
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="text-sm">
          Loads CSV
          <input type="file" accept=".csv" className="mt-2 block w-full text-sm" onChange={(e) => setLoadsFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="text-sm">
          Stops CSV
          <input type="file" accept=".csv" className="mt-2 block w-full text-sm" onChange={(e) => setStopsFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={wipeLoads} onChange={(e) => setWipeLoads(e.target.checked)} />
        Wipe existing loads before import
      </label>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {result ? <div className="text-sm text-emerald-700">{result}</div> : null}
      <Button onClick={runImport}>Import CSV</Button>
    </Card>
  );
}
