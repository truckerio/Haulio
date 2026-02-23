"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/rbac/route-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { getSaveButtonLabel } from "@/components/ui/save-feedback";
import { apiFetch } from "@/lib/api";
import {
  AppearanceSettings,
  DEFAULT_APPEARANCE,
  applyAppearanceToDocument,
  broadcastAppearance,
  normalizeAppearance,
  persistAppearanceLocal,
} from "@/lib/appearance";
import { useSaveFeedback } from "@/lib/use-save-feedback";

const OPTION_GROUPS = {
  theme: [
    { value: "SYSTEM", label: "System" },
    { value: "LIGHT", label: "Light" },
    { value: "DARK", label: "Dark" },
  ],
  textScale: [
    { value: "DEFAULT", label: "Default" },
    { value: "LARGE", label: "Large" },
    { value: "XL", label: "Extra large" },
  ],
  contrast: [
    { value: "NORMAL", label: "Normal" },
    { value: "HIGH", label: "High" },
  ],
  fontWeight: [
    { value: "NORMAL", label: "Normal" },
    { value: "BOLD", label: "Bold" },
  ],
  navDensity: [
    { value: "COMPACT", label: "Compact" },
    { value: "COMFORTABLE", label: "Comfortable" },
  ],
  motion: [
    { value: "FULL", label: "Full" },
    { value: "REDUCED", label: "Reduced" },
  ],
  focusRing: [
    { value: "STANDARD", label: "Standard" },
    { value: "STRONG", label: "Strong" },
  ],
  colorPreset: [
    { value: "DEFAULT", label: "Default" },
    { value: "SLATE", label: "Slate" },
    { value: "TEAL", label: "Teal" },
  ],
} as const;

export default function AppearancePage() {
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { saveState, startSaving, markSaved, resetSaveState } = useSaveFeedback(1800);

  useEffect(() => {
    apiFetch<{ appearance: AppearanceSettings }>("/me/appearance")
      .then((payload) => {
        const next = normalizeAppearance(payload.appearance);
        setAppearance(next);
        setLoaded(true);
        setError(null);
      })
      .catch((err) => {
        setError((err as Error).message || "Failed to load appearance settings.");
        setLoaded(true);
      });
  }, []);

  const applyLive = (next: AppearanceSettings) => {
    setAppearance(next);
    applyAppearanceToDocument(next);
    persistAppearanceLocal(next);
    broadcastAppearance(next);
  };

  const update = <K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
    const next = { ...appearance, [key]: value };
    applyLive(next);
  };

  const saveSettings = async () => {
    startSaving();
    setSaveError(null);
    try {
      const payload = await apiFetch<{ appearance: AppearanceSettings }>("/me/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appearance),
      });
      const next = normalizeAppearance(payload.appearance);
      applyLive(next);
      markSaved();
    } catch (err) {
      resetSaveState();
      setSaveError((err as Error).message || "Failed to save appearance settings.");
    }
  };

  const resetDefaults = () => {
    applyLive(DEFAULT_APPEARANCE);
    resetSaveState();
    setSaveError(null);
  };

  const previewText = useMemo(() => {
    if (appearance.contrast === "HIGH") return "High contrast improves readability in bright environments.";
    return "Balanced contrast and spacing for daily dispatch, finance, and operations workflows.";
  }, [appearance.contrast]);

  return (
    <AppShell title="Appearance" subtitle="Personalize readability, motion, and visual comfort.">
      <RouteGuard allowedRoles={["ADMIN", "DISPATCHER", "HEAD_DISPATCHER", "BILLING"]}>
        {!loaded ? (
          <EmptyState title="Loading appearance..." description="Fetching your current settings." />
        ) : (
          <div className="space-y-4">
            <Card className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Quick actions</div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveSettings}>{getSaveButtonLabel(saveState)}</Button>
                <Button variant="secondary" onClick={resetDefaults}>Reset to defaults</Button>
                <Link href="/profile">
                  <Button variant="secondary">Back to profile</Button>
                </Link>
              </div>
              {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
              {saveError ? <div className="text-sm text-[color:var(--color-danger)]">{saveError}</div> : null}
            </Card>

            <Card className="grid gap-3 lg:grid-cols-2">
              <FormField label="Theme" htmlFor="appearanceTheme">
                <Select
                  id="appearanceTheme"
                  value={appearance.theme}
                  onChange={(event) => update("theme", event.target.value as AppearanceSettings["theme"])}
                >
                  {OPTION_GROUPS.theme.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Color preset" htmlFor="appearanceColorPreset">
                <Select
                  id="appearanceColorPreset"
                  value={appearance.colorPreset}
                  onChange={(event) => update("colorPreset", event.target.value as AppearanceSettings["colorPreset"])}
                >
                  {OPTION_GROUPS.colorPreset.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Text size" htmlFor="appearanceTextScale">
                <Select
                  id="appearanceTextScale"
                  value={appearance.textScale}
                  onChange={(event) => update("textScale", event.target.value as AppearanceSettings["textScale"])}
                >
                  {OPTION_GROUPS.textScale.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Font weight" htmlFor="appearanceFontWeight">
                <Select
                  id="appearanceFontWeight"
                  value={appearance.fontWeight}
                  onChange={(event) => update("fontWeight", event.target.value as AppearanceSettings["fontWeight"])}
                >
                  {OPTION_GROUPS.fontWeight.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Contrast" htmlFor="appearanceContrast">
                <Select
                  id="appearanceContrast"
                  value={appearance.contrast}
                  onChange={(event) => update("contrast", event.target.value as AppearanceSettings["contrast"])}
                >
                  {OPTION_GROUPS.contrast.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Focus ring" htmlFor="appearanceFocusRing">
                <Select
                  id="appearanceFocusRing"
                  value={appearance.focusRing}
                  onChange={(event) => update("focusRing", event.target.value as AppearanceSettings["focusRing"])}
                >
                  {OPTION_GROUPS.focusRing.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Motion" htmlFor="appearanceMotion">
                <Select
                  id="appearanceMotion"
                  value={appearance.motion}
                  onChange={(event) => update("motion", event.target.value as AppearanceSettings["motion"])}
                >
                  {OPTION_GROUPS.motion.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Navigation density" htmlFor="appearanceNavDensity">
                <Select
                  id="appearanceNavDensity"
                  value={appearance.navDensity}
                  onChange={(event) => update("navDensity", event.target.value as AppearanceSettings["navDensity"])}
                >
                  {OPTION_GROUPS.navDensity.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </Card>

            <Card className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Preview</div>
              <div className="text-lg font-semibold text-ink">Workspace readability check</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">{previewText}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm">Primary action</Button>
                <Button size="sm" variant="secondary">Secondary action</Button>
              </div>
            </Card>
          </div>
        )}
      </RouteGuard>
    </AppShell>
  );
}
