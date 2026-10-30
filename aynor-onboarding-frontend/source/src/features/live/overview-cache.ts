// A tab-local last-successful snapshot survives route changes and reloads.
// Scope includes the authenticated identity, company, role and currency.
type Entry = { period: string; report: unknown };
const prefix = "aynor.overview.";
const memory = new Map<string, Entry>();
export function readOverviewCache(scope: string): Entry | null {
  if (memory.has(scope)) return memory.get(scope)!;
  try {
    const entry = JSON.parse(sessionStorage.getItem(prefix + scope) || "null");
    if (!entry || !["all", "month", "quarter", "year"].includes(entry.period))
      return null;
    const report = entry.report;
    if (
      !(
        report?.tableReport?.kind === "tables" &&
        Array.isArray(report.tableReport.tables) &&
        report.tableReport.tables.length
      ) &&
      !(report?.data && Array.isArray(report.data.points) && report.data.totals)
    )
      return null;
    memory.set(scope, entry);
    return entry;
  } catch {
    return null;
  }
}
export function writeOverviewCache(
  scope: string,
  period: string,
  report: unknown,
) {
  const entry = { period, report };
  memory.delete(scope);
  memory.set(scope, entry);
  if (memory.size > 8) memory.delete(memory.keys().next().value!);
  try {
    sessionStorage.setItem(prefix + scope, JSON.stringify(entry));
  } catch {
    /* In-memory retention still works when storage is full or blocked. */
  }
}
export function clearOverviewCache(scope?: string) {
  if (scope) memory.delete(scope);
  else memory.clear();
  try {
    if (scope) sessionStorage.removeItem(prefix + scope);
    else
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* Clearing memory does not depend on browser storage availability. */
  }
}
