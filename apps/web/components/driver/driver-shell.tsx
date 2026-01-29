"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";

type DriverShellProps = {
  children: React.ReactNode;
};

const tabs = [
  { label: "Today", href: "/driver", match: (path: string) => path === "/driver" },
  { label: "Pay", href: "/driver/pay", match: (path: string) => path.startsWith("/driver/pay") },
  { label: "Settlements", href: "/driver/settlements", match: (path: string) => path.startsWith("/driver/settlements") },
  { label: "Profile", href: "/driver/profile", match: (path: string) => path.startsWith("/driver/profile") },
];

export function DriverShell({ children }: DriverShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-muted)] pb-24">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-8">
        <div className="flex justify-end">
          <LogoutButton variant="ghost" size="sm" className="w-auto" />
        </div>
        {children}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-[color:var(--color-divider)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-xl items-center justify-around px-4 py-3">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)] focus-visible:ring-offset-2",
                  active
                    ? "bg-[color:var(--color-bg-muted)] text-ink"
                    : "text-[color:var(--color-text-muted)] hover:text-ink"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
