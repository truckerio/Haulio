import type { StatusTone } from "@/components/ui/status-chip";

export type StatusSemantic = "blocked" | "attention" | "info" | "complete" | "neutral";
export type SeveritySemantic = "error" | "warning" | "info" | "success" | "neutral";

const STATUS_SEMANTIC_TONE: Record<StatusSemantic, StatusTone> = {
  blocked: "danger",
  attention: "warning",
  info: "info",
  complete: "success",
  neutral: "neutral",
};

const SEVERITY_SEMANTIC_TONE: Record<SeveritySemantic, StatusTone> = {
  error: "danger",
  warning: "warning",
  info: "info",
  success: "success",
  neutral: "neutral",
};

export function toneFromSemantic(semantic: StatusSemantic): StatusTone {
  return STATUS_SEMANTIC_TONE[semantic];
}

export function toneFromSeverity(semantic: SeveritySemantic): StatusTone {
  return SEVERITY_SEMANTIC_TONE[semantic];
}

