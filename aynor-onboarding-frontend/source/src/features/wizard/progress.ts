import type { Company } from "../../lib/api";
export const wizardSteps = [
  "company",
  "structure",
  "connect",
  "team",
  "finish",
] as const;
export type WizardStep = (typeof wizardSteps)[number];
export const wizardNames = [
  "Company",
  "Structure",
  "Connect Data",
  "Invite Team",
  "Finish",
];
export function resumeStep(c: Company): WizardStep {
  if (c.data.wizard) return c.data.wizard.current;
  const old = c.data.step;
  if (["company"].includes(old)) return "company";
  if (["departments"].includes(old)) return "structure";
  if (
    [
      "priorities",
      "integrations",
      "sources",
      "discovery",
      "mapping",
      "readiness",
    ].includes(old)
  )
    return "connect";
  if (["kpis", "goals", "invite"].includes(old)) return "team";
  return "finish";
}
export const wizardUrl = (c: Company) =>
  `/companies/${c.id}/onboarding/${resumeStep(c)}`;
