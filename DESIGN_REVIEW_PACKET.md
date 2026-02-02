# DESIGN_REVIEW_PACKET

## A) Route files

- Today dashboard: `apps/web/app/today/page.tsx`
- Loads list: `apps/web/app/loads/page.tsx`
- Load details: `apps/web/app/loads/[id]/page.tsx`

## B) Layout wrappers

### Root layout (`apps/web/app/layout.tsx`)
```tsx
import type { Metadata } from "next";
import { Space_Grotesk, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { IdleLogout } from "@/components/idle-logout";
import { CanonicalHost } from "@/components/canonical-host";
import { AuthKeepalive } from "@/components/auth-keepalive";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Haulio",
  description: "Back-office + driver-friendly logistics console",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#f8f5f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} min-h-screen`}>
        <CanonicalHost />
        <AuthKeepalive />
        <IdleLogout />
        {children}
      </body>
    </html>
  );
}
```

### App shell (`apps/web/components/app-shell.tsx`)
```tsx
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
```

## C) Screen: Today dashboard
- Page path: `apps/web/app/today/page.tsx`
- Local components from same folder: None
- Data loading: `/today` for items, `/onboarding/state` for admin setup banner (both affect visibility)

### Component tree (approx.)
```text
TodayPage
├─ AppShell (title/subtitle)
│  └─ TodayContent
│     ├─ Header (title, subtitle, Refresh button)
│     ├─ ErrorBanner (today fetch)
│     ├─ ErrorBanner (onboarding fetch, admin only)
│     ├─ Setup Actions Card (admin + NOT_ACTIVATED)
│     ├─ EmptyState (if no items)
│     └─ 3-column Sections (Blocks, Warnings, Info)
│        ├─ SectionHeader
│        └─ Cards (item title/detail/Fix now) or “Nothing here”
```

### Page component code (`apps/web/app/today/page.tsx`)
```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";

type TodayItem = {
  severity: "block" | "warning" | "info";
  title: string;
  detail?: string | null;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ruleId?: string | null;
};

type TodayData = {
  blocks: TodayItem[];
  warnings: TodayItem[];
  info: TodayItem[];
};

type OnboardingState = {
  status?: "NOT_ACTIVATED" | "OPERATIONAL";
  percentComplete?: number;
  completedSteps?: string[];
};

const SECTION_META = [
  {
    key: "blocks",
    label: "Blocks",
    subtitle: "Must resolve before the next step",
    tone: "danger",
  },
  {
    key: "warnings",
    label: "Warnings",
    subtitle: "Needs eyes within the next shift",
    tone: "warning",
  },
  {
    key: "info",
    label: "Info",
    subtitle: "Nice to close out today",
    tone: "info",
  },
] as const;

const TONE_CLASS: Record<(typeof SECTION_META)[number]["tone"], string> = {
  danger: "border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/30",
  warning: "border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-soft)]/30",
  info: "border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30",
};

const SETUP_STEPS: Array<{ key: string; label: string }> = [
  { key: "basics", label: "Company basics" },
  { key: "operating", label: "Operating entities" },
  { key: "team", label: "Invite team" },
  { key: "drivers", label: "Add drivers" },
  { key: "fleet", label: "Add fleet" },
  { key: "preferences", label: "Document rules" },
  { key: "tracking", label: "Tracking setup" },
  { key: "finance", label: "Finance defaults" },
];

