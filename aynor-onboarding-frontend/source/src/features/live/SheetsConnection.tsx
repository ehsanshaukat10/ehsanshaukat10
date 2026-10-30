import { SourceWorkspace } from "./SourceWorkspace";
import { profileColumns, type Profile } from "../../../shared/table-data.mjs";
import { TableReview, DateFormat, type TableChoice } from "./TableReview";
import { Select } from "./LiveSelect";
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
  Upload,
  Unplug,
} from "lucide-react";
import { Button, ErrorBox, Field } from "../../components/ui";
import { serverRequest } from "../../lib/runtime";
import { Confirm, Panel } from "../intelligence/shared";
import {
  GoogleConnectionSetup,
  type GoogleSetup,
} from "./GoogleConnectionSetup";
import {
  readWorkbook,
  suggestHeaderRow,
  type UploadWorkbook,
  type UploadCell,
} from "./upload-workbook";
import "./sheet-upload.css";
import { ColumnMatches, type ColumnMapping } from "./ColumnMatches";
export type SourceStatus = {
  dataKind?: "tables" | "financial";
  hasSources?: boolean;
  automaticReady?: boolean;
  needsReviewCount?: number;
  sourceCount?: number;
  mappedCount?: number;
  unmappedCount?: number;
  configured: boolean;
  googleSetup?: GoogleSetup;
  connected: boolean;
  mode: string;
  spreadsheet: string | null;
  tabTitle: string | null;
  tabId: number | null;
  mapping: Record<string, string> | null;
  status: string;
  error: string | null;
  lastSuccess: number | null;
  lastAttempt: number | null;
  nextSync: number | null;
  stale: boolean;
  hasSnapshot: boolean;
  revision: number;
  intervalMs: number;
  syncMode?: "manual";
};
type Inspection = {
  spreadsheetId: string;
  title: string;
  tabs: { sheetId: number; title: string }[];
  tabId: number;
  tabTitle: string;
  headerRow?: number;
  rawPreview?: UploadCell[][];
  profiles?: Profile[];
  headers: string[];
  preview?: string[][];
  rowCount?: number;
};
type UploadData = { name: string; tabTitle: string; values: UploadCell[][] };
function announceSource(company: string, source: SourceStatus) {
  if (typeof source?.connected === "boolean")
    window.dispatchEvent(
      new CustomEvent("aynor:sheet-change", { detail: { company, source } }),
    );
}
export function useSheetStatus(company: string, enabled = true) {
  const [source, setSource] = useState<SourceStatus | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let sequence = 0;
    let events: EventSource | null = null;
    const reload = () => {
      const request = ++sequence;
      return serverRequest<SourceStatus>(`/companies/${company}/sheets`)
        .then((s) => {
          if (active && request === sequence) {
            setSource(s);
            setError("");
            if (s.syncMode !== "manual" && !events) {
              events = new EventSource(
                `/api/companies/${company}/sheets/events`,
              );
              events.addEventListener("sync", (event) => {
                if (active) {
                  setSource(JSON.parse((event as MessageEvent).data));
                  setError("");
                }
              });
              events.onerror = () => {
                if (active)
                  setError(
                    "Live updates interrupted. Status refreshes every 15 seconds.",
                  );
              };
            }
          }
        })
        .catch((e) => {
          if (active && request === sequence) setError(e.message);
        });
    };
    const changed = (event: Event) => {
      const detail = (
        event as CustomEvent<{ company: string; source: SourceStatus }>
      ).detail;
      if (detail?.company === company && detail.source) {
        sequence++;
        setSource(detail.source);
        setError("");
      } else void reload();
    };
    void reload();
    const timer = setInterval(reload, 15000);
    window.addEventListener("aynor:sheet-change", changed);
    return () => {
      active = false;
      events?.close();
      window.removeEventListener("aynor:sheet-change", changed);
      clearInterval(timer);
    };
  }, [company, enabled]);
  return { source, error };
}
export function SheetsConnection({ companyId }: { companyId: string }) {
  return <SourceWorkspace key={companyId} companyId={companyId} />;
}
export function LegacySheetsConnectionContent({
  companyId,
}: {
  companyId: string;
}) {
  const draftKey = `aynor:google-draft:${companyId}`;
  function readDraft() {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) || "null") as {
        url: string;
        autoRead: boolean;
      } | null;
    } catch {
      return null;
    }
  }
  const { source, error: streamError } = useSheetStatus(companyId),
    [mode, setMode] = useState("oauth"),
    [url, setUrl] = useState(() => readDraft()?.url || ""),
    [setupOpen, setSetupOpen] = useState(false),
    [setup, setSetup] = useState<GoogleSetup>(),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [workbook, setWorkbook] = useState<UploadWorkbook | null>(null),
    [uploadData, setUploadData] = useState<UploadData | null>(null),
    [worksheet, setWorksheet] = useState(0),
    [headerRow, setHeaderRow] = useState(0),
    [dragging, setDragging] = useState(false),
    [mapping, setMapping] = useState({ date: "", revenue: "", expenses: "" }),
    [suggestions, setSuggestions] = useState<ColumnMapping>({
      date: "",
      revenue: "",
      expenses: "",
    }),
    [reportType, setReportType] = useState("table"),
    [dateFormat, setDateFormat] = useState("ymd"),
    [tableChoice, setTableChoice] = useState<TableChoice>({
      tabId: 0,
      title: "",
      headerRow: 0,
      purpose: "Other",
      types: [],
      dateFormat: "ymd",
    }),
    [queued, setQueued] = useState<
      { choice: TableChoice; headers: string[]; values?: UploadCell[][] }[]
    >([]),
    [relationships, setRelationships] = useState<
      { from: number; to: number; fromColumn: string; toColumn: string }[]
    >([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(() => {
      const result = new URLSearchParams(window.location.search).get("google");
      return result === "cancelled"
        ? "Google connection cancelled. Your previous source is unchanged."
        : result === "failed"
          ? "Google connection could not be completed. Check its configuration and try again."
          : result === "connected"
            ? "Google account connected. Select a spreadsheet below."
            : "";
    }),
    [remove, setRemove] = useState(false);
  const root = `/companies/${companyId}/sheets`;
  const resumed = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sourceControls = useRef<HTMLDetailsElement>(null);
  async function connect(autoRead = false) {
    await perform("authorize", async () => {
      const current = await serverRequest<SourceStatus>(root);
      setSetup(current.googleSetup);
      if (!current.configured) {
        setSetupOpen(true);
        return;
      }
      const returnTo =
        window.location.pathname.match(
          /\/onboarding\/(integrations|mapping)$/,
        )?.[1] || "connections";
      const result = await serverRequest<{ url: string }>(
        root + "/authorize",
        "POST",
        { returnTo },
      );
      try {
        sessionStorage.setItem(draftKey, JSON.stringify({ url, autoRead }));
      } catch {
        /* Connection still works when browser storage is unavailable. */
      }
      window.location.assign(result.url);
    });
  }
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("google");
    const draft = readDraft();
    if (
      !resumed.current &&
      result === "connected" &&
      source?.connected &&
      source.mode === "oauth"
    ) {
      resumed.current = true;
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Optional draft only. */
      }
      if (draft?.autoRead && url.trim()) void inspect();
      // Consume the callback marker so reloads do not repeat an import.
      const location = new URL(window.location.href);
      location.searchParams.delete("google");
      window.history.replaceState(
        window.history.state,
        "",
        location.pathname + location.search + location.hash,
      );
    }
  }, [source]);
  async function perform(name: string, task: () => Promise<void>) {
    setBusy(name);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
      window.dispatchEvent(new Event("aynor:sheet-change"));
    }
  }
  async function inspect(tabId?: number, selectedHeader?: number) {
    await perform("inspect", async () => {
      const value = await serverRequest<Inspection>(
        root + (mode === "public" ? "/public" : "/inspect"),
        "POST",
        {
          url,
          ...(mode === "public" ? { previewOnly: true } : {}),
          ...(tabId === undefined ? {} : { tabId }),
          ...(selectedHeader === undefined
            ? {}
            : { headerRow: selectedHeader }),
        },
      );
      applyInspection(value);
    });
  }
  function applyInspection(value: Inspection) {
    setInspection(value);
    const match = (pattern: RegExp) =>
      value.headers.find((header) => pattern.test(header)) || "";
    const suggested = {
      date: match(/^(date|record date|transaction date)$/i),
      revenue: match(/^(revenue|sales|income|monthly revenue)$/i),
      expenses: match(/^(costs|expenses|operating expenses|operating costs)$/i),
    };
    setMapping(suggested);
    setSuggestions(suggested);
    setReportType(
      Object.values(suggested).every(Boolean) ? "financial" : "table",
    );
    const profiles =
      value.profiles || profileColumns(value.headers, value.preview || []);
    setTableChoice({
      tabId: value.tabId,
      title: value.tabTitle,
      headerRow: value.headerRow || 0,
      purpose: "Other",
      types: profiles.map((p) => p.type),
      dateFormat: "ymd",
    });
  }
  async function inspectUpload(
    book: UploadWorkbook,
    index: number,
    header: number,
  ) {
    setInspection(null);
    setUploadData(null);
    const data = {
      name: book.name,
      tabTitle: book.sheets[index].name,
      values: book.sheets[index].rows.slice(header),
    };
    if (new Blob([JSON.stringify(data)]).size > 3 * 1024 * 1024 - 2000)
      throw Error(
        "This worksheet contains too much data. Keep the reporting columns only or split it into smaller files.",
      );
    const value = await serverRequest<Inspection>(
      root + "/upload",
      "POST",
      data,
    );
    setUploadData(data);
    applyInspection({
      ...value,
      tabId: index,
      tabTitle: book.sheets[index].name,
      headerRow: header,
    });
  }
  async function chooseFile(file?: File) {
    if (!file || busy) return;
    setQueued([]);
    setRelationships([]);
    setInspection(null);
    setUploadData(null);
    await perform("file", async () => {
      const book = await readWorkbook(file);
      setWorkbook(book);
      const index = Math.max(
        0,
        book.sheets.findIndex((sheet) => sheet.rows.length > 1),
      );
      const header = suggestHeaderRow(book.sheets[index].rows);
      setWorksheet(index);
      setHeaderRow(header);
      await inspectUpload(book, index, header);
    });
  }
  return (
    <div className="live-source">
      <Panel title="Connect your data" action={<ShieldCheck size={18} />}>
        <p>
          Bring your spreadsheet into focus. Connect Google, upload a file, or
          paste a shared link.
        </p>
        <ErrorBox>{error || streamError}</ErrorBox>
        {message && <p role="status">{message}</p>}
        <div
          className="intel-tabs sheet-source-tabs"
          aria-label="Spreadsheet source"
        >
          {[
            ["oauth", "Connect Google"],
            ["upload", "Upload sheet"],
            ["public", "Paste URL"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              disabled={!!busy}
              aria-pressed={mode === value}
              onClick={() => {
                setQueued([]);
                setRelationships([]);
                setMode(value);
                setInspection(null);
                setUploadData(null);
                setError("");
                setMessage("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <details
          ref={sourceControls}
          className="sheet-source-controls"
          open={!inspection}
        >
          <summary hidden={!inspection}>
            <FileSpreadsheet size={15} />
            <span>{inspection?.title || "Your sheet"}</span>
            <small>Change sheet</small>
          </summary>
          {mode === "oauth" ? (
            <>
              <p>
                Connect your Google account, then paste a spreadsheet link.
                Aynor requests spreadsheet read permission only.
              </p>
              <Button
                type="button"
                disabled={!!busy}
                busy={busy === "authorize"}
                onClick={() => void connect()}
              >
                <ExternalLink size={14} />
                {source?.connected && source.mode === "oauth"
                  ? "Reconnect Google"
                  : "Connect Google account"}
              </Button>
              {source && !source.configured && (
                <div role="status">
                  <p>
                    Google connection is not set up for this workspace yet. A
                    private link needs Google authorization before its columns
                    can be read. Choose Connect Google to see the setup steps.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setMode("public");
                      setError("");
                      setInspection(null);
                      setUrl("");
                    }}
                  >
                    Paste a shared URL
                  </Button>
                </div>
              )}
            </>
          ) : mode === "public" ? (
            <p>
              Paste a published CSV link or a Google Sheet shared for viewing.
              For private sheets, choose Connect Google.
            </p>
          ) : (
            <div className="sheet-upload">
              <div
                className={
                  "sheet-upload-drop" + (dragging ? " is-dragging" : "")
                }
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void chooseFile(event.dataTransfer.files[0]);
                }}
              >
                <span className="sheet-upload-icon">
                  <Upload size={22} strokeWidth={1.5} />
                </span>
                <strong>
                  {workbook?.name || "A spreadsheet. A clearer picture."}
                </strong>
                <p>Drop your file here, or choose one below.</p>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,.csv"
                  aria-label="Upload Excel or CSV file"
                  hidden
                  disabled={!!busy}
                  onChange={(event) => {
                    void chooseFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  busy={busy === "file"}
                  disabled={!!busy}
                  onClick={() => fileInput.current?.click()}
                >
                  {workbook ? "Choose another file" : "Choose file"}
                </Button>
                <small>Excel .xlsx or CSV · up to 5 MB · 10,000 records</small>
              </div>
              {workbook && (
                <div className="sheet-upload-options">
                  <Select
                    label="Worksheet"
                    value={String(worksheet)}
                    disabled={!!busy}
                    onChange={(event) => {
                      const index = Number(event.target.value);
                      const header = suggestHeaderRow(
                        workbook.sheets[index].rows,
                      );
                      setWorksheet(index);
                      setHeaderRow(header);
                      void perform("inspect", () =>
                        inspectUpload(workbook, index, header),
                      );
                    }}
                  >
                    {workbook.sheets.map((sheet, index) => (
                      <option key={index} value={index}>
                        {sheet.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Header row"
                    value={String(headerRow)}
                    disabled={!!busy}
                    onChange={(event) => {
                      const header = Number(event.target.value);
                      setHeaderRow(header);
                      void perform("inspect", () =>
                        inspectUpload(workbook, worksheet, header),
                      );
                    }}
                  >
                    {Array.from(
                      {
                        length: Math.min(
                          100,
                          workbook.sheets[worksheet].rows.length,
                        ),
                      },
                      (_, index) => (
                        <option key={index} value={index}>
                          Row {index + 1}
                        </option>
                      ),
                    )}
                  </Select>
                  {!inspection && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void perform("inspect", () =>
                          inspectUpload(workbook, worksheet, headerRow),
                        )
                      }
                    >
                      Read columns
                    </Button>
                  )}
                </div>
              )}
              <p className="sheet-upload-note">
                A saved import stays in your workspace. Upload an updated file
                whenever your numbers change.
              </p>
            </div>
          )}
          {mode !== "upload" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  mode === "oauth" &&
                  (!source?.connected ||
                    source.mode !== "oauth" ||
                    source.status === "reauth_required")
                )
                  void connect(true);
                else void inspect();
              }}
              className="intel-inline-form"
              style={{ marginTop: 20 }}
            >
              <Field
                label={mode === "public" ? "Sheet URL" : "Spreadsheet link"}
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setQueued([]);
                  setRelationships([]);
                  setInspection(null);
                  setError("");
                }}
                placeholder={
                  mode === "public"
                    ? "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
                    : "https://docs.google.com/spreadsheets/d/…/edit"
                }
              />
              <Button
                disabled={!!busy || !url.trim()}
                busy={busy === "inspect"}
              >
                {mode === "oauth" &&
                (!source?.connected ||
                  source.mode !== "oauth" ||
                  source.status === "reauth_required")
                  ? "Connect Google & read columns"
                  : "Read columns"}
              </Button>
            </form>
          )}
        </details>
        {inspection && (
          <form
            className="intel-form mapping-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("mapping", async () => {
                let updated: SourceStatus;
                if (reportType === "table") {
                  const current = {
                    choice: tableChoice,
                    headers: inspection.headers,
                    values:
                      mode === "upload"
                        ? workbook?.sheets[worksheet].rows
                        : undefined,
                  };
                  const all = [
                    ...queued.filter(
                      (item) => item.choice.tabId !== current.choice.tabId,
                    ),
                    current,
                  ];
                  updated = await serverRequest(root + "/tables", "POST", {
                    mode,
                    url,
                    name: workbook?.name,
                    tables: all.map((item) => item.choice),
                    relationships: relationships.filter(
                      (link) =>
                        all.some((item) => item.choice.tabId === link.from) &&
                        all.some((item) => item.choice.tabId === link.to),
                    ),
                    ...(mode === "upload"
                      ? {
                          uploaded: all.map((item) => ({
                            tabId: item.choice.tabId,
                            values: item.values,
                          })),
                        }
                      : {}),
                  });
                  setQueued([]);
                  setRelationships([]);
                } else if (mode === "upload") {
                  if (!uploadData)
                    throw Error("Choose your file and read its columns first.");
                  updated = await serverRequest(root + "/upload", "POST", {
                    ...uploadData,
                    mapping: { ...mapping, _dateFormat: dateFormat },
                  });
                } else
                  updated = await serverRequest(root + "/mapping", "PUT", {
                    spreadsheetId: inspection.spreadsheetId,
                    tabId: inspection.tabId,
                    mapping: {
                      ...mapping,
                      _headerRow: String(inspection.headerRow || 0),
                      _dateFormat: dateFormat,
                    },
                    ...(mode === "public" ? { publicUrl: url } : {}),
                  });
                announceSource(companyId, updated);
                setMessage(
                  reportType === "table"
                    ? "Tables imported. Open your dashboard to explore your records."
                    : mode === "upload"
                      ? "File imported. Your dashboard now uses these records."
                      : source?.syncMode === "manual"
                        ? "Mapping saved and first sync completed."
                        : "Mapping saved. Validation and first sync are running.",
                );
                setInspection(null);
              });
            }}
          >
            {mode !== "upload" && (
              <Select
                label="Sheet"
                aria-label="Spreadsheet tab"
                value={String(inspection.tabId)}
                onChange={(event) => void inspect(Number(event.target.value))}
              >
                {inspection.tabs.map((tab) => (
                  <option key={tab.sheetId} value={tab.sheetId}>
                    {tab.title}
                  </option>
                ))}
              </Select>
            )}
            {mode !== "upload" && (
              <Select
                label="Column names are on"
                value={String(inspection.headerRow || 0)}
                disabled={!!busy}
                onChange={(e) =>
                  void inspect(inspection.tabId, Number(e.target.value))
                }
              >
                {Array.from(
                  { length: inspection.rawPreview?.length || 1 },
                  (_, i) => (
                    <option key={i} value={i}>
                      Row {i + 1} ·{" "}
                      {(inspection.rawPreview?.[i] || [])
                        .slice(0, 3)
                        .join(" · ")
                        .slice(0, 75)}
                    </option>
                  ),
                )}
              </Select>
            )}
            {!inspection.headers.length && (
              <p role="status">
                This worksheet is empty. Choose another sheet above, or add a
                table in Google Sheets and read it again.
              </p>
            )}
            <Select
              label="How would you like to use this data?"
              value={reportType}
              disabled={!!busy}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="table">Explore my table · any kind of data</option>
              <option value="financial">
                Build a financial report · dates, revenue & expenses
              </option>
            </Select>
            {reportType === "table" ? (
              <>
                <TableReview
                  profiles={
                    inspection.profiles ||
                    profileColumns(inspection.headers, inspection.preview || [])
                  }
                  choice={tableChoice}
                  disabled={!!busy}
                  onChange={setTableChoice}
                />
                {queued.length > 0 && (
                  <div
                    className="table-queue"
                    aria-label="Tables ready to import"
                  >
                    {queued.map((item) => (
                      <button
                        type="button"
                        key={item.choice.tabId}
                        disabled={!!busy}
                        onClick={() =>
                          setQueued(
                            queued.filter(
                              (t) => t.choice.tabId !== item.choice.tabId,
                            ),
                          )
                        }
                      >
                        {item.choice.title} · Remove
                      </button>
                    ))}
                  </div>
                )}
                {queued.some(
                  (item) => item.choice.tabId !== tableChoice.tabId,
                ) && (
                  <details className="mapping-detail">
                    <summary>Connect related tables · optional</summary>
                    <p>
                      Only connect a shared ID, code or email when it identifies
                      the same thing in both tables. The reference column must
                      be unique. We won’t combine totals.
                    </p>
                    {queued
                      .filter((item) => item.choice.tabId !== tableChoice.tabId)
                      .flatMap((item) =>
                        item.headers
                          .filter(
                            (header) =>
                              /(?:id|code|email)$/i.test(header.trim()) &&
                              inspection.headers.includes(header),
                          )
                          .map((header) => {
                            const checked = relationships.some(
                              (link) =>
                                link.from === tableChoice.tabId &&
                                link.to === item.choice.tabId &&
                                link.fromColumn === header &&
                                link.toColumn === header,
                            );
                            return (
                              <label
                                key={`${item.choice.tabId}:${header}`}
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                  fontSize: 13,
                                  padding: "10px 0",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!!busy}
                                  onChange={(e) =>
                                    setRelationships(
                                      e.target.checked
                                        ? [
                                            ...relationships,
                                            {
                                              from: tableChoice.tabId,
                                              to: item.choice.tabId,
                                              fromColumn: header,
                                              toColumn: header,
                                            },
                                          ]
                                        : relationships.filter(
                                            (link) =>
                                              !(
                                                link.from ===
                                                  tableChoice.tabId &&
                                                link.to === item.choice.tabId &&
                                                link.fromColumn === header
                                              ),
                                          ),
                                    )
                                  }
                                />
                                {tableChoice.title} → {item.choice.title} ·{" "}
                                {header}
                              </label>
                            );
                          }),
                      )}
                    <small>
                      No shared identifier shown? You can still import the
                      tables separately.
                    </small>
                  </details>
                )}
                {mode !== "public" && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      !!busy ||
                      queued.length >= 9 ||
                      !tableChoice.types.some((t) => t !== "ignore")
                    }
                    onClick={() => {
                      const choice =
                        mode === "upload"
                          ? {
                              ...tableChoice,
                              tabId: worksheet,
                              title: workbook!.sheets[worksheet].name,
                            }
                          : tableChoice;
                      setQueued([
                        ...queued.filter(
                          (t) => t.choice.tabId !== choice.tabId,
                        ),
                        {
                          choice,
                          headers: inspection.headers,
                          values:
                            mode === "upload"
                              ? workbook?.sheets[worksheet].rows
                              : undefined,
                        },
                      ]);
                      if (sourceControls.current && mode === "upload") {
                        sourceControls.current.open = true;
                        sourceControls.current
                          .querySelector<HTMLSelectElement>(
                            'select[aria-label="Worksheet"]',
                          )
                          ?.focus();
                      }
                      setMessage(
                        "Table added. Choose another worksheet above, or import your selection below.",
                      );
                    }}
                  >
                    Keep this table & add another
                  </Button>
                )}
              </>
            ) : (
              <>
                <ColumnMatches
                  headers={inspection.headers}
                  preview={inspection.preview}
                  mapping={mapping}
                  suggestions={suggestions}
                  disabled={!!busy}
                  onChange={setMapping}
                />
                <DateFormat
                  value={dateFormat}
                  disabled={!!busy}
                  onChange={setDateFormat}
                />
              </>
            )}
            {inspection.preview?.length ? (
              <details className="mapping-detail">
                <summary>
                  See your sheet
                  {inspection.rowCount !== undefined
                    ? ` · ${inspection.rowCount.toLocaleString()} ${inspection.rowCount === 1 ? "row" : "rows"}`
                    : ""}
                </summary>
                <div
                  style={{
                    overflowX: "auto",
                    maxHeight: 180,
                    marginBottom: 16,
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      fontSize: 12,
                      textAlign: "left",
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr>
                        {inspection.headers.map((header) => (
                          <th
                            key={header}
                            style={{ padding: 8, fontWeight: 500 }}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.preview.map((row, index) => (
                        <tr key={index}>
                          {inspection.headers.map((header, i) => (
                            <td
                              key={header}
                              style={{
                                padding: 8,
                                borderTop: "1px solid #ecebf3",
                              }}
                            >
                              {String(row[i] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
            {reportType === "financial" && (
              <details className="mapping-detail">
                <summary>Need help choosing?</summary>
                <p>
                  Pick the date of each entry, the money your business earned,
                  and the money it spent. Each needs a different column. If one
                  is missing, add it to your sheet first.
                </p>
                <p>
                  Dates can look like 2026-10-01 or 2026/10/1. Amounts should
                  use your workspace’s currency. We don’t convert currencies.
                </p>
              </details>
            )}
            <Button
              disabled={
                !!busy ||
                (reportType === "financial"
                  ? Object.values(mapping).some((v) => !v) ||
                    new Set(Object.values(mapping)).size !== 3
                  : !tableChoice.types.some((t) => t !== "ignore"))
              }
              busy={busy === "mapping"}
            >
              {reportType === "table"
                ? `Import ${new Set([...queued.map((t) => t.choice.tabId), tableChoice.tabId]).size} ${queued.filter((t) => t.choice.tabId !== tableChoice.tabId).length ? "tables" : "table"}`
                : mode === "upload"
                  ? "Import my sheet"
                  : "Use these columns"}
            </Button>
            <p className="mapping-submit-note">
              {reportType === "table"
                ? "Explore records, column completeness and category counts. Tables stay separate; no automatic joins or invented financial metrics."
                : "Aynor will validate every row before building financial charts. Your original sheet stays unchanged."}
            </p>
          </form>
        )}
      </Panel>
      {source?.connected && (
        <Panel
          title={source.tabTitle || "Connected account"}
          action={
            <span className="intel-status">
              {source.status.replaceAll("_", " ")}
            </span>
          }
        >
          <ErrorBox>{source.error}</ErrorBox>
          <p>
            <FileSpreadsheet size={13} />{" "}
            {source.mode === "upload"
              ? "Uploaded spreadsheet"
              : source.mode === "public"
                ? "Published CSV"
                : "Private Google Sheets"}{" "}
            · {source.mapping ? "Fields mapped" : "Mapping needed"}
          </p>
          <p>
            {source.lastSuccess
              ? (source.mode === "upload" ? "Imported " : "Last valid sync ") +
                new Date(source.lastSuccess).toLocaleString()
              : "No validated snapshot yet."}{" "}
            {source.stale
              ? "Showing last valid data; source needs attention."
              : ""}
          </p>
          <p>
            {source.mode === "upload"
              ? "Saved file import. Upload a new version to update your dashboard."
              : source.syncMode === "manual"
                ? "Manual sync: click Sync now after updating your sheet. No background sync is scheduled."
                : `Checks for changes every ${Math.round(source.intervalMs / 1000)} seconds. Changes appear after the next successful read.`}
          </p>
          <div className="intel-inline-links">
            {source.mode === "upload" ? (
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => {
                  setMode("upload");
                  setInspection(null);
                  setUploadData(null);
                  setTimeout(() => fileInput.current?.click(), 0);
                }}
              >
                <Upload size={13} />
                Upload new version
              </Button>
            ) : (
              <Button
                variant="secondary"
                busy={busy === "sync"}
                disabled={
                  !!busy || !source.mapping || source.status === "syncing"
                }
                onClick={() =>
                  perform("sync", async () => {
                    const updated = await serverRequest<SourceStatus>(
                      root + "/sync",
                      "POST",
                    );
                    announceSource(companyId, updated);
                    setMessage(
                      source.syncMode === "manual"
                        ? "Sync completed. Your report is up to date."
                        : "Sync requested. Status updates automatically.",
                    );
                  })
                }
              >
                <RefreshCw size={13} />
                Sync now
              </Button>
            )}
            <Button
              variant="text"
              disabled={!!busy}
              onClick={() => setRemove(true)}
            >
              <Unplug size={13} />
              Disconnect
            </Button>
          </div>
        </Panel>
      )}
      {remove && (
        <Confirm
          title="Disconnect this spreadsheet?"
          text="The reporting snapshot and saved mapping will be removed. This does not change the source sheet or revoke your Google account's grant."
          busy={!!busy}
          onCancel={() => setRemove(false)}
          onConfirm={() =>
            void perform("remove", async () => {
              await serverRequest(root, "DELETE");
              if (source)
                announceSource(companyId, {
                  ...source,
                  connected: false,
                  hasSnapshot: false,
                  mapping: null,
                  status: "disconnected",
                  lastSuccess: null,
                  error: null,
                });
              setRemove(false);
              setInspection(null);
              setMessage("Spreadsheet disconnected.");
            })
          }
        />
      )}
      {setupOpen && (
        <GoogleConnectionSetup
          setup={setup}
          onClose={() => setSetupOpen(false)}
          onRetry={() => {
            setSetupOpen(false);
            void connect(Boolean(url.trim()));
          }}
        />
      )}
    </div>
  );
}
