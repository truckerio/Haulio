export type ChatActionResult = Record<string, unknown> | null | undefined;

export type ChatActionLike = {
  key: string;
  result?: ChatActionResult;
};

export type ChatEntityRow = {
  entity: "load" | "trip";
  id: string;
  primary: string;
  secondary: string;
  href: string;
};

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function rowFromLoad(raw: unknown): ChatEntityRow | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toText(record.id);
  const loadNumber = toText(record.loadNumber);
  if (!id || !loadNumber) return null;
  const status = toText(record.status) || "UNKNOWN";
  const customer = toText(record.customerName) || "Unknown customer";
  return {
    entity: "load",
    id,
    primary: `${loadNumber} · ${status}`,
    secondary: customer,
    href: `/loads/${id}`,
  };
}

function rowFromTrip(raw: unknown): ChatEntityRow | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toText(record.id);
  const tripNumber = toText(record.tripNumber);
  if (!id || !tripNumber) return null;
  const status = toText(record.status) || "UNKNOWN";
  const origin = toText(record.origin);
  const destination = toText(record.destination);
  const loadCount = toNumber(record.loadCount);
  const lane = origin || destination ? `${origin || "-"} -> ${destination || "-"}` : "";
  const trailer = loadCount !== null ? ` · ${loadCount} loads` : "";
  return {
    entity: "trip",
    id,
    primary: `${tripNumber} · ${status}`,
    secondary: `${lane}${trailer}`.trim(),
    href: `/trips/${id}`,
  };
}

export function extractEntityRows(actions: ChatActionLike[] | null | undefined, limit = 8): ChatEntityRow[] {
  if (!actions || actions.length === 0) return [];
  const rows: ChatEntityRow[] = [];
  const seen = new Set<string>();
  for (const action of actions) {
    const result = action.result;
    if (!result || typeof result !== "object") continue;
    const loads = (result as Record<string, unknown>).loads;
    const trips = (result as Record<string, unknown>).trips;

    if (Array.isArray(loads)) {
      for (const item of loads) {
        const row = rowFromLoad(item);
        if (!row) continue;
        const key = `${row.entity}:${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        if (rows.length >= limit) return rows;
      }
    }

    if (Array.isArray(trips)) {
      for (const item of trips) {
        const row = rowFromTrip(item);
        if (!row) continue;
        const key = `${row.entity}:${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        if (rows.length >= limit) return rows;
      }
    }
  }
  return rows;
}
