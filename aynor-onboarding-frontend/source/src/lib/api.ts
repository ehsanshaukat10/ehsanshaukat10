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
/** Local frontend adapter; does not call or configure any backend. */
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  return mockRequest<T>(url, method, body, headers);
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
