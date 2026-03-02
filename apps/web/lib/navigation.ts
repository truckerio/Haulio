import { getRoleCapabilities } from "./capabilities";

export type NavSection = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

export const navSections: NavSection[] = [
  {
    title: "Home",
    items: [
      { href: "/today", label: "Activity" },
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
      { href: "/safety", label: "Safety" },
      { href: "/support", label: "Support" },
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
    "/dispatch",
    "/teams",
    "/finance",
    "/audit",
    "/admin",
    "/profile",
  ],
  HEAD_DISPATCHER: ["/dispatch", "/teams", "/finance", "/profile"],
  DISPATCHER: ["/dispatch", "/finance", "/profile"],
  BILLING: ["/today", "/dashboard", "/loads", "/trips", "/finance", "/profile"],
  SAFETY: ["/safety", "/profile"],
  SUPPORT: ["/support", "/profile"],
  DRIVER: ["/driver"],
};

export const driverSections: NavSection[] = [
  {
    title: "Driver",
    items: [{ href: "/driver", label: "Driver Portal" }],
  },
];

export function getVisibleSections(role?: string, options?: { showTeamsOps?: boolean }) {
  const roleCapabilities = getRoleCapabilities(role);
  if (roleCapabilities.canonicalRole === "DRIVER") return driverSections;
  const allowed = roleRoutes[role ?? ""] ?? defaultRoutes;
  const isDispatchRole =
    roleCapabilities.canonicalRole === "DISPATCHER" || roleCapabilities.canonicalRole === "HEAD_DISPATCHER";
  const secondaryDispatchRoutes = new Set(["/today", "/dashboard"]);
  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (isDispatchRole && secondaryDispatchRoutes.has(item.href)) {
          return false;
        }
        if (item.href === "/teams") {
          return allowed.includes(item.href) && Boolean(options?.showTeamsOps);
        }
        return allowed.includes(item.href);
      }),
    }))
    .filter((section) => section.items.length > 0);

  if (isDispatchRole) {
    const secondaryItems = navSections[0].items.filter((item) => secondaryDispatchRoutes.has(item.href));
    if (secondaryItems.length > 0) {
      sections.push({ title: "More", items: secondaryItems });
    }
  }

  return sections;
}
