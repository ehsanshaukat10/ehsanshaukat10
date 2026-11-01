import { z } from "zod";
const date = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
    "Use a valid ISO date.",
  );
export const goalPeriod = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), asOf: date }).strict(),
  z
    .object({ kind: z.literal("interval"), start: date, endExclusive: date })
    .strict()
    .refine(
      (v) => v.start < v.endExclusive,
      "The end date must follow the start date.",
    ),
]);
const fields = {
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(150),
  level: z.enum(["company", "department"]),
  department: z.string().max(80).default(""),
  scope: z.string().min(1).max(160),
  metricId: z.string().min(1).max(100),
  target: z.number().finite(),
  unit: z.enum(["currency", "percent", "count"]),
  currency: z.string().nullable().default(null),
  period: goalPeriod,
  deadline: date,
  owner: z.string().trim().max(100).default(""),
  direction: z.enum(["increase", "decrease", "maintain"]),
  threshold: z.enum(["at_least", "at_most"]).default("at_least"),
  baseline: z.number().finite().nullable().default(null),
  lifecycle: z.enum(["Active", "Paused", "Archived"]).default("Active"),
};
function validDefinition(v, ctx) {
  if (
    (v.unit === "currency" && !v.currency) ||
    (v.currency !== null &&
      !Intl.supportedValuesOf("currency").includes(v.currency)) ||
    (v.unit === "count" && v.currency !== null)
  )
    ctx.addIssue({
      code: "custom",
      message:
        "Confirm the metric currency context; count goals do not use a currency.",
    });
  if (
    (v.level === "company" && v.department) ||
    (v.level === "department" && !v.department)
  )
    ctx.addIssue({
      code: "custom",
      message: "Confirm the goal level and department.",
    });
  if (v.direction === "maintain" && v.baseline !== null)
    ctx.addIssue({
      code: "custom",
      message: "Threshold goals do not use a change baseline.",
    });
  if (
    v.baseline !== null &&
    (v.direction === "increase"
      ? v.target <= v.baseline
      : v.direction === "decrease" && v.target >= v.baseline)
  )
    ctx.addIssue({
      code: "custom",
      message:
        "The target must improve on the baseline in the chosen direction.",
    });
  if (
    v.unit === "count" &&
    (!Number.isSafeInteger(v.target) ||
      v.target < 0 ||
      (v.baseline !== null &&
        (!Number.isSafeInteger(v.baseline) || v.baseline < 0)))
  )
    ctx.addIssue({
      code: "custom",
      message: "Count goals require nonnegative safe integers.",
    });
}
export const goalInputSchema = z
  .object({
    ...fields,
    version: z.number().int().min(0),
    companyVersion: z.number().int().min(1),
  })
  .strict()
  .superRefine(validDefinition);
export const storedGoalSchema = z
  .object({
    ...fields,
    version: z.number().int().min(1),
    binding: z
      .object({
        entity: z.string().nullable(),
        namespace: z.string().nullable(),
      })
      .strict(),
    protection: z
      .object({
        scope: z.string(),
        department: z.string(),
        category: z.string(),
        sensitivities: z.array(z.string()),
      })
      .strict(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict()
  .superRefine(validDefinition);
export const storedGoalsSchema = z
  .array(storedGoalSchema)
  .max(100)
  .refine(
    (v) => new Set(v.map((g) => g.id)).size === v.length,
    "Goal IDs must be unique.",
  );
export const periodKey = (p) =>
  p ? JSON.stringify([p.kind, p.asOf, p.start, p.endExclusive]) : "";
export const goalFields = Object.keys(fields);
