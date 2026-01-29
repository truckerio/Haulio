"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoutButton } from "@/components/auth/logout-button";
import { UserProvider, useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type NavSection = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

type OnboardingState = {
  percentComplete: number;
  completedAt?: string | null;
  status?: "NOT_ACTIVATED" | "OPERATIONAL";
};

const navSections: NavSection[] = [
  {
    title: "Home",
    items: [
      { href: "/today", label: "Today" },
      { href: "/dashboard", label: "Task Inbox" },
      { href: "/profile", label: "Profile" },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/loads", label: "Loads" },
      { href: "/dispatch", label: "Dispatch" },
      { href: "/billing", label: "Billing" },
      { href: "/settlements", label: "Settlements" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/audit", label: "Audit" },
      { href: "/admin", label: "Admin" },
    ],
  },
];

const defaultRoutes = ["/today", "/dashboard", "/loads", "/profile"];

const roleRoutes: Record<string, string[]> = {
  ADMIN: ["/today", "/dashboard", "/loads", "/dispatch", "/billing", "/settlements", "/audit", "/admin", "/profile"],
  DISPATCHER: ["/today", "/dashboard", "/loads", "/dispatch", "/profile"],
  BILLING: ["/today", "/dashboard", "/loads", "/billing", "/settlements", "/profile"],
  DRIVER: ["/driver"],
};

const driverSections: NavSection[] = [
  {
    title: "Driver",
    items: [{ href: "/driver", label: "Driver Portal" }],
  },
];

function getVisibleSections(role?: string) {
  if (role === "DRIVER") return driverSections;
  const allowed = roleRoutes[role ?? ""] ?? defaultRoutes;
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowed.includes(item.href)),
    }))
    .filter((section) => section.items.length > 0);
}

function AppShellInner({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const { user, org } = useUser();
  const sections = useMemo(() => getVisibleSections(user?.role), [user?.role]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const navNode = navRef.current;
    const focusable = navNode?.querySelectorAll<HTMLElement>(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex=\"-1\"])'
    );
    const elements = focusable ? Array.from(focusable).filter((el) => !el.hasAttribute("disabled")) : [];
    const first = elements[0];
    const last = elements[elements.length - 1];
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        return;
      }
      if (event.key !== "Tab" || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      (closeButtonRef.current ?? first)?.focus();
    });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [navOpen]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") {
      setOnboarding(null);
      return;
    }
    if (pathname.startsWith("/onboarding")) {
      return;
    }
    apiFetch<{ state: OnboardingState }>("/onboarding/state")
      .then((data) => setOnboarding(data.state))
      .catch(() => setOnboarding(null));
  }, [user, pathname]);

  const NavContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-[var(--radius-control)] bg-[color:var(--color-accent)]/10" />
          <div>
            <div className="text-sm font-semibold text-ink">Haulio</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Operations console</div>
          </div>
        </div>
        <Badge className="bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
          {org?.companyDisplayName ?? org?.name ?? "Unknown org"}
        </Badge>
      </div>
      <Input aria-label="Search navigation" placeholder="Search" className="bg-white text-sm" />
      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <div className="px-2 text-[11px] uppercase tracking-[0.28em] text-[color:var(--color-text-subtle)]">
            {section.title}
          </div>
          <div className="space-y-1">
            {section.items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]",
                    active
                      ? "bg-[color:var(--color-bg-muted)] text-ink"
                      : "text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                  )}
                >
                  <span
                    className={cn(
                      "h-4 w-1 rounded-full",
                      active ? "bg-[color:var(--color-accent)]" : "bg-transparent"
                    )}
                    aria-hidden="true"
                  />
                  <span className={cn(active ? "font-medium" : "font-normal")}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)]/40 px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--color-text-subtle)]">Account</div>
        <div className="mt-2 text-sm font-semibold text-ink">{user?.name ?? user?.email ?? "User"}</div>
        {user?.email ? <div className="text-xs text-[color:var(--color-text-muted)]">{user.email}</div> : null}
        {org ? (
          <div className="text-xs text-[color:var(--color-text-muted)]">
            {org.companyDisplayName ?? org.name}
          </div>
        ) : null}
        <LogoutButton className="mt-3" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen h-screen w-full overflow-hidden bg-[color:var(--color-bg-muted)]">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[color:var(--color-divider)] bg-white/90 px-4 backdrop-blur lg:hidden">
        <div>
          <div className="text-sm font-semibold text-ink">Haulio</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">{title}</div>
        </div>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
          className="rounded-full border border-[color:var(--color-divider)] bg-white px-3 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
        >
          Menu
        </button>
      </header>

      {navOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <aside ref={navRef} className="absolute left-0 top-0 h-full w-72 bg-white px-4 py-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">Navigation</div>
              <button
                type="button"
                aria-label="Close navigation"
                ref={closeButtonRef}
                onClick={() => setNavOpen(false)}
                className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <NavContent />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex h-[calc(100vh-4rem)] w-full min-h-0 lg:h-screen">
        <aside className="hidden h-screen w-72 flex-col border-r border-[color:var(--color-divider)] bg-white lg:flex">
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <NavContent />
          </div>
        </aside>

        <main
          id="main-content"
          className="page-fade flex-1 min-h-0 min-w-0 overflow-y-auto lg:h-screen"
        >
          <div className="space-y-6 px-4 pb-10 pt-6 lg:px-10 lg:pb-16 lg:pt-8">
            {user?.role === "ADMIN" &&
            onboarding &&
            onboarding.status === "NOT_ACTIVATED" &&
            !pathname.startsWith("/onboarding") ? (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-6 py-4 shadow-[var(--shadow-subtle)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">Setup</div>
                    <div className="text-lg font-semibold text-ink">
                      Finish setup ({onboarding.percentComplete ?? 0}%)
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      Complete the workspace checklist to unlock dispatch, billing, and reporting defaults.
                    </div>
                  </div>
                  <Link href="/onboarding">
                    <Button>Finish setup</Button>
                  </Link>
                </div>
              </div>
            ) : null}
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-6 py-4 shadow-[var(--shadow-subtle)]">
              <h2 className="text-[22px] font-semibold text-ink">{title}</h2>
              {subtitle ? <p className="text-sm text-[color:var(--color-text-muted)]">{subtitle}</p> : null}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <UserProvider>
      <AppShellInner title={title} subtitle={subtitle}>
        {children}
      </AppShellInner>
    </UserProvider>
  );
}
