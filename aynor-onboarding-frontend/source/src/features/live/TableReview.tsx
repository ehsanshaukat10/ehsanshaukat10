import { Field } from "../../components/ui";
import { Select } from "./LiveSelect";
import { dataTypes, type Profile } from "../../../shared/table-data.mjs";
import "./table-review.css";
export type TableChoice = {
  tabId: number;
  title: string;
  headerRow: number;
  purpose: string;
  types: string[];
  dateFormat: string;
  endRow?: number;
};
export function TableReview({
  profiles,
  choice,
  disabled,
  onChange,
}: {
  profiles: Profile[];
  choice: TableChoice;
  disabled: boolean;
  onChange: (choice: TableChoice) => void;
}) {
  return (
    <section className="table-review" aria-label="Review your table">
      <div className="table-review-heading">
        <h3>Here’s what we found.</h3>
        <p>Keep your own column names. Check the suggested types below.</p>
      </div>
      <Select
        label="What is this table about?"
        value={choice.purpose}
        disabled={disabled}
        onChange={(e) => onChange({ ...choice, purpose: e.target.value })}
      >
        {[
          "Other",
          "Sales",
          "Finance",
          "Projects",
          "People",
          "Inventory",
          "Testing",
        ].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </Select>
      <details className="mapping-detail">
        <summary>Adjust the table range</summary>
        <p>
          Column names are on row {choice.headerRow + 1}. Data starts on row{" "}
          {choice.headerRow + 2}. Exclude footer notes or totals by setting the
          last data row.
        </p>
        <Field
          label="Last data row (optional)"
          type="number"
          min={choice.headerRow + 2}
          max={10101}
          value={choice.endRow ?? ""}
          disabled={disabled}
          placeholder="Include all remaining rows"
          onChange={(e) =>
            onChange({
              ...choice,
              endRow: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </details>
      <div className="table-review-columns">
        {profiles.map((profile, index) => (
          <div className="table-review-column" key={profile.name}>
            <div>
              <span>{profile.name}</span>
              <small>
                {profile.examples.join(" · ").slice(0, 100) ||
                  "No sample value"}
              </small>
            </div>
            <Select
              label={`Type for ${profile.name}`}
              value={choice.types[index] || "text"}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...choice,
                  types: choice.types.map((v, i) =>
                    i === index ? e.target.value : v,
                  ),
                })
              }
            >
              {dataTypes.map((v) => (
                <option key={v} value={v}>
                  {v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
              <option value="ignore">Don’t import</option>
            </Select>
            {profile.ambiguousDate && choice.types[index] !== "date" && (
              <small className="table-review-hint">
                Looks like a date. Choose Date and its format, or keep the
                original text.
              </small>
            )}
          </div>
        ))}
      </div>
      {choice.types.includes("date") && (
        <DateFormat
          value={choice.dateFormat}
          disabled={disabled}
          onChange={(dateFormat) => onChange({ ...choice, dateFormat })}
        />
      )}
      <p className="mapping-submit-note">
        Blank cells stay empty. Numbers are not automatically treated as money.
        Your original sheet stays unchanged.
      </p>
    </section>
  );
}
export function DateFormat({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      label="Date format in this table"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="ymd">Year / month / day · 2026-10-29</option>
      <option value="dmy">Day / month / year · 29/10/2026</option>
      <option value="mdy">Month / day / year · 10/29/2026</option>
    </Select>
  );
}
