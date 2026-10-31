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
    overviewReturn(companyId, current) ||
    overviewReturn(companyId, origin.searchParams.get("returnTo"));
  if (returnTo) destination.searchParams.set("returnTo", returnTo);
  return destination.pathname + destination.search + destination.hash;
}
export function evidenceReturn(companyId: string, current: string): string {
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
