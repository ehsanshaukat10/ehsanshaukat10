import { z } from "zod";
// The original descriptive definition is not a measured business target.
export const onboardingGoalSchema = z
  .object({
    id: z.string().uuid(),
    description: z.string().max(2000).optional(),
    name: z.string().min(1).max(150),
    kpi: z.string().max(100),
    target: z.string().max(50),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    owner: z.string().max(100),
  })
  .strict();
export const onboardingGoalEditSchema = onboardingGoalSchema
  .extend({
    companyVersion: z.number().int().min(1),
  })
  .strict();
export function onboardingGoals(state) {
  return (state.companyData.goals || [])
    .map((g) => onboardingGoalSchema.safeParse(g))
    .filter((r) => r.success)
    .map((r) => r.data);
}
