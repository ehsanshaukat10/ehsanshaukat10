import type { Company, Goal } from "../../lib/api";
export type Profile = "services" | "saas" | "managed" | "general";
export type Period = "30d" | "quarter" | "year";
export type Scenario =
  "workspace" | "connected" | "partial" | "sync-error" | "stale" | "clear";
export type Section =
  | "departments"
  | "goals"
  | "dependencies"
  | "deadlines"
  | "clients"
  | "activity";
export type MetricId =
  | "margin"
  | "receivables"
  | "utilization"
  | "retention"
  | "churn"
  | "customers"
  | "sla"
  | "tickets"
  | "renewals"
  | "onTime";
export type Preferences = {
  layoutRevision: 2;
  period: Period;
  currency: string;
  profile: Profile | "auto";
  metrics: MetricId[];
  departments: string[] | null;
  sections: Section[];
  order: Section[];
};
export const sectionLabels: Record<Section, string> = {
  departments: "Department intelligence",
  goals: "Goals",
  dependencies: "Dependencies",
  deadlines: "Upcoming deadlines",
  clients: "Client concentration",
  activity: "Activity patterns",
};
export const periods: Record<Period, string> = {
  "30d": "Last complete month",
  quarter: "Last 3 complete months",
  year: "Last 12 complete months",
};
export const profiles: Record<Profile, string> = {
  services: "Software & professional services",
  saas: "SaaS & recurring revenue",
  managed: "Managed IT & support",
  general: "Business performance",
};
export const scenarios: Record<Scenario, string> = {
  workspace: "Your workspace",
  connected: "Connected example",
  partial: "Partial coverage example",
  "sync-error": "Sync failure example",
  stale: "Outdated data example",
  clear: "No critical issues example",
};
export const metricLabels: Record<MetricId, string> = {
  margin: "Profit margin",
  receivables: "Overdue receivables",
  utilization: "Resource utilization",
  retention: "Customer retention",
  churn: "Customer churn",
  customers: "Customer growth",
  sla: "SLA compliance",
  tickets: "Unresolved tickets",
  renewals: "Renewals due",
  onTime: "On-time delivery",
};
export function inferProfile(c: Company): Profile {
  const text = [
    c.industry,
    c.businessModel,
    ...c.data.priorities,
    ...c.data.goals.map((g) => g.name),
    ...c.data.sources,
  ]
    .join(" ")
    .toLowerCase();
  if (/managed it|sla|service desk|ticket|it support/.test(text))
    return "managed";
  if (/saas|subscription|mrr|recurring|churn|retention/.test(text))
    return "saas";
  if (
    /services|project delivery|utilization|billable/.test(text) ||
    c.data.departments.includes("Project Delivery")
  )
    return "services";
  return "general";
}
export function financeAllowed(c: Company) {
  return (
    !["Viewer", "Department Manager"].includes(c.role) ||
    c.scope.some((s) => /finance|sales/i.test(s))
  );
}
export function availableMetrics(profile: Profile, c: Company): MetricId[] {
  const deps = c.data.departments.join(" ");
  const financial = financeAllowed(c) && /finance|sales/i.test(deps),
    operations =
      /project|delivery|operations|engineering|human|people|resource/i.test(
        deps,
      ),
    sales = /sales|customer|success/i.test(deps),
    support = /support|operations|it|engineering/i.test(deps);
  const candidates: MetricId[] =
    profile === "saas"
      ? ["retention", "churn", "customers", "margin", "receivables"]
      : profile === "managed"
        ? ["sla", "tickets", "renewals", "margin", "utilization"]
        : ["margin", "receivables", "utilization", "onTime"];
  return candidates.filter((m) =>
    ["margin", "receivables"].includes(m)
      ? financial
      : ["retention", "churn", "customers", "renewals"].includes(m)
        ? sales
        : ["sla", "tickets"].includes(m)
          ? support
          : operations,
  );
}
export function metricCovered(id: MetricId, s: Sample) {
  const pattern = ["margin", "receivables"].includes(id)
    ? /finance|sales/i
    : ["retention", "churn", "customers", "renewals"].includes(id)
      ? /sales|customer|success/i
      : ["sla", "tickets"].includes(id)
        ? /support|operations|it|engineering/i
        : /project|delivery|operations|engineering|human|people|resource/i;
  return s.covered.some((d) => pattern.test(d));
}

