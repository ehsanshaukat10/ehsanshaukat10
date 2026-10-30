type BusinessTable = {
  sourceId?: string;
  tabId?: number;
  title?: string;
  parentTitle?: string;
  department?: string;
  currency?: string;
  financial?: { points: { date: string; revenue: number; costs: number }[] };
};
export function businessOverview(
  tables: BusinessTable[],
  currency?: string,
  selection?: string[],
): {
  financial: (BusinessTable & { key: string })[];
  selected: string[];
  conflicts: string[];
  groups: {
    currency: string;
    pages: number;
    safe: boolean;
    revenue: number | null;
    costs: number | null;
    profit: number | null;
    margin: number | null;
    points: { date: string; revenue: number; costs: number }[];
  }[];
};
