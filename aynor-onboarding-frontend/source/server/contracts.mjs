import { z } from "zod";
export const workspaceSchema = z.object({
  departments: z.array(z.string().trim().min(1).max(80)).max(100),
  priorities: z.array(z.string().trim().min(1).max(100)).max(100),
  sources: z
    .array(
      z.enum([
        "Business performance · 2026",
        "Project delivery tracker",
        "Team & capacity",
      ]),
    )
    .max(3),
  mappings: z
    .array(
      z.object({
        field: z.string().min(1).max(150),
        department: z.string().max(80),
        meaning: z.string().max(150),
        confirmed: z.boolean(),
        ignored: z.boolean().optional(),
      }),
    )
    .max(200),
  kpis: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        department: z.string().max(80),
        target: z.string().max(50),
        period: z.enum(["Monthly", "Quarterly", "Yearly"]),
        enabled: z.boolean(),
        calculation: z.string().max(1000),
      }),
    )
    .max(100),
  goals: z
    .array(
      z.object({
        id: z.string().uuid(),
        description: z.string().max(2000).optional(),
        name: z.string().min(1).max(150),
        kpi: z.string().max(100),
        target: z.string().max(50),
        deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        owner: z.string().max(100),
      }),
    )
    .max(100),
  steps: z.record(
    z.string().max(30),
    z.enum([
      "not started",
      "completed",
      "skipped",
      "in progress",
      "needs review",
    ]),
  ),
  step: z.enum([
    "departments",
    "priorities",
    "integrations",
    "sources",
    "discovery",
    "mapping",
    "readiness",
    "kpis",
    "goals",
    "invite",
    "review",
    "complete",
    "company",
  ]),
  completed: z.boolean(),
  demo: z.boolean().optional(),
  discovered: z.boolean().optional(),
  connected: z.boolean().optional(),
});
