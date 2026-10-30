import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Upload,
  RefreshCw,
  Mail,
  ExternalLink,
  ChevronRight,
  Eye,
  HelpCircle,
  AlertCircle,
  Plus,
  Trash2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button, ErrorBox, Field, Modal } from "../../components/ui";
import { useApp } from "../../lib/context";
import { api, type Company } from "../../lib/api";
import { serverRequest } from "../../lib/runtime";
import { Select } from "./LiveSelect";
import { readWorkbook } from "./upload-workbook";
import { DateFormat } from "./TableReview";
import {
  GoogleConnectionSetup,
  type GoogleSetup,
} from "./GoogleConnectionSetup";
import type { Profile } from "../../../shared/table-data.mjs";
import "./source-workspace.css";
type Change = {
  added: number;
  removed: number;
  updated: number;
  checked: number;
};
type Config = {
  headers?: string[];
  headerRow: number;
  dateFormat: string;
  dateYear?: number;
  dateYears?: Record<number, number>;
  dateFormats?: Record<number, string>;
  properties?: string[];
  types?: string[];
  department?: string;
};
type AutoQuestion = {
  id: string;
  kind: string;
  column?: number;
  message: string;
  choices: { value: string; label: string }[];
};
type Automatic = {
  status: string;
  origin: string;
  questions: AutoQuestion[];
  notes: string[];
  preparedAt: number;
};
type Tab = {
  tabId: number;
  title: string;
  mapped: boolean;
  skipped: boolean;
  department: string;
  rowCount: number;
  error: string | null;
  config: Config | null;
  lastSuccess: number | null;
  changes?: Change;
  automatic?: Automatic;
};
type Source = {
  id: string;
  mode: string;
  title: string;
  department?: string;
  tabs: Tab[];
  lastSuccess: number | null;
  error: string | null;
  url?: string;
  automation?: {
    aiStatus: string;
    completed: boolean;
    allowAi: boolean;
    preparedAt: number;
  };
};
type Catalog = {
  sources: Source[];
  account: { email: string | null; connected: boolean } | null;
  googleSetup: GoogleSetup;
  syncing: boolean;
  revision: number;
  error: string | null;
  aiAvailable?: boolean;
  nextCursor?: number | null;
};
type Inspection = {
  sourceId: string;
  tabId: number;
  title: string;
  parentTitle: string;
  headerRow: number;
  headers: string[];
  preview: unknown[][];
  profiles: Profile[];
  config: Config | null;
  department: string;
  rawPreview: unknown[][];
};
type Draft = {
  inspection: Inspection;
  properties: string[];
  department: string;
  dateFormat: string;
  dateYear?: number;
  dateYears?: Record<number, number>;
  dateFormats?: Record<number, string>;
};
const aiMessages: Record<string, string> = {
  used: "OpenRouter returned an AI response. Suggestions are checked before use.",
  not_needed:
    "Built-in preparation was sufficient. No AI inference was requested.",
  not_requested:
    "AI was switched off for this import. Built-in preparation was used.",
  not_configured:
    "Live AI is not configured on the server. Built-in preparation remains available.",
  invalid_key:
    "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in Vercel Production.",
  credit_limit:
    "OpenRouter rejected the request because of the key budget or available credits. Built-in preparation remains available.",
  access_denied:
    "OpenRouter denied access for this key or account. Built-in preparation remains available.",
  no_route:
    "No provider route was available under the free-only and privacy settings.",
  quota:
    "OpenRouter’s request quota was reached. Built-in preparation was used.",
  daily_limit:
    "AYNOR’s daily AI allowance was reached. Built-in preparation was used.",
  no_free_model:
    "No eligible free model was available. Built-in preparation was used.",
  paid_model_blocked:
    "A paid model was blocked. AYNOR only permits free models.",
  invalid_proposal:
    "AI responded, but its suggestions could not be used. Built-in preparation was used.",
  sample_limit:
    "Workbook metadata exceeded the AI size limit. Built-in preparation was used.",
  unavailable: "Live AI was unavailable. Built-in preparation was used.",
};
function aiMessage(status: string) {
  return (
    aiMessages[status] ||
    "Built-in preparation was used; live AI has not been confirmed."
  );
}
const catalogCache = new Map<string, Catalog>();
type ConflictCheck = {
  total: number;
  issues: {
    row: number;
    column: number;
    name: string;
    value: string;
    message: string;
  }[];
  error: string;
};
export function SourceWorkspace({
  companyId,
  phase = "manage",
  onBusyChange,
  onEditingChange,
  backRequest = 0,
}: {
  companyId: string;
  phase?: "connect" | "mapping" | "manage";
  onBusyChange?: (busy: boolean) => void;
  onEditingChange?: (editing: boolean) => void;
  backRequest?: number;
}) {
  const root = `/companies/${companyId}/sources`,
    nav = useNavigate();
  const { user, toast } = useApp();
  const cacheKey = `${user?.id}:${companyId}`;
  const [catalog, setCatalog] = useState<Catalog | null>(
      () => catalogCache.get(cacheKey) || null,
    ),
    [departments, setDepartments] = useState<string[]>([]),
    [section, setSection] = useState(
      phase === "mapping" ||
        new URLSearchParams(window.location.search).has("map")
        ? "mapping"
        : phase === "manage" &&
            !new URLSearchParams(window.location.search).has("google")
          ? "inventory"
          : "connect",
    ),
    [mode, setMode] = useState("oauth"),
    [url, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [aiCheck, setAiCheck] = useState(""),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [showPages, setShowPages] = useState(true),
    [allowAi, setAllowAi] = useState(() => {
      try {
        return localStorage.getItem(`aynor.ai.${cacheKey}`) !== "false";
      } catch {
        return true;
      }
    }),
    [expanded, setExpanded] = useState<string[]>([]),
    [conflicts, setConflicts] = useState<ConflictCheck | null>(null),
    [checking, setChecking] = useState(false),
    [question, setQuestion] = useState<{
      sourceId: string;
      tabId: number;
      question: AutoQuestion;
    } | null>(null),
    [selected, setSelected] = useState(""),
    [popup, setPopup] = useState<"preview" | "help" | null>(null),
    [setup, setSetup] = useState(false),
    [files, setFiles] = useState<{ id: string; name: string }[]>([]),
    [fileId, setFileId] = useState(""),
    [filesLoading, setFilesLoading] = useState(false),
    [remove, setRemove] = useState<Source | null>(null);
  const viewSection =
    phase === "manage" ? section : phase === "mapping" ? "mapping" : "connect";
  const uploadInput = useRef<HTMLInputElement>(null);
  function applyCatalog(value: Catalog) {
    setCatalog((current) => {
      const next =
        !current || value.revision >= current.revision ? value : current;
      catalogCache.set(cacheKey, next);
      return next;
    });
  }
  useEffect(
    () =>
      setSection(
        phase === "mapping" ||
          (phase === "manage" &&
            new URLSearchParams(window.location.search).has("map"))
          ? "mapping"
          : phase === "manage" &&
              !new URLSearchParams(window.location.search).has("google")
            ? "inventory"
            : "connect",
      ),
    [phase],
  );
  const refresh = useCallback(async () => {
    const value = await serverRequest<Catalog>(root);
    applyCatalog(value);
    return value;
  }, [root]);
  useEffect(() => {
    let active = true;
    serverRequest<Catalog>(root)
      .then((value) => {
        if (active) applyCatalog(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    api<Company>(`/companies/${companyId}`)
      .then((company) => {
        if (active) setDepartments(company.data.departments);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const timer = setInterval(() => {
      if (active) void refresh().catch(() => {});
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [root, companyId, refresh]);
  useEffect(() => {
    if (!catalog?.account?.connected) return;
    let active = true;
    setFilesLoading(true);
    serverRequest<{ files: { id: string; name: string }[] }>(
      root + "/google-files",
    )
      .then((result) => {
        if (active) setFiles(result.files);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setFilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [catalog?.account?.connected, root]);
  async function run(name: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    onBusyChange?.(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
      onBusyChange?.(false);
      window.dispatchEvent(new Event("aynor:sheet-change"));
    }
  }
  async function connect() {
    await run("google", async () => {
      if (!catalog?.googleSetup.ready) {
        setSetup(true);
        return;
      }
      const returnTo =
        window.location.pathname.match(
          /onboarding\/(integrations|mapping)$/,
        )?.[1] || "connections";
      const result = await serverRequest<{ url: string }>(
        `/companies/${companyId}/sheets/authorize`,
        "POST",
        { returnTo },
      );
      window.location.assign(result.url);
    });
  }
  async function prepareSource(id: string) {
    let cursor: number | null = 0,
      value: Catalog | null = null;
    let rounds = 0;
    do {
      setMessage("Reading your workbook and preparing its columns…");
      value = await serverRequest<Catalog>(`${root}/${id}/prepare`, "POST", {
        cursor,
        allowAi,
      });
      applyCatalog(value);
      cursor = value.nextCursor ?? null;
      rounds++;
    } while (cursor !== null && rounds < 50);
    const source = value?.sources.find((s) => s.id === id);
    const ready = source?.tabs.filter((t) => t.mapped).length || 0;
    const questions =
      source?.tabs.reduce(
        (n, t) => n + (t.automatic?.questions.length || 0),
        0,
      ) || 0;
    setMessage(
      ready
        ? `Your data is ready. ${ready} worksheet page${ready === 1 ? "" : "s"} prepared${questions ? ` · ${questions} quick check${questions === 1 ? "" : "s"} available` : ""}.`
        : "Workbook connected. Some pages need a manual check before they can be prepared.",
    );
  }
  async function add(input: unknown) {
    const result = await serverRequest<
      Catalog & { selectedId: string; duplicate?: boolean; unchanged?: boolean }
    >(root, "POST", input);
    applyCatalog(result);
    setUrl("");
    setExpanded((ids) => [...new Set([...ids, result.selectedId])]);
    const source = result.sources.find((s) => s.id === result.selectedId);
    if (result.duplicate && result.unchanged) {
      setMessage(
        `“${source?.title}” is already connected. No duplicate was added; your mappings are unchanged.`,
      );
      toast("This workbook is already connected.");
      return;
    }
    toast(
      result.duplicate
        ? "Workbook updated successfully."
        : "Workbook added successfully. Preparing your data…",
    );
    await prepareSource(result.selectedId);
    if (result.duplicate) setMessage((m) => `Existing workbook updated. ${m}`);
  }
  const activeDraft =
    drafts.find(
      (d) => `${d.inspection.sourceId}:${d.inspection.tabId}` === selected,
    ) || drafts[0];
  function changeDraft(update: Partial<Draft>) {
    if (activeDraft)
      setDrafts(
        drafts.map((d) => (d === activeDraft ? { ...d, ...update } : d)),
      );
  }
  async function openTab(source: Source, tab: Tab, headerRow?: number) {
    await run("inspect", async () => {
      const inspection = await serverRequest<Inspection>(
        `${root}/${source.id}/inspect`,
        "POST",
        { tabId: tab.tabId, ...(headerRow === undefined ? {} : { headerRow }) },
      );
      const properties =
        inspection.config?.properties?.length === inspection.headers.length &&
        (!inspection.config.headers ||
          JSON.stringify(inspection.config.headers) ===
            JSON.stringify(inspection.headers))
          ? inspection.config.properties
          : inspection.profiles.map((p) =>
              /^(revenue|sales|income|monthly revenue)$/i.test(p.name)
                ? "money_in"
                : /^(expenses|costs|operating costs|operating expenses)$/i.test(
                      p.name,
                    )
                  ? "money_out"
                  : p.type,
            );
      const draft = {
        inspection,
        properties,
        department: tab.department ?? source.department ?? "",
        dateFormat: inspection.config?.dateFormat || "ymd",
        dateYear: inspection.config?.dateYear,
        dateYears: inspection.config?.dateYears,
        dateFormats: inspection.config?.dateFormats,
      };
      setDrafts((existing) => [
        ...existing.filter(
          (d) =>
            !(
              d.inspection.sourceId === source.id &&
              d.inspection.tabId === tab.tabId
            ),
        ),
        draft,
      ]);
      setSelected(`${source.id}:${tab.tabId}`);
      setSection("mapping");
      setShowPages(false);
    });
  }
  useEffect(() => {
    onEditingChange?.(!!activeDraft && viewSection === "mapping");
  }, [!!activeDraft, viewSection, onEditingChange]);
  useEffect(() => {
    if (backRequest) {
      setDrafts([]);
      setSelected("");
      setShowPages(true);
    }
  }, [backRequest]);
  useEffect(() => {
    if (!activeDraft) {
      setConflicts(null);
      return;
    }
    let active = true;
    setConflicts(null);
    setChecking(true);
    const timer = setTimeout(() => {
      serverRequest<ConflictCheck>(
        `${root}/${activeDraft.inspection.sourceId}/check`,
        "POST",
        {
          tabId: activeDraft.inspection.tabId,
          headerRow: activeDraft.inspection.headerRow,
          properties: activeDraft.properties,
          dateFormat: activeDraft.dateFormat,
          dateYear: activeDraft.dateYear,
          dateYears: activeDraft.dateYears,
          dateFormats: activeDraft.dateFormats,
        },
      )
        .then((value) => {
          if (active) setConflicts(value);
        })
        .catch((e) => {
          if (active) setConflicts({ total: 0, issues: [], error: e.message });
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeDraft, root]);
  async function saveMappings() {
    await run("mapping", async () => {
      const bySource = new Map<string, Draft[]>();
      for (const draft of drafts) {
        const group = bySource.get(draft.inspection.sourceId) || [];
        group.push(draft);
        bySource.set(draft.inspection.sourceId, group);
      }
      const failures: string[] = [];
      let saved = 0;
      for (const [id, group] of bySource) {
        try {
          const value = await serverRequest<Catalog>(
            `${root}/${id}/map`,
            "POST",
            {
              tables: group.map((d) => ({
                tabId: d.inspection.tabId,
                headerRow: d.inspection.headerRow,
                properties: d.properties,
                dateFormat: d.dateFormat,
                dateYear: d.dateYear,
                dateYears: d.dateYears,
                dateFormats: d.dateFormats,
                department: d.department,
              })),
            },
          );
          applyCatalog(value);
          saved += group.length;
          setDrafts((current) =>
            current.filter((d) => d.inspection.sourceId !== id),
          );
        } catch (e) {
          failures.push((e as Error).message);
        }
      }
      if (failures.length) throw Error(failures.join("\n"));
      setMessage(
        `${saved} worksheet page${saved === 1 ? "" : "s"} mapped. Unmapped pages can be added later from Data connections.`,
      );
      setSelected("");
      setShowPages(true);
    });
  }
  const sources = catalog?.sources || [],
    mapped = sources.reduce(
      (n, s) => n + s.tabs.filter((t) => t.mapped).length,
      0,
    ),
    total = sources.reduce((n, s) => n + s.tabs.length, 0);
  const questions = sources.flatMap((source) =>
    source.tabs.flatMap((tab) =>
      (tab.automatic?.questions || [])
        .filter((q) => q.kind !== "department")
        .map((question) => ({
          sourceId: source.id,
          tabId: tab.tabId,
          question,
        })),
    ),
  );
  const visibleSources =
    viewSection === "connect"
      ? sources.filter((source) => source.mode === mode)
      : sources;
  const automaticallyPrepared = visibleSources.some(
    (source) => source.automation,
  );
  const deepLinkOpened = useRef(false);
  useEffect(() => {
    if (!catalog || viewSection !== "mapping") return;
    setExpanded(catalog.sources.map((s) => s.id));
    const params = new URLSearchParams(window.location.search);
    const source = catalog.sources.find((s) => s.id === params.get("source"));
    const tab = source?.tabs.find((t) => String(t.tabId) === params.get("tab"));
    if (source && tab && !deepLinkOpened.current) {
      deepLinkOpened.current = true;
      void openTab(source, tab);
    }
  }, [phase, viewSection, !!catalog]);
  const cardMapped = visibleSources.reduce(
    (n, s) => n + s.tabs.filter((t) => t.mapped).length,
    0,
  );
  const cardTotal = visibleSources.reduce((n, s) => n + s.tabs.length, 0);
  const cardQuestions = questions.filter((q) =>
    visibleSources.some((s) => s.id === q.sourceId),
  );
  const reviewPages = visibleSources
    .flatMap((s) => s.tabs)
    .filter((t) => t.automatic?.status === "needs_review").length;
  if (!catalog)
    return (
      <section className="source-workspace" aria-busy={!error}>
        <ErrorBox>{error}</ErrorBox>
        {error ? (
          <Button
            variant="secondary"
            onClick={() => void refresh().catch((e) => setError(e.message))}
          >
            Retry loading sources
          </Button>
        ) : (
          <p role="status">Loading your connected sources…</p>
        )}
      </section>
    );
  return (
    <section className="source-workspace" aria-busy={!!busy}>
      {phase === "manage" && (
        <div
          className="source-section-tabs"
          aria-label="Data connection sections"
        >
          <Button
            variant={viewSection === "inventory" ? "primary" : "secondary"}
            disabled={!!busy}
            onClick={() => {
              setSection("inventory");
              setDrafts([]);
              setShowPages(true);
            }}
          >
            Connected sources
          </Button>
          <Button
            variant={viewSection === "connect" ? "primary" : "secondary"}
            disabled={!!busy}
            onClick={() => {
              setSection("connect");
              setDrafts([]);
              setShowPages(true);
            }}
          >
            Add workbook
          </Button>
          <Button
            variant={viewSection === "mapping" ? "primary" : "secondary"}
            disabled={!!busy}
            onClick={() => {
              setSection("mapping");
              setExpanded(sources.map((s) => s.id));
            }}
          >
            Map worksheet pages{" "}
            <span>
              {mapped}/{total}
            </span>
          </Button>
        </div>
      )}
      {phase === "manage" && (
        <section className="source-ai-status" aria-label="Live AI status">
          <strong>Live AI</strong>
          <p>
            {aiCheck
              ? aiMessage(aiCheck)
              : catalog.aiAvailable
                ? "Credentials are configured. This does not confirm a successful AI request."
                : aiMessage("not_configured")}
          </p>
          <Button
            variant="secondary"
            busy={busy === "ai-check"}
            disabled={!!busy || !catalog.aiAvailable}
            onClick={() =>
              void run("ai-check", async () => {
                const result = await serverRequest<{ status: string }>(
                  `${root}/ai-check`,
                  "POST",
                  {},
                );
                setAiCheck(result.status);
              })
            }
          >
            Test live AI connection
          </Button>
          <small>
            Uses synthetic labels only, stays free-only, and counts toward the
            daily AI allowance.
          </small>
        </section>
      )}
      <ErrorBox>{error}</ErrorBox>
      {message && (
        <p className="source-notice" role="status">
          <CheckCircle2 size={16} />
          {message}
        </p>
      )}
      {automaticallyPrepared && !activeDraft && (
        <section className="auto-ready-card" aria-label="Automatic preparation">
          <span className="auto-ready-icon">
            <Sparkles size={22} />
          </span>
          <div>
            <h3>
              {cardMapped && !reviewPages
                ? "Your data is ready."
                : "A quick check before you continue."}
            </h3>
            <p>
              {cardMapped} of {cardTotal} worksheet pages prepared.{" "}
              {reviewPages
                ? `${reviewPages} page${reviewPages === 1 ? "" : "s"} need a manual check. Previously saved data remains available.`
                : cardQuestions.length
                  ? `${cardQuestions.length} quick check${cardQuestions.length === 1 ? "" : "s"} available. Your other data is already ready to explore.`
                  : "Your original files stay unchanged. You can review any column later."}
            </p>
          </div>
          <div className="auto-ready-actions">
            {cardMapped > 0 && (
              <Button
                disabled={!!busy}
                onClick={() => nav(`/companies/${companyId}/overview`)}
              >
                Open dashboard
                <ArrowRight size={14} />
              </Button>
            )}
            {cardQuestions.length > 0 && (
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => setQuestion(cardQuestions[0])}
              >
                Review {cardQuestions.length} quick check
                {cardQuestions.length === 1 ? "" : "s"}
              </Button>
            )}
            {viewSection !== "mapping" && (
              <Button
                variant="text"
                disabled={!!busy}
                onClick={() => {
                  setExpanded(sources.map((s) => s.id));
                  if (phase === "manage") setSection("mapping");
                  else nav(`/companies/${companyId}/onboarding/mapping`);
                }}
              >
                Review mapping
              </Button>
            )}
          </div>
        </section>
      )}
      {viewSection === "connect" && (
        <>
          <div className="auto-import-intro">
            <Sparkles size={17} />
            <p>
              Connect your workbook. We’ll prepare its columns automatically.
              Manual editing stays available.
            </p>
          </div>
          {catalog?.aiAvailable && (
            <label className="auto-ai-consent">
              <input
                type="checkbox"
                checked={allowAi}
                disabled={!!busy}
                onChange={(e) => {
                  setAllowAi(e.target.checked);
                  try {
                    localStorage.setItem(
                      `aynor.ai.${cacheKey}`,
                      String(e.target.checked),
                    );
                  } catch {}
                }}
              />
              <span>
                Use optional AI for unfamiliar labels
                <small>
                  Share workbook labels, column names and type summaries with a
                  free AI provider. Sheet rows and cell values are not sent. If
                  unavailable, automatic detection continues locally.
                </small>
              </span>
            </label>
          )}

          <div
            className="sheet-source-tabs intel-tabs"
            aria-label="Spreadsheet source"
          >
            {[
              ["oauth", "Connect Google"],
              ["upload", "Upload sheet"],
              ["public", "Paste URL"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                disabled={!!busy}
                onClick={() => {
                  setMode(value);
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "oauth" ? (
            <div className="source-connect-panel">
              <div className="source-account">
                <span className="source-account-icon">
                  <Mail size={19} />
                </span>
                <div>
                  <strong>
                    {catalog?.account?.email ||
                      (catalog?.account?.connected
                        ? "Google account connected"
                        : "Connect your Google account")}
                  </strong>
                  <small>
                    {catalog?.account?.connected
                      ? "Read-only spreadsheet access"
                      : "Your files stay in Google. Aynor won’t edit them."}
                  </small>
                </div>
                <Button
                  variant="secondary"
                  busy={busy === "google"}
                  disabled={!!busy}
                  onClick={() => void connect()}
                >
                  {catalog?.account?.connected
                    ? "Change account"
                    : "Connect Google"}
                  <ExternalLink size={13} />
                </Button>
              </div>
              {catalog?.account?.connected && (
                <>
                  {filesLoading ? (
                    <p role="status">Looking for available spreadsheets…</p>
                  ) : files.length > 0 ? (
                    <div className="source-add-form">
                      <Select
                        label="Choose a Google spreadsheet"
                        value={fileId}
                        onChange={(e) => setFileId(e.target.value)}
                        disabled={!!busy}
                      >
                        <option value="">Select a spreadsheet</option>
                        {files.map((file) => (
                          <option value={file.id} key={file.id}>
                            {file.name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        disabled={!!busy || !fileId}
                        onClick={() =>
                          void run("add", () =>
                            add({
                              mode: "oauth",
                              url: `https://docs.google.com/spreadsheets/d/${fileId}/edit`,
                            }),
                          )
                        }
                      >
                        Add spreadsheet
                        <Plus size={14} />
                      </Button>
                    </div>
                  ) : (
                    <p className="source-muted">
                      Google is connected. Paste the spreadsheet link below to
                      choose a workbook. This read-only grant may not allow
                      browsing your Drive.
                    </p>
                  )}
                  <form
                    className="source-add-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run("add", () => add({ mode: "oauth", url }));
                    }}
                  >
                    <Field
                      label="Google spreadsheet link"
                      type="text"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setError("");
                      }}
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                    />
                    <Button
                      disabled={!!busy || !url.trim()}
                      busy={busy === "add"}
                    >
                      Add spreadsheet
                      <Plus size={14} />
                    </Button>
                  </form>
                </>
              )}
            </div>
          ) : mode === "upload" ? (
            <div className="source-upload-panel">
              <Upload size={23} />
              <div>
                <h3>Add an Excel or CSV workbook</h3>
                <p>
                  All worksheet pages stay available. We prepare their columns
                  automatically.
                </p>
              </div>
              <Button
                variant="secondary"
                type="button"
                disabled={!!busy}
                busy={busy === "upload"}
                onClick={() => uploadInput.current?.click()}
              >
                Choose file
              </Button>
              <input
                ref={uploadInput}
                aria-label="Upload Excel or CSV file"
                type="file"
                accept=".xlsx,.csv"
                disabled={!!busy}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run("upload", async () => {
                      const book = await readWorkbook(file);
                      await add({
                        mode: "upload",
                        name: book.name,
                        sheets: book.sheets,
                      });
                    });
                  e.target.value = "";
                }}
              />
              <small>Up to 5 MB per file · 3 MB total saved source data</small>
            </div>
          ) : (
            <form
              className="source-url-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void run("add", () => add({ mode: "public", url, title }));
              }}
            >
              <p>
                Use a Google Sheet shared for viewing or a published CSV link.
                This method adds the worksheet selected in the URL. To browse
                every page, use Connect Google or upload the workbook.
              </p>
              <Field
                label="Source name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sales workbook"
                maxLength={150}
              />
              <Field
                label="Sheet URL"
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError("");
                }}
              />
              <Button disabled={!!busy || !url.trim()} busy={busy === "add"}>
                Add shared sheet
                <Plus size={14} />
              </Button>
            </form>
          )}
        </>
      )}
      {activeDraft && viewSection === "mapping" && (
        <Button variant="secondary" onClick={() => setShowPages(!showPages)}>
          {showPages
            ? "Back to column mapping"
            : "Choose another worksheet page"}
        </Button>
      )}
      {visibleSources.length > 0 &&
        (viewSection !== "mapping" || !activeDraft || showPages) && (
          <div className="source-inventory">
            <div className="source-inventory-heading">
              <h3>
                {viewSection === "mapping"
                  ? "Your worksheet pages"
                  : "Connected sources"}
              </h3>
              <span>
                {mapped} of {total} pages mapped
              </span>
            </div>
            {visibleSources.map((source) => (
              <article className="source-parent" key={source.id}>
                <header>
                  <FileSpreadsheet size={20} />
                  <div>
                    <button
                      type="button"
                      className="source-parent-toggle"
                      aria-expanded={expanded.includes(source.id)}
                      onClick={() =>
                        setExpanded((ids) =>
                          ids.includes(source.id)
                            ? ids.filter((id) => id !== source.id)
                            : [...ids, source.id],
                        )
                      }
                    >
                      <ChevronRight
                        size={16}
                        style={{
                          transform: expanded.includes(source.id)
                            ? "rotate(90deg)"
                            : undefined,
                        }}
                      />
                      <h4>{source.title}</h4>
                    </button>
                    <small>
                      {source.mode === "oauth"
                        ? "Google Sheets"
                        : source.mode === "upload"
                          ? "Uploaded workbook"
                          : "Shared URL"}{" "}
                      · {source.tabs.filter((t) => t.mapped).length}/
                      {source.tabs.length} pages mapped
                    </small>
                  </div>
                  <div className="source-parent-actions">
                    <Button
                      variant="text"
                      disabled={!!busy}
                      busy={busy === `prepare:${source.id}`}
                      onClick={() =>
                        void run(`prepare:${source.id}`, () =>
                          prepareSource(source.id),
                        )
                      }
                    >
                      <Sparkles size={14} />
                      {source.automation
                        ? "Prepare again"
                        : "Prepare automatically"}
                    </Button>
                    {source.mode !== "upload" ? (
                      <Button
                        variant="text"
                        disabled={!!busy}
                        busy={busy === `sync:${source.id}`}
                        onClick={() =>
                          void run(`sync:${source.id}`, async () => {
                            const value = await serverRequest<Catalog>(
                              `${root}/${source.id}/sync`,
                              "POST",
                              {},
                            );
                            applyCatalog(value);
                            setMessage(
                              "Sync checked all mapped pages. See each page for updates or issues.",
                            );
                          })
                        }
                      >
                        <RefreshCw size={14} />
                        Sync now
                      </Button>
                    ) : (
                      viewSection !== "mapping" && (
                        <Button
                          variant="text"
                          onClick={() => {
                            setSection("connect");
                            setMode("upload");
                            setMessage(
                              "Choose the updated file with the same name to refresh this workbook. Other sources will stay connected.",
                            );
                          }}
                        >
                          Upload new version
                        </Button>
                      )
                    )}
                    <Button
                      variant="text"
                      disabled={!!busy}
                      aria-label={`Remove ${source.title}`}
                      onClick={() => setRemove(source)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </header>
                {source.automation && (
                  <p
                    className="source-ai-result"
                    aria-label={`AI preparation status for ${source.title}`}
                  >
                    {aiMessage(source.automation.aiStatus)}
                  </p>
                )}
                {source.error && (
                  <p className="source-page-error">
                    <AlertCircle size={14} />
                    {source.error}
                  </p>
                )}
                <Select
                  label={`Department for ${source.title}`}
                  value={source.department || ""}
                  disabled={!!busy}
                  onChange={(e) => {
                    const department = e.target.value;
                    void run("department", async () => {
                      applyCatalog(
                        await serverRequest<Catalog>(
                          `${root}/${source.id}/department`,
                          "POST",
                          { department },
                        ),
                      );
                      setMessage(
                        "Department applied to all pages in this workbook. You can override individual pages in Edit mapping.",
                      );
                    });
                  }}
                >
                  <option value="">Unassigned · assign individual pages</option>
                  {departments.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
                {expanded.includes(source.id) && (
                  <div className="source-pages">
                    {source.tabs.map((tab) => (
                      <div
                        className={`source-page ${tab.mapped ? "is-mapped" : ""}`}
                        key={tab.tabId}
                      >
                        <span className="source-page-icon">
                          {tab.error ? (
                            <AlertCircle size={15} />
                          ) : tab.mapped ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <FileSpreadsheet size={15} />
                          )}
                        </span>
                        <div>
                          <strong>{tab.title}</strong>
                          <small>
                            {tab.mapped
                              ? `${tab.department || "Department not assigned"} · ${tab.rowCount.toLocaleString()} records`
                              : tab.skipped
                                ? "Skipped · available to map later"
                                : "Not mapped yet"}
                          </small>
                          {tab.automatic && (
                            <small className="auto-page-status">
                              {tab.automatic.status === "needs_review"
                                ? "Needs a manual check · saved data retained"
                                : tab.automatic.origin === "ai"
                                  ? "AI-assisted · validated"
                                  : tab.automatic.origin === "manual"
                                    ? "Manually reviewed"
                                    : tab.automatic.status === "empty"
                                      ? "No table records found"
                                      : tab.mapped
                                        ? "Automatically prepared · validated"
                                        : "Needs a manual check"}
                              {tab.automatic.questions?.length
                                ? ` · ${tab.automatic.questions.length} quick check${tab.automatic.questions.length === 1 ? "" : "s"}`
                                : ""}
                            </small>
                          )}
                          {tab.automatic?.notes?.map((note, index) => (
                            <small key={index}>{note}</small>
                          ))}
                          {tab.lastSuccess && (
                            <small>
                              Checked{" "}
                              {new Date(tab.lastSuccess).toLocaleString()}
                            </small>
                          )}
                          {tab.changes && (
                            <small className="source-change">
                              <RefreshCw size={11} />
                              {tab.changes.added ||
                              tab.changes.removed ||
                              tab.changes.updated
                                ? `${tab.changes.added} added · ${tab.changes.updated} changed · ${tab.changes.removed} removed`
                                : "No data changes"}
                            </small>
                          )}
                          {tab.error && (
                            <p className="source-page-error">{tab.error}</p>
                          )}
                        </div>
                        {viewSection === "mapping" || phase === "manage" ? (
                          <div className="source-page-actions">
                            <Button
                              variant="secondary"
                              disabled={!!busy}
                              onClick={() => void openTab(source, tab)}
                            >
                              {tab.mapped ? "Edit mapping" : "Map columns"}
                              <ChevronRight size={13} />
                            </Button>
                            {!tab.mapped && (
                              <Button
                                variant="text"
                                disabled={!!busy}
                                onClick={() =>
                                  void run("skip", async () =>
                                    applyCatalog(
                                      await serverRequest(
                                        `${root}/${source.id}/skip`,
                                        "POST",
                                        {
                                          tabId: tab.tabId,
                                          skipped: !tab.skipped,
                                        },
                                      ),
                                    ),
                                  )
                                }
                              >
                                {tab.skipped ? "Undo skip" : "Skip for now"}
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="source-page-status">
                            {tab.mapped
                              ? "Mapped"
                              : tab.skipped
                                ? "Skipped"
                                : "Pending mapping"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      {viewSection === "inventory" && sources.length === 0 && (
        <div className="source-empty">
          <FileSpreadsheet size={24} />
          <h3>No workbooks connected yet.</h3>
          <p>
            Connect Google, upload an Excel or CSV workbook, or paste a shared
            link.
          </p>
          <Button onClick={() => setSection("connect")}>
            Add your first workbook
          </Button>
        </div>
      )}
      {viewSection === "connect" && visibleSources.length === 0 && (
        <div className="source-empty" role="status">
          <FileSpreadsheet size={24} />
          <h3>
            {mode === "upload"
              ? "No uploaded workbooks yet."
              : mode === "oauth"
                ? "No Google spreadsheets added yet."
                : "No URL sources added yet."}
          </h3>
          <p>
            {mode === "upload"
              ? "Choose an Excel or CSV file above to get started."
              : "Add a workbook above. Sources added with other methods stay connected."}
          </p>
        </div>
      )}
      {viewSection === "mapping" && sources.length === 0 && (
        <div className="source-empty">
          <Link2 size={25} />
          <h3>Connect a source first.</h3>
          <p>
            Your worksheet pages will appear here once a workbook is connected.
          </p>
          <Button
            onClick={() =>
              phase === "manage"
                ? setSection("connect")
                : nav(`/companies/${companyId}/onboarding/integrations`)
            }
          >
            Connect a source
          </Button>
        </div>
      )}
      {activeDraft && viewSection === "mapping" && (
        <section className="source-mapping-editor">
          {drafts.length > 1 && (
            <div className="source-draft-tabs">
              {drafts.map((d) => (
                <button
                  type="button"
                  aria-pressed={activeDraft === d}
                  key={`${d.inspection.sourceId}:${d.inspection.tabId}`}
                  onClick={() =>
                    setSelected(
                      `${d.inspection.sourceId}:${d.inspection.tabId}`,
                    )
                  }
                >
                  {d.inspection.title}
                </button>
              ))}
            </div>
          )}
          <header>
            <div>
              <small>{activeDraft.inspection.parentTitle}</small>
              <h3>{activeDraft.inspection.title}</h3>
            </div>
            <div>
              <Button variant="text" onClick={() => setPopup("preview")}>
                <Eye size={14} />
                Preview sheet
              </Button>
              <Button
                variant="text"
                aria-label="Mapping help"
                onClick={() => setPopup("help")}
              >
                <HelpCircle size={16} />
              </Button>
            </div>
          </header>
          <Select
            label="Department for this worksheet"
            value={activeDraft.department}
            disabled={!!busy}
            onChange={(e) => changeDraft({ department: e.target.value })}
          >
            <option value="">Unassigned · choose later</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
          <div className="source-field-checks" aria-live="polite">
            {checking ? (
              <p role="status">
                Checking all rows against your column choices…
              </p>
            ) : conflicts?.total ? (
              <>
                <strong>
                  {conflicts.total} conflicting cell
                  {conflicts.total === 1 ? "" : "s"} to review
                </strong>
                <ul>
                  {conflicts.issues.map((issue, index) => (
                    <li key={index}>
                      Row {issue.row} · {issue.name}: “{issue.value}” —{" "}
                      {issue.message}
                    </li>
                  ))}
                </ul>
                <p>
                  Choose the correct type or date settings below. Text preserves
                  every original value.
                </p>
              </>
            ) : conflicts?.error ? (
              <ErrorBox>{conflicts.error}</ErrorBox>
            ) : conflicts ? (
              <p>
                <CheckCircle2 size={14} /> All rows match your column choices.
              </p>
            ) : null}
          </div>
          <p className="source-muted">
            Assign a property to each column. Your column names stay the same.
          </p>
          {!activeDraft.inspection.headers.length ? (
            <p role="status">
              This page is empty. Choose another page or a different header row.
            </p>
          ) : (
            <div className="source-property-list">
              {activeDraft.inspection.headers.map((name, index) => (
                <div
                  className={`source-property ${conflicts?.issues.some((i) => i.column === index) ? "has-conflict" : ""}`}
                  key={name}
                >
                  <div>
                    <strong>{name}</strong>
                    <small>
                      {activeDraft.inspection.profiles[index]?.examples
                        .join(" · ")
                        .slice(0, 100) || "No sample value"}
                    </small>
                  </div>
                  <Select
                    label={`Property for ${name}`}
                    value={activeDraft.properties[index] || "text"}
                    disabled={!!busy}
                    onChange={(e) =>
                      changeDraft({
                        properties: activeDraft.properties.map((p, i) =>
                          i === index ? e.target.value : p,
                        ),
                      })
                    }
                  >
                    {[
                      ["text", "Text"],
                      ["number", "Number"],
                      ["currency", "Currency"],
                      ["percentage", "Percentage"],
                      ["date", "Date"],
                      ["boolean", "Yes / No"],
                      ["money_in", "Money in (revenue)"],
                      ["money_out", "Money out (expenses)"],
                      ["ignore", "Don’t import"],
                    ].map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          )}
          {activeDraft.properties.includes("date") && (
            <DateFormat
              value={activeDraft.dateFormat}
              disabled={!!busy}
              onChange={(dateFormat) =>
                changeDraft({ dateFormat, dateFormats: undefined })
              }
            />
          )}
          {activeDraft.properties.includes("date") && (
            <Field
              label="Year for dates without a year"
              type="number"
              min={1900}
              max={9999}
              value={activeDraft.dateYear ?? ""}
              hint="For example, Oct 2 needs an explicit year. Dates that already include a year keep their own year."
              onChange={(e) =>
                changeDraft({
                  dateYear: e.target.value ? Number(e.target.value) : undefined,
                  dateYears: undefined,
                })
              }
              disabled={!!busy}
            />
          )}
          <div className="source-map-actions">
            <Button
              busy={busy === "mapping"}
              disabled={
                !!busy ||
                drafts.some(
                  (d) =>
                    !d.inspection.headers.length ||
                    !d.properties.some((p) => p !== "ignore"),
                )
              }
              onClick={() => void saveMappings()}
            >
              Save{" "}
              {drafts.length > 1 ? `${drafts.length} page mappings` : "mapping"}
              <CheckCircle2 size={15} />
            </Button>
            <Button
              variant="text"
              disabled={!!busy}
              onClick={() => {
                setDrafts(drafts.filter((d) => d !== activeDraft));
                if (drafts.length === 1) setShowPages(true);
              }}
            >
              Close this page
            </Button>
          </div>
        </section>
      )}
      {question && (
        <Modal
          title="Review a mapping choice"
          onClose={() => setQuestion(null)}
        >
          <ErrorBox>{error}</ErrorBox>
          <p className="source-muted">
            {sources.find((s) => s.id === question.sourceId)?.title} /{" "}
            {
              sources
                .find((s) => s.id === question.sourceId)
                ?.tabs.find((t) => t.tabId === question.tabId)?.title
            }
          </p>
          <p>{question.question.message}</p>
          <Button
            variant="text"
            disabled={!!busy}
            onClick={() => {
              const source = sources.find((s) => s.id === question.sourceId)!;
              const tab = source.tabs.find((t) => t.tabId === question.tabId)!;
              setQuestion(null);
              if (phase === "connect")
                nav(
                  `/companies/${companyId}/onboarding/mapping?source=${source.id}&tab=${tab.tabId}`,
                );
              else void openTab(source, tab);
            }}
          >
            Edit this page’s columns
          </Button>
          <div className="auto-question-options">
            {question.question.choices.map((choice) => (
              <Button
                key={choice.value || "unassigned"}
                variant="secondary"
                disabled={!!busy}
                busy={busy === "answer"}
                onClick={() =>
                  void run("answer", async () => {
                    const value = await serverRequest<Catalog>(
                      `${root}/${question.sourceId}/answer`,
                      "POST",
                      {
                        tabId: question.tabId,
                        questionId: question.question.id,
                        value: choice.value,
                      },
                    );
                    applyCatalog(value);
                    setQuestion(null);
                    setMessage("Choice saved. Your data is up to date.");
                  })
                }
              >
                {choice.label}
              </Button>
            ))}
          </div>
          <Button
            variant="text"
            disabled={!!busy}
            onClick={() => setQuestion(null)}
          >
            Decide later · keep available data
          </Button>
        </Modal>
      )}
      {popup && activeDraft && (
        <Modal
          title={
            popup === "help"
              ? "A quick guide to properties"
              : `${activeDraft.inspection.parentTitle} · ${activeDraft.inspection.title}`
          }
          onClose={() => setPopup(null)}
        >
          {popup === "help" ? (
            <div className="source-help">
              <p>
                <b>Text</b> — names, IDs, statuses and notes.
              </p>
              <p>
                <b>Number / Currency / Percentage</b> — measurable values. A
                number isn’t automatically revenue.
              </p>
              <p>
                <b>Date</b> — choose the date order used in your sheet.
              </p>
              <p>
                <b>Money in / Money out</b> — optional financial properties.
                Assign both and a Date column to create financial charts.
              </p>
              <p>
                <b>Don’t import</b> — leave this column out.
              </p>
              <p>
                Choose the department responsible for this worksheet. You can
                map other pages later.
              </p>
            </div>
          ) : (
            <>
              <Select
                label="Column names are on"
                value={String(activeDraft.inspection.headerRow)}
                onChange={(e) => {
                  const source = sources.find(
                    (s) => s.id === activeDraft.inspection.sourceId,
                  )!;
                  const tab = source.tabs.find(
                    (t) => t.tabId === activeDraft.inspection.tabId,
                  )!;
                  void openTab(source, tab, Number(e.target.value));
                }}
              >
                {activeDraft.inspection.rawPreview.map((row, i) => (
                  <option value={i} key={i}>
                    Row {i + 1} · {row.slice(0, 3).join(" · ").slice(0, 75)}
                  </option>
                ))}
              </Select>
              <div className="source-preview-table">
                <table>
                  <thead>
                    <tr>
                      {activeDraft.inspection.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeDraft.inspection.preview.map((row, i) => (
                      <tr key={i}>
                        {activeDraft.inspection.headers.map((h, j) => (
                          <td key={h}>{String(row[j] ?? "—")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
      {setup && (
        <GoogleConnectionSetup
          setup={catalog?.googleSetup}
          onClose={() => setSetup(false)}
          onRetry={() => {
            setSetup(false);
            void connect();
          }}
        />
      )}
      {remove && (
        <Modal
          title={`Remove ${remove.title}?`}
          onClose={() => setRemove(null)}
        >
          <p>
            Only this source and its mapped pages will be removed. Your other
            connected sources and original files stay unchanged.
          </p>
          <Button variant="secondary" onClick={() => setRemove(null)}>
            Cancel
          </Button>
          <Button
            busy={busy === "remove"}
            onClick={() =>
              void run("remove", async () => {
                applyCatalog(
                  await serverRequest(`${root}/${remove.id}`, "DELETE"),
                );
                setRemove(null);
              })
            }
          >
            Remove source
          </Button>
        </Modal>
      )}
    </section>
  );
}
