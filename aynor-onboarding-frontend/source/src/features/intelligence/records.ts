import type { Executive } from "./shared";
import {
  financeAllowed,
  metricLabels,
  metricValue,
  metricCovered,
  totals,
  type MetricId,
} from "../dashboard/model";
export type MetricKey =
  MetricId | "revenue" | "costs" | "profit" | "projects" | "capacity";
export const metricNames: Record<MetricKey, string> = {
  ...metricLabels,
  revenue: "Revenue",
  costs: "Operating expenses",
  profit: "Operating profit",
  projects: "Tracked projects",
  capacity: "Assigned capacity",
};
export function departmentMetrics(
  dept: string,
  e: Pick<Executive, "company" | "profile">,
): MetricKey[] {
  if (/finance/i.test(dept) && financeAllowed(e.company))
    return ["revenue", "costs", "profit", "margin", "receivables"];
  if (/sales|customer|success/i.test(dept))
    return e.profile === "saas"
      ? ["customers", "retention", "churn"]
      : e.profile === "managed"
        ? ["renewals", "revenue"]
        : financeAllowed(e.company)
          ? ["revenue"]
          : [];
  if (/project|delivery|engineering|operations|support|\bit\b/i.test(dept))
    return e.profile === "managed"
      ? ["sla", "tickets", "utilization"]
      : ["projects", "onTime", "utilization"];
  if (/human|people|resource/i.test(dept)) return ["capacity", "utilization"];
  return [];
}
export function metricRecord(
  id: MetricKey,
  dept: string,
  e: Pick<Executive, "sample" | "company" | "profile" | "scenario">,
) {
  const s = e.sample,
    covered = s?.covered.includes(dept),
    allowed = departmentMetrics(dept, e).includes(id);
  const empty = {
    id,
    label: metricNames[id] || id,
    value: null as number | null,
    unit: "number" as "number" | "money" | "percent",
    method: "Required fields are not mapped to this department.",
    context: "No validated measure",
    series: [] as number[],
  };
  if (!s || !covered || !allowed) return empty;
  if (["revenue", "costs", "profit"].includes(id)) {
    const t = totals(s);
    return {
      ...empty,
      value:
        id === "revenue"
          ? t.revenue
          : id === "costs"
            ? t.costs
            : t.revenue - t.costs,
      unit: "money" as const,
      method:
        id === "profit"
          ? "Revenue − operating expenses."
          : `Sum of ${id === "costs" ? "operating expenses" : "revenue"} in the selected reporting period.`,
      context: "Period total",
      series: s.points.map((p) =>
        id === "revenue"
          ? p.revenue
          : id === "costs"
            ? p.costs
            : p.revenue - p.costs,
      ),
    };
  }
  if (id === "projects")
    return {
      ...empty,
      value: s.projects.filter((p) => p.department === dept).length,
      method: "Count of project records mapped to this department.",
      context: "Project register snapshot",
    };
  if (id === "capacity")
    return {
      ...empty,
      value: e.scenario === "clear" ? 40 : 46,
      method:
        "Migration allocation 24 h + launch allocation 22 h; available capacity 40 h. Clear-state example has 40 h assigned.",
      context: "Hours assigned / 40 available",
    };
  if (!metricCovered(id as MetricId, s)) return empty;
  const metric = metricValue(id as MetricId, s);
  return {
    ...empty,
    ...metric,
    series:
      id === "margin"
        ? s.points.map((p) => ((p.revenue - p.costs) / p.revenue) * 100)
        : id === "onTime"
          ? s.points.map((p) => (p.delivered / p.planned) * 100)
          : [],
  };
}
export function formattedMetric(
  record: ReturnType<typeof metricRecord>,
  e: Pick<Executive, "money">,
) {
  return record.value === null
    ? "—"
    : record.unit === "money"
      ? e.money(record.value)
      : record.unit === "percent"
        ? record.value.toFixed(1) + "%"
        : record.value.toLocaleString("en", { maximumFractionDigits: 1 });
}
export function departmentStatus(dept: string, e: Executive) {
  if (!e.sample || !e.sample.covered.includes(dept)) return "Limited data";
  if (!departmentMetrics(dept, e).length) return "Limited data";
  return e.sample.risks.some((r) => r.department === dept)
    ? "Needs attention"
    : "No flagged issues";
}
