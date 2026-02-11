const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

if (!API_BASE) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE is not set. Web cannot start without an API base."
  );
}

export const apiBase = API_BASE.replace(/\/+$/, "");
