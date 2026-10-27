import { Select } from "./LiveSelect";
import { useEffect, useState } from "react";
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
export type SourceStatus = {
  configured: boolean;
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
  const { source, error: streamError } = useSheetStatus(companyId),
    [mode, setMode] = useState("oauth"),
    [url, setUrl] = useState(""),
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
      setMapping({ date: "", revenue: "", expenses: "" });
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
            }}
          >
            Private sheet
          </button>
          <button
            aria-pressed={mode === "public"}
            onClick={() => {
              setMode("public");
              setInspection(null);
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
              disabled={!!busy || !source?.configured}
              busy={busy === "authorize"}
              onClick={() =>
                perform("authorize", async () => {
                  const result = await serverRequest<{ url: string }>(
                    root + "/authorize",
                    "POST",
                  );
                  window.location.assign(result.url);
                })
              }
            >
              <ExternalLink size={14} />
              {source?.connected && source.mode === "oauth"
                ? "Reconnect Google"
                : "Connect Google"}
            </Button>
            {source && !source.configured && (
              <p>
                Private access needs server OAuth credentials. Published sheets
                are available without them.
              </p>
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
            void inspect();
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
            }}
            placeholder={
              mode === "public"
                ? "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
                : "https://docs.google.com/spreadsheets/d/…/edit"
            }
          />
          <Button
            disabled={
              !!busy ||
              !url.trim() ||
              (mode === "oauth" &&
                (!source?.connected || source.mode !== "oauth"))
            }
            busy={busy === "inspect"}
          >
            Read columns
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
            <p>
              One row per record. Dates must use YYYY-MM-DD. Revenue and
              expenses must be numeric amounts in your workspace currency; no
              currency conversion is applied.
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
    </div>
  );
}