function TodayContent() {
  const router = useRouter();
  const { user } = useUser();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const loadToday = async () => {
    setLoading(true);
    try {
      const payload = await apiFetch<TodayData>("/today");
      setData(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadToday();
  }, []);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") {
      setOnboarding(null);
      return;
    }
    apiFetch<{ state: OnboardingState }>("/onboarding/state")
      .then((payload) => {
        setOnboarding(payload.state);
        setOnboardingError(null);
      })
      .catch((err) => {
        setOnboarding(null);
        setOnboardingError((err as Error).message);
      });
  }, [user]);

  const totalItems = useMemo(() => {
    if (!data) return 0;
    return data.blocks.length + data.warnings.length + data.info.length;
  }, [data]);

  const subtitle = user?.role ? `${user.role.toLowerCase()} focus` : "Your attention stack";
  const showSetup = onboarding?.status === "NOT_ACTIVATED";
  const completedSteps = new Set(onboarding?.completedSteps ?? []);
  const remainingSteps = SETUP_STEPS.filter((step) => !completedSteps.has(step.key));
  const setupPreview = remainingSteps.slice(0, 3);

  const handleFixNow = async (item: TodayItem) => {
    if (item.ruleId) {
      apiFetch("/learning/attention-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: item.ruleId,
          severity: item.severity,
          entityType: item.entityType ?? null,
          outcome: "FIXED",
        }),
      }).catch(() => null);
    }
    if (item.href) {
      router.push(item.href);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Today</div>
          <div className="text-2xl font-semibold">Your priority stack</div>
          <div className="text-sm text-[color:var(--color-text-muted)]">{subtitle}</div>
        </div>
        <Button variant="secondary" onClick={loadToday} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {user?.role === "ADMIN" && onboardingError ? <ErrorBanner message={onboardingError} /> : null}

      {showSetup ? (
        <Card className="space-y-3 border border-[color:var(--color-divider)] bg-white/90">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Setup actions</div>
              <div className="text-lg font-semibold">Activate your workspace</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {onboarding?.percentComplete ?? 0}% complete · Finish setup to unlock full operations.
              </div>
            </div>
            <Button onClick={() => router.push("/onboarding")}>Finish setup</Button>
          </div>
          <div className="grid gap-2 text-sm text-[color:var(--color-text-muted)]">
            {setupPreview.length > 0 ? (
              setupPreview.map((step) => (
                <div key={step.key} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2">
                  <span>{step.label}</span>
                  <Button size="sm" variant="secondary" onClick={() => router.push("/onboarding")}>
                    Continue
                  </Button>
                </div>
              ))
            ) : (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2">
                Review your setup and activate the workspace.
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {!loading && data && totalItems === 0 ? (
        <EmptyState title="All clear." description="No urgent actions detected right now." />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {SECTION_META.map((section) => {
          const items = data ? data[section.key] : [];
          return (
            <div key={section.key} className="space-y-3">
              <SectionHeader title={section.label} subtitle={section.subtitle} />
              {loading ? (
                <Card className="text-sm text-[color:var(--color-text-muted)]">Loading…</Card>
              ) : items.length === 0 ? (
                <Card className="text-sm text-[color:var(--color-text-muted)]">Nothing here right now.</Card>
              ) : (
                items.map((item, index) => (
                  <Card key={`${item.title}-${index}`} className={`space-y-2 border ${TONE_CLASS[section.tone]}`}>
                    <div className="text-sm font-semibold">{item.title}</div>
                    {item.detail ? <div className="text-xs text-[color:var(--color-text-muted)]">{item.detail}</div> : null}
                    {item.href ? (
                      <Button size="sm" variant="secondary" onClick={() => handleFixNow(item)}>
                        Fix now
                      </Button>
                    ) : null}
                  </Card>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TodayPage() {
  return (
    <AppShell title="Today" subtitle="What needs attention right now">
      <TodayContent />
    </AppShell>
  );
}
```

## D) Screen: Loads list
- Page path: `apps/web/app/loads/page.tsx`
- Local components from same folder: None
- Data loading: `/loads`, `/assets/drivers`, `/api/operating-entities`, `/auth/me` (affect visibility/sections); optional `/teams` when canSeeAllTeams

### Component tree (approx.)
```text
LoadsPage
├─ AppShell (title/subtitle)
│  ├─ Header actions (Create load, Bulk import, Export, RC Inbox)
│  ├─ Search + Refine toggle
│  ├─ Status chips bar
│  ├─ Optional panels
│  │  ├─ BlockedScreen (onboarding)
│  │  ├─ Create load form (Card)
│  │  ├─ Bulk Import (BulkLoadImport / ImportWizard)
│  │  └─ Export panel + preview
│  ├─ RefinePanel (filters, incl. Team when canSeeAllTeams)
│  └─ Load list (cards + empty state)
```

### Page component code (`apps/web/app/loads/page.tsx`)
```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/ui/section-header";
import { Textarea } from "@/components/ui/textarea";
import { RefinePanel } from "@/components/ui/refine-panel";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { BlockedScreen } from "@/components/ui/blocked-screen";
import { Badge } from "@/components/ui/badge";
import { apiFetch, getApiBase } from "@/lib/api";
import { BulkLoadImport } from "@/components/BulkLoadImport";
import { ImportWizard } from "@/components/ImportWizard";
import {
  deriveBillingStatus,
  deriveBlocker,
  deriveDocsBlocker,
  deriveOpsStatus,
  derivePrimaryAction,
  deriveTrackingBadge,
} from "@/lib/load-derivations";

const PAGE_SIZE = 25;

const OPS_STATUSES = [
  "DRAFT",
  "PLANNED",
  "ASSIGNED",
  "IN_TRANSIT",
  "DELIVERED",
  "POD_RECEIVED",
  "READY_TO_INVOICE",
  "INVOICED",
  "PAID",
  "CANCELLED",
] as const;
const BILLING_STATUSES = ["DOCS_NEEDED", "READY_TO_INVOICE", "INVOICED", "PAID"] as const;

// TODO(QA): Open /loads, click a chip (e.g., Missing POD) to confirm list updates, then click a card to verify navigation.

const TMS_LOAD_SHEET_TEMPLATE =
  "Load,Trip,Status,Customer,Cust Ref,Unit,Trailer,As Wgt,Total Rev,PU Date F,PU Time F,PU Time T,Shipper,Ship City,Ship St,Del Date F,Del Time T,Consignee,Cons City,Cons St,Sales,Drop Name,Load Notes (Shipper),Load Notes (Consignee),Inv Date,Del Date T,Type\n" +
  "LD-1001,TRIP-9001,Planned,Acme Foods,PO-7788,TRK-101,TRL-201,42000,2500,01/20/2026,08:00,10:00,Acme DC,Chicago,IL,01/21/2026,16:00,Fresh Mart,Dallas,TX,A. Lee,Store 14,Handle with care,Deliver after 3 PM,,01/21/2026,Van\n";

type OpsStatus = (typeof OPS_STATUSES)[number];
type BillingStatus = (typeof BILLING_STATUSES)[number];

type RefineState = {
  opsStatuses: OpsStatus[];
  billingStatuses: BillingStatus[];
  customer: string;
  driverId: string;
  pickupFrom: string;
  pickupTo: string;
  deliveryFrom: string;
  deliveryTo: string;
  missingDocsOnly: boolean;
  trackingOffOnly: boolean;
  destSearch: string;
  minRate: string;
  maxRate: string;
};

const defaultRefine: RefineState = {
  opsStatuses: [],
  billingStatuses: [],
  customer: "",
  driverId: "",
  pickupFrom: "",
  pickupTo: "",
  deliveryFrom: "",
  deliveryTo: "",
  missingDocsOnly: false,
  trackingOffOnly: false,
  destSearch: "",
  minRate: "",
  maxRate: "",
};

export default function LoadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loads, setLoads] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [operatingEntities, setOperatingEntities] = useState<any[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; active?: boolean }>>([]);
  const [teamFilterId, setTeamFilterId] = useState("");
  const [user, setUser] = useState<any | null>(null);
  const [orgOperatingMode, setOrgOperatingMode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [blocked, setBlocked] = useState<{ message?: string; ctaHref?: string } | null>(null);
  const [operational, setOperational] = useState<boolean | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeChip, setActiveChip] = useState("active");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportPreviewCount, setExportPreviewCount] = useState<number | null>(null);
  const [exportPreviewMax, setExportPreviewMax] = useState<number | null>(null);
  const [exportPreviewLoading, setExportPreviewLoading] = useState(false);
  const [exportPreviewError, setExportPreviewError] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [importMode, setImportMode] = useState<"legacy" | "tms_load_sheet">("legacy");
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [refine, setRefine] = useState<RefineState>(defaultRefine);
  const [pageIndex, setPageIndex] = useState(0);
  const [customerSuggestion, setCustomerSuggestion] = useState<{
    customerId: string;
    customerName: string;
    confidence: number;
  } | null>(null);
  const [customerLearnedApplied, setCustomerLearnedApplied] = useState(false);
  const [pickupSuggestion, setPickupSuggestion] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null>(null);
  const [pickupNameSuggestion, setPickupNameSuggestion] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null>(null);
  const [deliverySuggestion, setDeliverySuggestion] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null>(null);
  const [deliveryNameSuggestion, setDeliveryNameSuggestion] = useState<{
    address: string;
    city: string;
    state: string;
    zip: string;
  } | null>(null);
  const [pickupLearnedApplied, setPickupLearnedApplied] = useState(false);
  const [deliveryLearnedApplied, setDeliveryLearnedApplied] = useState(false);
  const lastCustomerQuery = useRef("");
  const lastPickupQuery = useRef("");
  const lastDeliveryQuery = useRef("");
  const lastPickupNameQuery = useRef("");
  const lastDeliveryNameQuery = useRef("");
  const [showStopDetails, setShowStopDetails] = useState(false);
  const [form, setForm] = useState({
    loadNumber: "",
    status: "PLANNED",
    loadType: "BROKERED",
    tripNumber: "",
    operatingEntityId: "",
    customerId: "",
    customerName: "",
    customerRef: "",
    truckUnit: "",
    trailerUnit: "",
    weightLbs: "",
    rate: "",
    miles: "",
    pickupDate: "",
    pickupTimeStart: "",
    pickupTimeEnd: "",
    pickupName: "",
    pickupAddress: "",
    pickupCity: "",
    pickupState: "",
    pickupZip: "",
    pickupNotes: "",
    deliveryDateStart: "",
    deliveryDateEnd: "",
    deliveryTimeEnd: "",
    deliveryName: "",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryState: "",
    deliveryZip: "",
    deliveryNotes: "",
    salesRepName: "",
    dropName: "",
    desiredInvoiceDate: "",
  });

  const canImport = user?.role === "ADMIN" || user?.role === "DISPATCHER";
  const canSeeAllTeams = Boolean(user?.canSeeAllTeams);
  const archivedMode = activeChip === "archived";

  const buildParams = useCallback((options?: {
    rangeDays?: number;
    fromDate?: string;
    toDate?: string;
    includeChip?: boolean;
    page?: number;
    limit?: number;
    format?: string;
  }) => {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (refine.driverId) params.set("driverId", refine.driverId);
    if (refine.customer) params.set("customer", refine.customer);
    if (refine.destSearch) params.set("destSearch", refine.destSearch);
    if (refine.minRate) params.set("minRate", refine.minRate);
    if (refine.maxRate) params.set("maxRate", refine.maxRate);
    params.set("archived", archivedMode ? "true" : "false");
    if (options?.includeChip) params.set("chip", activeChip);
    if (options?.page) params.set("page", String(options.page));
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.rangeDays) {
      params.set("rangeDays", String(options.rangeDays));
    }
    if (options?.fromDate) params.set("fromDate", options.fromDate);
    if (options?.toDate) params.set("toDate", options.toDate);
    if (options?.format) params.set("format", options.format);
    if (teamFilterId) params.set("teamId", teamFilterId);
    return params.toString();
  }, [
    searchTerm,
    refine.driverId,
    refine.customer,
    refine.destSearch,
    refine.minRate,
    refine.maxRate,
    archivedMode,
    activeChip,
    teamFilterId,
  ]);

  const loadData = useCallback(async () => {
    const query = buildParams({ page: pageIndex + 1, limit: PAGE_SIZE, includeChip: true });
    const url = query ? `/loads?${query}` : "/loads";
    const [loadsData, driversData] = await Promise.all([
      apiFetch<{ loads: any[]; page: number; totalPages: number; total: number }>(url),
      apiFetch<{ drivers: any[] }>("/assets/drivers"),
    ]);
    setDrivers(driversData.drivers);
    setLoads(loadsData.loads);
    setTotalPages(loadsData.totalPages ?? 1);
    setTotalCount(loadsData.total ?? loadsData.loads.length);
    try {
      const entitiesData = await apiFetch<{ entities: any[] }>("/api/operating-entities");
      setOperatingEntities(entitiesData.entities);
    } catch {
      setOperatingEntities([]);
    }
  }, [buildParams, pageIndex]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    apiFetch<{ user: any; org: { operatingMode?: string | null } | null }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        setOrgOperatingMode(data.org?.operatingMode ?? null);
      })
      .catch(() => {
        setUser(null);
        setOrgOperatingMode(null);
      });
  }, []);

  useEffect(() => {
    if (!canSeeAllTeams) {
      setTeams([]);
      setTeamFilterId("");
      return;
    }
    apiFetch<{ teams: Array<{ id: string; name: string; active?: boolean }> }>("/teams")
      .then((data) => setTeams(data.teams ?? []))
      .catch(() => setTeams([]));
  }, [canSeeAllTeams]);
  useEffect(() => {
    if (searchParams?.get("create") === "1") {
      setShowCreate(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    apiFetch<{ state: { status?: string } }>("/onboarding/state")
      .then((payload) => {
        if (payload.state?.status === "NOT_ACTIVATED") {
          setOperational(false);
          setBlocked({ message: "Finish setup to create loads.", ctaHref: "/onboarding" });
        } else {
          setOperational(true);
          setBlocked(null);
        }
      })
      .catch(() => {
        // ignore onboarding checks for non-admins or unexpected errors
      });
  }, [user]);

  useEffect(() => {
    if (!canImport && showImport) {
      setShowImport(false);
    }
  }, [canImport, showImport]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadData();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [loadData]);

  const downloadExport = async (query: string) => {
    setExportError(null);
    setExporting(true);
    try {
      const url = `${getApiBase()}/loads/export?${query}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Export failed" }));
        throw new Error(error.error || "Export failed");
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      const params = new URLSearchParams(query);
      const isTms = params.get("format") === "tms_load_sheet";
      link.href = objectUrl;
      link.download = isTms ? `loads-export-tms-load-sheet-${stamp}.csv` : `loads-export-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError((error as Error).message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const previewExport = async (query: string) => {
    setExportPreviewError(null);
    setExportPreviewLoading(true);
    try {
      const url = `${getApiBase()}/loads/export/preview?${query}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Preview failed" }));
        throw new Error(error.error || "Preview failed");
      }
      const data = await response.json();
      setExportPreviewCount(data.count ?? null);
      setExportPreviewMax(data.maxRows ?? null);
    } catch (error) {
      setExportPreviewError((error as Error).message || "Preview failed");
    } finally {
      setExportPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (operatingEntities.length === 0) return;
    setForm((prev) => {
      if (prev.operatingEntityId) return prev;
      const defaultEntity = operatingEntities.find((entity) => entity.isDefault) ?? operatingEntities[0];
      return { ...prev, operatingEntityId: defaultEntity?.id ?? "" };
    });
  }, [operatingEntities]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchTerm, activeChip, refine]);

  useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [pageIndex, totalPages]);

  const handleCreate = async () => {
    setFormError(null);
    if (
      !form.customerName.trim() ||
      !form.pickupName.trim() ||
      !form.pickupCity.trim() ||
      !form.pickupState.trim() ||
      !form.deliveryName.trim() ||
      !form.deliveryCity.trim() ||
      !form.deliveryState.trim() ||
      !form.pickupDate.trim() ||
      !form.deliveryDateStart.trim()
    ) {
      setFormError("Fill all required fields before creating the load.");
      return;
    }
    const combineDateTime = (date: string, time?: string) => {
      if (!date) return undefined;
      const cleanTime = time?.trim();
      return cleanTime ? `${date}T${cleanTime}` : `${date}T00:00`;
    };
    const pickupStart = combineDateTime(form.pickupDate, form.pickupTimeStart || undefined);
    const pickupEnd = combineDateTime(
      form.pickupDate,
      form.pickupTimeEnd || form.pickupTimeStart || undefined
    );
    const deliveryStart = combineDateTime(form.deliveryDateStart, undefined);
    const deliveryEnd = form.deliveryTimeEnd
      ? combineDateTime(form.deliveryDateEnd || form.deliveryDateStart, form.deliveryTimeEnd)
      : undefined;

    const stops: Array<Record<string, string | number | undefined | null>> = [
      {
        type: "PICKUP",
        name: form.pickupName,
        address: form.pickupAddress || "",
        city: form.pickupCity,
        state: form.pickupState,
        zip: form.pickupZip || "",
        notes: form.pickupNotes || undefined,
        appointmentStart: pickupStart,
        appointmentEnd: pickupEnd,
        sequence: 1,
      },
      {
        type: "DELIVERY",
        name: form.deliveryName,
        address: form.deliveryAddress || "",
        city: form.deliveryCity,
        state: form.deliveryState,
        zip: form.deliveryZip || "",
        notes: form.deliveryNotes || undefined,
        appointmentStart: deliveryStart,
        appointmentEnd: deliveryEnd,
        sequence: 2,
      },
    ];

    try {
      const resolvedBusinessType = form.loadType === "BROKERED" ? "BROKER" : "COMPANY";
      await apiFetch("/loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadNumber: form.loadNumber.trim() ? form.loadNumber : undefined,
          tripNumber: form.tripNumber.trim() ? form.tripNumber : undefined,
          status: form.status || undefined,
          loadType: form.loadType || undefined,
          businessType: resolvedBusinessType,
          operatingEntityId: form.operatingEntityId || undefined,
          customerId: form.customerId || undefined,
          customerName: form.customerName,
          customerRef: form.customerRef || undefined,
          truckUnit: form.truckUnit || undefined,
          trailerUnit: form.trailerUnit || undefined,
          weightLbs: form.weightLbs ? Number(form.weightLbs) : undefined,
          rate: form.rate ? Number(form.rate) : undefined,
          miles: form.miles ? Number(form.miles) : undefined,
          salesRepName: form.salesRepName || undefined,
          dropName: form.dropName || undefined,
          desiredInvoiceDate: form.desiredInvoiceDate || undefined,
          stops,
        }),
      });
      setForm({
        loadNumber: "",
        status: "PLANNED",
        loadType: form.loadType === "BROKERED" ? "BROKERED" : "COMPANY",
        tripNumber: "",
        operatingEntityId: form.operatingEntityId,
        customerId: "",
        customerName: "",
        customerRef: "",
        truckUnit: "",
        trailerUnit: "",
        weightLbs: "",
        rate: "",
        miles: "",
        pickupDate: "",
        pickupTimeStart: "",
        pickupTimeEnd: "",
        pickupName: "",
        pickupAddress: "",
        pickupCity: "",
        pickupState: "",
        pickupZip: "",
        pickupNotes: "",
        deliveryDateStart: "",
        deliveryDateEnd: "",
        deliveryTimeEnd: "",
        deliveryName: "",
        deliveryAddress: "",
        deliveryCity: "",
        deliveryState: "",
        deliveryZip: "",
        deliveryNotes: "",
        salesRepName: "",
        dropName: "",
        desiredInvoiceDate: "",
      });
      setCustomerSuggestion(null);
      setCustomerLearnedApplied(false);
      setPickupSuggestion(null);
      setPickupNameSuggestion(null);
      setDeliverySuggestion(null);
      setDeliveryNameSuggestion(null);
      setPickupLearnedApplied(false);
      setDeliveryLearnedApplied(false);
      loadData();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "ORG_NOT_OPERATIONAL") {
        setOperational(false);
        setBlocked({
          message: (error as Error).message || "Finish setup to create loads.",
          ctaHref: (error as { ctaHref?: string }).ctaHref || "/onboarding",
        });
        return;
      }
      setFormError((error as Error).message || "Failed to create load");
    }
  };

  const requestCustomerSuggestion = async () => {
    const rawName = form.customerName.trim();
    if (!rawName) {
      setCustomerSuggestion(null);
      return;
    }
    const queryKey = rawName.toLowerCase();
    if (queryKey === lastCustomerQuery.current) return;
    lastCustomerQuery.current = queryKey;
    try {
      const payload = await apiFetch<{
        suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
      }>("/learning/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "MATCH_CUSTOMER",
          inputJson: { rawCustomerName: rawName },
        }),
      });
      const suggestion = payload.suggestion.suggestionJson as
        | { customerId?: string; customerName?: string }
        | null;
      if (suggestion?.customerId && suggestion?.customerName) {
        setCustomerSuggestion({
          customerId: suggestion.customerId,
          customerName: suggestion.customerName,
          confidence: payload.suggestion.confidence,
        });
      } else {
        setCustomerSuggestion(null);
      }
    } catch {
      setCustomerSuggestion(null);
    }
  };

  const requestAddressSuggestion = async (target: "pickup" | "delivery") => {
    const rawAddress =
      target === "pickup"
        ? [form.pickupAddress, form.pickupCity, form.pickupState, form.pickupZip].filter(Boolean).join(", ")
        : [form.deliveryAddress, form.deliveryCity, form.deliveryState, form.deliveryZip].filter(Boolean).join(", ");
    if (rawAddress.trim().length < 6) {
      if (target === "pickup") setPickupSuggestion(null);
      else setDeliverySuggestion(null);
      return;
    }
    const queryKey = rawAddress.toLowerCase();
    const lastRef = target === "pickup" ? lastPickupQuery : lastDeliveryQuery;
    if (queryKey === lastRef.current) return;
    lastRef.current = queryKey;
    try {
      const payload = await apiFetch<{
        suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
      }>("/learning/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "MATCH_ADDRESS",
          inputJson: { rawAddressString: rawAddress },
        }),
      });
      const suggestion = payload.suggestion.suggestionJson as
        | { normalized?: { address?: string; city?: string; state?: string; zip?: string } }
        | { address?: string; city?: string; state?: string; zip?: string }
        | null;
      const normalized = (suggestion as any)?.normalized ?? suggestion;
      if (normalized?.address || normalized?.city || normalized?.state || normalized?.zip) {
        const nextSuggestion = {
          address: String(normalized.address ?? ""),
          city: String(normalized.city ?? ""),
          state: String(normalized.state ?? ""),
          zip: String(normalized.zip ?? ""),
        };
        if (target === "pickup") setPickupSuggestion(nextSuggestion);
        else setDeliverySuggestion(nextSuggestion);
      } else if (target === "pickup") {
        setPickupSuggestion(null);
      } else {
        setDeliverySuggestion(null);
      }
    } catch {
      if (target === "pickup") setPickupSuggestion(null);
      else setDeliverySuggestion(null);
    }
  };

  const requestStopNameSuggestion = async (target: "pickup" | "delivery") => {
    const rawName = target === "pickup" ? form.pickupName.trim() : form.deliveryName.trim();
    if (!rawName) {
      if (target === "pickup") setPickupNameSuggestion(null);
      else setDeliveryNameSuggestion(null);
      return;
    }
    const queryKey = rawName.toLowerCase();
    const lastRef = target === "pickup" ? lastPickupNameQuery : lastDeliveryNameQuery;
    if (queryKey === lastRef.current) return;
    lastRef.current = queryKey;
    try {
      const payload = await apiFetch<{
        suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
      }>("/learning/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: target === "pickup" ? "MATCH_SHIPPER" : "MATCH_CONSIGNEE",
          inputJson: { rawName },
        }),
      });
      const suggestion = payload.suggestion.suggestionJson as
        | { address?: string; city?: string; state?: string; zip?: string }
        | null;
      if (suggestion?.address || suggestion?.city || suggestion?.state || suggestion?.zip) {
        const nextSuggestion = {
          address: String(suggestion.address ?? ""),
          city: String(suggestion.city ?? ""),
          state: String(suggestion.state ?? ""),
          zip: String(suggestion.zip ?? ""),
        };
        if (target === "pickup") setPickupNameSuggestion(nextSuggestion);
        else setDeliveryNameSuggestion(nextSuggestion);
      } else if (target === "pickup") {
        setPickupNameSuggestion(null);
      } else {
        setDeliveryNameSuggestion(null);
      }
    } catch {
      if (target === "pickup") setPickupNameSuggestion(null);
      else setDeliveryNameSuggestion(null);
    }
  };

  const customers = useMemo(() => {
    const names = loads
      .map((load) => load.customer?.name ?? load.customerName)
      .filter(Boolean) as string[];
    return Array.from(new Set(names)).sort();
  }, [loads]);

  const statusTone = (status: string) => {
    if (status === "PAID" || status === "DELIVERED" || status === "INVOICED") return "success";
    if (status === "IN_TRANSIT") return "info";
    if (status === "READY_TO_INVOICE" || status === "POD_RECEIVED") return "warning";
    if (status === "CANCELLED") return "danger";
    return "neutral";
  };

  const baseLoads = useMemo(() => {
    return loads.map((load) => {
      const opsStatus = deriveOpsStatus(load);
      const billingStatus = deriveBillingStatus(load);
      const docsBlocker = deriveDocsBlocker(load);
      const trackingBadge = deriveTrackingBadge(load);
      const blocker = deriveBlocker(load, docsBlocker, trackingBadge);
      const primaryAction = derivePrimaryAction(load, blocker, trackingBadge, user?.role);
      return { load, opsStatus, billingStatus, docsBlocker, trackingBadge, blocker, primaryAction };
    });
  }, [loads, user?.role]);

  const pickupDateForLoad = (load: any) => {
    return load.shipperApptStart ?? load.shipperApptEnd ?? null;
  };

  const deliveryDateForLoad = (load: any) => {
    return load.consigneeApptStart ?? load.consigneeApptEnd ?? null;
  };

  const withinRange = (value: string | null, from: string, to: string) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  };

  const searchFiltered = useMemo(() => baseLoads, [baseLoads]);

  const chipDefinitions = useMemo(
    () => [
      {
        id: "active",
        label: "Active",
        predicate: (entry: any) => !["INVOICED", "PAID", "CANCELLED"].includes(entry.opsStatus),
      },
      {
        id: "archived",
        label: "Archived",
        predicate: (entry: any) => ["INVOICED", "PAID", "CANCELLED"].includes(entry.opsStatus),
      },
      {
        id: "delivered-unbilled",
        label: "Delivered – Unbilled",
        predicate: (entry: any) =>
          ["DELIVERED", "POD_RECEIVED"].includes(entry.opsStatus) &&
          (entry.docsBlocker !== null || entry.billingStatus !== "INVOICED"),
      },
      {
        id: "ready-to-invoice",
        label: "Ready to invoice",
        predicate: (entry: any) => entry.opsStatus === "READY_TO_INVOICE",
      },
      {
        id: "tracking-off",
        label: "Tracking off",
        predicate: (entry: any) =>
          ["ASSIGNED", "IN_TRANSIT"].includes(entry.opsStatus) && entry.trackingBadge.state === "OFF",
      },
      {
        id: "missing-pod",
        label: "Missing POD",
        predicate: (entry: any) => entry.docsBlocker?.type === "POD_MISSING",
      },
    ],
    []
  );

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    chipDefinitions.forEach((chip) => {
      counts[chip.id] = searchFiltered.filter(chip.predicate).length;
    });
    return counts;
  }, [chipDefinitions, searchFiltered]);

  const filteredLoads = useMemo(() => {
    let result = searchFiltered;
    const activeChipDef = chipDefinitions.find((chip) => chip.id === activeChip);
    if (activeChipDef) {
      result = result.filter(activeChipDef.predicate);
    }
    if (refine.opsStatuses.length > 0) {
      result = result.filter((entry) => refine.opsStatuses.includes(entry.opsStatus));
    }
    if (refine.billingStatuses.length > 0) {
      result = result.filter((entry) =>
        entry.billingStatus ? refine.billingStatuses.includes(entry.billingStatus as BillingStatus) : false
      );
    }
    if (refine.customer) {
      result = result.filter((entry) =>
        (entry.load.customer?.name ?? entry.load.customerName) === refine.customer
      );
    }
    if (refine.driverId) {
      result = result.filter((entry) => entry.load.driver?.id === refine.driverId);
    }
    if (refine.pickupFrom || refine.pickupTo) {
      result = result.filter((entry) =>
        withinRange(pickupDateForLoad(entry.load), refine.pickupFrom, refine.pickupTo)
      );
    }
    if (refine.deliveryFrom || refine.deliveryTo) {
      result = result.filter((entry) =>
        withinRange(deliveryDateForLoad(entry.load), refine.deliveryFrom, refine.deliveryTo)
      );
    }
    if (refine.missingDocsOnly) {
      result = result.filter((entry) => entry.docsBlocker !== null);
    }
    if (refine.trackingOffOnly) {
      result = result.filter((entry) => entry.trackingBadge.state === "OFF");
    }
    return result;
  }, [searchFiltered, activeChip, refine, chipDefinitions]);

  const pagedLoads = filteredLoads;

  const clearFilters = () => {
    setSearchTerm("");
    setActiveChip("active");
    setRefine(defaultRefine);
    setTeamFilterId("");
  };

  return (
    <AppShell title="Loads" subtitle="Create, import, and manage loads">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[color:var(--color-text-muted)]">Exception-first load queue</div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowCreate((prev) => !prev)}>
            {showCreate ? "Close create" : "Create load"}
          </Button>
          {canImport ? (
            <Button variant="secondary" onClick={() => setShowImport((prev) => !prev)}>
              {showImport ? "Hide bulk import" : "Bulk import"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setShowExport((prev) => !prev)}>
            {showExport ? "Hide export" : "Export"}
          </Button>
          <Button variant="ghost" onClick={() => (window.location.href = "/loads/confirmations")}>
            RC Inbox
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr,0.8fr]">
        <div>
          <label htmlFor="loadsSearch" className="sr-only">Search loads</label>
          <Input
            id="loadsSearch"
            placeholder="Search loads, refs, customers, drivers…"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowFilters((prev) => !prev)}>
            {showFilters ? "Hide refine" : "Refine"}
          </Button>
        </div>
      </div>

      <div className="sticky top-4 z-10 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-bg-muted)] px-3 py-2 shadow-[var(--shadow-subtle)]">
        <div className="flex flex-wrap gap-2">
          {chipDefinitions.map((chip) => {
            const active = chip.id === activeChip;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveChip(chip.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)] ${
                  active
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-white"
                    : "border-[color:var(--color-divider)] bg-white text-[color:var(--color-text-muted)]"
                }`}
              >
                {chip.label}
                {chipCounts[chip.id] !== undefined ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]"}`}>
                    {chipCounts[chip.id]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {showImport && canImport ? (
        <Card>
          <SectionHeader title="Bulk import" subtitle="Choose a format and preview before committing." />
          <div className="mt-4 space-y-4">
            <FormField label="Import format" htmlFor="importFormat">
              <Select id="importFormat" value={importMode} onChange={(event) => setImportMode(event.target.value as any)}>
                <option value="legacy">Loads + Stops templates</option>
                <option value="tms_load_sheet">TMS Load Sheet (Standard)</option>
              </Select>
            </FormField>
            {importMode === "legacy" ? <BulkLoadImport onImported={loadData} /> : null}
            {importMode === "tms_load_sheet" ? (
              <ImportWizard
                type="tms_load_sheet"
                title="TMS Load Sheet (Standard)"
                description="Uses the standard TMS load sheet header. Preview shows row-level warnings before commit."
                templateCsv={TMS_LOAD_SHEET_TEMPLATE}
                onImported={() => loadData()}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      {showExport ? (
        <Card className="space-y-4">
          <SectionHeader title="Export loads" subtitle="Download a CSV for the current view or a date range." />
          {exportError ? (
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/80 px-3 py-2 text-sm text-[color:var(--color-danger)]">
              {exportError}
            </div>
          ) : null}
          {exportPreviewError ? (
            <div className="rounded-[var(--radius-card)] border border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-soft)]/80 px-3 py-2 text-sm text-[color:var(--color-warning)]">
              {exportPreviewError}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => downloadExport(buildParams({ includeChip: true }))} disabled={exporting}>
              {exporting ? "Exporting..." : "Export current view"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadExport(buildParams({ includeChip: true, format: "tms_load_sheet" }))}
              disabled={exporting}
            >
              Export TMS Load Sheet
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadExport(buildParams({ includeChip: true, rangeDays: 7 }))}
              disabled={exporting}
            >
              Last 7 days
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadExport(buildParams({ includeChip: true, rangeDays: 14 }))}
              disabled={exporting}
            >
              Last 14 days
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                previewExport(
                  buildParams({
                    includeChip: true,
                    fromDate: exportFrom || undefined,
                    toDate: exportTo || undefined,
                  })
                )
              }
              disabled={exportPreviewLoading}
            >
              {exportPreviewLoading ? "Checking..." : "Preview count"}
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr,1fr,auto]">
            <FormField label="From date" htmlFor="exportFrom">
              <Input type="date" value={exportFrom} onChange={(event) => setExportFrom(event.target.value)} />
            </FormField>
            <FormField label="To date" htmlFor="exportTo">
              <Input type="date" value={exportTo} onChange={(event) => setExportTo(event.target.value)} />
            </FormField>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                downloadExport(
                  buildParams({
                    includeChip: true,
                    fromDate: exportFrom || undefined,
                    toDate: exportTo || undefined,
                  })
                )
              }
              disabled={exporting || (!exportFrom && !exportTo)}
            >
              Export range
            </Button>
          </div>
          {exportPreviewCount !== null ? (
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Estimated rows: {exportPreviewCount}
              {exportPreviewMax ? ` (max ${exportPreviewMax})` : ""}
              {exportPreviewMax && exportPreviewCount > exportPreviewMax ? " · Too many rows — narrow your filters." : ""}
            </div>
          ) : null}
        </Card>
      ) : null}

      {showCreate ? (
        blocked || operational === false ? (
          <BlockedScreen
            isAdmin={user?.role === "ADMIN"}
            description={user?.role === "ADMIN" ? blocked?.message || "Finish setup to create loads." : undefined}
            ctaHref={user?.role === "ADMIN" ? blocked?.ctaHref || "/onboarding" : undefined}
          />
        ) : (
          <Card className="space-y-4">
            <SectionHeader title="Create load" subtitle="TMS Load Sheet standard" />
            {formError ? (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/80 px-3 py-2 text-sm text-[color:var(--color-danger)]">
                {formError}
              </div>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-3">
              <FormField label="Load" htmlFor="loadNumber">
                <Input
                  placeholder="Auto"
                  value={form.loadNumber}
                  onChange={(e) => setForm({ ...form, loadNumber: e.target.value })}
                />
              </FormField>
              <FormField label="Trip number" htmlFor="tripNumber">
                <Input
                  placeholder="Auto"
                  value={form.tripNumber}
                  onChange={(e) => setForm({ ...form, tripNumber: e.target.value })}
                />
              </FormField>
              <FormField label="Status" htmlFor="status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="DRAFT">Draft</option>
                  <option value="PLANNED">Planned</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_TRANSIT">In transit</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="POD_RECEIVED">POD received</option>
                  <option value="READY_TO_INVOICE">Ready to invoice</option>
                  <option value="INVOICED">Invoiced</option>
                  <option value="PAID">Paid</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </FormField>
              <FormField label="Load type" htmlFor="loadType">
                <Select value={form.loadType} onChange={(e) => setForm({ ...form, loadType: e.target.value })}>
                  <option value="COMPANY">Company load</option>
                  <option value="BROKERED">Brokered load</option>
                </Select>
              </FormField>
              <FormField label="Operating entity" htmlFor="operatingEntity">
                {operatingEntities.length > 0 ? (
                  <Select
                    value={form.operatingEntityId}
                    onChange={(e) => setForm({ ...form, operatingEntityId: e.target.value })}
                  >
                    {operatingEntities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name} {entity.isDefault ? "· Default" : ""}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input disabled placeholder="Default operating entity" value="Default operating entity" />
                )}
              </FormField>
              <FormField label={form.loadType === "BROKERED" ? "Broker" : "Customer"} htmlFor="customerName" required>
                <Input
                  placeholder={form.loadType === "BROKERED" ? "Acme Brokerage" : "Acme Logistics"}
                  value={form.customerName}
                  onChange={(e) => {
                    setForm({ ...form, customerName: e.target.value, customerId: "" });
                    setCustomerLearnedApplied(false);
                    setCustomerSuggestion(null);
                  }}
                  onBlur={requestCustomerSuggestion}
                />
              </FormField>
              <FormField label="Cust Ref" htmlFor="customerRef">
                <Input
                  placeholder="PO-12345"
                  value={form.customerRef}
                  onChange={(e) => setForm({ ...form, customerRef: e.target.value })}
                />
              </FormField>
              <FormField label="Unit" htmlFor="unit">
                <Input
                  placeholder="TRK-12"
                  value={form.truckUnit}
                  onChange={(e) => setForm({ ...form, truckUnit: e.target.value })}
                />
              </FormField>
              <FormField label="Trailer" htmlFor="trailer">
                <Input
                  placeholder="TRL-08"
                  value={form.trailerUnit}
                  onChange={(e) => setForm({ ...form, trailerUnit: e.target.value })}
                />
              </FormField>
              <FormField label="As Wgt (lbs)" htmlFor="weight">
                <Input
                  placeholder="40000"
                  value={form.weightLbs}
                  onChange={(e) => setForm({ ...form, weightLbs: e.target.value })}
                />
              </FormField>
              <FormField label="Total Rev" htmlFor="rate">
                <Input
                  placeholder="2150"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                />
              </FormField>
              <FormField label="Miles" htmlFor="miles">
                <Input
                  placeholder="1200"
                  value={form.miles}
                  onChange={(e) => setForm({ ...form, miles: e.target.value })}
                />
              </FormField>
              <FormField label="Sales" htmlFor="sales">
                <Input
                  placeholder="Alex Martinez"
                  value={form.salesRepName}
                  onChange={(e) => setForm({ ...form, salesRepName: e.target.value })}
                />
              </FormField>
              <FormField label="Drop name" htmlFor="dropName">
                <Input
                  placeholder="Walmart Dock 12"
                  value={form.dropName}
                  onChange={(e) => setForm({ ...form, dropName: e.target.value })}
                />
              </FormField>
              <FormField label="Inv Date" htmlFor="invDate">
                <Input
                  type="date"
                  value={form.desiredInvoiceDate}
                  onChange={(e) => setForm({ ...form, desiredInvoiceDate: e.target.value })}
                />
              </FormField>
            </div>
            {customerSuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>Suggested customer: {customerSuggestion.customerName}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      customerName: customerSuggestion.customerName,
                      customerId: customerSuggestion.customerId,
                    }));
                    setCustomerLearnedApplied(true);
                    setCustomerSuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            {customerLearnedApplied ? (
              <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                Customer filled from learned mapping.
              </div>
            ) : null}
            <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                Shipper (Pickup)
              </div>
              {pickupLearnedApplied ? (
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <FormField label="PU Date F" htmlFor="puDate">
                <Input
                  type="date"
                  value={form.pickupDate}
                  onChange={(e) => setForm({ ...form, pickupDate: e.target.value })}
                />
              </FormField>
              <FormField label="PU Time F" htmlFor="puTimeF">
                <Input
                  type="time"
                  value={form.pickupTimeStart}
                  onChange={(e) => setForm({ ...form, pickupTimeStart: e.target.value })}
                />
              </FormField>
              <FormField label="PU Time T" htmlFor="puTimeT">
                <Input
                  type="time"
                  value={form.pickupTimeEnd}
                  onChange={(e) => setForm({ ...form, pickupTimeEnd: e.target.value })}
                />
              </FormField>
              <FormField label="Shipper" htmlFor="shipperName" required>
                <Input
                  placeholder="Fontana Yard"
                  value={form.pickupName}
                  onChange={(e) => {
                    setForm({ ...form, pickupName: e.target.value });
                    setPickupLearnedApplied(false);
                    setPickupNameSuggestion(null);
                  }}
                  onBlur={() => requestStopNameSuggestion("pickup")}
                />
              </FormField>
              <FormField label="Ship City" htmlFor="shipCity" required>
                <Input
                  placeholder="Fontana"
                  value={form.pickupCity}
                  onChange={(e) => {
                    setForm({ ...form, pickupCity: e.target.value });
                    setPickupLearnedApplied(false);
                    setPickupSuggestion(null);
                  }}
                  onBlur={() => requestAddressSuggestion("pickup")}
                />
              </FormField>
              <FormField label="Ship St" htmlFor="shipState" required>
                <Input
                  placeholder="CA"
                  value={form.pickupState}
                  onChange={(e) => {
                    setForm({ ...form, pickupState: e.target.value });
                    setPickupLearnedApplied(false);
                    setPickupSuggestion(null);
                  }}
                  onBlur={() => requestAddressSuggestion("pickup")}
                />
              </FormField>
            </div>
            {showStopDetails ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Shipper address" htmlFor="shipperAddress">
                  <Input
                    placeholder="14300 Slover Ave"
                    value={form.pickupAddress}
                    onChange={(e) => {
                      setForm({ ...form, pickupAddress: e.target.value });
                      setPickupLearnedApplied(false);
                      setPickupSuggestion(null);
                    }}
                    onBlur={() => requestAddressSuggestion("pickup")}
                  />
                </FormField>
                <FormField label="Shipper zip" htmlFor="shipperZip">
                  <Input
                    placeholder="92335"
                    value={form.pickupZip}
                    onChange={(e) => {
                      setForm({ ...form, pickupZip: e.target.value });
                      setPickupLearnedApplied(false);
                      setPickupSuggestion(null);
                    }}
                    onBlur={() => requestAddressSuggestion("pickup")}
                  />
                </FormField>
              </div>
            ) : null}
            <FormField label="Load Notes (Shipper)" htmlFor="shipperNotes">
              <Textarea
                rows={2}
                placeholder="Dock notes, appointment info, access instructions"
                value={form.pickupNotes}
                onChange={(e) => setForm({ ...form, pickupNotes: e.target.value })}
              />
            </FormField>
            {showStopDetails && pickupNameSuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>
                  Suggested address for shipper: {pickupNameSuggestion.address} {pickupNameSuggestion.city} {pickupNameSuggestion.state} {pickupNameSuggestion.zip}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      pickupAddress: pickupNameSuggestion.address,
                      pickupCity: pickupNameSuggestion.city,
                      pickupState: pickupNameSuggestion.state,
                      pickupZip: pickupNameSuggestion.zip,
                    }));
                    setPickupLearnedApplied(true);
                    setPickupNameSuggestion(null);
                    setPickupSuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            {showStopDetails && pickupSuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>
                  Suggested address: {pickupSuggestion.address} {pickupSuggestion.city} {pickupSuggestion.state} {pickupSuggestion.zip}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      pickupAddress: pickupSuggestion.address,
                      pickupCity: pickupSuggestion.city,
                      pickupState: pickupSuggestion.state,
                      pickupZip: pickupSuggestion.zip,
                    }));
                    setPickupLearnedApplied(true);
                    setPickupSuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            </div>
            <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                Consignee (Delivery)
              </div>
              {deliveryLearnedApplied ? (
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
              ) : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <FormField label="Del Date F" htmlFor="delDateF">
                <Input
                  type="date"
                  value={form.deliveryDateStart}
                  onChange={(e) => setForm({ ...form, deliveryDateStart: e.target.value })}
                />
              </FormField>
              <FormField label="Del Date T" htmlFor="delDateT">
                <Input
                  type="date"
                  value={form.deliveryDateEnd}
                  onChange={(e) => setForm({ ...form, deliveryDateEnd: e.target.value })}
                />
              </FormField>
              <FormField label="Del Time T" htmlFor="delTimeT">
                <Input
                  type="time"
                  value={form.deliveryTimeEnd}
                  onChange={(e) => setForm({ ...form, deliveryTimeEnd: e.target.value })}
                />
              </FormField>
              <FormField label="Consignee" htmlFor="consigneeName" required>
                <Input
                  placeholder="Home Goods Wholesale Dock"
                  value={form.deliveryName}
                  onChange={(e) => {
                    setForm({ ...form, deliveryName: e.target.value });
                    setDeliveryLearnedApplied(false);
                    setDeliveryNameSuggestion(null);
                  }}
                  onBlur={() => requestStopNameSuggestion("delivery")}
                />
              </FormField>
              <FormField label="Cons City" htmlFor="consCity" required>
                <Input
                  placeholder="Indianapolis"
                  value={form.deliveryCity}
                  onChange={(e) => {
                    setForm({ ...form, deliveryCity: e.target.value });
                    setDeliveryLearnedApplied(false);
                    setDeliverySuggestion(null);
                  }}
                  onBlur={() => requestAddressSuggestion("delivery")}
                />
              </FormField>
              <FormField label="Cons St" htmlFor="consState" required>
                <Input
                  placeholder="IN"
                  value={form.deliveryState}
                  onChange={(e) => {
                    setForm({ ...form, deliveryState: e.target.value });
                    setDeliveryLearnedApplied(false);
                    setDeliverySuggestion(null);
                  }}
                  onBlur={() => requestAddressSuggestion("delivery")}
                />
              </FormField>
            </div>
            {showStopDetails ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <FormField label="Consignee address" htmlFor="consigneeAddress">
                  <Input
                    placeholder="6020 E 82nd St"
                    value={form.deliveryAddress}
                    onChange={(e) => {
                      setForm({ ...form, deliveryAddress: e.target.value });
                      setDeliveryLearnedApplied(false);
                      setDeliverySuggestion(null);
                    }}
                    onBlur={() => requestAddressSuggestion("delivery")}
                  />
                </FormField>
                <FormField label="Consignee zip" htmlFor="consigneeZip">
                  <Input
                    placeholder="46219"
                    value={form.deliveryZip}
                    onChange={(e) => {
                      setForm({ ...form, deliveryZip: e.target.value });
                      setDeliveryLearnedApplied(false);
                      setDeliverySuggestion(null);
                    }}
                    onBlur={() => requestAddressSuggestion("delivery")}
                  />
                </FormField>
              </div>
            ) : null}
            <FormField label="Load Notes (Consignee)" htmlFor="consigneeNotes">
              <Textarea
                rows={2}
                placeholder="Delivery notes, access instructions, appointment details"
                value={form.deliveryNotes}
                onChange={(e) => setForm({ ...form, deliveryNotes: e.target.value })}
              />
            </FormField>
            {showStopDetails && deliveryNameSuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>
                  Suggested address for consignee: {deliveryNameSuggestion.address} {deliveryNameSuggestion.city} {deliveryNameSuggestion.state} {deliveryNameSuggestion.zip}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      deliveryAddress: deliveryNameSuggestion.address,
                      deliveryCity: deliveryNameSuggestion.city,
                      deliveryState: deliveryNameSuggestion.state,
                      deliveryZip: deliveryNameSuggestion.zip,
                    }));
                    setDeliveryLearnedApplied(true);
                    setDeliveryNameSuggestion(null);
                    setDeliverySuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            {showStopDetails && deliverySuggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Learned</Badge>
                <span>
                  Suggested address: {deliverySuggestion.address} {deliverySuggestion.city} {deliverySuggestion.state} {deliverySuggestion.zip}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      deliveryAddress: deliverySuggestion.address,
                      deliveryCity: deliverySuggestion.city,
                      deliveryState: deliverySuggestion.state,
                      deliveryZip: deliverySuggestion.zip,
                    }));
                    setDeliveryLearnedApplied(true);
                    setDeliverySuggestion(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            ) : null}
            </div>
            <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-border)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
              <span>Stop address details (optional)</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowStopDetails((prev) => !prev)}
              >
                {showStopDetails ? "Hide address details" : "Add address details"}
              </Button>
            </div>
            <Button onClick={handleCreate}>Create load</Button>
          </Card>
        )
      ) : null}

      {showFilters ? (
        <RefinePanel>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Ops status</div>
              <div className="grid gap-2 text-sm">
                {OPS_STATUSES.map((status) => (
                  <CheckboxField
                    key={status}
                    id={`opsStatus-${status}`}
                    label={status.replaceAll("_", " ")}
                    checked={refine.opsStatuses.includes(status)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...refine.opsStatuses, status]
                        : refine.opsStatuses.filter((value) => value !== status);
                      setRefine({ ...refine, opsStatuses: next });
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Billing status</div>
              <div className="grid gap-2 text-sm">
                {BILLING_STATUSES.map((status) => (
                  <CheckboxField
                    key={status}
                    id={`billingStatus-${status}`}
                    label={status.replaceAll("_", " ")}
                    checked={refine.billingStatuses.includes(status)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...refine.billingStatuses, status]
                        : refine.billingStatuses.filter((value) => value !== status);
                      setRefine({ ...refine, billingStatuses: next });
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <FormField label="Customer" htmlFor="refineCustomer">
                <Select
                  value={refine.customer}
                  onChange={(event) => setRefine({ ...refine, customer: event.target.value })}
                >
                  <option value="">All customers</option>
                  {customers.map((customer) => (
                    <option key={customer} value={customer}>
                      {customer}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            {canSeeAllTeams ? (
              <div className="space-y-2">
                <FormField label="Team" htmlFor="refineTeam">
                  <Select value={teamFilterId} onChange={(event) => setTeamFilterId(event.target.value)}>
                    <option value="">All teams</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <FormField label="Driver" htmlFor="refineDriver">
                <Select
                  value={refine.driverId}
                  onChange={(event) => setRefine({ ...refine, driverId: event.target.value })}
                >
                  <option value="">All drivers</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Pickup range</div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="From" htmlFor="pickupFrom">
                  <Input
                    type="date"
                    value={refine.pickupFrom}
                    onChange={(event) => setRefine({ ...refine, pickupFrom: event.target.value })}
                  />
                </FormField>
                <FormField label="To" htmlFor="pickupTo">
                  <Input
                    type="date"
                    value={refine.pickupTo}
                    onChange={(event) => setRefine({ ...refine, pickupTo: event.target.value })}
                  />
                </FormField>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Delivery range</div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="From" htmlFor="deliveryFrom">
                  <Input
                    type="date"
                    value={refine.deliveryFrom}
                    onChange={(event) => setRefine({ ...refine, deliveryFrom: event.target.value })}
                  />
                </FormField>
                <FormField label="To" htmlFor="deliveryTo">
                  <Input
                    type="date"
                    value={refine.deliveryTo}
                    onChange={(event) => setRefine({ ...refine, deliveryTo: event.target.value })}
                  />
                </FormField>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <CheckboxField
              id="missingDocsOnly"
              label="Missing docs only"
              checked={refine.missingDocsOnly}
              onChange={(event) => setRefine({ ...refine, missingDocsOnly: event.target.checked })}
            />
            <CheckboxField
              id="trackingOffOnly"
              label="Tracking off only"
              checked={refine.trackingOffOnly}
              onChange={(event) => setRefine({ ...refine, trackingOffOnly: event.target.checked })}
            />
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-[color:var(--color-text-muted)]">
              More filters
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <FormField label="Destination search" htmlFor="destSearch">
                <Input
                  placeholder="City, state, zip, or name"
                  value={refine.destSearch}
                  onChange={(event) => setRefine({ ...refine, destSearch: event.target.value })}
                />
              </FormField>
              <FormField label="Min rate" htmlFor="minRate">
                <Input
                  placeholder="1000"
                  value={refine.minRate}
                  onChange={(event) => setRefine({ ...refine, minRate: event.target.value })}
                />
              </FormField>
              <FormField label="Max rate" htmlFor="maxRate">
                <Input
                  placeholder="5000"
                  value={refine.maxRate}
                  onChange={(event) => setRefine({ ...refine, maxRate: event.target.value })}
                />
              </FormField>
            </div>
          </details>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={loadData}>
              Apply
            </Button>
            <Button size="sm" variant="secondary" onClick={clearFilters}>
              Reset
            </Button>
          </div>
        </RefinePanel>
      ) : null}

      {loads.length === 0 ? (
        <EmptyState
          title="Create your first load"
          description="Start with a manual load or import your existing CSVs."
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setShowCreate(true)}>Create load</Button>
              {canImport ? <Button variant="secondary" onClick={() => setShowImport(true)}>Bulk import</Button> : null}
              <Button variant="ghost" onClick={() => (window.location.href = "/loads/confirmations")}>RC Inbox</Button>
            </div>
          }
        />
      ) : filteredLoads.length === 0 ? (
        <EmptyState
          title={activeChip === "archived" ? "No archived loads in this range" : "No loads match these filters"}
          description={
            activeChip === "archived"
              ? "Switch back to Active loads or widen your date range to see more."
              : "Try a different chip or clear filters to see more loads."
          }
          action={
            <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {pagedLoads.map(({ load, opsStatus, billingStatus, trackingBadge, blocker, primaryAction }) => {
            const routeLeft =
              load.shipperCity && load.shipperState
                ? `${load.shipperCity}, ${load.shipperState}`
                : load.shipperName ?? "Shipper";
            const routeRight =
              load.consigneeCity && load.consigneeState
                ? `${load.consigneeCity}, ${load.consigneeState}`
                : load.consigneeName ?? "Consignee";
            const trackingText = trackingBadge.state === "ON"
              ? `Tracking ON${trackingBadge.lastPingAge ? ` · last ping ${trackingBadge.lastPingAge}` : ""}`
              : `Tracking OFF${trackingBadge.lastPingAge ? ` · last ping ${trackingBadge.lastPingAge}` : ""}`;
            const blockerTone =
              blocker?.severity === "danger"
                ? "border-l-[color:var(--color-danger)]"
                : blocker?.severity === "warning"
                  ? "border-l-[color:var(--color-warning)]"
                  : blocker?.severity === "info"
                    ? "border-l-[color:var(--color-info)]"
                    : "";
            const bannerTone =
              blocker?.severity === "danger"
                ? "border-[color:var(--color-danger)] bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]"
                : blocker?.severity === "warning"
                  ? "border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
                  : blocker?.severity === "info"
                    ? "border-[color:var(--color-info)] bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]"
                    : "border-transparent";
            return (
              <div
                key={load.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/loads/${load.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/loads/${load.id}`);
                  }
                }}
                className={`rounded-[var(--radius-card)] border border-[color:var(--color-divider)] border-l-4 ${blockerTone} bg-white px-4 py-4 shadow-[var(--shadow-subtle)] transition hover:translate-y-[-1px] hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-ink">LOAD {load.loadNumber}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip label={opsStatus} tone={statusTone(opsStatus)} />
                    {billingStatus ? (
                      <StatusChip
                        label={billingStatus.replaceAll("_", " ")}
                        tone={
                          billingStatus === "INVOICED" || billingStatus === "PAID"
                            ? "success"
                            : billingStatus === "READY_TO_INVOICE"
                            ? "warning"
                            : "neutral"
                        }
                      />
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                  {routeLeft} → {routeRight} • {load.customer?.name ?? load.customerName ?? "Customer"}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--color-text-muted)]">
                  <div>Driver: {load.driver?.name ?? "Unassigned"}</div>
                  {load.miles ? <div>Miles: {load.miles}</div> : null}
                  {load.rate ? <div>Rate: {load.rate}</div> : null}
                  <div>{trackingText}</div>
                </div>
                {blocker ? (
                  <div
                    className={`mt-3 rounded-[var(--radius-control)] border px-3 py-2 text-xs font-medium leading-snug ${bannerTone}`}
                  >
                    {blocker.title}
                    {blocker.subtitle ? ` • ${blocker.subtitle}` : ""}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <Button
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(primaryAction.href);
                    }}
                  >
                    {primaryAction.label}
                  </Button>
                  <details
                    className="relative"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <summary className="cursor-pointer list-none rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-xs text-[color:var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]">
                      •••
                    </summary>
                    <div className="absolute right-0 mt-2 w-40 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-2 text-xs shadow-[var(--shadow-card)]">
                      <button
                        className="w-full rounded-[var(--radius-control)] px-2 py-2 text-left text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                        onClick={() => router.push(`/loads/${load.id}`)}
                      >
                        View details
                      </button>
                      <button
                        className="mt-1 w-full rounded-[var(--radius-control)] px-2 py-2 text-left text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                        onClick={() => router.push(`/loads/${load.id}`)}
                      >
                        Edit load
                      </button>
                      <button
                        className="mt-1 w-full rounded-[var(--radius-control)] px-2 py-2 text-left text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                        onClick={() => router.push(`/loads/${load.id}`)}
                      >
                        Upload doc
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Page {pageIndex + 1} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={pageIndex === 0}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
                disabled={pageIndex >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
```

## E) Screen: Load details
- Page path: `apps/web/app/loads/[id]/page.tsx`
- Local components from same folder: None
- Data loading: `/loads/:id`, `/loads/:id/timeline`, `/tracking/load/:id/latest`, `/auth/me`, `/api/operating-entities` (affect tabs/actions/blockers)

### Component tree (approx.)
```text
LoadDetailsPage
├─ AppShell (title/subtitle)
│  ├─ Header / summary card (load number, status, actions)
│  ├─ SegmentedControl tabs (Overview / Documents / Billing / Audit)
│  ├─ Overview tab
│  │  ├─ BlockerCard(s)
│  │  ├─ Stops list + status chips
│  │  ├─ Tracking card
│  │  └─ Freight details card (edit)
│  ├─ Documents tab
│  │  ├─ Checklist / required docs
│  │  └─ Upload panel + doc list
│  ├─ Billing tab
│  │  ├─ Charges list + add/edit
│  │  └─ Invoice section
│  └─ Audit tab
│     └─ Timeline
```

### Page component code (`apps/web/app/loads/[id]/page.tsx`)
```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { CheckboxField } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusChip } from "@/components/ui/status-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { Timeline } from "@/components/ui/timeline";
import { BlockerCard } from "@/components/ui/blocker-card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { formatDocStatusLabel, formatInvoiceStatusLabel, formatStatusLabel } from "@/lib/status-format";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const DOC_TYPES = ["POD", "RATECON", "BOL", "LUMPER", "SCALE", "DETENTION", "OTHER"] as const;
const CHARGE_TYPES = ["LINEHAUL", "LUMPER", "DETENTION", "LAYOVER", "OTHER", "ADJUSTMENT"] as const;
const CHARGE_LABELS: Record<string, string> = {
  LINEHAUL: "Linehaul",
  LUMPER: "Lumper",
  DETENTION: "Detention",
  LAYOVER: "Layover",
  OTHER: "Other",
  ADJUSTMENT: "Adjustment",
};

const TIMELINE_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "PLANNED", label: "Planned" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "IN_TRANSIT", label: "In Transit" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "POD_RECEIVED", label: "POD Received" },
  { key: "READY_TO_INVOICE", label: "Ready to Invoice" },
  { key: "INVOICED", label: "Invoiced" },
  { key: "PAID", label: "Paid" },
];

export default function LoadDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadId = params?.id as string | undefined;
  const [load, setLoad] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [tracking, setTracking] = useState<{ session: any | null; ping: any | null } | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [operatingEntities, setOperatingEntities] = useState<any[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "billing" | "audit">("overview");
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [docChecklist, setDocChecklist] = useState<Record<string, any>>({});
  const [docRejectReasons, setDocRejectReasons] = useState<Record<string, string>>({});
  const [uploadType, setUploadType] = useState<string>("POD");
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [freightEditing, setFreightEditing] = useState(false);
  const [freightSaving, setFreightSaving] = useState(false);
  const [charges, setCharges] = useState<any[]>([]);
  const [chargeForm, setChargeForm] = useState({
    type: "LINEHAUL",
    description: "",
    amount: "",
  });
  const [chargeEditingId, setChargeEditingId] = useState<string | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeSaving, setChargeSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chargeSuggestion, setChargeSuggestion] = useState<{
    type?: string;
    amountCents?: number;
    avgAmountCents?: number;
    minAmountCents?: number;
    maxAmountCents?: number;
  } | null>(null);
  const lastChargeQuery = useRef("");
  const [freightForm, setFreightForm] = useState({
    loadType: "COMPANY",
    operatingEntityId: "",
    shipperReferenceNumber: "",
    consigneeReferenceNumber: "",
    palletCount: "",
    weightLbs: "",
  });
  const tabParam = searchParams?.get("tab");
  const docTypeParam = searchParams?.get("docType");

  const loadData = useCallback(async () => {
    if (!loadId) return;
    try {
      const [loadData, timelineData, trackingData, meData, chargesData] = await Promise.all([
        apiFetch<{ load: any; settings: any | null }>(`/loads/${loadId}`),
        apiFetch<{ load: any; timeline: any[] }>(`/loads/${loadId}/timeline`),
        apiFetch<{ session: any | null; ping: any | null }>(`/tracking/load/${loadId}/latest`),
        apiFetch<{ user: any }>("/auth/me"),
        apiFetch<{ charges: any[] }>(`/loads/${loadId}/charges`),
      ]);
      setLoad(loadData.load);
      setSettings(loadData.settings ?? null);
      setTimeline(timelineData.timeline ?? []);
      setTracking(trackingData);
      setUser(meData.user);
      setCharges(chargesData.charges ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [loadId]);

  const handleDeleteLoad = async () => {
    if (!loadId) return;
    setDeleteError(null);
    const reason = window.prompt("Reason for deleting this load? This action is permanent in the UI.");
    if (!reason || !reason.trim()) {
      setDeleteError("Delete reason is required.");
      return;
    }
    setDeleting(true);
    try {
      await apiFetch(`/loads/${loadId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      router.push("/loads");
    } catch (err) {
      setDeleteError((err as Error).message || "Failed to delete load.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const description = chargeForm.description.trim();
    if (!description || !load?.id) {
      setChargeSuggestion(null);
      return;
    }
    const queryKey = `${load.customerId ?? "org"}::${description.toLowerCase()}`;
    if (queryKey === lastChargeQuery.current) return;
    const timeout = setTimeout(async () => {
      lastChargeQuery.current = queryKey;
      try {
        const payload = await apiFetch<{
          suggestion: { suggestionJson: Record<string, unknown> | null; confidence: number; reason: string[] };
        }>("/learning/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: "CHARGE_SUGGESTION",
            inputJson: { description, customerId: load.customerId ?? null },
          }),
        });
        const suggestion = payload.suggestion.suggestionJson as
          | { type?: string; amountCents?: number; avgAmountCents?: number; minAmountCents?: number; maxAmountCents?: number }
          | null;
        if (suggestion?.type) {
          setChargeSuggestion(suggestion);
        } else {
          setChargeSuggestion(null);
        }
      } catch {
        setChargeSuggestion(null);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [chargeForm.description, load?.customerId, load?.id]);

  useEffect(() => {
    if (!tabParam) {
      setActiveTab("overview");
      return;
    }
    if (tabParam === "overview" || tabParam === "documents" || tabParam === "billing" || tabParam === "audit") {
      setActiveTab(tabParam);
      return;
    }
    if (tabParam === "stops") {
      setActiveTab("overview");
      setPendingAnchor("stops");
      return;
    }
    setActiveTab("overview");
  }, [tabParam]);

  useEffect(() => {
    if (pendingAnchor) {
      const target = document.getElementById(pendingAnchor);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        setPendingAnchor(null);
      }
      return;
    }
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeTab, pendingAnchor, loadId, load?.docs?.length]);

  const docTypeOptions = useMemo(() => {
    if (load?.loadType === "COMPANY") {
      return DOC_TYPES.filter((type) => type !== "RATECON");
    }
    return DOC_TYPES;
  }, [load?.loadType]);

  useEffect(() => {
    if (!docTypeParam) return;
    if (docTypeOptions.includes(docTypeParam as (typeof DOC_TYPES)[number])) {
      setUploadType(docTypeParam);
    }
  }, [docTypeParam, docTypeOptions]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    apiFetch<{ entities: any[] }>("/api/operating-entities")
      .then((data) => setOperatingEntities(data.entities))
      .catch(() => setOperatingEntities([]));
  }, [user]);

  useEffect(() => {
    if (!load || freightEditing) return;
    setFreightForm({
      loadType: load.loadType ?? "COMPANY",
      operatingEntityId: load.operatingEntityId ?? "",
      shipperReferenceNumber: load.shipperReferenceNumber ?? "",
      consigneeReferenceNumber: load.consigneeReferenceNumber ?? "",
      palletCount: load.palletCount !== null && load.palletCount !== undefined ? String(load.palletCount) : "",
      weightLbs: load.weightLbs !== null && load.weightLbs !== undefined ? String(load.weightLbs) : "",
    });
  }, [load, freightEditing]);

  const podDocs = useMemo(() => load?.docs?.filter((doc: any) => doc.type === "POD") ?? [], [load?.docs]);
  const docCount = load?.docs?.length ?? 0;
  const podStatus = useMemo(() => {
    if (podDocs.length === 0) return "Missing";
    if (podDocs.some((doc: any) => doc.status === "REJECTED")) return "Rejected";
    if (podDocs.some((doc: any) => doc.status === "VERIFIED")) return "Verified";
    return "Uploaded";
  }, [podDocs]);
  const rateConRequired = Boolean(settings?.requireRateConBeforeDispatch && load?.loadType === "BROKERED");
  const hasRateCon = useMemo(
    () => (load?.docs ?? []).some((doc: any) => doc.type === "RATECON"),
    [load?.docs]
  );
  const dispatchStage =
    load?.status && ["DRAFT", "PLANNED", "ASSIGNED"].includes(load.status);
  const rateConMissing = dispatchStage && rateConRequired && !hasRateCon;
  const assignmentMissing = dispatchStage && (!load?.assignedDriverId || !load?.truckId);
  const documentsIndicator = podStatus === "Verified" ? "OK" : podStatus === "Rejected" ? "X" : "!";
  const docsBlocker = useMemo(() => {
    if (load?.status === "READY_TO_INVOICE" || load?.status === "INVOICED" || load?.status === "PAID") return null;
    if (load?.status !== "DELIVERED" && load?.status !== "POD_RECEIVED") return null;
    if (podStatus === "Rejected") {
      return { type: "DOCS_REJECTED", title: "Docs rejected", subtitle: "Billing blocked" };
    }
    if (podStatus === "Uploaded") {
      return { type: "DOCS_UNDER_REVIEW", title: "POD under review", subtitle: "Billing blocked" };
    }
    if (podStatus === "Missing") {
      return { type: "POD_MISSING", title: "POD missing", subtitle: "Billing blocked" };
    }
    return null;
  }, [load?.status, podStatus]);

  const shipperStop = load?.stops?.find((stop: any) => stop.type === "PICKUP");
  const consigneeStop = load?.stops?.find((stop: any) => stop.type === "DELIVERY");

  const linehaulRateNumber = load?.rate ? Number(load.rate) : null;
  const linehaulCentsFromRate = linehaulRateNumber !== null && !Number.isNaN(linehaulRateNumber)
    ? Math.round(linehaulRateNumber * 100)
    : null;
  const hasStoredLinehaul = charges.some((charge) => charge.type === "LINEHAUL");
  const impliedLinehaul =
    !hasStoredLinehaul && linehaulCentsFromRate !== null
      ? {
          id: "implied-linehaul",
          type: "LINEHAUL",
          description: "Linehaul (from load rate)",
          amountCents: linehaulCentsFromRate,
          implied: true,
        }
      : null;
  const displayCharges = impliedLinehaul ? [impliedLinehaul, ...charges] : charges;
  const chargesTotalCents = displayCharges.reduce((sum, charge) => sum + (charge.amountCents ?? 0), 0);

  const openDoc = (doc: any) => {
    const name = doc.filename?.split("/").pop();
    if (!name) return;
    window.open(`${API_BASE}/files/docs/${name}`, "_blank");
  };

  const verifyDoc = async (docId: string) => {
    const checklist = docChecklist[docId] || { signature: true, printed: true, date: true, pages: 1 };
    await apiFetch(`/docs/${docId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requireSignature: Boolean(checklist.signature),
        requirePrintedName: Boolean(checklist.printed),
        requireDeliveryDate: Boolean(checklist.date),
        pages: Number(checklist.pages || 1),
      }),
    });
    loadData();
  };

  const rejectDoc = async (docId: string) => {
    const reason = docRejectReasons[docId];
    if (!reason) return;
    await apiFetch(`/docs/${docId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectReason: reason }),
    });
    loadData();
  };

  const uploadDoc = async (file: File) => {
    if (!loadId) return;
    setUploading(true);
    setUploadNote(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", uploadType);
      await apiFetch(`/loads/${loadId}/docs`, { method: "POST", body });
      setUploadNote("Document uploaded.");
      loadData();
    } catch (err) {
      setUploadNote((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const canEditCharges = user?.role === "ADMIN" || user?.role === "DISPATCHER";
  const canViewCharges = user?.role === "ADMIN" || user?.role === "DISPATCHER" || user?.role === "BILLING";

  const formatAmount = (cents: number) => (cents / 100).toFixed(2);
  const parseAmountToCents = (value: string) => {
    const normalized = value.replace(/[^0-9.-]/g, "");
    if (!normalized) return null;
    const amount = Number(normalized);
    if (Number.isNaN(amount)) return null;
    return Math.round(amount * 100);
  };

  const resetChargeForm = () => {
    setChargeForm({ type: "LINEHAUL", description: "", amount: "" });
    setChargeEditingId(null);
    setChargeError(null);
    setChargeSuggestion(null);
  };

  const saveCharge = async () => {
    if (!loadId) return;
    const amountCents = parseAmountToCents(chargeForm.amount);
    if (amountCents === null) {
      setChargeError("Enter a valid amount.");
      return;
    }
    setChargeSaving(true);
    try {
      if (chargeEditingId) {
        await apiFetch(`/loads/${loadId}/charges/${chargeEditingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: chargeForm.type,
            description: chargeForm.description || undefined,
            amountCents,
          }),
        });
      } else {
        await apiFetch(`/loads/${loadId}/charges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: chargeForm.type,
            description: chargeForm.description || undefined,
            amountCents,
          }),
        });
      }
      resetChargeForm();
      loadData();
    } catch (err) {
      setChargeError((err as Error).message);
    } finally {
      setChargeSaving(false);
    }
  };

  const editCharge = (charge: any) => {
    setChargeEditingId(charge.id);
    setChargeForm({
      type: charge.type ?? "OTHER",
      description: charge.description ?? "",
      amount: formatAmount(charge.amountCents ?? 0),
    });
    setChargeSuggestion(null);
  };

  const deleteCharge = async (chargeId: string) => {
    if (!loadId) return;
    setChargeSaving(true);
    try {
      await apiFetch(`/loads/${loadId}/charges/${chargeId}`, { method: "DELETE" });
      if (chargeEditingId === chargeId) {
        resetChargeForm();
      }
      loadData();
    } catch (err) {
      setChargeError((err as Error).message);
    } finally {
      setChargeSaving(false);
    }
  };

  const saveFreight = async () => {
    if (!loadId) return;
    setFreightSaving(true);
    try {
      const payload: Record<string, any> = {
        loadType: freightForm.loadType,
        shipperReferenceNumber: freightForm.shipperReferenceNumber,
        consigneeReferenceNumber: freightForm.consigneeReferenceNumber,
        palletCount: freightForm.palletCount,
        weightLbs: freightForm.weightLbs,
      };
      if (freightForm.operatingEntityId) {
        payload.operatingEntityId = freightForm.operatingEntityId;
      }
      await apiFetch(`/loads/${loadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setFreightEditing(false);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFreightSaving(false);
    }
  };

  const generateInvoice = async () => {
    if (!loadId) return;
    await apiFetch(`/billing/invoices/${loadId}/generate`, { method: "POST" });
    loadData();
  };

  const invoice = load?.invoices?.[0] ?? null;

  const latestPing = tracking?.ping;
  const pingLat = latestPing?.lat ? Number(latestPing.lat) : null;
  const pingLng = latestPing?.lng ? Number(latestPing.lng) : null;
  const mapLink = pingLat !== null && pingLng !== null ? `https://www.google.com/maps?q=${pingLat},${pingLng}` : null;

  const canVerify = user?.role === "ADMIN" || user?.role === "BILLING";
  const canUpload = user?.role === "ADMIN" || user?.role === "DISPATCHER";
  const canEditLoad = user?.role === "ADMIN" || user?.role === "DISPATCHER";

  const timelineItems = timeline.map((item) => ({
    id: item.id,
    title: item.message,
    subtitle: item.type,
    time: item.time ? new Date(item.time).toLocaleString() : undefined,
  }));

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const formatAge = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const statusTone = (status?: string) => {
    if (!status) return "neutral";
    if (status === "PAID" || status === "DELIVERED" || status === "INVOICED") return "success";
    if (status === "IN_TRANSIT") return "info";
    if (status === "READY_TO_INVOICE" || status === "POD_RECEIVED") return "warning";
    if (status === "CANCELLED") return "danger";
    return "neutral";
  };

  const podTone: "success" | "danger" | "warning" | "neutral" =
    podStatus === "Verified" ? "success" : podStatus === "Rejected" ? "danger" : podStatus === "Uploaded" ? "warning" : "neutral";

  const billingLabel = useMemo(() => {
    if (invoice?.status) return formatInvoiceStatusLabel(invoice.status);
    if (load?.status === "PAID") return "PAID";
    if (load?.status === "READY_TO_INVOICE") return "READY TO INVOICE";
    if (load?.status === "POD_RECEIVED") return "POD RECEIVED";
    if (load?.status === "DELIVERED") return "DOCS NEEDED";
    return null;
  }, [invoice?.status, load?.status]);

  const billingTone = (status?: string | null) => {
    if (!status) return "neutral";
    if (status === "PAID") return "success";
    if (status.includes("READY")) return "warning";
    if (status.includes("DISPUTED")) return "danger";
    if (status.includes("DOCS")) return "warning";
    return "info";
  };

  const getEventTime = useCallback((type: string) => {
    let found: string | null = null;
    for (const item of timeline) {
      if (item.type !== type || !item.time) continue;
      const date = new Date(item.time);
      if (Number.isNaN(date.getTime())) continue;
      const iso = date.toISOString();
      if (!found || date.getTime() < new Date(found).getTime()) {
        found = iso;
      }
    }
    return found;
  }, [timeline]);

  const timelineSteps = useMemo(() => {
    const draft = load?.createdAt ?? getEventTime("EVENT_LOAD_CREATED");
    const planned = load?.plannedAt ?? draft;
    const assigned = load?.assignedDriverAt ?? getEventTime("EVENT_LOAD_ASSIGNED");
    const inTransit = getEventTime("EVENT_STOP_DEPARTED");
    const delivered = load?.deliveredAt ?? getEventTime("EVENT_STOP_ARRIVED");
    const podReceived = podDocs.length
      ? podDocs.reduce((earliest: string | null, doc: any) => {
          const uploadedAt = doc.uploadedAt ? new Date(doc.uploadedAt).toISOString() : null;
          if (!uploadedAt) return earliest;
          if (!earliest || new Date(uploadedAt).getTime() < new Date(earliest).getTime()) {
            return uploadedAt;
          }
          return earliest;
        }, null)
      : null;
    const readyToInvoice = load?.podVerifiedAt ?? getEventTime("DOC_VERIFIED");
    const invoiced = invoice?.generatedAt ?? getEventTime("INVOICE_GENERATED");
    const paid = invoice?.paidAt ?? getEventTime("SETTLEMENT_PAID");
    const times: Record<string, string | null> = {
      DRAFT: draft ?? null,
      PLANNED: planned ?? null,
      ASSIGNED: assigned ?? null,
      IN_TRANSIT: inTransit ?? null,
      DELIVERED: delivered ?? null,
      POD_RECEIVED: podReceived ?? null,
      READY_TO_INVOICE: readyToInvoice ?? null,
      INVOICED: invoiced ?? null,
      PAID: paid ?? null,
    };
    return TIMELINE_STEPS.map((step) => ({
      key: step.key,
      label: step.label,
      time: times[step.key] ?? null,
    }));
  }, [load, invoice, getEventTime, podDocs]);

  const lastPingAt = tracking?.ping?.capturedAt ?? null;
  const lastPingAge = formatAge(lastPingAt);
  const pingStale = lastPingAt ? Date.now() - new Date(lastPingAt).getTime() > 15 * 60 * 1000 : true;
  const trackingState =
    tracking?.session?.status === "ON" || (lastPingAt && !pingStale) ? "ON" : tracking?.session?.status ?? "OFF";
  const canStartTracking = user?.role === "ADMIN" || user?.role === "DISPATCHER" || user?.role === "DRIVER";

  const formatStopLocation = (stop: any) => {
    if (!stop) return "-";
    if (stop.city) {
      return `${stop.city}${stop.state ? `, ${stop.state}` : ""}`;
    }
    return stop.name ?? "-";
  };

  const routeSummary = `${formatStopLocation(shipperStop)} -> ${formatStopLocation(consigneeStop)}`;
  const customerName = load?.customer?.name ?? load?.customerName ?? "-";

  const nextAction = useMemo(() => {
    if (!load) return null;
    if (rateConMissing) {
      if (canUpload) {
        return {
          label: "Upload RateCon",
          href: `/loads/${load.id}?tab=documents&docType=RATECON`,
          reason: "Dispatch blocked until rate confirmation is uploaded.",
        };
      }
      return {
        label: "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=RATECON`,
        reason: "Rate confirmation required before dispatch.",
      };
    }
    if (assignmentMissing) {
      if (canEditLoad) {
        return {
          label: "Assign equipment",
          href: "/dispatch",
          reason: "Driver and truck are required to dispatch.",
        };
      }
      return { label: "Open dispatch", href: "/dispatch", reason: "Assignment required before dispatch." };
    }
    if (docsBlocker?.type === "POD_MISSING" || docsBlocker?.type === "DOCS_REJECTED") {
      if (canUpload) {
        return {
          label: "Upload POD",
          href: `/loads/${load.id}?tab=documents&docType=POD`,
          reason: "Billing blocked until POD is uploaded.",
        };
      }
      return {
        label: "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=POD`,
        reason: "POD required for billing.",
      };
    }
    if (docsBlocker?.type === "DOCS_UNDER_REVIEW") {
      if (canVerify) {
        return {
          label: "Review POD",
          href: `/loads/${load.id}?tab=documents&docType=POD`,
          reason: "POD uploaded and awaiting review.",
        };
      }
      return {
        label: "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=POD`,
        reason: "POD awaiting review.",
      };
    }
    if (load?.status === "READY_TO_INVOICE") {
      if (canVerify) {
        return { label: "Create invoice", href: `/loads/${load.id}?tab=billing`, reason: "Docs approved and ready." };
      }
      return { label: "Open billing", href: `/loads/${load.id}?tab=billing`, reason: "Ready for invoicing." };
    }
    if (load?.status === "DRAFT" || load?.status === "PLANNED" || load?.status === "ASSIGNED") {
      if (canEditLoad) {
        return { label: "Dispatch", href: `/loads/${load.id}?tab=overview`, reason: "Assign driver and equipment." };
      }
      return { label: "Open", href: `/loads/${load.id}`, reason: "Review current load status." };
    }
    if (load?.status === "IN_TRANSIT" && trackingState === "OFF") {
      if (canStartTracking) {
        return { label: "Enable tracking", href: `/loads/${load.id}?tab=overview#tracking`, reason: "Tracking is OFF." };
      }
      return { label: "Open tracking", href: `/loads/${load.id}?tab=overview#tracking`, reason: "Tracking is OFF." };
    }
    return null;
  }, [
    load,
    docsBlocker,
    canUpload,
    canVerify,
    canEditLoad,
    canStartTracking,
    trackingState,
    rateConMissing,
    assignmentMissing,
  ]);

  const dispatchBlockers = useMemo(() => {
    const items: Array<{ title: string; subtitle: string; ctaLabel: string; href: string; tone?: "warning" | "danger" | "info" }> = [];
    if (rateConMissing) {
      items.push({
        title: "Rate confirmation missing",
        subtitle: "Dispatch blocked until RateCon is uploaded.",
        ctaLabel: "Fix now",
        href: `/loads/${load?.id}?tab=documents&docType=RATECON`,
        tone: "warning",
      });
    }
    if (assignmentMissing) {
      items.push({
        title: "Assignment incomplete",
        subtitle: "Driver and truck required before dispatch.",
        ctaLabel: canEditLoad ? "Open dispatch" : "Open dispatch",
        href: "/dispatch",
        tone: "info",
      });
    }
    if (load?.status && !["DRAFT", "PLANNED", "ASSIGNED"].includes(load.status)) {
      items.push({
        title: "Dispatch locked",
        subtitle: `Load is ${formatStatusLabel(load.status)}. Dispatch is only available before transit.`,
        ctaLabel: "Fix now",
        href: `/loads/${load.id}?tab=overview`,
        tone: "danger",
      });
    }
    return items;
  }, [rateConMissing, assignmentMissing, canUpload, canEditLoad, load?.id]);

  const docsBlockerCard = useMemo(() => {
    if (!docsBlocker || !load?.id) return null;
    if (docsBlocker.type === "POD_MISSING") {
      return {
        title: "POD missing",
        subtitle: "Billing blocked until POD is uploaded.",
        ctaLabel: "Fix now",
        href: `/loads/${load.id}?tab=documents&docType=POD#pod`,
        tone: "danger" as const,
      };
    }
    if (docsBlocker.type === "DOCS_REJECTED") {
      return {
        title: "POD rejected",
        subtitle: "Re-upload required to proceed with billing.",
        ctaLabel: canUpload ? "Re-upload POD" : "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=POD#pod`,
        tone: "danger" as const,
      };
    }
    if (docsBlocker.type === "DOCS_UNDER_REVIEW") {
      return {
        title: "POD pending review",
        subtitle: "Verify the POD to move into billing.",
        ctaLabel: canVerify ? "Review POD" : "Open documents",
        href: `/loads/${load.id}?tab=documents&docType=POD#pod`,
        tone: "warning" as const,
      };
    }
    return null;
  }, [docsBlocker, load?.id, canUpload, canVerify]);

  return (
    <AppShell title="Load Details" subtitle="Shipper -> Consignee, documents, tracking, billing">
      {error ? <ErrorBanner message={error} /> : null}
      {deleteError ? <ErrorBanner message={deleteError} /> : null}
      {load?.deletedAt ? (
        <Card className="border border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/50 px-4 py-3 text-sm text-[color:var(--color-danger)]">
          This load was deleted on {new Date(load.deletedAt).toLocaleString()}
          {load.deletedBy ? ` by ${load.deletedBy.name ?? load.deletedBy.email}` : ""}
          {load.deletedReason ? ` · Reason: ${load.deletedReason}` : ""}.
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Load</div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-2xl font-semibold text-ink">{load?.loadNumber ?? loadId}</div>
              <StatusChip label={load?.status ?? "UNKNOWN"} tone={statusTone(load?.status)} />
              {billingLabel ? <StatusChip label={billingLabel} tone={billingTone(billingLabel)} /> : null}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Trip: {load?.tripNumber ?? "-"}</div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {routeSummary} - {customerName}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Operating entity: {load?.operatingEntity?.name ?? "-"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {nextAction ? (
              <Button onClick={() => router.push(nextAction.href)}>{nextAction.label}</Button>
            ) : null}
            <details className="relative">
              <summary className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] text-sm text-[color:var(--color-text-muted)]">
                ...
                <span className="sr-only">More actions</span>
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-2 shadow-subtle">
                <button
                  type="button"
                  className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-ink hover:bg-[color:var(--color-panel)]"
                  onClick={() => {
                    if (!loadId) return;
                    const params = new URLSearchParams(searchParams?.toString() ?? "");
                    params.set("tab", "documents");
                    router.replace(`/loads/${loadId}?${params.toString()}`);
                  }}
                >
                  Open documents
                </button>
                <button
                  type="button"
                  className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-ink hover:bg-[color:var(--color-panel)]"
                  onClick={() => {
                    if (!loadId) return;
                    const params = new URLSearchParams(searchParams?.toString() ?? "");
                    params.set("tab", "billing");
                    router.replace(`/loads/${loadId}?${params.toString()}`);
                  }}
                >
                  Open billing
                </button>
                <button
                  type="button"
                  className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-ink hover:bg-[color:var(--color-panel)]"
                  onClick={() => {
                    if (!loadId) return;
                    const params = new URLSearchParams(searchParams?.toString() ?? "");
                    params.set("tab", "audit");
                    router.replace(`/loads/${loadId}?${params.toString()}`);
                  }}
                >
                  View audit
                </button>
                {user?.role === "ADMIN" ? (
                  <button
                    type="button"
                    className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger-soft)]/40 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleDeleteLoad}
                    disabled={deleting || Boolean(load?.deletedAt)}
                  >
                    {load?.deletedAt ? "Load deleted" : deleting ? "Deleting..." : "Delete load"}
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </Card>

      <Card className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Rate", value: load?.rate ?? "-" },
          { label: "Miles", value: load?.miles ?? "-" },
          { label: "Driver", value: load?.driver?.name ?? "Unassigned" },
          { label: "Truck/Trailer", value: `${load?.truck?.unit ?? "-"} · ${load?.trailer?.unit ?? "-"}` },
        ].map((item) => (
          <div key={item.label} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">{item.label}</div>
            <div className="text-sm font-semibold text-ink">{item.value}</div>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Workspace" subtitle="Review details, documents, billing, and audit trail" />
        <SegmentedControl
          value={activeTab}
          options={[
            { label: "Overview", value: "overview" },
            { label: `Documents (${docCount}) ${documentsIndicator}`, value: "documents" },
            { label: "Billing", value: "billing" },
            { label: "Audit", value: "audit" },
          ]}
          onChange={(value) => {
            const next = value as "overview" | "documents" | "billing" | "audit";
            setActiveTab(next);
            if (!loadId) return;
            const params = new URLSearchParams(searchParams?.toString() ?? "");
            params.set("tab", next);
            router.replace(`/loads/${loadId}?${params.toString()}`);
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr,0.9fr]">
        <div className="space-y-6">
          {activeTab === "overview" ? (
            <>
              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionHeader title="Timeline" subtitle="Milestones and billing gates" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!loadId) return;
                      const params = new URLSearchParams(searchParams?.toString() ?? "");
                      params.set("tab", "audit");
                      router.replace(`/loads/${loadId}?${params.toString()}`);
                    }}
                  >
                    View audit
                  </Button>
                </div>
                <div className="space-y-3">
                  {timelineSteps.map((step) => (
                    <div key={step.key} className="flex items-center justify-between text-sm">
                      <div className="font-medium text-ink">{step.label}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">{formatDateTime(step.time)}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="space-y-3">
                <SectionHeader title="Details" subtitle="Stops, documents, notes, and history" />
                <details open className="group" id="stops">
                  <summary className="cursor-pointer text-sm font-medium text-ink">Stops</summary>
                  <div className="mt-3 grid gap-3">
                    {load?.stops?.map((stop: any) => (
                      <div key={stop.id} className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                          {stop.type === "PICKUP" ? "Shipper" : stop.type === "DELIVERY" ? "Consignee" : "Yard"}
                        </div>
                        <div className="text-sm font-semibold text-ink">{stop.name}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {stop.address}, {stop.city} {stop.state} {stop.zip}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">Status: {stop.status}</div>
                      </div>
                    ))}
                    {load?.stops?.length ? null : <EmptyState title="No stops yet." />}
                  </div>
                </details>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-ink">Documents</summary>
                  <div className="mt-3 grid gap-2">
                    {load?.docs?.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-2"
                      >
                        <div>
                          <div className="text-sm font-semibold text-ink">{doc.type}</div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            {formatDocStatusLabel(doc.status)}
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                          Open
                        </Button>
                      </div>
                    ))}
                    {docCount === 0 ? <EmptyState title="No documents yet." /> : null}
                  </div>
                </details>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-ink">Notes</summary>
                  <div className="mt-3 text-sm text-[color:var(--color-text-muted)]">
                    {load?.notes ?? "No notes yet."}
                  </div>
                </details>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-ink">History</summary>
                  <div className="mt-3">
                    <Timeline items={timelineItems} />
                  </div>
                </details>
              </Card>
            </>
          ) : null}

          {activeTab === "documents" ? (
            <Card className="space-y-4" id="documents">
              <SectionHeader title="Documents" subtitle="Review uploads and verify POD" />
              <div className="grid gap-3">
                {load?.docs?.map((doc: any) => (
                  <div
                    key={doc.id}
                    id={doc.type === "POD" ? "pod" : undefined}
                    className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-ink">{doc.type}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {formatDocStatusLabel(doc.status)}
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                        Open
                      </Button>
                    </div>
                    {doc.type === "POD" && canVerify ? (
                      <div className="mt-3 space-y-2 text-sm text-[color:var(--color-text-muted)]">
                        <CheckboxField
                          id={`docSignature-${doc.id}`}
                          label="Signature present"
                          checked={docChecklist[doc.id]?.signature ?? true}
                          onChange={(e) =>
                            setDocChecklist({
                              ...docChecklist,
                              [doc.id]: { ...docChecklist[doc.id], signature: e.target.checked },
                            })
                          }
                        />
                        <CheckboxField
                          id={`docPrinted-${doc.id}`}
                          label="Printed name present"
                          checked={docChecklist[doc.id]?.printed ?? true}
                          onChange={(e) =>
                            setDocChecklist({
                              ...docChecklist,
                              [doc.id]: { ...docChecklist[doc.id], printed: e.target.checked },
                            })
                          }
                        />
                        <CheckboxField
                          id={`docDate-${doc.id}`}
                          label="Consignee date present"
                          checked={docChecklist[doc.id]?.date ?? true}
                          onChange={(e) =>
                            setDocChecklist({
                              ...docChecklist,
                              [doc.id]: { ...docChecklist[doc.id], date: e.target.checked },
                            })
                          }
                        />
                        <FormField label="Pages" htmlFor={`docPages-${doc.id}`}>
                          <Input
                            type="number"
                            min={1}
                            value={docChecklist[doc.id]?.pages ?? 1}
                            onChange={(e) =>
                              setDocChecklist({
                                ...docChecklist,
                                [doc.id]: { ...docChecklist[doc.id], pages: e.target.value },
                              })
                            }
                          />
                        </FormField>
                        <FormField label="Reject reason" htmlFor={`docReject-${doc.id}`} hint="Required to reject">
                          <Input
                            placeholder="Explain the issue"
                            value={docRejectReasons[doc.id] ?? ""}
                            onChange={(e) => setDocRejectReasons({ ...docRejectReasons, [doc.id]: e.target.value })}
                          />
                        </FormField>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => verifyDoc(doc.id)}>
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => rejectDoc(doc.id)}
                            disabled={!docRejectReasons[doc.id]}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                {docCount === 0 ? <EmptyState title="No documents yet." /> : null}
              </div>
            </Card>
          ) : null}

          {activeTab === "billing" ? (
            <Card className="space-y-4" id="billing">
              <SectionHeader title="Billing" subtitle="Invoice status and actions" />
              <div className="text-sm text-[color:var(--color-text-muted)]">
                Invoice status: {invoice?.status ? formatInvoiceStatusLabel(invoice.status) : "Not generated"}
              </div>
              <div className="flex flex-wrap gap-2">
                {load?.status === "READY_TO_INVOICE" && canVerify ? (
                  <Button onClick={generateInvoice}>Generate invoice</Button>
                ) : null}
                {invoice?.pdfPath ? (
                  <Button variant="secondary" onClick={() => window.open(`${API_BASE}/invoices/${invoice.id}/pdf`, "_blank")}>
                    Download PDF
                  </Button>
                ) : null}
              </div>
              {canViewCharges ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Charges</div>
                    <div className="text-sm font-semibold text-ink">Total ${formatAmount(chargesTotalCents)}</div>
                  </div>
                  <div className="grid gap-2">
                    {displayCharges.map((charge) => (
                      <div
                        key={charge.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-semibold text-ink">
                            {CHARGE_LABELS[charge.type] ?? charge.type}
                          </div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            {charge.description || "—"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-ink">${formatAmount(charge.amountCents)}</div>
                          {canEditCharges && !charge.implied ? (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => editCharge(charge)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => deleteCharge(charge.id)} disabled={chargeSaving}>
                                Delete
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {displayCharges.length === 0 ? <EmptyState title="No charges yet." /> : null}
                  </div>
                  {canEditCharges ? (
                    <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white p-3">
                      <div className="grid gap-3 lg:grid-cols-3">
                        <FormField label="Charge type" htmlFor="chargeType">
                          <Select
                            value={chargeForm.type}
                            onChange={(event) => setChargeForm({ ...chargeForm, type: event.target.value })}
                          >
                            {CHARGE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {CHARGE_LABELS[type]}
                              </option>
                            ))}
                          </Select>
                        </FormField>
                        <FormField label="Description" htmlFor="chargeDescription">
                          <Input
                            placeholder="Detention after 2 hours"
                            value={chargeForm.description}
                            onChange={(event) => setChargeForm({ ...chargeForm, description: event.target.value })}
                          />
                        </FormField>
                        <FormField label="Amount ($)" htmlFor="chargeAmount">
                          <Input
                            placeholder="150.00"
                            value={chargeForm.amount}
                            onChange={(event) => setChargeForm({ ...chargeForm, amount: event.target.value })}
                          />
                        </FormField>
                      </div>
                      {chargeSuggestion ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-info-soft)] bg-[color:var(--color-info-soft)]/30 px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                          <Badge className="bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]">Suggested</Badge>
                          <span>
                            {CHARGE_LABELS[chargeSuggestion.type ?? "OTHER"] ?? chargeSuggestion.type ?? "Other"}
                            {typeof (chargeSuggestion.avgAmountCents ?? chargeSuggestion.amountCents) === "number"
                              ? ` · $${formatAmount(chargeSuggestion.avgAmountCents ?? chargeSuggestion.amountCents ?? 0)}`
                              : ""}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const amount = chargeSuggestion.avgAmountCents ?? chargeSuggestion.amountCents;
                              setChargeForm((prev) => ({
                                ...prev,
                                type: chargeSuggestion.type ?? prev.type,
                                amount: typeof amount === "number" ? formatAmount(amount) : prev.amount,
                              }));
                            }}
                          >
                            Apply
                          </Button>
                        </div>
                      ) : null}
                      {chargeError ? (
                        <div className="mt-2 text-xs text-[color:var(--color-danger)]">{chargeError}</div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={saveCharge} disabled={chargeSaving}>
                          {chargeEditingId ? "Update charge" : "Add charge"}
                        </Button>
                        {chargeEditingId ? (
                          <Button size="sm" variant="secondary" onClick={resetChargeForm} disabled={chargeSaving}>
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : null}

          {activeTab === "audit" ? (
            <Card className="space-y-4" id="audit">
              <SectionHeader title="Audit" subtitle="Chronological activity" />
              <Timeline items={timelineItems} />
            </Card>
          ) : null}
        </div>

        <div>
          <div className="sticky top-6 space-y-4">
            <Card className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Next action</div>
              {nextAction ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-ink">{nextAction.label}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{nextAction.reason}</div>
                  <Button size="sm" onClick={() => router.push(nextAction.href)}>
                    {nextAction.label}
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-[color:var(--color-text-muted)]">No immediate action.</div>
              )}
            </Card>

            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Documents & POD</div>
                <StatusChip label={podStatus} tone={podTone} />
              </div>
              {docsBlockerCard ? (
                <BlockerCard
                  title={docsBlockerCard.title}
                  subtitle={docsBlockerCard.subtitle}
                  ctaLabel={docsBlockerCard.ctaLabel}
                  onClick={() => router.push(docsBlockerCard.href)}
                  tone={docsBlockerCard.tone}
                />
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {podStatus === "Verified" ? "POD verified. Ready for billing." : "Awaiting POD for billing."}
                </div>
              )}
              <div className="grid gap-2">
                {load?.docs?.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-ink">{doc.type}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {formatDocStatusLabel(doc.status)}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => openDoc(doc)}>
                      Open
                    </Button>
                  </div>
                ))}
                {docCount === 0 ? <EmptyState title="No documents yet." /> : null}
              </div>
              {canUpload ? (
                <div className="space-y-2">
                  <FormField label="Document type" htmlFor="uploadType">
                    <Select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                      {docTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Upload file" htmlFor="uploadFile" hint="PDF or image">
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadDoc(file);
                      }}
                    />
                  </FormField>
                  {uploadNote ? <div className="text-xs text-[color:var(--color-text-muted)]">{uploadNote}</div> : null}
                </div>
              ) : null}
            </Card>

            <Card id="tracking" className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Tracking</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">Status: {trackingState}</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                Last ping: {lastPingAt ? `${formatDateTime(lastPingAt)}${lastPingAge ? ` - ${lastPingAge}` : ""}` : "-"}
              </div>
              {trackingState === "OFF" && canStartTracking ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!loadId) return;
                    try {
                      await apiFetch(`/tracking/load/${loadId}/start`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ providerType: "PHONE" }),
                      });
                      loadData();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  Start tracking
                </Button>
              ) : null}
              {!pingStale && mapLink ? (
                <div className="space-y-2 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-3 text-xs text-[color:var(--color-text-muted)]">
                  Map preview available
                  <Button size="sm" variant="secondary" onClick={() => window.open(mapLink, "_blank")}>
                    Open map
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {lastPingAt ? "Ping stale." : "No recent pings."}
                </div>
              )}
              <div className="text-xs text-[color:var(--color-text-muted)]">Keep the page open for best results.</div>
            </Card>

            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Freight</div>
                {canEditLoad ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (freightEditing) {
                        setFreightEditing(false);
                      } else {
                        setFreightEditing(true);
                      }
                    }}
                  >
                    {freightEditing ? "Cancel" : "Edit"}
                  </Button>
                ) : null}
              </div>
              {freightEditing ? (
                <div className="space-y-2">
                  <FormField label="Load type" htmlFor="freightLoadType">
                    <Select
                      value={freightForm.loadType}
                      onChange={(e) => setFreightForm({ ...freightForm, loadType: e.target.value })}
                    >
                      <option value="COMPANY">Company</option>
                      <option value="BROKERED">Brokered</option>
                    </Select>
                  </FormField>
                  <FormField label="Operating entity" htmlFor="freightOperatingEntity">
                    {user?.role === "ADMIN" && operatingEntities.length > 0 ? (
                      <Select
                        value={freightForm.operatingEntityId}
                        onChange={(e) => setFreightForm({ ...freightForm, operatingEntityId: e.target.value })}
                      >
                        {operatingEntities.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.name} {entity.isDefault ? "· Default" : ""}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input disabled value={load?.operatingEntity?.name ?? "Operating entity"} />
                    )}
                  </FormField>
                  <FormField label="Shipper reference #" htmlFor="freightShipperRef">
                    <Input
                      placeholder="SREF-1001"
                      value={freightForm.shipperReferenceNumber}
                      onChange={(e) => setFreightForm({ ...freightForm, shipperReferenceNumber: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Consignee reference #" htmlFor="freightConsigneeRef">
                    <Input
                      placeholder="CREF-1001"
                      value={freightForm.consigneeReferenceNumber}
                      onChange={(e) => setFreightForm({ ...freightForm, consigneeReferenceNumber: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Pallet count" htmlFor="freightPalletCount">
                    <Input
                      placeholder="10"
                      value={freightForm.palletCount}
                      onChange={(e) => setFreightForm({ ...freightForm, palletCount: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Weight (lbs)" htmlFor="freightWeightLbs">
                    <Input
                      placeholder="40000"
                      value={freightForm.weightLbs}
                      onChange={(e) => setFreightForm({ ...freightForm, weightLbs: e.target.value })}
                    />
                  </FormField>
                  <Button size="sm" onClick={saveFreight} disabled={freightSaving}>
                    {freightSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Pallets: {load?.palletCount ?? "-"}</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Weight: {load?.weightLbs ?? "-"} lbs</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Shipper ref: {load?.shipperReferenceNumber ?? "-"}</div>
                  <div className="text-sm text-[color:var(--color-text-muted)]">Consignee ref: {load?.consigneeReferenceNumber ?? "-"}</div>
                </>
              )}
            </Card>

            <Card className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Dispatch readiness</div>
              {dispatchBlockers.length > 0 ? (
                <div className="space-y-2">
                  {dispatchBlockers.map((blocker) => (
                    <BlockerCard
                      key={blocker.title}
                      title={blocker.title}
                      subtitle={blocker.subtitle}
                      ctaLabel={blocker.ctaLabel}
                      onClick={() => router.push(blocker.href)}
                      tone={blocker.tone ?? "info"}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[color:var(--color-text-muted)]">Dispatch requirements satisfied.</div>
              )}
            </Card>

            <Card className="space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Billing</div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                Invoice: {invoice?.status ? formatInvoiceStatusLabel(invoice.status) : "Not generated"}
              </div>
              {load?.status === "READY_TO_INVOICE" && canVerify ? (
                <Button size="sm" onClick={generateInvoice}>
                  Generate invoice
                </Button>
              ) : null}
              {invoice?.pdfPath ? (
                <Button size="sm" variant="secondary" onClick={() => window.open(`${API_BASE}/invoices/${invoice.id}/pdf`, "_blank")}>
                  Download PDF
                </Button>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
```

## F) Screenshots
- MISSING: No UI screenshots captured in repo.
- Existing image assets (not screenshots):
  - `apps/web/public/icon-192.png`
  - `apps/web/public/icon-512.png`
