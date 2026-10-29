import type { Company } from "../src/lib/api";
export function safeReturnPath(value: unknown): string;
export function workspaceDestination(company: Company): string;
export function authenticatedDestination(
  companies: Company[],
  requested?: string,
): string;
