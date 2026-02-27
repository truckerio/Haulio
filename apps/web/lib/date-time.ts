type DateInput = Date | string | number | null | undefined;

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toDate(value: DateInput): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: DateInput, fallback = "-"): string {
  const date = toDate(value);
  return date ? DATE_FORMATTER.format(date) : fallback;
}

export function formatDateTime(value: DateInput, fallback = "-"): string {
  const date = toDate(value);
  return date ? DATE_TIME_FORMATTER.format(date) : fallback;
}

export function formatTime(value: DateInput, fallback = "-"): string {
  const date = toDate(value);
  return date ? TIME_FORMATTER.format(date) : fallback;
}
