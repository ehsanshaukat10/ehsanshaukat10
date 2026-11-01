// Return only to this company's Overview; preserve its exact reporting context.
export function overviewReturn(
  companyId: string,
  candidate: string | null,
): string | null {
  if (!candidate || !candidate.startsWith("/")) return null;
  try {
    const url = new URL(candidate, "https://aynor.invalid");
    if (
      url.origin !== "https://aynor.invalid" ||
      url.pathname !== `/companies/${companyId}/overview`
    )
      return null;
    url.searchParams.delete("returnTo");
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
export function connectionsLink(
  companyId: string,
  target: string,
  current: string,
): string {
  const destination = new URL(target, "https://aynor.invalid");
  if (
    destination.origin !== "https://aynor.invalid" ||
    destination.pathname !== `/companies/${companyId}/connections`
  )
    return target;
  const origin = new URL(current, "https://aynor.invalid");
  const returnTo =
    moduleReturn(companyId, current) ||
    moduleReturn(companyId, origin.searchParams.get("returnTo"));
  if (returnTo) destination.searchParams.set("returnTo", returnTo);
  return destination.pathname + destination.search + destination.hash;
}
export function evidenceReturn(companyId: string, current: string): string {
  const contextual = moduleReturn(
    companyId,
    new URL(current, "https://aynor.invalid").searchParams.get("from"),
  );
  if (contextual) return contextual;
  const url = new URL(
    overviewReturn(companyId, current) || `/companies/${companyId}/overview`,
    "https://aynor.invalid",
  );
  for (const key of ["evidence", "source", "tab", "revision"])
    url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}
// Evidence URLs supply their own source/tab, while carrying the current dashboard filters.
export function evidenceLink(target: string, search: string): string {
  const url = new URL(target, "https://aynor.invalid");
  for (const [key, value] of new URLSearchParams(search))
    if (
      !["evidence", "source", "tab", "returnTo", "scope", "revision"].includes(
        key,
      )
    )
      url.searchParams.append(key, value);
  return url.pathname + url.search;
}

// Only approved business module routes can be used as contextual return destinations.
export function moduleReturn(
  companyId: string,
  candidate: string | null,
): string | null {
  if (!candidate) return null;
  try {
    const u = new URL(candidate, "https://aynor.invalid");
    const prefix = `/companies/${companyId}/`;
    if (u.origin !== "https://aynor.invalid" || !u.pathname.startsWith(prefix))
      return null;
    const route = u.pathname.slice(prefix.length);
    if (
      !/^(overview|departments(?:\/[^/]+(?:\/metrics\/[^/]+)?)?|actions(?:\/[^/]+)?|dependencies(?:\/[^/]+(?:\/evidence)?)?)$/.test(
        route,
      )
    )
      return null;
    u.searchParams.delete("returnTo");
    u.searchParams.delete("from");
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}
export function businessLink(
  companyId: string,
  target: string,
  search: string,
  from?: string,
): string {
  const dest = new URL(target, "https://aynor.invalid");
  if (
    dest.origin !== "https://aynor.invalid" ||
    !dest.pathname.startsWith(`/companies/${companyId}/`)
  )
    return `/companies/${companyId}/overview`;
  const p = new URLSearchParams(search);
  for (const [key, value] of p)
    if (
      [
        "scope",
        "department",
        "period",
        "filter",
        "status",
        "q",
        "tag",
      ].includes(key) &&
      !dest.searchParams.has(key)
    ) {
      for (const v of p.getAll(key)) dest.searchParams.append(key, v);
    }
  if (from) {
    const safe = moduleReturn(companyId, from);
    if (safe) dest.searchParams.set("from", safe);
  }
  return dest.pathname + dest.search;
}