const order: Section[] = [
  "departments",
  "goals",
  "dependencies",
  "deadlines",
  "clients",
  "activity",
];
export function defaults(c: Company): Preferences {
  const profile = inferProfile(c);
  return {
    layoutRevision: 2,
    period: "quarter",
    currency: c.currency || "USD",
    profile: "auto",
    metrics: availableMetrics(profile, c).slice(0, 3),
    departments: null,
    sections: ["departments", "goals", "dependencies", "deadlines"],
    order: [...order],
  };
}
export function preferenceKey(user: string, c: Company) {
  return `aynor.dashboard.v1.${user}.${c.id}`;
}
export function readPreferences(key: string, c: Company): Preferences {
  const initial = defaults(c);
  try {
    const p = JSON.parse(localStorage.getItem(key) || "null");
    if (!p) return initial;
    const profile =
      p.profile === "auto" || Object.hasOwn(profiles, p.profile)
        ? p.profile
        : "auto";
    const allowed = availableMetrics(
      profile === "auto" ? inferProfile(c) : profile,
      c,
    );
    return {
      layoutRevision: 2,
      period: Object.hasOwn(periods, p.period) ? p.period : initial.period,
      currency: [
        "USD",
        "PKR",
        "GBP",
        "EUR",
        "AED",
        "INR",
        "CAD",
        "AUD",
        "SGD",
      ].includes(p.currency)
        ? p.currency
        : initial.currency,
      profile,
      metrics: Array.isArray(p.metrics)
        ? p.metrics.filter((v: MetricId) => allowed.includes(v)).slice(0, 3)
        : initial.metrics,
      departments: Array.isArray(p.departments)
        ? p.departments.filter((d: string) => c.data.departments.includes(d))
        : null,
      sections: Array.isArray(p.sections)
        ? p.sections.filter(
            (s: Section) =>
              order.includes(s) &&
              (p.layoutRevision === 2 || !["clients", "activity"].includes(s)),
          )
        : initial.sections,
      order: Array.isArray(p.order)
        ? [
            ...new Set<Section>([
              ...p.order.filter((s: Section) => order.includes(s)),
              ...order,
            ]),
          ]
        : initial.order,
    };
  } catch {
    return initial;
  }
}
export type Point = {
  label: string;
  date: string;
  revenue: number;
  costs: number;
  delivered: number;
  planned: number;
};
export type Project = {
  id: string;
  name: string;
  client: string;
  owner: string;
  department: string;
  due: string;
  status: "Delayed" | "On track" | "At risk";
  evidence: string;
};
export type Risk = {
  id: string;
  title: string;
  impact: string;
  severity: "High" | "Medium";
  action: string;
  department: string;
  evidence: string[];
  type: "delivery" | "receivables" | "resource" | "churn" | "sla";
};
export type Sample = {
  points: Point[];
  previousRevenue: number;
  asOf: Date;
  projects: Project[];
  risks: Risk[];
  activity: { date: string; count: number; events: string[] }[];
  clients: { name: string; share: number; amount: number }[];
  covered: string[];
  source: string;
};
const date = (d: Date) => d.toISOString().slice(0, 10);
function offset(base: Date, days: number) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return date(d);
}
export function buildSample(
  c: Company,
  profile: Profile,
  period: Period,
  scenario: Scenario,
  now = new Date(),
): Sample {
  const asOf = new Date(now);
  asOf.setUTCDate(
    asOf.getUTCDate() -
      (scenario === "stale" ? 12 : scenario === "sync-error" ? 1 : 0),
  );
  const base =
    profile === "saas" ? 48000 : profile === "managed" ? 126000 : 184000;
  const all = Array.from({ length: 12 }, (_, i) => {
    const month = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 12 + i, 1),
    );
    const revenue = Math.round(
      base * (0.62 + i * 0.035 + (i % 3 === 0 ? 0.025 : 0)),
    );
    return {
      label: month.toLocaleDateString("en", {
        month: "short",
        timeZone: "UTC",
      }),
      date: date(month),
      revenue,
      costs: Math.round(revenue * (i === 10 ? 0.79 : 0.64 + (i % 3) * 0.025)),
      delivered: 14 + (i % 5),
      planned: 18 + (i % 5),
    };
  });
  let points: Point[];
  if (period === "30d") {
    const last = all[11],
      weights = [0.21, 0.24, 0.26, 0.29];
    points = weights.map((weight, i) => ({
      label: `W${i + 1}`,
      date: date(
        new Date(
          Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, 1 + i * 7),
        ),
      ),
      revenue:
        i === 3
          ? last.revenue -
            weights
              .slice(0, 3)
              .reduce((s, w) => s + Math.round(last.revenue * w), 0)
          : Math.round(last.revenue * weight),
      costs:
        i === 3
          ? last.costs -
            weights
              .slice(0, 3)
              .reduce((s, w) => s + Math.round(last.costs * w), 0)
          : Math.round(last.costs * weight),
      delivered: 4 + (i % 2),
      planned: 5 + (i % 2),
    }));
  } else points = period === "quarter" ? all.slice(-3) : all;
  const relevant = c.data.departments;
  const operations = relevant.find((d) =>
    /project|delivery|operations|engineering/i.test(d),
  );
  const finance = relevant.find((d) => /finance|sales/i.test(d));
  const people = relevant.find((d) =>
    /human|people|resource|operations/i.test(d),
  );
  const source = c.data.sources[0] || "Illustrative business workbook";
  const projects: Project[] = operations
    ? [
        {
          id: "atlas",
          name:
            profile === "managed"
              ? "Infrastructure renewal"
              : "Atlas migration",
          client: "Orion Group",
          owner: "Sana Ahmed",
          department: operations,
          due: offset(asOf, scenario === "clear" ? 2 : -2),
          status: scenario === "clear" ? "On track" : "Delayed",
          evidence:
            "Security approval is pending; the delivery owner recorded a two-day hold.",
        },
        {
          id: "launch",
          name: "Client launch",
          client: "Harbor Studio",
          owner: "Alex Morgan",
          department: operations,
          due: offset(asOf, 3),
          status: scenario === "clear" ? "On track" : "At risk",
          evidence:
            "The same specialist is assigned to the migration and client launch.",
        },
        {
          id: "release",
          name: "Platform handover",
          client: "Northline",
          owner: "Sam Chen",
          department: operations,
          due: offset(asOf, 7),
          status: "On track",
          evidence:
            "Acceptance review is scheduled; all prerequisite tasks are complete.",
        },
      ]
    : [];
  let risks: Risk[] = [];
  if (scenario !== "clear") {
    if (operations)
      risks.push({
        id: "delivery",
        title:
          profile === "managed"
            ? "Two high-priority tickets missed SLA"
            : "Atlas migration crossed its deadline",
        impact:
          profile === "managed"
            ? "A key account is waiting for service restoration."
            : "Client handover is two days late; the next launch depends on the same specialist.",
        severity: "High",
        action:
          profile === "managed"
            ? "Review service response"
            : "Review delivery plan",
        department: operations,
        type: profile === "managed" ? "sla" : "delivery",
        evidence: [
          `Source: ${source}, delivery tab, rows 14–16.`,
          `Reported owner: Sana Ahmed.`,
          "Security approval is pending; specialist capacity is shared with the next launch.",
        ],
      });
    if (finance && financeAllowed(c))
      risks.push({
        id: "receivables",
        title:
          profile === "saas"
            ? "Six accounts reached their renewal window"
            : "Three invoices are more than 30 days overdue",
        impact:
          profile === "saas"
            ? "Two accounts have not confirmed renewal; follow-up is due this week."
            : "Collections are concentrated in Orion Group; agree an owner and a payment date.",
        severity: "High",
        action:
          profile === "saas" ? "Review renewals" : "Review collection plan",
        department: finance,
        type: profile === "saas" ? "churn" : "receivables",
        evidence: [
          `Source: ${source}, ${profile === "saas" ? "renewals" : "receivables"} tab, rows 8–10.`,
          profile === "saas"
            ? "Six illustrative contracts renew in the next 30 days; two confirmations are outstanding."
            : "Three illustrative records total 32,400 in the selected reporting currency.",
          "Latest contact note: a purchase-order approval is outstanding.",
        ],
      });
    if (people || operations)
      risks.push({
        id: "resource",
        title: "One specialist is committed to two priority projects",
        impact: "Resolve the capacity conflict before Friday’s client launch.",
        severity: "Medium",
        action: "Review capacity",
        department: people || operations!,
        type: "resource",
        evidence: [
          `Source: ${source}, capacity tab.`,
          "Sana Ahmed is allocated 24 hours to migration and 22 hours to launch this week.",
          "Recorded weekly capacity: 40 hours. Proposed demand: 46 hours.",
        ],
      });
  }
  const covered =
    scenario === "partial" ? relevant.filter((_, i) => i % 2 === 0) : relevant;
  if (scenario === "partial")
    risks = risks.filter((r) => covered.includes(r.department));
  const total = points.reduce((sum, p) => sum + p.revenue, 0);
  return {
    points,
    previousRevenue:
      period === "year"
        ? Math.round(total / 0.94)
        : period === "quarter"
          ? all.slice(-6, -3).reduce((s, p) => s + p.revenue, 0)
          : all[10].revenue,
    asOf,
    projects:
      scenario === "partial"
        ? projects.filter((p) => covered.includes(p.department))
        : projects,
    risks,
    covered,
    source,
    clients: [
      { name: "Orion Group", share: 37 },
      { name: "Harbor Studio", share: 26 },
      { name: "Northline", share: 18 },
      { name: "Other clients", share: 19 },
    ].map((x) => ({ ...x, amount: (total * x.share) / 100 })),
    activity: Array.from({ length: 14 }, (_, i) => {
      const count = [0, 1, 3, 2, 0, 4, 1][i % 7];
      return {
        date: offset(asOf, -13 + i),
        count,
        events: [
          "Milestone updated",
          "Invoice recorded",
          "Client review completed",
          "Source reconciled",
        ].slice(0, count),
      };
    }),
  };
}
export function totals(sample: Sample) {
  const revenue = sample.points.reduce((n, p) => n + p.revenue, 0),
    costs = sample.points.reduce((n, p) => n + p.costs, 0);
  return {
    revenue,
    costs,
    margin: revenue ? ((revenue - costs) / revenue) * 100 : 0,
    growth: sample.previousRevenue
      ? (revenue / sample.previousRevenue - 1) * 100
      : 0,
  };
}
export function metricValue(
  id: MetricId,
  s: Sample,
): {
  value: number;
  unit: "percent" | "money" | "number";
  context: string;
  method: string;
} {
  const t = totals(s);
  switch (id) {
    case "margin":
      return {
        value: t.margin,
        unit: "percent",
        context: "Revenue less operating expenses",
        method: "(Revenue − operating expenses) ÷ revenue × 100.",
      };
    case "receivables":
      return {
        value: 32400,
        unit: "money",
        context: "3 invoices · over 30 days",
        method:
          "Sum of three overdue illustrative invoices: 14,400 + 10,000 + 8,000.",
      };
    case "utilization":
      return {
        value: 82,
        unit: "percent",
        context: "1,640 of 2,000 available hours",
        method: "Billable hours ÷ available hours: 1,640 ÷ 2,000 × 100.",
      };
    case "retention":
      return {
        value: (122 / 128) * 100,
        unit: "percent",
        context: "122 of 128 opening customers retained",
        method: "Retained customers ÷ opening customers: 122 ÷ 128 × 100.",
      };
    case "churn":
      return {
        value: (6 / 128) * 100,
        unit: "percent",
        context: "6 customers left in the period",
        method: "Lost customers ÷ opening customers: 6 ÷ 128 × 100.",
      };
    case "customers":
      return {
        value: (133 / 128 - 1) * 100,
        unit: "percent",
        context: "128 → 133 active customers",
        method: "(Closing customers ÷ opening customers − 1) × 100.",
      };
    case "sla":
      return {
        value: (94 / 100) * 100,
        unit: "percent",
        context: "94 of 100 tickets met SLA",
        method: "Tickets meeting SLA ÷ resolved tickets: 94 ÷ 100 × 100.",
      };
    case "tickets":
      return {
        value: 12,
        unit: "number",
        context: "2 high priority · 10 routine",
        method:
          "Count of illustrative tickets still open at the reporting cutoff.",
      };
    case "renewals":
      return {
        value: 6,
        unit: "number",
        context: "Next 30 days",
        method: "Count of illustrative contracts due to renew within 30 days.",
      };
    case "onTime": {
      const delivered = s.points.reduce((n, p) => n + p.delivered, 0),
        planned = s.points.reduce((n, p) => n + p.planned, 0);
      return {
        value: (delivered / planned) * 100,
        unit: "percent",
        context: `${delivered} of ${planned} planned milestones`,
        method: "Delivered milestones ÷ planned milestones × 100.",
      };
    }
  }
}
export function goalActual(g: Goal, s: Sample): number | null {
  const text = (g.name + " " + g.kpi).toLowerCase();
  if (/revenue|mrr/.test(text))
    return g.target.includes("%") ? totals(s).growth : totals(s).revenue;
  if (/deliver|milestone|project/.test(text))
    return s.points.reduce((n, p) => n + p.delivered, 0);
  if (/retention/.test(text)) return metricValue("retention", s).value;
  return null;
}
export function goalTarget(target: string): number | null {
  const match = target.toLowerCase().match(/([\d,.]+)\s*([kmb])\b/);
  const number = match
    ? Number(match[1].replaceAll(",", "")) *
      ({ k: 1000, m: 1000000, b: 1000000000 }[match[2]] || 1)
    : Number(target.replace(/[^\d.-]/g, ""));
  return target.trim() && Number.isFinite(number) && number > 0 ? number : null;
}

/** Illustrative measures use the existing configuration; no departments or goals are invented. */
export function overviewExampleCompany(company: Company): Company {
  return company;
}
