"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/today", label: "Today" },
  { href: "/dashboard", label: "Task Inbox" },
  { href: "/loads", label: "Loads" },
  { href: "/dispatch", label: "Dispatch" },
  { href: "/billing", label: "Billing" },
  { href: "/settlements", label: "Settlements" },
  { href: "/storage", label: "Storage" },
  { href: "/audit", label: "Audit" },
  { href: "/admin", label: "Admin" },
];

export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-2xl bg-moss shadow-md shadow-moss/30" />
          <div>
            <h1 className="text-3xl font-semibold">TruckerIO</h1>
            <div className="text-sm text-black/60">Back-office control</div>
          </div>
        </div>
        <Badge className="bg-ember text-white">Demo</Badge>
      </header>

      <div className="grid gap-6 px-8 pb-10 lg:grid-cols-[240px,1fr]">
        <aside className="space-y-2 rounded-3xl border border-black/5 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="px-2 text-xs uppercase tracking-[0.3em] text-black/40">Workspace</div>
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-2xl px-3 py-2 text-sm font-semibold transition",
                  active ? "bg-moss text-white shadow-sm shadow-moss/30" : "text-black/70 hover:bg-black/5"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </aside>

        <main className="page-fade space-y-6">
          <div className="rounded-3xl border border-black/5 bg-white/80 px-6 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <h2 className="text-2xl font-semibold">{title}</h2>
            {subtitle ? <p className="text-sm text-black/60">{subtitle}</p> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
