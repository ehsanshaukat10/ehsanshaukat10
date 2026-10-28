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
export type SourceStatus = {
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
  headers: string[];
  preview?: string[][];
  rowCount?: number;
};
type UploadData = { name: string; tabTitle: string; values: UploadCell[][] };
export function useSheetStatus(company: string, enabled = true) {
  const [source, setSource] = useState<SourceStatus | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let events: EventSource | null = null;
    const reload = () =>
      serverRequest<SourceStatus>(`/companies/${company}/sheets`)
        .then((s) => {
          if (active) {
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
          if (active) setError(e.message);
        });
    void reload();
    const timer = setInterval(reload, 15000);
    window.addEventListener("aynor:sheet-change", reload);
    return () => {
      active = false;
      events?.close();
      window.removeEventListener("aynor:sheet-change", reload);
      clearInterval(timer);
    };
  }, [company, enabled]);
  return { source, error };
}
export function SheetsConnection({ companyId }: { companyId: string }) {
  return <SheetsConnectionContent key={companyId} companyId={companyId} />;
}
function SheetsConnectionContent({ companyId }: { companyId: string }) {
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
  async function inspect(tabId?: number) {
    await perform("inspect", async () => {
      const value = await serverRequest<Inspection>(
        root + (mode === "public" ? "/public" : "/inspect"),
        "POST",
        {
          url,
          ...(mode === "public" ? { previewOnly: true } : {}),
          ...(tabId === undefined ? {} : { tabId }),
        },
      );
      applyInspection(value);
    });
  }
  function applyInspection(value: Inspection) {
    setInspection(value);
    const match = (pattern: RegExp) =>
      value.headers.find((header) => pattern.test(header)) || "";
    setMapping({
      date: match(/^(date|record date|transaction date)$/i),
      revenue: match(/^(revenue|sales|income|monthly revenue)$/i),
      expenses: match(/^(costs|expenses|operating expenses|operating costs)$/i),
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
    applyInspection(value);
  }
  async function chooseFile(file?: File) {
    if (!file || busy) return;
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
        {mode === "oauth" ? (
          <>
            <p>
              Connect your Google account, then paste a spreadsheet link. Aynor
              requests spreadsheet read permission only.
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
                  private link needs Google authorization before its columns can
                  be read. Choose Connect Google to see the setup steps.
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
            Paste a published CSV link or a Google Sheet shared for viewing. For
            private sheets, choose Connect Google.
          </p>
        ) : (
          <div className="sheet-upload">
            <div
              className={"sheet-upload-drop" + (dragging ? " is-dragging" : "")}
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
                setInspection(null);
                setError("");
              }}
              placeholder={
                mode === "public"
                  ? "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
                  : "https://docs.google.com/spreadsheets/d/…/edit"
              }
            />
            <Button disabled={!!busy || !url.trim()} busy={busy === "inspect"}>
              {mode === "oauth" &&
              (!source?.connected ||
                source.mode !== "oauth" ||
                source.status === "reauth_required")
                ? "Connect Google & read columns"
                : "Read columns"}
            </Button>
          </form>
        )}
        {inspection && (
          <form
            className="intel-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("mapping", async () => {
                if (mode === "upload") {
                  if (!uploadData)
                    throw Error("Choose your file and read its columns first.");
                  await serverRequest(root + "/upload", "POST", {
                    ...uploadData,
                    mapping,
                  });
                } else
                  await serverRequest(root + "/mapping", "PUT", {
                    spreadsheetId: inspection.spreadsheetId,
                    tabId: inspection.tabId,
                    mapping,
                    ...(mode === "public" ? { publicUrl: url } : {}),
                  });
                setMessage(
                  mode === "upload"
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
                label="Spreadsheet tab"
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
            <p role="status">
              {inspection.rowCount !== undefined
                ? `${inspection.rowCount.toLocaleString()} records · `
                : ""}
              {inspection.headers.length} columns found. Review your data and
              choose the reporting columns.
            </p>
            {inspection.preview?.length ? (
              <div
                style={{ overflowX: "auto", maxHeight: 180, marginBottom: 16 }}
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
            ) : null}
            <p>
              One row per record. Dates accept year-first formats such as
              2026-09-01 or 2026/9/1. Revenue and expenses accept numbers,
              thousands separators and common currency symbols in your workspace
              currency; no currency conversion is applied.
            </p>
            <div className="intel-form-grid">
              {(["date", "revenue", "expenses"] as const).map((field) => (
                <Select
                  key={field}
                  label={
                    field === "date"
                      ? "Record date"
                      : field === "revenue"
                        ? "Revenue"
                        : "Operating expenses"
                  }
                  value={mapping[field]}
                  onChange={(event) =>
                    setMapping({ ...mapping, [field]: event.target.value })
                  }
                >
                  <option value="">Choose a column</option>
                  {inspection.headers.map((header) => (
                    <option key={header}>{header}</option>
                  ))}
                </Select>
              ))}
            </div>
            <Button
              disabled={
                !!busy ||
                Object.values(mapping).some((v) => !v) ||
                new Set(Object.values(mapping)).size !== 3
              }
              busy={busy === "mapping"}
            >
              {mode === "upload"
                ? "Import & update dashboard"
                : "Save mapping & sync"}
            </Button>
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
                    await serverRequest(root + "/sync", "POST");
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
