export type SemanticPeriod =
  | { kind: "interval"; start: string; endExclusive: string }
  | { kind: "snapshot"; asOf: string };
export type SemanticMetric = {
  metricId: string;
  name: string;
  label?: string;
  definition: string;
  scope: string;
  unit: string;
  currency: string | null;
  value: number | null;
  state: string;
  period: SemanticPeriod;
  timezone: string;
  department: string | null;
  reasons: string[];
  freshness: { lastSuccess: number | null; maxAgeHours: number };
  lineage: {
    sourceId: string;
    tabId: number;
    fields: Record<string, string>;
    snapshotRevision: number | null;
    contributingRows: number[];
  };
};
export type SemanticMapping = {
  purpose: string;
  entity: string;
  entityNamespace: string;
  label?: string | null;
  identityMode?: string;
  fields: Record<string, string>;
  currency?: string | null;
  period: SemanticPeriod;
  statusValues?: Record<string, string[]>;
  enabled?: boolean;
};
export type SemanticWorksheet = {
  sourceId: string;
  tabId: number;
  department: string | null;
  proposal: { purpose: string; fields: Record<string, string> };
  availableFields: { name: string; type: string; values: string[] }[];
  dateRange: { start: string; endExclusive: string } | null;
  confirmation: SemanticMapping | null;
  executiveEligible: boolean;
};
export type ExecutiveScope = {
  id: string;
  sourceId: string;
  tabId: number;
  label: string;
  purpose: string;
  department: string | null;
  currency: string | null;
  period: SemanticPeriod;
};
export type ExecutiveReport = {
  version: number;
  state: string;
  selectedScope: string | null;
  scopes: ExecutiveScope[];
  primary: SemanticMetric[];
  performance: {
    kind: string;
    metrics: SemanticMetric[];
    series: { date: string; revenue: number; costs: number }[];
  } | null;
  issues: {
    id: string;
    title: string;
    metric: SemanticMetric;
    scopeLabel: string;
    department: string | null;
    href: string;
  }[];
  additional: (ExecutiveScope & { metrics: SemanticMetric[] })[];
  dataStatus: string | null;
  reviewHref: string;
  summary: string | null;
};
export type SemanticView = {
  version: number;
  companyId: string;
  evaluatedAt: number;
  worksheets: SemanticWorksheet[];
  metrics: SemanticMetric[];
  executive: ExecutiveReport;
};
export function displayMetric(
  metric: Pick<SemanticMetric, "value" | "unit" | "currency">,
  compact = false,
) {
  if (metric.value === null) return "Unavailable";
  if (metric.unit === "currency" && metric.currency)
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: metric.currency,
      ...(compact && Math.abs(metric.value) >= 1_000_000
        ? { notation: "compact" as const, maximumFractionDigits: 1 }
        : {}),
    }).format(metric.value);
  return (
    new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(
      metric.value,
    ) + (metric.unit === "percent" ? "%" : "")
  );
}
export function displayPeriod(period: SemanticPeriod) {
  return period.kind === "snapshot"
    ? `As of ${period.asOf}`
    : `${period.start} – ${new Date(Date.parse(period.endExclusive + "T00:00:00Z") - 86400000).toISOString().slice(0, 10)}`;
}

export type ExecutiveSnapshot = Pick<
  SemanticView,
  "version" | "companyId" | "evaluatedAt" | "executive"
>;

export type IntelligenceAuthority = {
  version: number;
  companyId: string;
  datasetRevision: string;
  authorization: {
    fingerprint: string;
    role: string;
    canManageSources: boolean;
  };
  context: {
    key: string;
    scope: string;
    department: string;
    period: string;
    filters: Record<string, string[]>;
    periodBasis: string;
    filterBasis: string;
  };
};
export type IntelligenceSnapshot = ExecutiveSnapshot &
  IntelligenceAuthority & {
    metrics: (Omit<SemanticMetric, "period"> & {
      period: SemanticPeriod | null;
    })[];
    departments: string[];
    concerns: ExecutiveReport["issues"];
    scopes: ExecutiveScope[];
  };

export type RelationshipEndpoint = {
  scope: string;
  entity: "client" | "project" | "employee" | "resource" | "invoice" | "deal";
  idColumn: string;
  labelColumn: string;
  namespace: string;
  schema: string;
};
export type RelationshipContract = {
  id: string;
  label: string;
  from: RelationshipEndpoint;
  to: RelationshipEndpoint;
  foreignKey: string;
  confirmed: true;
};
