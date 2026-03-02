"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { ToastViewport } from "@/components/ui/toast-viewport";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { getRoleCapabilities } from "@/lib/capabilities";
import { getVisibleSections } from "@/lib/navigation";
import type { NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  type: "load" | "driver" | "employee" | "customer";
  title: string;
  subtitle?: string | null;
  status?: string | null;
  url: string;
};

type OnboardingState = {
  percentComplete: number;
  completedAt?: string | null;
  status?: "NOT_ACTIVATED" | "OPERATIONAL";
};

type ActivityItem = {
  id: string;
  title: string;
  severity: "ALERT" | "IMPORTANT" | "INFO";
  domain: "DISPATCH" | "BILLING" | "SAFETY" | "SYSTEM";
  timestamp: string;
  count?: number;
  cta: { label: string; href: string };
};

type ActivitySummary = {
  badgeCount: number;
  generatedAt: string;
  now: ActivityItem[];
  week: ActivityItem[];
};

type AppShellActivityControls = {
  canUseActivity: boolean;
  activityBadgeCount: number;
  openActivityDrawer: () => void;
};

const AppShellActivityContext = createContext<AppShellActivityControls | null>(null);

const searchGroups: Array<{ type: SearchResult["type"]; label: string }> = [
  { type: "load", label: "Loads" },
  { type: "driver", label: "Drivers" },
  { type: "employee", label: "Employees" },
  { type: "customer", label: "Customers" },
];
const NAV_SEARCH_INPUT_ID = "global-nav-search-input";

const SIDEBAR_PINNED_KEY = "haulio:sidebar:pinned";
const SIDEBAR_PEEK_OPEN_DELAY_MS = 380;
const SIDEBAR_PEEK_CLOSE_DELAY_MS = 240;
let sidebarPinnedCache: boolean | null = null;
let sidebarPeekOpenCache = false;
let teamsEnabledCache: boolean | null = null;

