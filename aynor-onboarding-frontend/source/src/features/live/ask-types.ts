export type AskStatus = {
  companyId: string;
  companyVersion: number;
  proof: string;
  datasetRevision: string;
  authorization: { fingerprint: string; canManageSources: boolean };
  context: { key: string };
  companyPolicy: { enabled: boolean; categories: string[] };
  approval: string;
  consented: boolean;
  consentVersion: string | null;
  provider: {
    configured: boolean;
    eligible: boolean;
    provider: string | null;
    model: string | null;
    privacyMode: string;
    policyUrl: string;
    reason: string | null;
  };
  memoryAvailable: boolean;
  categories: string[];
  limits: {
    user: number;
    company: number;
    applicationCalls: number;
    maxCallsPerTurn: number;
    maxTurns: number;
  };
  catalogue: {
    id: string;
    label: string;
    kind: string;
    state: string;
    period: unknown;
  }[];
  truncated: boolean;
};
export type AskAnswer = {
  companyId: string;
  proof: string;
  datasetRevision: string;
  authorization: { fingerprint: string };
  mode: "ai" | "fallback";
  reason: string | null;
  memory: string | null;
  clarification: string | null;
  facts: {
    id: string;
    stableId: string;
    kind: string;
    label: string;
    statement: string;
    department: string;
    period: string;
    state: string;
    href: string;
    evidenceHref: string | null;
  }[];
  interpretations: { text: string; citations: string[] }[];
  steps: { text: string; citations: string[]; href: string }[];
  usage: { calls: number; attempted: boolean; planningAttempts: number };
  selected: string[];
};
