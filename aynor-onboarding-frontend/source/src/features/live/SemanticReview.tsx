import { useEffect, useState, useRef } from "react";
import { Modal, Button, Field, ErrorBox } from "../../components/ui";
import { Select } from "./LiveSelect";
import { serverRequest } from "../../lib/runtime";
import { dateInTimezone } from "../../../shared/sync-time.mjs";
import type {
  SemanticView,
  SemanticWorksheet,
  SemanticMapping,
} from "./semantic-types";
const kinds = [
  ["finance:transaction", "Financial performance"],
  ["finance:invoice", "Outstanding invoices"],
  ["sales:deal", "Sales opportunities"],
  ["delivery:project", "Projects & delivery"],
  ["resources:resource", "People & capacity"],
  ["reference:other", "Instructions / reference"],
  ["other:other", "Other — keep out of executive reporting"],
];
const roles: Record<string, string> = {
  client_name: "Client name (optional)",
  project_name: "Project name (optional)",
  owner_name: "Owner name (optional)",
  resource_name: "Person name (optional)",
  entity_id: "Unique record ID",
  date: "Reporting date",
  revenue: "Recognized revenue (not cash received)",
  expense: "Operating expenses",
  amount: "Deal value (not revenue)",
  outstanding_amount: "Outstanding balance (not invoice total)",
  status: "Status",
  due_date: "Due date",
  assigned_hours: "Assigned hours",
  available_hours: "Available hours",
};
const required: Record<string, string[]> = {
  "finance:transaction": ["entity_id", "date", "revenue", "expense"],
  "finance:invoice": ["entity_id", "status", "due_date", "outstanding_amount"],
  "sales:deal": ["entity_id", "date", "status", "amount"],
  "delivery:project": ["entity_id", "status", "due_date"],
  "resources:resource": [
    "entity_id",
    "date",
    "assigned_hours",
    "available_hours",
  ],
};
export function SemanticReview({
  companyId,
  sourceId,
  tabId,
  timezone,
  onClose,
  onSaved,
}: {
  companyId: string;
  sourceId: string;
  tabId: number;
  timezone: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [sheet, setSheet] = useState<SemanticWorksheet | null>(null),
    [kind, setKind] = useState("other:other"),
    [label, setLabel] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [identity, setIdentity] = useState("identifier"),
    [currency, setCurrency] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [asOf, setAsOf] = useState(dateInTimezone(timezone)),
    [statusGroups, setStatusGroups] = useState<Record<string, string>>({}),
    [confirmed, setConfirmed] = useState(false),
    [included, setIncluded] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const saving = useRef(false);
  const [savedNotice, setSavedNotice] = useState("");
  const root = `/companies/${companyId}/sources/${sourceId}/semantics`;
  useEffect(() => {
    let active = true;
    setError("");
    serverRequest<SemanticView>(root)
      .then((view) => {
        if (!active) return;
        const s = view.worksheets.find((w) => w.tabId === tabId);
        if (!s)
          throw Error(
            "Import this worksheet before confirming business meanings.",
          );
        setSheet(s);
        setIncluded(s.confirmation?.enabled !== false);
        const c = s.confirmation,
          p = s.proposal;
        const entity =
          c?.entity ||
          (p.purpose === "finance"
            ? p.fields.outstanding_amount
              ? "invoice"
              : "transaction"
            : p.purpose === "sales"
              ? "deal"
              : p.purpose === "delivery"
                ? "project"
                : p.purpose === "resources"
                  ? "resource"
                  : "other");
        const nextKind = `${c?.purpose || p.purpose}:${entity}`;
        setKind(nextKind);
        setLabel(
          c?.label ||
            kinds.find(([id]) => id === nextKind)?.[1] ||
            "Business reporting",
        );
        setFields(c?.fields || p.fields);
        setIdentity(
          c?.identityMode ||
            (!p.fields.entity_id &&
            p.fields.date &&
            nextKind === "finance:transaction"
              ? "reporting_date"
              : "identifier"),
        );
        setCurrency(c?.currency || "");
        if (c?.period.kind === "interval") {
          setStart(c.period.start);
          setEnd(c.period.endExclusive);
        } else {
          setStart(s.dateRange?.start || "");
          setEnd(s.dateRange?.endExclusive || "");
        }
        if (c?.period.kind === "snapshot") setAsOf(c.period.asOf);
        const groups: Record<string, string> = {};
        for (const [group, values] of Object.entries(c?.statusValues || {}))
          for (const value of values) groups[value.toLowerCase()] = group;
        setStatusGroups(groups);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [root, tabId, revision]);
  const [purpose, entity] = kind.split(":");
  const contextFields =
    entity === "project"
      ? ["project_name", "client_name", "owner_name"]
      : entity === "resource"
        ? ["resource_name", "owner_name"]
        : ["client_name", "owner_name"];
  const fieldNames = [
    ...(required[kind] || []),
    ...(["reference", "other"].includes(purpose) ? [] : contextFields),
  ];
  const snapshot =
    entity === "invoice" ||
    entity === "project" ||
    ["reference", "other"].includes(purpose);
  const money = purpose === "finance" || purpose === "sales";
  const statuses = [
    ...new Set(
      (
        sheet?.availableFields.find((f) => f.name === fields.status)?.values ||
        []
      )
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  async function save() {
    if (!sheet || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const bindings = Object.fromEntries(
        fieldNames.filter((f) => fields[f]).map((f) => [f, fields[f]]),
      );
      if (identity === "reporting_date" && kind === "finance:transaction")
        bindings.entity_id = bindings.date;
      const mapping: SemanticMapping = {
        purpose,
        entity,
        label,
        entityNamespace:
          sheet.confirmation?.entityNamespace ||
          `source-${sourceId}-tab${tabId}`,
        identityMode: kind === "finance:transaction" ? identity : "identifier",
        fields: bindings,
        currency: money ? currency || null : null,
        period: snapshot
          ? { kind: "snapshot", asOf }
          : { kind: "interval", start, endExclusive: end },
        statusValues: Object.fromEntries(
          ["active", "closed", "won", "lost"].map((group) => [
            group,
            statuses.filter((v) => statusGroups[v] === group),
          ]),
        ),
        enabled: included,
      };
      const result = await serverRequest<SemanticView>(root, "POST", {
        tabId,
        mapping,
      });
      await onSaved();
      const applicable = result.metrics.filter(
        (metric) =>
          metric.lineage.sourceId === sourceId &&
          metric.lineage.tabId === tabId &&
          metric.state !== "unavailable",
      );
      if (
        included &&
        !["reference", "other"].includes(purpose) &&
        applicable.length &&
        !applicable.some((metric) => metric.state === "validated")
      ) {
        setSavedNotice(
          "Saved. Measures need review: " +
            [...new Set(applicable.flatMap((metric) => metric.reasons))].join(
              " ",
            ),
        );
        setConfirmed(false);
      } else onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Review business meanings"
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      <div className="source-workspace">
        <ErrorBox>{error}</ErrorBox>
        {savedNotice && <p role="status">{savedNotice}</p>}
        {!sheet ? (
          <>
            <p role="status">
              {error
                ? "Unable to load this worksheet."
                : "Loading worksheet meanings…"}
            </p>
            {error && (
              <Button
                variant="secondary"
                onClick={() => setRevision((v) => v + 1)}
              >
                Retry
              </Button>
            )}
          </>
        ) : (
          <>
            <p>
              Confirm what this data means. Only supported, validated measures
              appear on Overview.
            </p>
            <Select
              label="What does this worksheet describe?"
              value={kind}
              disabled={busy}
              onChange={(e) => {
                if (label === kinds.find(([id]) => id === kind)?.[1])
                  setLabel(
                    kinds.find(([id]) => id === e.target.value)?.[1] ||
                      "Business reporting",
                  );
                setKind(e.target.value);
                setConfirmed(false);
              }}
            >
              {kinds.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Field
              label="Reporting name"
              value={label}
              maxLength={100}
              disabled={busy}
              onChange={(e) => {
                setLabel(e.target.value);
                setConfirmed(false);
              }}
            />
            {!["reference", "other"].includes(purpose) && (
              <>
                {kind === "finance:transaction" && (
                  <Select
                    label="How is each financial record identified?"
                    value={identity}
                    disabled={busy}
                    onChange={(e) => {
                      setIdentity(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="identifier">A unique record ID</option>
                    <option value="reporting_date">
                      One financial record per reporting date
                    </option>
                  </Select>
                )}
                <div className="source-property-list">
                  {fieldNames
                    .filter(
                      (field) =>
                        !(
                          field === "entity_id" &&
                          identity === "reporting_date" &&
                          kind === "finance:transaction"
                        ),
                    )
                    .map((field) => (
                      <div className="source-property" key={field}>
                        <strong>{roles[field]}</strong>
                        <Select
                          label={`Column for ${roles[field]}`}
                          value={fields[field] || ""}
                          disabled={busy}
                          onChange={(e) => {
                            setFields({ ...fields, [field]: e.target.value });
                            setConfirmed(false);
                          }}
                        >
                          <option value="">Not available</option>
                          {sheet.availableFields
                            .filter((f) =>
                              field === "date" || field === "due_date"
                                ? f.type === "date"
                                : field === "status" || field.endsWith("_name")
                                  ? f.type === "text"
                                  : field === "entity_id"
                                    ? ["text", "number"].includes(f.type)
                                    : ["number", "currency"].includes(f.type),
                            )
                            .map((f) => (
                              <option key={f.name}>{f.name}</option>
                            ))}
                        </Select>
                      </div>
                    ))}
                </div>
                <p className="source-muted">
                  Leave unavailable fields blank. Their metrics will stay
                  hidden.
                </p>
                {money && (
                  <Field
                    label="Currency code"
                    value={currency}
                    placeholder="USD, PKR, EUR…"
                    maxLength={3}
                    disabled={busy}
                    onChange={(e) => {
                      setCurrency(e.target.value.toUpperCase());
                      setConfirmed(false);
                    }}
                    hint="Confirm the currency used by these amounts. Different currencies are not combined."
                  />
                )}
                {snapshot ? (
                  <Field
                    label="Data is accurate as of"
                    type="date"
                    value={asOf}
                    disabled={busy}
                    onChange={(e) => {
                      setAsOf(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                ) : (
                  <div className="source-add-form">
                    <Field
                      label="Reporting period starts"
                      type="date"
                      value={start}
                      disabled={busy}
                      onChange={(e) => {
                        setStart(e.target.value);
                        setConfirmed(false);
                      }}
                    />
                    <Field
                      label="Reporting period ends"
                      type="date"
                      value={
                        end
                          ? new Date(Date.parse(end + "T00:00:00Z") - 86400000)
                              .toISOString()
                              .slice(0, 10)
                          : ""
                      }
                      disabled={busy}
                      onChange={(e) => {
                        setEnd(
                          e.target.value
                            ? new Date(
                                Date.parse(e.target.value + "T00:00:00Z") +
                                  86400000,
                              )
                                .toISOString()
                                .slice(0, 10)
                            : "",
                        );
                        setConfirmed(false);
                      }}
                    />
                  </div>
                )}
                {!!fields.status && (
                  <div className="source-property-list">
                    {statuses.map((value) => (
                      <div className="source-property" key={value}>
                        <strong>{value}</strong>
                        <Select
                          label={`Meaning of status ${value}`}
                          value={statusGroups[value] || ""}
                          disabled={busy}
                          onChange={(e) => {
                            setStatusGroups({
                              ...statusGroups,
                              [value]: e.target.value,
                            });
                            setConfirmed(false);
                          }}
                        >
                          <option value="">Choose a meaning</option>
                          <option value="active">Active / unpaid</option>
                          <option value="closed">Completed / settled</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost / cancelled</option>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {!["reference", "other"].includes(purpose) && (
              <label className="auto-ai-consent">
                <input
                  type="checkbox"
                  checked={included}
                  disabled={busy}
                  onChange={(event) => {
                    setIncluded(event.target.checked);
                    setConfirmed(false);
                  }}
                />
                <span>Include validated measures in Overview</span>
              </label>
            )}
            <label className="auto-ai-consent">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                {["reference", "other"].includes(purpose)
                  ? "Keep this worksheet for reference, outside executive calculations."
                  : "These field meanings, units and reporting dates match my data."}
              </span>
            </label>
            <div className="intel-inline-links">
              <Button
                busy={busy}
                disabled={!confirmed || !label.trim() || busy}
                onClick={() => void save()}
              >
                Confirm business meanings
              </Button>
              <Button variant="text" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
