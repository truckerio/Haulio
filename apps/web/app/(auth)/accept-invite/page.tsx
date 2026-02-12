import { Suspense } from "react";
import AcceptInviteClient from "./accept-invite-client";

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[color:var(--color-bg-muted)] px-6 py-12">
          <div className="mx-auto max-w-lg text-sm text-[color:var(--color-text-muted)]">Loading…</div>
        </div>
      }
    >
      <AcceptInviteClient />
    </Suspense>
  );
}
