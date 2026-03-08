function parseCsvSet(value: string | undefined) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

function isEnabledFlag(value: string | undefined, fallback = true) {
  if (value == null) return fallback;
  return String(value).trim().toLowerCase() !== "false";
}

export function isChatbotEnabledForOrgClient(orgId: string | null | undefined, workflowEnabled?: boolean | null) {
  if (typeof workflowEnabled === "boolean") return workflowEnabled;
  const moduleEnabled = isEnabledFlag(process.env.NEXT_PUBLIC_CHATBOT_MODULE_ENABLED, false);
  if (!moduleEnabled) return false;
  const allowlist = parseCsvSet(process.env.NEXT_PUBLIC_CHATBOT_ALLOWED_ORGS);
  if (allowlist.size === 0) return true;
  if (!orgId) return false;
  return allowlist.has(orgId);
}
