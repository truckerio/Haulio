import type {
  ContextResponse,
  EventsResponse,
  LoadImportMode,
  LoadImportResponse,
  PlanApplyRequest,
  PlanApplyResponse,
  PlanPreviewRequest,
  PlanPreviewResponse,
  PlanRejectRequest,
  PlanRejectResponse,
  SuggestedPlansRequest,
  SuggestedPlansResponse,
  TrailerSpec,
  TrailerSpecUpdateResponse,
} from "@yardos/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4100";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers || {});
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const message = payload?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return res.json();
}

export function getContext(params?: {
  loadIds?: string[];
  search?: string;
  status?: string;
  lane?: string;
  destination?: string;
  constraint?: string;
  assigned?: "true" | "false";
  sortBy?: "id" | "weight" | "pallets";
  sortDir?: "asc" | "desc";
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.loadIds?.length) query.set("loadIds", params.loadIds.join(","));
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.lane) query.set("lane", params.lane);
  if (params?.destination) query.set("destination", params.destination);
  if (params?.constraint) query.set("constraint", params.constraint);
  if (params?.assigned) query.set("assigned", params.assigned);
  if (params?.sortBy) query.set("sortBy", params.sortBy);
  if (params?.sortDir) query.set("sortDir", params.sortDir);
  if (params?.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<ContextResponse>(`/integrations/yardos/context${suffix}`);
}

export function getSuggestedPlans(payload: SuggestedPlansRequest) {
  return request<SuggestedPlansResponse>("/integrations/yardos/suggested-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function previewPlan(payload: PlanPreviewRequest) {
  return request<PlanPreviewResponse>("/integrations/yardos/plan-preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function applyPlan(payload: PlanApplyRequest) {
  return request<PlanApplyResponse>("/integrations/yardos/plan-apply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function rejectPlan(payload: PlanRejectRequest) {
  return request<PlanRejectResponse>("/integrations/yardos/plan-reject", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEvents(cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<EventsResponse>(`/integrations/yardos/events${query}`);
}

export function saveTrailerSpec(spec: Partial<TrailerSpec>) {
  return request<TrailerSpecUpdateResponse>("/integrations/yardos/trailer-spec", {
    method: "POST",
    body: JSON.stringify(spec),
  });
}

export function importLoadsFile(file: File, mode: LoadImportMode = "upsert") {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  return request<LoadImportResponse>("/integrations/yardos/import-loads", {
    method: "POST",
    body: form,
  });
}
