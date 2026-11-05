import type {
  IntelligenceAuthority,
  IntelligenceSnapshot,
} from "./semantic-types";
export function intelligenceCacheKey(
  user: string,
  company: string,
  proof: IntelligenceAuthority,
) {
  return JSON.stringify([
    user,
    company,
    proof.authorization.role,
    proof.authorization.fingerprint,
    proof.context.key,
    proof.datasetRevision,
  ]);
}
export function authorizedCachedSnapshot(
  report: unknown,
  company: string,
  proof: IntelligenceAuthority,
): report is IntelligenceSnapshot {
  const value = report as IntelligenceSnapshot | null;
  return (
    !!value &&
    value.companyId === company &&
    value.authorization?.fingerprint === proof.authorization.fingerprint &&
    value.authorization.role === proof.authorization.role &&
    value.context?.key === proof.context.key &&
    value.datasetRevision === proof.datasetRevision &&
    Array.isArray(value.metrics) &&
    Array.isArray(value.worksheets) &&
    Array.isArray(value.departments) &&
    Array.isArray(value.concerns) &&
    Array.isArray(value.scopes)
  );
}
export function intelligenceQuery(search: string) {
  const params = new URLSearchParams();
  const input = new URLSearchParams(search);
  for (const value of input.getAll("scope")) params.append("scope", value);
  if (!params.has("scope")) params.set("scope", "");
  for (const [key, value] of input)
    if (["department", "period", "filter", "status", "q", "tag"].includes(key))
      params.append(key, value);
  return params.toString();
}
