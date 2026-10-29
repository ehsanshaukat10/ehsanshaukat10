export function safeReturnPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return "/entry";
  const url = new URL(value, "https://aynor.internal");
  if (!/^\/(?:companies(?:\/|$)|invite\/)/.test(url.pathname)) return "/entry";
  return url.pathname + url.search + url.hash;
}
export function workspaceDestination(company) {
  if (company.data.completed || !["Owner", "Admin"].includes(company.role))
    return `/companies/${company.id}/overview`;
  const aliases = {
    sources: "integrations",
    discovery: "mapping",
    readiness: "mapping",
    kpis: "goals",
    complete: "review",
    company: "company",
  };
  const saved = aliases[company.data.step] || company.data.step;
  const step = [
    "company",
    "departments",
    "integrations",
    "mapping",
    "priorities",
    "goals",
    "review",
  ].includes(saved)
    ? saved
    : "departments";
  return `/companies/${company.id}/onboarding/${step}`;
}
export function authenticatedDestination(companies, requested) {
  const next = safeReturnPath(requested);
  if (next.startsWith("/invite/")) return next;
  if (!companies.length) return "/companies/new";
  if (next === "/companies" || /^\/companies\/new(?:[?#]|$)/.test(next))
    return next;
  const id = next.match(/^\/companies\/([^/?#]+)/)?.[1];
  const selected = companies.find((company) => company.id === id);
  if (selected)
    return !selected.data.completed &&
      ["Owner", "Admin"].includes(selected.role)
      ? workspaceDestination(selected)
      : next;
  const company =
    [...companies]
      .reverse()
      .find((c) => !c.data.completed && ["Owner", "Admin"].includes(c.role)) ||
    companies[0];
  return workspaceDestination(company);
}
