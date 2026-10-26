import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  Globe2,
  Link2,
  Pencil,
  Plus,
  Target,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Modal,
  Select,
} from "../../components/ui";
import {
  departmentOptions,
  priorityOptions,
  sampleSources,
  steps,
  type Company,
  type Goal,
  type Mapping,
  type WorkspaceData,
} from "../../lib/api";
import { useApp } from "../../lib/context";
import { sampleAdapter } from "../integrations/sampleAdapter";
import { CompanyProfile } from "./Onboarding";
import "./seven-step.css";

const titles: Record<string, [string, string]> = {
  departments: [
    "How does your company work?",
    "Choose your departments, or add a team that’s unique to you.",
  ],
  integrations: [
    "Bring your information together.",
    "Connect a spreadsheet, upload a file, or paste a Google Sheets URL.",
  ],
  mapping: [
    "Give your data meaning.",
    "Review and edit your fields. You can also skip mapping and return later.",
  ],
  priorities: [
    "What matters most?",
    "Choose your business priorities. This step is optional.",
  ],
  goals: [
    "Give ambition a direction.",
    "Add a clear goal here, or come back when you’re ready. This step is optional.",
  ],
  review: [
    "Everything in its place.",
    "Your workspace, at a glance. Fine-tune anything before you begin.",
  ],
  complete: ["Your workspace is ready.", "A clearer perspective starts here."],
};
const freshGoal = {
  description: "",
  name: "",
  kpi: "",
  target: "",
  deadline: "",
  owner: "",
};
function csvHeaders(text: string, separator: string): string[] {
  const fields: string[] = [];
  let field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "\r" || c === "\n")) break;
    else if (!quoted && c === separator) {
      fields.push(field.trim());
      field = "";
    } else field += c;
  }
  if (quoted)
    throw Error(
      "The header row contains an unclosed quote. Check the file and retry.",
    );
  fields.push(field.trim());
  return fields;
}
export function SevenStepOnboarding({
  company,
  step,
  save,
  busy,
  onReload,
}: {
  company: Company;
  step: string;
  save: (data: WorkspaceData) => Promise<boolean | undefined>;
  busy: boolean;
  onReload: () => void;
}) {
  const nav = useNavigate(),
    location = useLocation(),
    { toast } = useApp();
  const draftKey = `aynor.seven-draft.${company.id}.${step}`;
  const [data, setData] = useState<WorkspaceData>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (stored?.version === company.version) return stored.data;
    } catch {}
    return structuredClone(company.data);
  });
  const [error, setError] = useState(""),
    [custom, setCustom] = useState(""),
    [tab, setTab] = useState("sheets"),
    [url, setUrl] = useState(""),
    [working, setWorking] = useState(false),
    [consent, setConsent] = useState(false),
    [pending, setPending] = useState("");
  const [goal, setGoal] = useState(freshGoal),
    [editing, setEditing] = useState<number | null>(null);
  const [mappingPage, setMappingPage] = useState(0);
  const dirty = JSON.stringify(data) !== JSON.stringify(company.data);
  const reviewEdit =
    new URLSearchParams(location.search).get("return") === "review";
  useEffect(() => {
    sessionStorage.setItem(
      draftKey,
      JSON.stringify({ version: company.version, data }),
    );
    queueMicrotask(() =>
      window.dispatchEvent(
        new CustomEvent("aynor-visual-update", { detail: data }),
      ),
    );
  }, [data, draftKey, company.version]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const intercept = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || e.metaKey || e.ctrlKey || a.origin !== window.location.origin)
        return;
      const target = a.hash.startsWith("#/")
        ? a.hash.slice(1)
        : a.pathname + a.search;
      if (target !== location.pathname + location.search) {
        e.preventDefault();
        e.stopPropagation();
        setPending(target);
      }
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [dirty, location.pathname, location.search]);
  const update = (key: keyof WorkspaceData, value: unknown) =>
    setData((d) => ({ ...d, [key]: value }));
  const toggle = (key: "departments" | "priorities", value: string) => {
    const removing = data[key].includes(value);
    setData((d) => ({
      ...d,
      [key]: removing ? d[key].filter((x) => x !== value) : [...d[key], value],
      ...(key === "departments" && removing
        ? {
            mappings: d.mappings.map((m) =>
              m.department === value
                ? { ...m, department: "Company-wide", confirmed: false }
                : m,
            ),
          }
        : {}),
    }));
  };
  function addCustom(key: "departments" | "priorities") {
    const value = custom.trim();
    if (
      !value ||
      value.length > 80 ||
      data[key].some((x) => x.toLowerCase() === value.toLowerCase())
    ) {
      setError("Enter a unique name between 1 and 80 characters.");
      return;
    }
    update(key, [...data[key], value]);
    setCustom("");
    setError("");
  }
  async function advance(skip = false) {
    setError("");
    if (step === "goals" && goal.name.trim() && !skip) {
      setError("Save the goal below, or clear the form before continuing.");
      return;
    }
    if (
      step === "mapping" &&
      !skip &&
      data.mappings.some(
        (m) => !m.ignored && (!m.field.trim() || !m.department || !m.confirmed),
      )
    ) {
      setMappingPage(
        data.mappings.findIndex(
          (m) =>
            !m.ignored && (!m.field.trim() || !m.department || !m.confirmed),
        ),
      );
      setError(
        "Give every active field a name and department, then confirm it. Or skip mapping for now.",
      );
      return;
    }
    const index = steps.indexOf(step),
      target = reviewEdit ? "review" : steps[index + 1] || "complete";
    const next = {
      ...data,
      step: target,
      steps: { ...data.steps, [step]: skip ? "skipped" : "completed" },
      ...(step === "review" ? { completed: true } : {}),
    };
    if (await save(next)) {
      sessionStorage.removeItem(draftKey);
      nav(`/companies/${company.id}/onboarding/${target}`);
    }
  }
  function attachSource(name: string, fields: string[], demo: boolean) {
    const mappings: Mapping[] = fields.map((field) => ({
      field,
      meaning: field,
      department: data.departments[0] || "Company-wide",
      confirmed: false,
    }));
    setData((d) => ({
      ...d,
      connected: true,
      demo,
      sources: [name],
      mappings,
      discovered: true,
    }));
    setError("");
    toast("Source added. Your fields are ready for mapping.");
  }
  async function connectSheets() {
    setWorking(true);
    setError("");
    try {
      await new Promise((r) => setTimeout(r, 350));
      const fields = sampleAdapter
        .discover(sampleSources, data.departments)
        .map((m) => m.field);
      attachSource("Google Sheets · Business overview", fields, true);
      setConsent(false);
    } catch {
      setError("The connection could not be prepared. Please retry.");
    } finally {
      setWorking(false);
    }
  }
  async function uploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setWorking(true);
    setError("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw Error("Choose a file smaller than 5 MB.");
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["csv", "tsv", "json"].includes(ext || ""))
        throw Error(
          "Use a CSV, TSV or JSON file. Export Excel workbooks to CSV first.",
        );
      const text = (await file.text()).replace(/^\uFEFF/, "");
      let fields: string[];
      if (ext === "json") {
        const parsed = JSON.parse(text);
        const row = Array.isArray(parsed) ? parsed[0] : parsed;
        if (!row || typeof row !== "object" || Array.isArray(row))
          throw Error("Use a JSON object or a non-empty array of objects.");
        fields = Object.keys(row);
      } else fields = csvHeaders(text, ext === "tsv" ? "\t" : ",");
      if (
        !fields.length ||
        fields.some((f) => !f) ||
        new Set(fields).size !== fields.length
      )
        throw Error("Each column needs a unique, non-empty header.");
      if (fields.length > 100)
        throw Error("Please upload a file with 100 columns or fewer.");
      attachSource(file.name, fields, false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
      e.target.value = "";
    }
  }
  function addUrl() {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== "docs.google.com" ||
        !/^\/spreadsheets\/d\/[\w-]+/.test(parsed.pathname)
      )
        throw Error();
      attachSource(
        "Google Sheets · Linked spreadsheet",
        ["Date", "Revenue", "Expenses"],
        true,
      );
    } catch {
      setError(
        "Enter a valid Google Sheets URL beginning with https://docs.google.com/spreadsheets/d/.",
      );
    }
  }
  function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.name.trim() || !goal.target.trim() || !goal.deadline) {
      setError("Add a goal name, target and deadline.");
      return;
    }
    const next: Goal = {
      ...goal,
      name: goal.name.trim(),
      id: editing === null ? crypto.randomUUID() : data.goals[editing].id,
    };
    update(
      "goals",
      editing === null
        ? [...data.goals, next]
        : data.goals.map((g, i) => (i === editing ? next : g)),
    );
    setGoal(freshGoal);
    setEditing(null);
    setError("");
    toast("Goal saved.");
  }
  const editLink = (s: string) =>
    `/companies/${company.id}/onboarding/${s}${s === "company" ? "" : "?return=review"}`;
  if (step === "company")
    return <CompanyProfile company={company} onReload={onReload} />;
  const title = titles[step];
  if (!title)
    return (
      <Empty
        title="Return to your setup"
        description="This step is no longer part of onboarding."
        action={
          <Link className="button" to={editLink("departments")}>
            Open setup
          </Link>
        }
      />
    );
  return (
    <div className="seven-setup">
      {step !== "complete" && (
        <div className="seven-heading">
          <span className="seven-eyebrow">
            {step === "review"
              ? "YOUR WORKSPACE, AT A GLANCE"
              : step === "complete"
                ? "A CLEARER BEGINNING"
                : "SHAPED AROUND YOUR BUSINESS"}
          </span>
          <h1>{title[0]}</h1>
          <p>{title[1]}</p>
          {["priorities", "goals", "mapping"].includes(step) && (
            <Badge>Optional step</Badge>
          )}
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
      {step === "departments" && (
        <>
          <div className="seven-choice-grid">
            {[...new Set([...departmentOptions, ...data.departments])].map(
              (d, i) => (
                <button
                  className="seven-choice"
                  key={d}
                  aria-pressed={data.departments.includes(d)}
                  onClick={() => toggle("departments", d)}
                >
                  <span className="seven-choice-icon">
                    {i % 3 === 0 ? (
                      <BarIcon />
                    ) : i % 3 === 1 ? (
                      <Users size={22} />
                    ) : (
                      <Building2 size={22} />
                    )}
                  </span>
                  <strong>{d}</strong>
                  <span className="seven-choice-check">
                    {data.departments.includes(d) && <Check size={14} />}
                  </span>
                </button>
              ),
            )}
          </div>
          <form
            className="seven-custom"
            onSubmit={(e) => {
              e.preventDefault();
              addCustom("departments");
            }}
          >
            <Field
              label="Custom department"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. Customer success"
              maxLength={80}
            />
            <Button type="submit" variant="secondary">
              <Plus size={16} />
              Add department
            </Button>
          </form>
        </>
      )}
      {step === "integrations" && (
        <>
          <div
            className="seven-source-tabs"
            role="tablist"
            aria-label="Data source method"
          >
            {[
              ["sheets", "Connect sheets", FileSpreadsheet],
              ["file", "Upload a file", Upload],
              ["url", "Paste a URL", Link2],
            ].map(([id, label, Icon]) => {
              const I = Icon as typeof Upload;
              return (
                <button
                  key={String(id)}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(String(id));
                    setError("");
                  }}
                >
                  <I size={18} />
                  {String(label)}
                </button>
              );
            })}
          </div>
          <div className="seven-source-panel" role="tabpanel">
            {tab === "sheets" ? (
              <>
                <FileSpreadsheet className="seven-source-icon" size={38} />
                <h2>Google Sheets. Connected.</h2>
                <p>
                  Bring the spreadsheets your business already uses into one
                  workspace.
                </p>
                <Button onClick={() => setConsent(true)} disabled={working}>
                  <Link2 size={17} />
                  Connect Google Sheets
                </Button>
              </>
            ) : tab === "file" ? (
              <>
                <Upload className="seven-source-icon" size={38} />
                <h2>A simple file. A clearer start.</h2>
                <p>
                  Upload CSV, TSV or JSON, up to 5 MB. Your headers become
                  editable mapping fields. Files are read only in this browser.
                </p>
                <label className="seven-upload">
                  <input
                    type="file"
                    aria-label="Upload data file"
                    accept=".csv,.tsv,.json"
                    disabled={working || busy}
                    onChange={uploadFile}
                  />
                  <Upload size={20} />
                  <span>
                    {working ? "Reading your file…" : "Choose a file"}
                  </span>
                  <small>CSV, TSV or JSON · max 5 MB</small>
                </label>
              </>
            ) : (
              <>
                <Link2 className="seven-source-icon" size={38} />
                <h2>Start with a link.</h2>
                <p>
                  Paste a Google Sheets URL. This preview prepares example
                  fields without accessing the document.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addUrl();
                  }}
                >
                  <Field
                    label="Google Sheets URL"
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                  />
                  <Button type="submit">
                    Use spreadsheet URL <ArrowRight size={16} />
                  </Button>
                </form>
              </>
            )}
          </div>
          {!!data.sources.length && (
            <div className="seven-attached">
              <CheckCircle2 size={23} />
              <div>
                <strong>{data.sources[0]}</strong>
                <small>
                  {data.mappings.length} fields ready to map · adding a source
                  replaces the current one
                </small>
              </div>
              <button
                className="icon-button"
                aria-label="Remove source"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    sources: [],
                    mappings: [],
                    connected: false,
                    discovered: false,
                  }))
                }
              >
                <X size={17} />
              </button>
            </div>
          )}
        </>
      )}
      {step === "mapping" && (
        <>
          {!data.mappings.length ? (
            <Empty
              title="No fields to map yet"
              description="Connect a source, or skip this step and set it up later."
              action={
                <Link
                  className="button secondary"
                  to={editLink("integrations")}
                >
                  Connect data sheets
                </Link>
              }
            />
          ) : (
            <div className="seven-mappings">
              <div
                className="seven-mapping-pagination"
                aria-label="Mapping fields"
              >
                <span>
                  Field {mappingPage + 1} of {data.mappings.length}
                </span>
                <div>
                  <Button
                    variant="text"
                    disabled={mappingPage === 0}
                    onClick={() => {
                      setMappingPage((p) => p - 1);
                      setError("");
                    }}
                  >
                    Previous field
                  </Button>
                  <Button
                    variant="text"
                    disabled={mappingPage >= data.mappings.length - 1}
                    onClick={() => {
                      setMappingPage((p) => p + 1);
                      setError("");
                    }}
                  >
                    Next field
                  </Button>
                </div>
              </div>
              {data.mappings.map(
                (m, i) =>
                  i === mappingPage && (
                    <article
                      key={i}
                      className={
                        m.ignored ? "seven-map is-ignored" : "seven-map"
                      }
                    >
                      <div className="seven-map-title">
                        <FileSpreadsheet size={18} />
                        <strong>Field {String(i + 1).padStart(2, "0")}</strong>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            update(
                              "mappings",
                              data.mappings.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      ignored: !x.ignored,
                                      confirmed: false,
                                    }
                                  : x,
                              ),
                            )
                          }
                        >
                          {m.ignored ? "Restore field" : "Ignore field"}
                        </button>
                      </div>
                      <div className="seven-map-fields">
                        <Field
                          label={`Source field ${i + 1}`}
                          value={m.field}
                          disabled={m.ignored}
                          onChange={(e) =>
                            update(
                              "mappings",
                              data.mappings.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      field: e.target.value,
                                      meaning: e.target.value,
                                      confirmed: false,
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        <Select
                          label={`Department for ${m.field}`}
                          value={m.department}
                          disabled={m.ignored}
                          options={[
                            ...new Set([...data.departments, "Company-wide"]),
                          ]}
                          onChange={(v) =>
                            update(
                              "mappings",
                              data.mappings.map((x, j) =>
                                j === i
                                  ? { ...x, department: v, confirmed: false }
                                  : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <label className="seven-check">
                        <input
                          type="checkbox"
                          checked={m.confirmed}
                          disabled={m.ignored}
                          onChange={(e) =>
                            update(
                              "mappings",
                              data.mappings.map((x, j) =>
                                j === i
                                  ? { ...x, confirmed: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                        Confirm this field
                      </label>
                    </article>
                  ),
              )}
            </div>
          )}
        </>
      )}
      {step === "priorities" && (
        <>
          <div className="seven-priorities">
            {[...new Set([...priorityOptions, ...data.priorities])].map(
              (p, i) => (
                <button
                  key={p}
                  className="seven-priority"
                  aria-pressed={data.priorities.includes(p)}
                  onClick={() => toggle("priorities", p)}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {p}
                  <span className="seven-choice-check">
                    {data.priorities.includes(p) && <Check size={14} />}
                  </span>
                </button>
              ),
            )}
          </div>
          <form
            className="seven-custom"
            onSubmit={(e) => {
              e.preventDefault();
              addCustom("priorities");
            }}
          >
            <Field
              label="Custom priority"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="A priority unique to your business"
              maxLength={80}
            />
            <Button type="submit" variant="secondary">
              <Plus size={16} />
              Add priority
            </Button>
          </form>
        </>
      )}
      {step === "goals" && (
        <>
          <div className="seven-goals-list">
            {data.goals.map((g, i) => (
              <article key={g.id}>
                <Target size={23} />
                <div>
                  <h3>{g.name}</h3>
                  {g.description && (
                    <p className="goal-description-copy">{g.description}</p>
                  )}
                  <p>
                    Target: {g.target} · Due {g.deadline}
                  </p>
                  {g.owner && <small>Owner: {g.owner}</small>}
                </div>
                <button
                  className="icon-button"
                  aria-label={`Edit goal ${g.name}`}
                  onClick={() => {
                    setGoal({ ...g, description: g.description || "" });
                    setEditing(i);
                    document
                      .getElementById("inline-goal")
                      ?.scrollIntoView({ block: "center", behavior: "smooth" });
                  }}
                >
                  <Pencil size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove goal ${g.name}`}
                  onClick={() => {
                    update(
                      "goals",
                      data.goals.filter((_, j) => j !== i),
                    );
                    setGoal(freshGoal);
                    setEditing(null);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </article>
            ))}
          </div>
          <form
            id="inline-goal"
            className="seven-goal-form"
            onSubmit={saveGoal}
          >
            <div className="seven-form-title">
              <Target size={22} />
              <h2>
                {editing === null ? "Add a business goal" : "Edit your goal"}
              </h2>
            </div>
            <div className="form-grid">
              <Field
                label="Goal name"
                required
                value={goal.name}
                onChange={(e) => setGoal({ ...goal, name: e.target.value })}
                placeholder="e.g. Grow recurring revenue"
              />
              <Field
                label="Goal owner (optional)"
                value={goal.owner}
                onChange={(e) => setGoal({ ...goal, owner: e.target.value })}
                placeholder="Who will lead this goal?"
              />
            </div>
            <div className="form-grid">
              <Field
                label="Target value"
                required
                value={goal.target}
                onChange={(e) => setGoal({ ...goal, target: e.target.value })}
                placeholder="e.g. 20% growth"
              />
              <Field
                label="Deadline"
                type="date"
                required
                value={goal.deadline}
                onChange={(e) => setGoal({ ...goal, deadline: e.target.value })}
              />
            </div>
            <label className="field seven-goal-description">
              <span>Goal description (optional)</span>
              <textarea
                rows={2}
                value={goal.description}
                onChange={(e) =>
                  setGoal({ ...goal, description: e.target.value })
                }
                placeholder="Add context, milestones or what success looks like."
                maxLength={1000}
              />
            </label>
            <div className="seven-form-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setGoal(freshGoal);
                  setEditing(null);
                }}
              >
                Clear form
              </button>
              <Button type="submit" variant="secondary">
                <Check size={16} />
                {editing === null ? "Save goal" : "Update goal"}
              </Button>
            </div>
          </form>
        </>
      )}
      {step === "review" && (
        <div className="seven-review seven-review--refined">
          <div className="seven-review-company">
            <span>{company.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <small>YOUR WORKSPACE BRIEF</small>
              <h2>{company.name}</h2>
              <p>
                {company.industry} · {company.country}
              </p>
            </div>
            <span className="review-ready">
              <Check size={12} /> Ready to begin
            </span>
            <div className="review-facts">
              {[
                [data.departments.length, "Departments"],
                [data.sources.length, "Sources"],
                [data.goals.length, "Goals"],
              ].map(([n, l]) => (
                <div key={String(l)}>
                  <strong>{n}</strong>
                  <small>{l}</small>
                </div>
              ))}
            </div>
          </div>
          {[
            {
              s: "company",
              icon: Building2,
              title: "Company details",
              subtitle:
                [company.size, company.businessModel]
                  .filter(Boolean)
                  .join(" · ") || "Your company essentials",
              body: (
                <dl className="seven-review-details">
                  {[
                    ["Company name", company.name],
                    ["Industry", company.industry],
                    ["Website", company.website],
                    ["Company size", company.size],
                    ["Country", company.country],
                    ["Business model", company.businessModel],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || "Not provided"}</dd>
                    </div>
                  ))}
                </dl>
              ),
            },
            {
              s: "departments",
              icon: Users,
              title: "Departments",
              subtitle:
                data.departments.slice(0, 2).join(" · ") +
                  (data.departments.length > 2
                    ? ` +${data.departments.length - 2}`
                    : "") || "Add teams whenever you’re ready",
              body: (
                <div className="seven-review-tags">
                  {data.departments.length ? (
                    data.departments.map((d) => <span key={d}>{d}</span>)
                  ) : (
                    <p>No departments selected.</p>
                  )}
                </div>
              ),
            },
            {
              s: "integrations",
              icon: FileSpreadsheet,
              title: "Data sheets",
              subtitle: data.sources.length
                ? data.sources[0] +
                  (data.sources.length > 1
                    ? ` +${data.sources.length - 1}`
                    : "")
                : "Connect a source whenever you’re ready",
              body: <p>{data.sources.join(", ") || "No source added yet."}</p>,
            },
            {
              s: "mapping",
              icon: Link2,
              title: "Field mapping",
              subtitle:
                data.steps.mapping === "skipped"
                  ? "Skipped · you can return later"
                  : `${data.mappings.filter((m) => m.confirmed && !m.ignored).length} confirmed fields`,
              body: (
                <p>
                  {data.mappings
                    .filter((m) => m.confirmed && !m.ignored)
                    .map((m) => `${m.field} · ${m.department}`)
                    .join(" · ") || "No fields confirmed yet."}
                </p>
              ),
            },
            {
              s: "priorities",
              icon: Target,
              title: "Business priorities",
              subtitle:
                data.steps.priorities === "skipped"
                  ? "Optional · skipped for now"
                  : data.priorities.slice(0, 2).join(" · ") ||
                    "Choose your focus later",
              body: (
                <div className="seven-review-tags">
                  {data.priorities.length ? (
                    data.priorities.map((p) => <span key={p}>{p}</span>)
                  ) : (
                    <p>No priorities selected.</p>
                  )}
                </div>
              ),
            },
            {
              s: "goals",
              icon: CheckCircle2,
              title: "Business goals",
              subtitle: data.goals[0]?.name || "Room for your next ambition",
              body: data.goals.length ? (
                <ul className="seven-review-goals">
                  {data.goals.map((g) => (
                    <li key={g.id}>
                      <strong>{g.name}</strong>
                      {g.description && <p>{g.description}</p>}
                      <span>
                        Target: {g.target} · Due {g.deadline}
                        {g.owner ? ` · Owner: ${g.owner}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No goals added. You can set them later.</p>
              ),
            },
          ].map(({ s, icon: Icon, title, subtitle, body }) => (
            <section className="seven-review-section" key={s}>
              <details
                className="seven-review-expand"
                name="aynor-workspace-review"
              >
                <summary className="seven-review-section-head">
                  <span className="seven-review-icon">
                    <Icon size={18} strokeWidth={1.6} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{subtitle}</p>
                  </div>
                  {data.steps[s] === "skipped" && (
                    <span className="review-skipped">Skipped</span>
                  )}
                  <ChevronDown className="review-chevron" size={15} />
                </summary>
                <div className="seven-review-body">{body}</div>
              </details>
              <Link
                className="seven-edit"
                to={editLink(s)}
                aria-label={`Edit ${title.toLowerCase()}`}
                title={`Edit ${title.toLowerCase()}`}
              >
                <Pencil size={13} />
                <span>Edit</span>
              </Link>
            </section>
          ))}
        </div>
      )}
      {step === "complete" && (
        <div className="seven-complete seven-complete-restored">
          <div className="seven-complete-symbol" aria-hidden="true">
            <Check size={54} strokeWidth={1.65} />
          </div>
          <span className="seven-complete-eyebrow">
            A CLEARER PERSPECTIVE STARTS HERE
          </span>
          <h1>
            Make room for
            <br />
            <span>better decisions.</span>
          </h1>
          <p>
            {company.name} has a place of its own.
            <br />
            Your workspace is ready to explore.
          </p>
          <Badge>Workspace ready</Badge>
          <Link className="button" to={`/companies/${company.id}/overview`}>
            Open dashboard <ArrowRight size={22} />
          </Link>
          <small>Setup is saved. You can refine every detail later.</small>
        </div>
      )}
      {step !== "complete" && (
        <>
          <div className="seven-footer">
            <Button
              variant="text"
              disabled={busy || working}
              onClick={async () => {
                const target = reviewEdit
                  ? "review"
                  : steps[Math.max(0, steps.indexOf(step) - 1)];
                if (await save({ ...data, step: target }))
                  nav(
                    step === "departments" && !reviewEdit
                      ? `/companies/${company.id}/onboarding/company`
                      : `/companies/${company.id}/onboarding/${target}`,
                  );
              }}
            >
              <ArrowLeft size={16} />
              Back
            </Button>
            <div>
              {["mapping", "priorities", "goals", "integrations"].includes(
                step,
              ) &&
                !reviewEdit && (
                  <Button
                    variant="text"
                    disabled={busy || working}
                    onClick={() => advance(true)}
                  >
                    Skip for now
                  </Button>
                )}
              <Button busy={busy} disabled={working} onClick={() => advance()}>
                {step === "review"
                  ? "Enter Aynor"
                  : reviewEdit
                    ? "Save & return to review"
                    : "Continue"}
                <ArrowRight size={17} />
              </Button>
            </div>
          </div>
          <button
            className="seven-finish-later"
            disabled={busy || working}
            onClick={async () => {
              if (await save({ ...data, step })) {
                toast("Your progress is saved.");
                nav(`/companies/${company.id}/overview`);
              }
            }}
          >
            Save & finish later <ArrowUpRight size={14} />
          </button>
        </>
      )}
      {consent && (
        <Modal title="Connect Google Sheets" onClose={() => setConsent(false)}>
          <Badge>SIMULATED GOOGLE AUTHORIZATION</Badge>
          <p>
            This frontend preview uses example spreadsheet fields. No Google
            account is connected and no real document is accessed.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={working}
              onClick={() => {
                setConsent(false);
                setError(
                  "Access wasn’t granted. Retry the connection or choose another source method.",
                );
              }}
            >
              Deny access
            </Button>
            <Button busy={working} onClick={connectSheets}>
              Allow sample access <ArrowRight size={15} />
            </Button>
          </div>
        </Modal>
      )}
      {pending && (
        <Modal title="Keep your latest changes?" onClose={() => setPending("")}>
          <p>Save your changes before leaving this step.</p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                sessionStorage.removeItem(draftKey);
                nav(pending);
              }}
            >
              Discard changes
            </Button>
            <Button
              busy={busy}
              onClick={async () => {
                if (await save({ ...data, step })) nav(pending);
              }}
            >
              Save & continue
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function BarIcon() {
  return <Building2 size={22} />;
}
