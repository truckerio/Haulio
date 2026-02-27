type CountryTimeZoneDefinition = {
  code: string;
  label: string;
  timeZones: string[];
};

const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Warsaw",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const COUNTRY_TIMEZONE_DEFINITIONS: CountryTimeZoneDefinition[] = [
  { code: "US", label: "United States", timeZones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"] },
  { code: "CA", label: "Canada", timeZones: ["America/Toronto", "America/Winnipeg", "America/Edmonton", "America/Vancouver", "America/Halifax", "America/St_Johns"] },
  { code: "MX", label: "Mexico", timeZones: ["America/Mexico_City", "America/Cancun", "America/Monterrey", "America/Tijuana", "America/Chihuahua"] },
  { code: "BR", label: "Brazil", timeZones: ["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Recife"] },
  { code: "AR", label: "Argentina", timeZones: ["America/Argentina/Buenos_Aires"] },
  { code: "CL", label: "Chile", timeZones: ["America/Santiago"] },
  { code: "CO", label: "Colombia", timeZones: ["America/Bogota"] },
  { code: "PE", label: "Peru", timeZones: ["America/Lima"] },
  { code: "GB", label: "United Kingdom", timeZones: ["Europe/London"] },
  { code: "IE", label: "Ireland", timeZones: ["Europe/Dublin"] },
  { code: "FR", label: "France", timeZones: ["Europe/Paris"] },
  { code: "DE", label: "Germany", timeZones: ["Europe/Berlin"] },
  { code: "NL", label: "Netherlands", timeZones: ["Europe/Amsterdam"] },
  { code: "BE", label: "Belgium", timeZones: ["Europe/Brussels"] },
  { code: "ES", label: "Spain", timeZones: ["Europe/Madrid", "Atlantic/Canary"] },
  { code: "IT", label: "Italy", timeZones: ["Europe/Rome"] },
  { code: "PL", label: "Poland", timeZones: ["Europe/Warsaw"] },
  { code: "CZ", label: "Czech Republic", timeZones: ["Europe/Prague"] },
  { code: "SE", label: "Sweden", timeZones: ["Europe/Stockholm"] },
  { code: "NO", label: "Norway", timeZones: ["Europe/Oslo"] },
  { code: "DK", label: "Denmark", timeZones: ["Europe/Copenhagen"] },
  { code: "PT", label: "Portugal", timeZones: ["Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira"] },
  { code: "AE", label: "United Arab Emirates", timeZones: ["Asia/Dubai"] },
  { code: "SA", label: "Saudi Arabia", timeZones: ["Asia/Riyadh"] },
  { code: "IN", label: "India", timeZones: ["Asia/Kolkata"] },
  { code: "PK", label: "Pakistan", timeZones: ["Asia/Karachi"] },
  { code: "BD", label: "Bangladesh", timeZones: ["Asia/Dhaka"] },
  { code: "SG", label: "Singapore", timeZones: ["Asia/Singapore"] },
  { code: "MY", label: "Malaysia", timeZones: ["Asia/Kuala_Lumpur"] },
  { code: "TH", label: "Thailand", timeZones: ["Asia/Bangkok"] },
  { code: "VN", label: "Vietnam", timeZones: ["Asia/Ho_Chi_Minh"] },
  { code: "PH", label: "Philippines", timeZones: ["Asia/Manila"] },
  { code: "CN", label: "China", timeZones: ["Asia/Shanghai"] },
  { code: "HK", label: "Hong Kong", timeZones: ["Asia/Hong_Kong"] },
  { code: "JP", label: "Japan", timeZones: ["Asia/Tokyo"] },
  { code: "KR", label: "South Korea", timeZones: ["Asia/Seoul"] },
  { code: "ID", label: "Indonesia", timeZones: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] },
  { code: "AU", label: "Australia", timeZones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Darwin", "Australia/Perth"] },
  { code: "NZ", label: "New Zealand", timeZones: ["Pacific/Auckland", "Pacific/Chatham"] },
  { code: "ZA", label: "South Africa", timeZones: ["Africa/Johannesburg"] },
  { code: "NG", label: "Nigeria", timeZones: ["Africa/Lagos"] },
  { code: "KE", label: "Kenya", timeZones: ["Africa/Nairobi"] },
  { code: "EG", label: "Egypt", timeZones: ["Africa/Cairo"] },
  { code: "OTHER", label: "Other / Global", timeZones: [] },
];

function getSupportedTimeZones() {
  try {
    const values = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (Array.isArray(values) && values.length > 0) return values;
  } catch {
    // ignore and fallback
  }
  return FALLBACK_TIME_ZONES;
}

const SUPPORTED_TIME_ZONES = getSupportedTimeZones();
const SUPPORTED_TIME_ZONE_SET = new Set(SUPPORTED_TIME_ZONES);

export const ONBOARDING_COUNTRY_OPTIONS = COUNTRY_TIMEZONE_DEFINITIONS.map(({ code, label }) => ({ code, label }));

function normalizeCountryTimeZones(def: CountryTimeZoneDefinition) {
  if (def.code === "OTHER") return [...SUPPORTED_TIME_ZONES];
  const filtered = def.timeZones.filter((zone) => SUPPORTED_TIME_ZONE_SET.has(zone));
  return filtered.length > 0 ? filtered : [...SUPPORTED_TIME_ZONES];
}

export function getCountryTimeZones(countryCode: string) {
  const def = COUNTRY_TIMEZONE_DEFINITIONS.find((entry) => entry.code === countryCode) ?? COUNTRY_TIMEZONE_DEFINITIONS[0];
  return normalizeCountryTimeZones(def);
}

export function inferCountryFromTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) return null;
  const match = COUNTRY_TIMEZONE_DEFINITIONS.find((entry) => entry.code !== "OTHER" && entry.timeZones.includes(timeZone));
  return match?.code ?? null;
}

