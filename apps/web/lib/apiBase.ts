const rawApiBase = (process.env.NEXT_PUBLIC_API_BASE || "/api").trim();

export const API_BASE = rawApiBase;
export const apiBase = rawApiBase.replace(/\/+$/, "");
