const rawApiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";

if (!rawApiBase) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE is not set. Web cannot start without an API base."
  );
}

export const API_BASE = rawApiBase;
export const apiBase = rawApiBase.replace(/\/+$/, "");
