import { Suspense } from "react";
import LoginClient from "./login-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen px-6 py-12">
          <div className="mx-auto max-w-5xl text-sm text-[color:var(--color-text-muted)]">Loading…</div>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
