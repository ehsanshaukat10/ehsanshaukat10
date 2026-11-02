import { z } from "zod";
import { categories } from "./intelligence-policy.mjs";
export const askPolicyInput = z
  .object({
    enabled: z.boolean(),
    categories: z.array(z.enum(categories)).max(7),
    companyVersion: z.number().int().min(1),
  })
  .strict();
export const askPolicyStored = z
  .object({
    enabled: z.boolean(),
    categories: z.array(z.enum(categories)).max(7),
    revision: z.string().uuid(),
    approvedBy: z.string().uuid(),
    approvedAt: z.number(),
  })
  .strict();
export const askTurnInput = z
  .object({
    requestId: z.string().uuid(),
    question: z.string().trim().min(1).max(2000),
    context: z
      .record(
        z.string(),
        z.union([z.string().max(500), z.array(z.string().max(500)).max(12)]),
      )
      .default({}),
    memory: z.string().max(32000).optional(),
    focus: z.string().max(200).optional(),
    external: z.boolean().default(false),
  })
  .strict();
export const askAnswerSchema = z
  .object({
    select: z
      .array(z.string().regex(/^F\d+$/))
      .min(1)
      .max(12)
      .optional(),
    facts: z
      .array(z.string().regex(/^F\d+$/))
      .max(12)
      .default([]),
    reasoning: z
      .array(
        z
          .object({
            type: z.enum([
              "financial_bridge",
              "compare",
              "goal_progress",
              "shared_dependency",
              "separate_observations",
              "investigate",
            ]),
            facts: z
              .array(z.string().regex(/^F\d+$/))
              .min(1)
              .max(6),
          })
          .strict(),
      )
      .max(5)
      .default([]),
    clarification: z
      .enum([
        "none",
        "period",
        "scope",
        "metric",
        "cause_not_established",
        "forecast_not_supported",
      ])
      .default("none"),
  })
  .strict();
