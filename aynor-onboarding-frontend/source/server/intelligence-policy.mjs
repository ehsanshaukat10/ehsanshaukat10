import { createHash } from "node:crypto";
import { z } from "zod";
import { fail } from "./database.mjs";
export const categories = [
  "finance",
  "sales",
  "delivery",
  "resources",
  "operations",
  "marketing",
  "other",
];
export const intelligenceAccessSchema = z
  .object({
    version: z.literal(1),
    worksheets: z.record(
      z.string().max(160),
      z
        .object({
          category: z.enum(categories),
          sensitivity: z.enum([
            "standard",
            "financial",
            "payroll",
            "confidential",
          ]),
          recordColumns: z.array(z.string().min(1).max(200)).max(200),
        })
        .strict(),
    ),
    grants: z.record(
      z.string().uuid(),
      z
        .object({
          categories: z.array(z.enum(categories)).max(7),
          sensitivities: z
            .array(z.enum(["financial", "payroll", "confidential"]))
            .max(3),
        })
        .strict(),
    ),
  })
  .strict();
export const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function intelligencePolicy(state, actor) {
  const { membership: m, company } = state;
  if (
    !m ||
    m.user_id !== actor ||
    !company ||
    !["Owner", "Admin", "Executive", "Department Manager", "Viewer"].includes(
      m.role,
    )
  )
    fail(403, "Business reporting is unavailable for your current access.");
  const admin = ["Owner", "Admin"].includes(m.role);
  const parsed = intelligenceAccessSchema.safeParse(
    company.data?.intelligenceAccess,
  );
  const access = parsed.success ? parsed.data : { worksheets: {}, grants: {} };
  const grant = access.grants[actor] || { categories: [], sensitivities: [] };
  const scopes = new Map();
  for (const source of state.catalog.sources)
    for (const tab of source.tabs) {
      const id = `${source.id}:${tab.tabId}`,
        rule = access.worksheets[id];
      const department = tab.department ?? source.department ?? "";
      const required = new Set(
        rule && rule.sensitivity !== "standard" ? [rule.sensitivity] : [],
      );
      // A financial purpose cannot be downgraded by labelling its sensitivity "standard".
      if (tab.semantic?.purpose === "finance") required.add("financial");
      const allowed =
        admin ||
        (rule &&
          tab.semantic &&
          rule.category === tab.semantic.purpose &&
          grant.categories.includes(rule.category) &&
          [...required].every((x) => grant.sensitivities.includes(x)) &&
          (m.role === "Executive" ||
            (department &&
              company.data.departments?.includes(department) &&
              m.scope?.includes(department))));
      if (allowed)
        scopes.set(id, {
          source,
          tab,
          department,
          columns: admin ? null : rule.recordColumns,
        });
    }
  const fingerprint = digest([
    actor,
    company.id,
    m.role,
    [...(m.scope || [])].sort(),
    access,
    [...scopes.keys()].sort(),
  ]);
  return {
    admin,
    role: m.role,
    fingerprint,
    scopes,
    require(id) {
      const scope = scopes.get(id);
      if (!scope)
        fail(
          admin ? 404 : 403,
          "This reporting scope is unavailable for your current access.",
        );
      return scope;
    },
  };
}
