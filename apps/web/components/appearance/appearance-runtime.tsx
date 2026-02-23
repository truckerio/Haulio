"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  APPEARANCE_EVENT_NAME,
  APPEARANCE_STORAGE_KEY,
  AppearanceSettings,
  DEFAULT_APPEARANCE,
  applyAppearanceToDocument,
  normalizeAppearance,
  persistAppearanceLocal,
  readAppearanceLocal,
} from "@/lib/appearance";

export function AppearanceRuntime() {
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const appearanceRef = useRef<AppearanceSettings>(DEFAULT_APPEARANCE);

  useEffect(() => {
    const local = readAppearanceLocal();
    appearanceRef.current = local;
    setAppearance(local);
    applyAppearanceToDocument(local);
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch<{ appearance: AppearanceSettings }>("/me/appearance", { skipAuthRedirect: true })
      .then((payload) => {
        if (!active) return;
        const next = normalizeAppearance(payload.appearance);
        appearanceRef.current = next;
        setAppearance(next);
      })
      .catch(() => {
        // Keep local/default appearance when session is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    appearanceRef.current = appearance;
    persistAppearanceLocal(appearance);
    applyAppearanceToDocument(appearance);
  }, [appearance]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY) return;
      const next = readAppearanceLocal();
      appearanceRef.current = next;
      setAppearance(next);
    };

    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<AppearanceSettings>).detail;
      const next = normalizeAppearance(detail);
      appearanceRef.current = next;
      setAppearance(next);
    };

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onThemeChanged = () => {
      if (appearanceRef.current.theme === "SYSTEM") {
        applyAppearanceToDocument(appearanceRef.current);
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(APPEARANCE_EVENT_NAME, onUpdated as EventListener);
    media.addEventListener("change", onThemeChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APPEARANCE_EVENT_NAME, onUpdated as EventListener);
      media.removeEventListener("change", onThemeChanged);
    };
  }, []);

  return null;
}
