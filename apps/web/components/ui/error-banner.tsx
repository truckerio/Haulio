"use client";

import { Card } from "@/components/ui/card";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <Card>
      <div className="text-sm text-[color:var(--color-danger)]">{message}</div>
    </Card>
  );
}
