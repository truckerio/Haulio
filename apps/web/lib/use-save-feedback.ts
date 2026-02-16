import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved";

export function useSaveFeedback(resetMs = 1800) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startSaving = useCallback(() => {
    clearTimer();
    setSaveState("saving");
  }, [clearTimer]);

  const markSaved = useCallback(() => {
    clearTimer();
    setSaveState("saved");
    timerRef.current = window.setTimeout(() => {
      setSaveState("idle");
      timerRef.current = null;
    }, resetMs);
  }, [clearTimer, resetMs]);

  const resetSaveState = useCallback(() => {
    clearTimer();
    setSaveState("idle");
  }, [clearTimer]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return {
    saveState,
    isSaving: saveState === "saving",
    startSaving,
    markSaved,
    resetSaveState,
  };
}