function compactRelativeTime(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "—";
  const diffMs = Date.now() - timestamp.getTime();
  const absMinutes = Math.max(1, Math.round(Math.abs(diffMs) / 60000));
  if (absMinutes < 60) return `${absMinutes}m ago`;
  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) return `${absHours}h ago`;
  const absDays = Math.round(absHours / 24);
  return `${absDays}d ago`;
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const strokeClass = active ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-text-muted)]";
  const iconClass = `h-[var(--icon-size-nav)] w-[var(--icon-size-nav)] ${strokeClass}`;

  if (href === "/today") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
        <path d="M8 2.75v3.5M16 2.75v3.5M3.5 9.5h17" />
      </svg>
    );
  }
  if (href === "/dashboard") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 5.5h7v6H4zM13 5.5h7v4h-7zM4 13.5h7v5H4zM13 11.5h7v7h-7z" />
      </svg>
    );
  }
  if (href === "/profile") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }
  if (href === "/loads") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <path d="M7 9h10M7 13h6" />
      </svg>
    );
  }
  if (href === "/dispatch") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3.5 12h8.5M12.5 12l-2.5-2.5M12.5 12l-2.5 2.5M20.5 12H12" />
        <circle cx="20.5" cy="12" r="2.5" />
      </svg>
    );
  }
  if (href === "/trips") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7.5h16M4 12h16M4 16.5h16" />
        <circle cx="7.5" cy="7.5" r="1.4" />
        <circle cx="12" cy="12" r="1.4" />
        <circle cx="16.5" cy="16.5" r="1.4" />
      </svg>
    );
  }
  if (href === "/safety") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3.5 5 6.5V12c0 4.1 2.5 7.8 7 8.9 4.5-1.1 7-4.8 7-8.9V6.5l-7-3Z" />
        <path d="M9.5 12.2 11 13.8l3.5-3.7" />
      </svg>
    );
  }
  if (href === "/support") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4.2-4.2" />
        <path d="M9 10.2h4M9 12.8h2.5" />
      </svg>
    );
  }
  if (href === "/teams") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="8.5" r="2.5" />
        <circle cx="16" cy="9.5" r="2.5" />
        <path d="M3.5 20a4.5 4.5 0 0 1 9 0M11.5 20a4 4 0 0 1 8 0" />
      </svg>
    );
  }
  if (href === "/finance") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 17.5h16M6.5 17.5v-7m5 7v-11m5 11v-5" />
      </svg>
    );
  }
  if (href === "/audit") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 4.5h12v15H6z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    );
  }
  if (href === "/admin") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2M6.7 6.7l1.5 1.5M15.8 15.8l1.5 1.5M17.3 6.7l-1.5 1.5M8.2 15.8l-1.5 1.5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function NavContent({
  pathname,
  org,
  user,
  sections,
  compact = false,
  canUseGlobalSearch,
  searchTerm,
  searchLoading,
  searchError,
  groupedSearchResults,
  onSearchTermChange,
  onClearSearch,
  onCompactSearchClick,
}: {
  pathname: string;
  org: { id: string; name: string; companyDisplayName?: string | null } | null;
  user: { name?: string | null; email?: string | null } | null;
  sections: NavSection[];
  compact?: boolean;
  canUseGlobalSearch: boolean;
  searchTerm: string;
  searchLoading: boolean;
  searchError: string | null;
  groupedSearchResults: Array<{ type: SearchResult["type"]; label: string; items: SearchResult[] }>;
  onSearchTermChange: (value: string) => void;
  onClearSearch: () => void;
  onCompactSearchClick?: () => void;
}) {
  return (
    <div className={cn("nav-content space-y-5", compact ? "space-y-4" : "")}>
      {compact ? (
        <div className="flex flex-col items-center gap-3">
          <div className="group relative inline-flex">
            <div
              aria-hidden="true"
              className="h-10 w-10 rounded-[var(--radius-control)] bg-[color:var(--color-accent)]/10 ring-1 ring-[color:var(--color-divider)]"
            />
            <span className="pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[color:var(--color-ink)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white opacity-0 shadow-[var(--shadow-subtle)] transition group-hover:opacity-100">
              {org?.companyDisplayName ?? org?.name ?? "Haulio"}
            </span>
          </div>
          {canUseGlobalSearch ? (
            <button
              type="button"
              aria-label="Open search"
              title="Search"
              onClick={onCompactSearchClick}
              className="group relative inline-flex h-[var(--icon-button-size-toolbar)] w-[var(--icon-button-size-toolbar)] items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] transition hover:bg-[color:var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-[var(--icon-size-toolbar)] w-[var(--icon-size-toolbar)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[color:var(--color-ink)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white opacity-0 shadow-[var(--shadow-subtle)] transition group-hover:opacity-100">
                Search
              </span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-[var(--radius-control)] bg-[color:var(--color-accent)]/10" />
            <div>
              <div className="text-sm font-semibold text-ink">Haulio</div>
              <div className="text-xs text-[color:var(--color-text-muted)]">Operations console</div>
            </div>
          </div>
          <Badge className="max-w-[11rem] truncate bg-[color:var(--color-bg-muted)] text-[color:var(--color-text-muted)]">
            {org?.companyDisplayName ?? org?.name ?? "Unknown org"}
          </Badge>
        </div>
      )}
      {canUseGlobalSearch && !compact ? (
        <div className="space-y-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-muted)]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-[var(--icon-size-toolbar)] w-[var(--icon-size-toolbar)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <Input
              id={NAV_SEARCH_INPUT_ID}
              aria-label="Search"
              placeholder="Search"
              className="bg-[color:var(--color-surface)] pl-9 text-sm border-[color:var(--color-divider-strong)]"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
            />
          </div>
          {searchTerm.trim() ? (
            <div className="max-h-80 overflow-y-auto rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] p-2 shadow-[var(--shadow-subtle)]">
              {searchLoading ? (
                <div className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">Searching…</div>
              ) : null}
              {searchError ? (
                <div className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">{searchError}</div>
              ) : null}
              {!searchLoading && !searchError && groupedSearchResults.length === 0 ? (
                <div className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">No matches</div>
              ) : null}
              {groupedSearchResults.map((group) => (
                <div key={group.type} className="space-y-1 px-1 py-2">
                  <div className="px-2 text-[11px] uppercase tracking-[0.28em] text-[color:var(--color-text-subtle)]">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((result) => (
                      <Link
                        key={result.id}
                        href={result.url}
                        onClick={onClearSearch}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-2 py-2 text-sm transition hover:bg-[color:var(--color-bg-muted)]"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">{result.title}</div>
                          {result.subtitle ? (
                            <div className="truncate text-xs text-[color:var(--color-text-muted)]">
                              {result.subtitle}
                            </div>
                          ) : null}
                        </div>
                        {result.status ? <StatusChip label={result.status} tone="neutral" /> : null}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {sections.map((section, index) => (
        <div
          key={section.title}
          className={cn(
            "space-y-2",
            index > 0 ? (compact ? "mt-2 border-t border-[color:var(--color-divider)] pt-3" : "pt-3") : ""
          )}
        >
          {!compact ? (
            <div className="px-2 text-[11px] uppercase tracking-[0.28em] text-[color:var(--color-text-subtle)]">
              {section.title}
            </div>
          ) : null}
          <div className="space-y-1">
            {section.items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    "nav-item flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]",
                    compact ? "justify-center px-1" : "",
                    active
                      ? "bg-[color:var(--color-bg-muted)] text-ink ring-1 ring-[color:var(--color-divider)]"
                      : "text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-bg-muted)]"
                  )}
                >
                  <span
                    className={cn(
                      "h-[var(--icon-size-nav)] w-1.5 rounded-full",
                      active ? "bg-[color:var(--color-accent)]" : "bg-transparent"
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className="group relative inline-flex h-[var(--icon-button-size-nav)] w-[var(--icon-button-size-nav)] items-center justify-center"
                    tabIndex={-1}
                  >
                    <NavIcon href={item.href} active={active} />
                    <span className="pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2 rounded-md bg-[color:var(--color-ink)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white opacity-0 shadow-[var(--shadow-subtle)] transition group-hover:opacity-100 group-focus-within:opacity-100">
                      {item.label}
                    </span>
                  </span>
                  {!compact ? <span className={cn(active ? "font-medium" : "font-normal")}>{item.label}</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="pt-2" />
    </div>
  );
}

function AppShellInner({
  title,
  subtitle,
  hideHeader,
  hideTopActivityTrigger,
  children,
}: {
  title: string;
  subtitle?: string;
  hideHeader?: boolean;
  hideTopActivityTrigger?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const { user, org } = useUser();
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    if (sidebarPinnedCache !== null) return sidebarPinnedCache;
    if (typeof window === "undefined") return false;
    const next = window.localStorage.getItem(SIDEBAR_PINNED_KEY) === "true";
    sidebarPinnedCache = next;
    return next;
  });
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(() => sidebarPeekOpenCache);
  const [desktopHoverEnabled, setDesktopHoverEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  });
  const [sidebarTransitionReady, setSidebarTransitionReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const searchRequestIdRef = useRef(0);
  const [teamsEnabled, setTeamsEnabled] = useState(() => teamsEnabledCache ?? false);
  const capabilities = getRoleCapabilities(user?.role);
  const canSeeTeamsOps = capabilities.canSeeTeamsOps;
  const showTeamsOps = Boolean(
    user && (capabilities.canAccessAdmin || (capabilities.canSeeTeamsOps && teamsEnabled))
  );
  const canUseGlobalSearch = capabilities.canUseGlobalSearch;
  const canUseActivity = capabilities.canUseActivity;
  const desktopSidebarExpanded = sidebarPinned || sidebarPeekOpen;
  const sections = useMemo(
    () => getVisibleSections(user?.role, { showTeamsOps }),
    [user?.role, showTeamsOps]
  );
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const groupedSearchResults = useMemo(() => {
    const groups = new Map<SearchResult["type"], SearchResult[]>();
    searchResults.forEach((result) => {
      const list = groups.get(result.type) ?? [];
      list.push(result);
      groups.set(result.type, list);
    });
    return searchGroups
      .map((group) => ({ ...group, items: groups.get(group.type) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [searchResults]);
  const activityNow = useMemo(() => (activitySummary?.now ?? []).slice(0, 7), [activitySummary?.now]);
  const activityWeek = useMemo(() => (activitySummary?.week ?? []).slice(0, 7), [activitySummary?.week]);
  const activityBadgeCount = activitySummary?.badgeCount ?? 0;
  const shouldShowTopActivityTrigger = canUseActivity && hideHeader && !hideTopActivityTrigger;
  const activityControls = useMemo<AppShellActivityControls>(
    () => ({
      canUseActivity,
      activityBadgeCount,
      openActivityDrawer: () => setActivityDrawerOpen(true),
    }),
    [activityBadgeCount, canUseActivity]
  );

  useEffect(() => {
    setNavOpen(false);
    setActivityDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const applyHoverMode = () => setDesktopHoverEnabled((prev) => (prev === media.matches ? prev : media.matches));
    applyHoverMode();
    const raf = window.requestAnimationFrame(() => setSidebarTransitionReady(true));
    media.addEventListener("change", applyHoverMode);
    return () => {
      window.cancelAnimationFrame(raf);
      media.removeEventListener("change", applyHoverMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sidebarPinnedCache = sidebarPinned;
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, sidebarPinned ? "true" : "false");
  }, [sidebarPinned]);

  useEffect(() => {
    sidebarPeekOpenCache = sidebarPeekOpen;
  }, [sidebarPeekOpen]);

  useEffect(() => {
    return () => {
      if (hoverOpenTimerRef.current) window.clearTimeout(hoverOpenTimerRef.current);
      if (hoverCloseTimerRef.current) window.clearTimeout(hoverCloseTimerRef.current);
    };
  }, []);

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

  useEffect(() => {
    if (!user) {
      teamsEnabledCache = false;
      setTeamsEnabled(false);
      return;
    }
    if (!canSeeTeamsOps) {
      teamsEnabledCache = false;
      setTeamsEnabled(false);
      return;
    }
    let active = true;
    apiFetch<{ teams: Array<{ id: string; name?: string | null }> }>("/teams")
      .then((data) => {
        if (!active) return;
        const next = (data.teams ?? []).some((team) => team.name && team.name !== "Default");
        teamsEnabledCache = next;
        setTeamsEnabled(next);
      })
      .catch(() => {
        if (!active) return;
        teamsEnabledCache = false;
        setTeamsEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [user, canSeeTeamsOps]);

  useEffect(() => {
    if (canUseGlobalSearch) return;
    setSearchTerm("");
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError(null);
  }, [canUseGlobalSearch]);

  useEffect(() => {
    if (!canUseGlobalSearch) return;
    const query = searchTerm.trim();
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    setSearchLoading(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      apiFetch<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}&limit=6`)
        .then((data) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchResults(data.results ?? []);
          setSearchLoading(false);
        })
        .catch((err) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchError((err as Error).message || "Search failed.");
          setSearchLoading(false);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm, canUseGlobalSearch]);

  useEffect(() => {
    if (!canUseActivity) {
      setActivitySummary(null);
      setActivityError(null);
      setActivityLoading(false);
      return;
    }
    let active = true;
    setActivityLoading(true);
    apiFetch<ActivitySummary>("/activity/summary")
      .then((payload) => {
        if (!active) return;
        setActivitySummary(payload);
        setActivityError(null);
      })
      .catch((err) => {
        if (!active) return;
        setActivitySummary(null);
        setActivityError((err as Error).message || "Activity unavailable");
      })
      .finally(() => {
        if (!active) return;
        setActivityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canUseActivity, pathname, user?.role]);

  const clearSidebarHoverTimers = () => {
    if (hoverOpenTimerRef.current) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };

  const handleDesktopSidebarToggle = () => {
    clearSidebarHoverTimers();
    setSidebarPeekOpen(false);
    setSidebarPinned((prev) => {
      const next = !prev;
      return next;
    });
  };

  const handleDesktopSidebarMouseEnter = () => {
    if (!desktopHoverEnabled || sidebarPinned) return;
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    if (hoverOpenTimerRef.current) return;
    hoverOpenTimerRef.current = window.setTimeout(() => {
      setSidebarPeekOpen(true);
      hoverOpenTimerRef.current = null;
    }, SIDEBAR_PEEK_OPEN_DELAY_MS);
  };

  const handleDesktopSidebarMouseLeave = () => {
    if (!desktopHoverEnabled || sidebarPinned) return;
    if (hoverOpenTimerRef.current) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current) return;
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setSidebarPeekOpen(false);
      hoverCloseTimerRef.current = null;
    }, SIDEBAR_PEEK_CLOSE_DELAY_MS);
  };

  const focusNavSearchInput = () => {
    if (typeof window === "undefined") return;
    const focusIfPresent = () => {
      const input = document.getElementById(NAV_SEARCH_INPUT_ID) as HTMLInputElement | null;
      if (!input) return false;
      input.focus();
      input.select();
      return true;
    };
    if (focusIfPresent()) return;
    window.setTimeout(() => {
      focusIfPresent();
    }, 220);
  };

  const handleCompactSearchClick = () => {
    clearSidebarHoverTimers();
    setSidebarPeekOpen(false);
    setSidebarPinned(true);
    focusNavSearchInput();
  };

  return (
    <div className="min-h-dvh w-full overflow-hidden bg-[color:var(--color-bg-muted)]">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)]/90 px-4 backdrop-blur lg:hidden">
        <div>
          <div className="text-sm font-semibold text-ink">Haulio</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">{title}</div>
        </div>
        <div className="flex items-center gap-2">
          {shouldShowTopActivityTrigger ? (
            <button
              type="button"
              aria-label="Open activity"
              onClick={() => setActivityDrawerOpen(true)}
              className="relative rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] p-2 text-[color:var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 17H9a2 2 0 0 1-2-2v-4a5 5 0 1 1 10 0v4a2 2 0 0 1-2 2Z" />
                <path d="M10 20a2 2 0 0 0 4 0" />
              </svg>
              {activityBadgeCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-danger)] px-1 text-[10px] font-semibold text-white">
                  {activityBadgeCount > 99 ? "99+" : activityBadgeCount}
                </span>
              ) : null}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
          >
            Menu
          </button>
        </div>
      </header>

      {navOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={navRef}
            className="absolute left-0 top-0 h-full w-[min(20rem,92vw)] bg-[color:var(--color-surface-elevated)] px-4 py-6 shadow-[var(--shadow-card)]"
          >
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
              <NavContent
                pathname={pathname}
                org={org}
                user={user}
                sections={sections}
                canUseGlobalSearch={canUseGlobalSearch}
                searchTerm={searchTerm}
                searchLoading={searchLoading}
                searchError={searchError}
                groupedSearchResults={groupedSearchResults}
                onSearchTermChange={setSearchTerm}
                onClearSearch={() => setSearchTerm("")}
                onCompactSearchClick={handleCompactSearchClick}
              />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex h-[calc(100dvh-4rem)] w-full min-h-0 lg:h-screen">
        <aside
          onMouseEnter={handleDesktopSidebarMouseEnter}
          onMouseLeave={handleDesktopSidebarMouseLeave}
          className={cn(
            "hidden h-screen flex-col border-r border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] lg:flex",
            sidebarTransitionReady ? "transition-[width] duration-200 ease-out" : "transition-none",
            desktopSidebarExpanded ? "w-[15.5rem]" : "w-20"
          )}
        >
          <div
            className={cn(
              "border-b border-[color:var(--color-divider)] py-3",
              desktopSidebarExpanded ? "px-4" : "px-2"
            )}
          >
            <button
              type="button"
              aria-label={sidebarPinned ? "Collapse sidebar" : "Expand sidebar"}
              title={sidebarPinned ? "Collapse sidebar" : "Expand sidebar"}
              aria-pressed={sidebarPinned}
              onClick={handleDesktopSidebarToggle}
              className={cn(
                "sidebar-toggle-btn inline-flex h-[var(--icon-button-size-toolbar)] w-[var(--icon-button-size-toolbar)] items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] transition hover:bg-[color:var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]",
                desktopSidebarExpanded ? "" : "mx-auto"
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="sidebar-toggle-icon h-[var(--icon-size-toolbar)] w-[var(--icon-size-toolbar)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
                <path className="sidebar-toggle-divider" d="M9 4.5v15" strokeLinecap="round" />
                <path className="sidebar-toggle-dots" d="M6.5 9.5h1.5M6.5 12h1.5M6.5 14.5h1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div
            className={cn(
              "flex-1 overflow-y-auto overflow-x-visible py-6",
              desktopSidebarExpanded ? "px-4" : "px-3"
            )}
          >
            <NavContent
              pathname={pathname}
              org={org}
              user={user}
              sections={sections}
              compact={!desktopSidebarExpanded}
              canUseGlobalSearch={canUseGlobalSearch}
              searchTerm={searchTerm}
              searchLoading={searchLoading}
              searchError={searchError}
              groupedSearchResults={groupedSearchResults}
              onSearchTermChange={setSearchTerm}
              onClearSearch={() => setSearchTerm("")}
              onCompactSearchClick={handleCompactSearchClick}
            />
          </div>
        </aside>

        <main
          id="main-content"
          className="flex-1 min-h-0 min-w-0 overflow-y-auto lg:h-screen"
        >
          <div className="space-y-6 px-3 pb-8 pt-5 sm:px-4 sm:pb-10 sm:pt-6 lg:px-10 lg:pb-16 lg:pt-8">
          {shouldShowTopActivityTrigger ? (
              <div className="hidden lg:flex lg:justify-end">
                <button
                  type="button"
                  aria-label="Open activity"
                  onClick={() => setActivityDrawerOpen(true)}
                  className="relative inline-flex h-[var(--icon-button-size-toolbar)] w-[var(--icon-button-size-toolbar)] items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] shadow-[var(--shadow-subtle)] transition hover:bg-[color:var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[var(--icon-size-toolbar)] w-[var(--icon-size-toolbar)]" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M15 17H9a2 2 0 0 1-2-2v-4a5 5 0 1 1 10 0v4a2 2 0 0 1-2 2Z" />
                    <path d="M10 20a2 2 0 0 0 4 0" />
                  </svg>
                  {activityBadgeCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-danger)] px-1 text-[10px] font-semibold text-white">
                      {activityBadgeCount > 99 ? "99+" : activityBadgeCount}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}
            {capabilities.canAccessAdmin &&
            onboarding &&
            onboarding.status === "NOT_ACTIVATED" &&
            !pathname.startsWith("/onboarding") ? (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-4 py-4 shadow-[var(--shadow-subtle)] sm:px-6">
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
            {hideHeader ? null : (
              <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-4 py-4 shadow-[var(--shadow-subtle)] sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[22px] font-semibold text-ink">{title}</h2>
                    {subtitle ? <p className="text-sm text-[color:var(--color-text-muted)]">{subtitle}</p> : null}
                  </div>
                  {canUseActivity && !hideTopActivityTrigger ? (
                    <button
                      type="button"
                      aria-label="Open activity"
                      onClick={() => setActivityDrawerOpen(true)}
                      className="relative inline-flex h-[var(--icon-button-size-toolbar)] w-[var(--icon-button-size-toolbar)] items-center justify-center rounded-[var(--radius-control)] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] shadow-[var(--shadow-subtle)] transition hover:bg-[color:var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[var(--icon-size-toolbar)] w-[var(--icon-size-toolbar)]" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M15 17H9a2 2 0 0 1-2-2v-4a5 5 0 1 1 10 0v4a2 2 0 0 1-2 2Z" />
                        <path d="M10 20a2 2 0 0 0 4 0" />
                      </svg>
                      {activityBadgeCount > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-danger)] px-1 text-[10px] font-semibold text-white">
                          {activityBadgeCount > 99 ? "99+" : activityBadgeCount}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
            <AppShellActivityContext.Provider value={activityControls}>
              {children}
            </AppShellActivityContext.Provider>
          </div>
        </main>
      </div>
      {activityDrawerOpen ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Activity">
          <button
            type="button"
            aria-label="Close activity drawer"
            className="absolute inset-0 bg-black/20"
            onClick={() => setActivityDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-[min(28rem,96vw)] overflow-y-auto border-l border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-ink">Activity</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">Now and this week queues</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setActivityDrawerOpen(false)}>
                Close
              </Button>
            </div>
            <div className="mt-4 space-y-4">
              {activityLoading ? <div className="text-sm text-[color:var(--color-text-muted)]">Loading activity…</div> : null}
              {activityError ? <div className="text-sm text-[color:var(--color-danger)]">{activityError}</div> : null}
              {!activityLoading && !activityError ? (
                <>
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">Now</div>
                    {activityNow.length === 0 ? (
                      <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                        No active blockers.
                      </div>
                    ) : (
                      activityNow.map((item) => (
                        <Card key={item.id} className="space-y-1 border border-[color:var(--color-divider)] px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-ink">{item.title}</div>
                              <div className="text-xs text-[color:var(--color-text-muted)]">
                                {(item.count ?? 1) > 1 ? `${item.count} items` : "1 item"} · {compactRelativeTime(item.timestamp)}
                              </div>
                            </div>
                            <span className="rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                              {item.severity}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setActivityDrawerOpen(false);
                              router.push(item.cta.href);
                            }}
                          >
                            {item.cta.label}
                          </Button>
                        </Card>
                      ))
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">This week</div>
                    {activityWeek.length === 0 ? (
                      <div className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
                        No scheduled risk this week.
                      </div>
                    ) : (
                      activityWeek.map((item) => (
                        <Card key={item.id} className="space-y-1 border border-[color:var(--color-divider)] px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-ink">{item.title}</div>
                              <div className="text-xs text-[color:var(--color-text-muted)]">
                                {(item.count ?? 1) > 1 ? `${item.count} items` : "1 item"} · {compactRelativeTime(item.timestamp)}
                              </div>
                            </div>
                            <span className="rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
                              {item.severity}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setActivityDrawerOpen(false);
                              router.push(item.cta.href);
                            }}
                          >
                            {item.cta.label}
                          </Button>
                        </Card>
                      ))
                    )}
                  </div>
                  <div className="pt-1">
                    <Link href="/today" onClick={() => setActivityDrawerOpen(false)}>
                      <Button className="w-full" size="sm">
                        View all activity
                      </Button>
                    </Link>
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
      <ToastViewport />
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  hideHeader,
  hideTopActivityTrigger,
  children,
}: {
  title: string;
  subtitle?: string;
  hideHeader?: boolean;
  hideTopActivityTrigger?: boolean;
  children: ReactNode;
}) {
  return (
    <AppShellInner title={title} subtitle={subtitle} hideHeader={hideHeader} hideTopActivityTrigger={hideTopActivityTrigger}>
      {children}
    </AppShellInner>
  );
}

export function useAppShellActivity() {
  return useContext(AppShellActivityContext);
}
