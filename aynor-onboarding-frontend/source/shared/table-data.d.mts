export type Cell = string | number | boolean | null;
export type Profile = {
  name: string;
  type: string;
  examples: string[];
  missing: number;
  ambiguousDate: boolean;
};
export const dataTypes: string[];
export function parseNumber(value: unknown): number | null;
export function parseDate(value: unknown, format?: string): string | null;
export function suggestHeader(rows: Cell[][]): number;
export function profileColumns(headers: string[], rows: Cell[][]): Profile[];
