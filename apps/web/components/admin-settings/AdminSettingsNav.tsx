"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const settingsLinks = [
  { href: "/admin#company", label: "Company" },
  { href: "/admin#documents", label: "Documents" },
  { href: "/admin#automation", label: "Integrations & Automation" },
  { href: "/admin#fleet", label: "Fleet" },
];

const peopleLinks = [
  { href: "/admin/people/employees", label: "Employees" },
  { href: "/admin/people/drivers", label: "Drivers" },
];

const advancedLinks = [{ href: "/admin?view=classic", label: "Classic admin" }];

function isActive(pathname: string, href: string) {
  const [base, hash] = href.split("#");
  if (!base) return false;
  if (hash) return false;
  if (pathname === base) return true;
  return pathname.startsWith(base) && base !== "/admin";
}

export function AdminSettingsNav() {
  const pathname = usePathname();
  return (
    <aside className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white/70 p-4 text-sm text-[color:var(--color-text-muted)] lg:sticky lg:top-24 lg:self-start">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Settings</div>
          <div className="grid gap-2">
            {settingsLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-[var(--radius-control)] px-2 py-1 text-sm font-semibold text-ink hover:underline",
                  isActive(pathname, link.href) ? "bg-white/80" : ""
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">People & Access</div>
          <div className="grid gap-2">
            {peopleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-[var(--radius-control)] px-2 py-1 text-sm font-semibold text-ink hover:underline",
                  isActive(pathname, link.href) ? "bg-white/80" : ""
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Advanced</div>
          <div className="grid gap-2">
            {advancedLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-[var(--radius-control)] px-2 py-1 text-sm font-semibold text-ink hover:underline",
                  isActive(pathname, link.href) ? "bg-white/80" : ""
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
