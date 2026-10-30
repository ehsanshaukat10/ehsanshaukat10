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
export function parseDate(
  value: unknown,
  format?: string,
  year?: number | string,
): string | null;
export function suggestHeader(rows: Cell[][]): number;
export function profileColumns(headers: string[], rows: Cell[][]): Profile[];

export function isYearlessDate(value: unknown): boolean;
