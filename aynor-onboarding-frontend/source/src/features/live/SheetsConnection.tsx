import { Select } from "./LiveSelect";
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { Button, ErrorBox, Field } from "../../components/ui";
import { serverRequest } from "../../lib/runtime";
import { Confirm, Panel } from "../intelligence/shared";
import {
  GoogleConnectionSetup,
  type GoogleSetup,
} from "./GoogleConnectionSetup";
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
};
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
        { url, ...(tabId === undefined ? {} : { tabId }) },
      );
      setInspection(value);
      const match = (pattern: RegExp) =>
        value.headers.find((header) => pattern.test(header)) || "";
      setMapping({
        date: match(/^(date|record date|transaction date)$/i),
        revenue: match(/^(revenue|sales|income|monthly revenue)$/i),
        expenses: match(
          /^(costs|expenses|operating expenses|operating costs)$/i,
        ),
      });
    });
  }
  return (
    <div className="live-source">
      <Panel title="Google Sheets" action={<ShieldCheck size={18} />}>
        <p>
          Read-only access. Your sheet stays in Google; Aynor stores a validated
          reporting snapshot.
        </p>
        <ErrorBox>{error || streamError}</ErrorBox>
        {message && <p role="status">{message}</p>}
        <div className="intel-tabs" aria-label="Google Sheets access">
          <button
            aria-pressed={mode === "oauth"}
            onClick={() => {
              setMode("oauth");
              setInspection(null);
              setError("");
            }}
          >
            Private sheet
          </button>
          <button
            aria-pressed={mode === "public"}
            onClick={() => {
              setMode("public");
              setInspection(null);
              setError("");
            }}
          >
            Published sheet
          </button>
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
                : "Connect Google"}
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
                  Use published sheet
                </Button>
              </div>
            )}
          </>
        ) : (
          <p>
            In Google Sheets, choose File → Share → Publish to web → CSV. Only
            publish data you intend to make public.
          </p>
        )}
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
            label={
              mode === "public" ? "Published CSV link" : "Spreadsheet link"
            }
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
        {inspection && (
          <form
            className="intel-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("mapping", async () => {
                await serverRequest(root + "/mapping", "PUT", {
                  spreadsheetId: inspection.spreadsheetId,
                  tabId: inspection.tabId,
                  mapping,
                });
                setMessage(
                  source?.syncMode === "manual"
                    ? "Mapping saved and first sync completed."
                    : "Mapping saved. Validation and first sync are running.",
                );
                setInspection(null);
              });
            }}
          >
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
            <p role="status">
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
              Save mapping & sync
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
            {source.mode === "public"
              ? "Published CSV"
              : "Private Google Sheets"}{" "}
            · {source.mapping ? "Fields mapped" : "Mapping needed"}
          </p>
          <p>
            {source.lastSuccess
              ? "Last valid sync " +
                new Date(source.lastSuccess).toLocaleString()
              : "No validated snapshot yet."}{" "}
            {source.stale
              ? "Showing last valid data; source needs attention."
              : ""}
          </p>
          <p>
            {source.syncMode === "manual"
              ? "Manual sync: click Sync now after updating your sheet. No background sync is scheduled."
              : `Checks for changes every ${Math.round(source.intervalMs / 1000)} seconds. Changes appear after the next successful read.`}
          </p>
          <div className="intel-inline-links">
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
