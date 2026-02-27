"use client";

import { useSyncExternalStore } from "react";

export type ToastTone = "error" | "success";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  message: string;
  createdAt: number;
};

type ToastListener = () => void;

const MAX_VISIBLE_TOASTS = 3;
const AUTO_DISMISS_MS = 6000;

let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();
const timers = new Map<string, number>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function scheduleDismiss(id: string) {
  if (typeof window === "undefined") return;
  const existing = timers.get(id);
  if (existing) {
    window.clearTimeout(existing);
  }
  const timeoutId = window.setTimeout(() => {
    dismiss(id);
  }, AUTO_DISMISS_MS);
  timers.set(id, timeoutId);
}

function nextId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pushToast(tone: ToastTone, message: string) {
  const item: ToastItem = {
    id: nextId(),
    tone,
    message,
    createdAt: Date.now(),
  };
  toasts = [item, ...toasts].slice(0, MAX_VISIBLE_TOASTS);
  scheduleDismiss(item.id);
  emit();
  return item.id;
}

export function dismiss(id: string) {
  const existing = timers.get(id);
  if (existing && typeof window !== "undefined") {
    window.clearTimeout(existing);
    timers.delete(id);
  }
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function clearToasts() {
  if (typeof window !== "undefined") {
    for (const timeoutId of timers.values()) {
      window.clearTimeout(timeoutId);
    }
  }
  timers.clear();
  toasts = [];
  emit();
}

function subscribe(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

function getServerSnapshot() {
  return [];
}

export function useToasts() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) as ToastItem[];
}

export const toast = {
  error(message: string) {
    return pushToast("error", message);
  },
  success(message: string) {
    return pushToast("success", message);
  },
  dismiss,
  clear: clearToasts,
};
