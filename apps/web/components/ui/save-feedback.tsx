import type { SaveState } from "@/lib/use-save-feedback";

export function getSaveButtonLabel(saveState: SaveState, idleLabel = "Save") {
  if (saveState === "saving") return "Saving...";
  if (saveState === "saved") return "Saved";
  return idleLabel;
}

export function SaveFeedbackText({
  saveState,
  label = "Saved",
}: {
  saveState: SaveState;
  label?: string;
}) {
  if (saveState !== "saved") return null;
  return <span className="text-sm text-[color:var(--color-success)]">{label}</span>;
}
