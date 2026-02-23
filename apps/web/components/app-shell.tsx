"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { useUser } from "@/components/auth/user-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type NavSection = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

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
      { href: "/trips", label: "Trips" },
      { href: "/teams", label: "Teams (Ops)" },
      { href: "/finance", label: "Finance" },
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
  ADMIN: [
    "/today",
    "/dashboard",
    "/loads",
    "/dispatch",
    "/trips",
    "/teams",
    "/finance",
    "/audit",
    "/admin",
    "/profile",
  ],
  HEAD_DISPATCHER: ["/today", "/dashboard", "/loads", "/dispatch", "/trips", "/teams", "/finance", "/profile"],
  DISPATCHER: ["/today", "/dashboard", "/loads", "/dispatch", "/trips", "/finance", "/profile"],
  BILLING: ["/today", "/dashboard", "/loads", "/trips", "/finance", "/profile"],
  DRIVER: ["/driver"],
};

const driverSections: NavSection[] = [
  {
    title: "Driver",
    items: [{ href: "/driver", label: "Driver Portal" }],
  },
];

const searchGroups: Array<{ type: SearchResult["type"]; label: string }> = [
  { type: "load", label: "Loads" },
  { type: "driver", label: "Drivers" },
  { type: "employee", label: "Employees" },
  { type: "customer", label: "Customers" },
];
const NAV_SEARCH_INPUT_ID = "global-nav-search-input";

const searchRoles = new Set(["ADMIN", "HEAD_DISPATCHER", "DISPATCHER", "BILLING"]);
const SIDEBAR_PINNED_KEY = "haulio:sidebar:pinned";
const SIDEBAR_PEEK_OPEN_DELAY_MS = 380;
const SIDEBAR_PEEK_CLOSE_DELAY_MS = 240;

function getVisibleSections(role?: string, options?: { showTeamsOps?: boolean }) {
  if (role === "DRIVER") return driverSections;
  const allowed = roleRoutes[role ?? ""] ?? defaultRoutes;
  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.href === "/teams") {
          return Boolean(options?.showTeamsOps);
        }
        return allowed.includes(item.href);
      }),
    }))
    .filter((section) => section.items.length > 0);
  return sections;
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
  children,
}: {
  title: string;
  subtitle?: string;
  hideHeader?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const sidebarPrefReadyRef = useRef(false);
  const { user, org } = useUser();
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false);
  const [desktopHoverEnabled, setDesktopHoverEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const [teamsEnabled, setTeamsEnabled] = useState(false);
  const canSeeTeamsOps = Boolean(user && (user.role === "ADMIN" || user.role === "HEAD_DISPATCHER"));
  const showTeamsOps = Boolean(user && (user.role === "ADMIN" || (user.role === "HEAD_DISPATCHER" && teamsEnabled)));
  const canUseGlobalSearch = Boolean(user && searchRoles.has(user.role));
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

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SIDEBAR_PINNED_KEY);
    setSidebarPinned(stored === "true");
    sidebarPrefReadyRef.current = true;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const applyHoverMode = () => setDesktopHoverEnabled(media.matches);
    applyHoverMode();
    media.addEventListener("change", applyHoverMode);
    return () => media.removeEventListener("change", applyHoverMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sidebarPrefReadyRef.current) return;
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, sidebarPinned ? "true" : "false");
  }, [sidebarPinned]);

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
      setTeamsEnabled(false);
      return;
    }
    if (!canSeeTeamsOps) {
      setTeamsEnabled(false);
      return;
    }
    let active = true;
    apiFetch<{ teams: Array<{ id: string; name?: string | null }> }>("/teams")
      .then((data) => {
        if (!active) return;
        setTeamsEnabled((data.teams ?? []).some((team) => team.name && team.name !== "Default"));
      })
      .catch(() => {
        if (!active) return;
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
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
          className="rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
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
            "hidden h-screen flex-col border-r border-[color:var(--color-divider)] bg-[color:var(--color-surface-elevated)] transition-[width] duration-200 ease-out lg:flex",
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
            {user?.role === "ADMIN" &&
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
                <h2 className="text-[22px] font-semibold text-ink">{title}</h2>
                {subtitle ? <p className="text-sm text-[color:var(--color-text-muted)]">{subtitle}</p> : null}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  hideHeader,
  children,
}: {
  title: string;
  subtitle?: string;
  hideHeader?: boolean;
  children: ReactNode;
}) {
  return <AppShellInner title={title} subtitle={subtitle} hideHeader={hideHeader}>{children}</AppShellInner>;
}
