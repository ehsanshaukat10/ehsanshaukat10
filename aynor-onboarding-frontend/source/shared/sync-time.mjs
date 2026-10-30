export function formatSyncTime(value, timezone = "UTC") {
  if (value === null || value === undefined || value === "")
    return "Not synced yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Timestamp unavailable";
  let zone = timezone || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(date);
  } catch {
    zone = "UTC";
  }
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: zone,
    })
      .format(date)
      .replace(/\b(am|pm)\b/g, (v) => v.toUpperCase()) + ` · ${zone}`
  );
}
export function dateInTimezone(timezone = "UTC", value = Date.now()) {
  let format;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  const parts = Object.fromEntries(
    format
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
