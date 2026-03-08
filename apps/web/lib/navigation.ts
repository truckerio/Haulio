import { getRoleCapabilities, type CanonicalRole } from "./capabilities";

export type NavSection = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

const NAV_ITEMS = {
  today: { href: "/today", label: "Activity" },
  dashboard: { href: "/dashboard", label: "Task Inbox" },
  profile: { href: "/profile", label: "Profile" },
  chatbot: { href: "/chatbot", label: "Chatbot" },
  dispatch: { href: "/dispatch", label: "Dispatch" },
  teams: { href: "/teams", label: "Teams (Ops)" },
  finance: { href: "/finance", label: "Finance" },
  safety: { href: "/safety", label: "Safety" },
  support: { href: "/support", label: "Support" },
  audit: { href: "/audit", label: "Audit" },
  admin: { href: "/admin", label: "Admin" },
  driver: { href: "/driver", label: "Driver Portal" },
} as const;

type NavItemKey = keyof typeof NAV_ITEMS;
type RoleNavPlan = { primary: NavItemKey[]; more: NavItemKey[] };

const ROLE_NAV_PLANS: Record<CanonicalRole, RoleNavPlan> = {
  ADMIN: {
    primary: ["today", "dispatch", "finance"],
    more: ["chatbot", "safety", "support", "teams", "audit", "admin", "dashboard", "profile"],
  },
  HEAD_DISPATCHER: {
    primary: ["dispatch"],
    more: ["chatbot", "finance", "teams", "today", "dashboard", "profile"],
  },
  DISPATCHER: {
    primary: ["dispatch"],
    more: ["chatbot", "finance", "today", "dashboard", "profile"],
  },
  BILLING: {
    primary: ["finance"],
    more: ["chatbot", "today", "dashboard", "profile"],
  },
  SAFETY: {
    primary: ["safety"],
    more: ["chatbot", "today", "dashboard", "profile"],
  },
  SUPPORT: {
    primary: ["support"],
    more: ["chatbot", "today", "dashboard", "profile"],
  },
  DRIVER: {
    primary: ["driver"],
    more: [],
  },
};

const DEFAULT_PLAN: RoleNavPlan = {
  primary: ["today"],
  more: ["profile"],
};

function isHrefAllowedByCapability(
  href: string,
  capabilities: ReturnType<typeof getRoleCapabilities>,
  options?: { chatbotEnabled?: boolean }
) {
  if (href.startsWith("/chatbot")) {
    return Boolean(capabilities.canonicalRole) && (options?.chatbotEnabled ?? true);
  }
  if (href.startsWith("/dispatch") || href.startsWith("/loads") || href.startsWith("/trips") || href.startsWith("/teams")) {
    return capabilities.canAccessDispatch;
  }
  if (href.startsWith("/finance") || href.startsWith("/billing") || href.startsWith("/settlements")) {
    return capabilities.canAccessFinance;
  }
  if (href.startsWith("/safety")) return capabilities.canAccessSafety;
  if (href.startsWith("/support")) return capabilities.canAccessSupport;
  if (href.startsWith("/admin") || href.startsWith("/audit")) return capabilities.canAccessAdmin;
  if (href.startsWith("/driver")) return capabilities.canAccessDriver;
  return true;
}

function buildRoleItems(
  keys: NavItemKey[],
  capabilities: ReturnType<typeof getRoleCapabilities>,
  options?: { showTeamsOps?: boolean; chatbotEnabled?: boolean }
) {
  const seen = new Set<string>();
  const items = keys
    .map((key) => NAV_ITEMS[key])
    .filter((item) => {
      if (!item) return false;
      if (item.href === "/teams" && !options?.showTeamsOps) return false;
      if (!isHrefAllowedByCapability(item.href, capabilities, options)) return false;
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });
  return items;
}

export const driverSections: NavSection[] = [{ title: "Driver", items: [NAV_ITEMS.driver] }];

export function getVisibleSections(role?: string, options?: { showTeamsOps?: boolean; chatbotEnabled?: boolean }) {
  const capabilities = getRoleCapabilities(role);
  const canonicalRole = capabilities.canonicalRole;
  if (canonicalRole === "DRIVER") return driverSections;

  const rolePlan = canonicalRole ? ROLE_NAV_PLANS[canonicalRole] : DEFAULT_PLAN;
  const primaryItems = buildRoleItems(rolePlan.primary, capabilities, options);
  const moreItems = buildRoleItems(
    rolePlan.more.filter((key) => !rolePlan.primary.includes(key)),
    capabilities,
    options
  );

  const sections: NavSection[] = [];
  if (primaryItems.length > 0) sections.push({ title: "Workspace", items: primaryItems });
  if (moreItems.length > 0) sections.push({ title: "More", items: moreItems });
  return sections;
}
