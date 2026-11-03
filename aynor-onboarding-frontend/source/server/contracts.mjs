import { onboardingGoalSchema } from "./onboarding-goal.mjs";
import { askPolicyStored } from "./ask-contracts.mjs";
import { storedGoalsSchema } from "./goal-definition.mjs";
import { relationshipContractsSchema } from "./relationship-intelligence.mjs";
import { intelligenceAccessSchema } from "./intelligence-policy.mjs";
import { z } from "zod";
export const workspaceSchema = z.object({
  askPolicy: askPolicyStored.optional(),
  governedGoals: storedGoalsSchema.optional(),
  relationshipContracts: relationshipContractsSchema.optional(),
  intelligenceAccess: intelligenceAccessSchema.optional(),
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
    .array(onboardingGoalSchema)
    .max(100)
    .refine(
      (v) => new Set(v.map((g) => g.id)).size === v.length,
      "Goal IDs must be unique.",
    ),
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
