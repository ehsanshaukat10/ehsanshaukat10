type Input = {
  headers: string[];
  types: string[];
  rows: (string | number | boolean | null)[][];
  sourceId?: string;
  parentTitle?: string;
  department?: string;
};
export function operationalOverview(
  tables: Input[],
  today?: string,
): {
  records: number;
  workbooks: number;
  pages: number;
  statusRecords: number;
  counts: {
    open: number;
    completed: number;
    flagged: number;
    cancelled: number;
    other: number;
  };
  overdue: number | null;
  departments: {
    name: string;
    records: number;
    pages: number;
    open: number;
    completed: number;
    flagged: number;
  }[];
  measures: { name: string; total: number; values: number; pages: number }[];
  previewIndex: number;
};
