import { sampleSources, type Mapping } from "../../lib/api";

export interface SourceAdapter {
  readonly mode: "sample" | "live";
  discover(sources: string[], departments: string[]): Mapping[];
}

/** Built-in example definitions only. This adapter never reads Google or company rows. */
export const sampleAdapter: SourceAdapter = {
  mode: "sample",
  discover(sources, departments) {
    const definitions = [
      {
        field: "Monthly Revenue",
        department: "Finance",
        meaning: "Revenue",
        source: sampleSources[0],
      },
      {
        field: "Operating Expenses",
        department: "Finance",
        meaning: "Expenses",
        source: sampleSources[0],
      },
      {
        field: "Project Status",
        department: "Project Delivery",
        meaning: "Status",
        source: sampleSources[1],
      },
      {
        field: "Team Member",
        department: "Human Resources",
        meaning: "Employee",
        source: sampleSources[2],
      },
    ];
    return definitions
      .filter((d) => sources.includes(d.source))
      .map((d) => ({
        field: d.field,
        meaning: d.meaning,
        // An unrecognized department remains ambiguous until the user explicitly maps it.
        department: departments.includes(d.department) ? d.department : "",
        confirmed: false,
      }));
  },
};
