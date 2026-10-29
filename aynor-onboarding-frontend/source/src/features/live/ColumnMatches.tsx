import { ArrowDownLeft, ArrowUpRight, CalendarDays, Check } from "lucide-react";
import { Select } from "./LiveSelect";
import "./column-matches.css";

export type ColumnMapping = { date: string; revenue: string; expenses: string };
const fields = [
  {
    key: "date",
    title: "Date",
    hint: "When it happened",
    label: "Date column",
    icon: CalendarDays,
  },
  {
    key: "revenue",
    title: "Money in",
    hint: "Money you earned, like sales",
    label: "Money in column",
    icon: ArrowUpRight,
  },
  {
    key: "expenses",
    title: "Money out",
    hint: "Money you spent, like bills",
    label: "Money out column",
    icon: ArrowDownLeft,
  },
] as const;

export function ColumnMatches({
  headers,
  preview = [],
  mapping,
  suggestions,
  disabled,
  onChange,
}: {
  headers: string[];
  preview?: unknown[][];
  mapping: ColumnMapping;
  suggestions: ColumnMapping;
  disabled: boolean;
  onChange: (mapping: ColumnMapping) => void;
}) {
  const count = Object.values(mapping).filter(Boolean).length;
  return (
    <section className="column-matches" aria-label="Match your columns">
      <div className="column-matches-heading">
        <div>
          <h3>Match just 3 columns.</h3>
          <p>
            {Object.values(suggestions).some(Boolean)
              ? "We’ve suggested a few matches. Check the examples, then confirm."
              : "Choose a column for each item. The examples will help you check."}
          </p>
        </div>
        <span className="column-match-count" role="status">
          {count === 3 && <Check size={13} />}
          {count} of 3 matched
        </span>
      </div>
      <div className="column-match-list">
        {fields.map(({ key, title, hint, label, icon: Icon }) => {
          const column = mapping[key];
          const index = headers.indexOf(column);
          const examples =
            index < 0
              ? []
              : preview
                  .map((row) => row[index])
                  .filter(
                    (value) =>
                      value !== null &&
                      value !== undefined &&
                      String(value).trim(),
                  )
                  .slice(0, 2)
                  .map((value) => String(value).slice(0, 60));
          const suggested = column && suggestions[key] === column;
          return (
            <div
              className={"column-match-row" + (column ? " is-matched" : "")}
              key={key}
            >
              <div className="column-match-question">
                <span className="column-match-icon">
                  <Icon size={18} strokeWidth={1.6} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{hint}</span>
                </div>
                {suggested && <small>Suggested</small>}
              </div>
              <Select
                label={`Column for ${title.toLowerCase()}`}
                aria-label={label}
                value={column}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...mapping, [key]: event.target.value })
                }
              >
                <option value="">Choose from your sheet</option>
                {headers.map((header) => (
                  <option
                    key={header}
                    value={header}
                    disabled={Object.entries(mapping).some(
                      ([other, selected]) =>
                        other !== key && selected === header,
                    )}
                  >
                    {header}
                  </option>
                ))}
              </Select>
              <p className="column-match-example">
                {column ? (
                  examples.length ? (
                    <>
                      From your sheet: <span>{examples.join(" · ")}</span>
                    </>
                  ) : (
                    "No sample value in these rows. Check the column in your sheet."
                  )
                ) : (
                  "Choose the matching column above."
                )}
              </p>
            </div>
          );
        })}
      </div>
      {count < 3 && (
        <p className="column-match-next">
          Choose a column for each item to continue. Each one needs a different
          column.
        </p>
      )}
    </section>
  );
}
