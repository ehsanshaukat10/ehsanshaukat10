import { serverMode, serverRequest } from "./runtime";
import { mockRequest } from "./mockService";
export type User = {
  id: string;
  name: string;
  email: string;
  verified: boolean;
};
export type Mapping = {
  field: string;
  department: string;
  meaning: string;
  confirmed: boolean;
  ignored?: boolean;
};
export type KPI = {
  name: string;
  department: string;
  target: string;
  period: string;
  enabled: boolean;
  calculation: string;
};
export type Goal = {
  description?: string;
  id: string;
  name: string;
  kpi: string;
  target: string;
  deadline: string;
  owner: string;
};
export type WorkspaceData = {
  departments: string[];
  priorities: string[];
  sources: string[];
  mappings: Mapping[];
  kpis: KPI[];
  goals: Goal[];
  steps: Record<string, string>;
  step: string;
  completed: boolean;
  demo?: boolean;
  discovered?: boolean;
  connected?: boolean;
};
export type Company = {
  id: string;
  name: string;
  industry: string;
  country: string;
  timezone: string;
  currency: string;
  website: string;
  size: string;
  city?: string;
  businessModel?: string;
  role: string;
  scope: string[];
  version: number;
  data: WorkspaceData;
};
/** Explicit server mode uses the API; the default prototype stays offline. */
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  if (!serverMode) return mockRequest<T>(url, method, body, headers);
  const result = await serverRequest<T>(url, method, body, headers);
  // The backend deliberately redacts configuration for scoped roles. Supply
  // empty presentation containers, never values from another scope or demo.
  const normalize = (value: any) =>
    value?.id && value?.data && typeof value.data === "object"
      ? {
          ...value,
          data: {
            departments: [],
            priorities: [],
            sources: [],
            mappings: [],
            kpis: [],
            goals: [],
            steps: {},
            ...value.data,
          },
        }
      : value;
  return (
    /^\/companies(?:\/[^/]+(?:\/profile)?)?$/.test(url)
      ? Array.isArray(result)
        ? result.map(normalize)
        : normalize(result)
      : result
  ) as T;
}
export const steps = [
  "departments",
  "integrations",
  "mapping",
  "priorities",
  "goals",
  "review",
  "complete",
];
export const stepLabels = [
  "Add departments",
  "Connect data sheets",
  "Mapping",
  "Business priorities",
  "Goal set",
  "Review",
  "Complete",
];
export const resolveSetupStep = (step: string) =>
  (
    ({
      sources: "integrations",
      discovery: "mapping",
      readiness: "mapping",
      kpis: "goals",
      invite: "review",
    }) as Record<string, string>
  )[step] || step;
export const departmentOptions = [
  "Finance",
  "Sales",
  "Project Delivery",
  "Human Resources",
  "Marketing",
  "Operations",
];
export const priorityOptions = [
  "Revenue growth",
  "Profitability",
  "Cash flow",
  "Project delivery",
  "Sales performance",
  "Team capacity",
  "Operational efficiency",
];
export const sampleSources = [
  "Business performance · 2026",
  "Project delivery tracker",
  "Team & capacity",
];
