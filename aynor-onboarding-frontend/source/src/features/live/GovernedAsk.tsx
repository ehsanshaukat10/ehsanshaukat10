import { clearAskMemory, readAskMemory, writeAskMemory } from "./ask-memory";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Send, Sparkles } from "lucide-react";
import { Button, ErrorBox, Modal } from "../../components/ui";
import type { Company } from "../../lib/api";
import { serverRequest, ApiError } from "../../lib/runtime";
import { Panel, Blank, Status } from "../intelligence/shared";
import { GovernedModule, useGovernedModule } from "./GovernedModule";
import { intelligenceQuery } from "./intelligence-cache";
import type { AskAnswer, AskStatus } from "./ask-types";
type Request = {
  requestId: string;
  question: string;
  context: Record<string, string | string[]>;
  memory?: string;
  focus?: string;
  external: boolean;
};
const categoryLabels: Record<string, string> = {
  finance: "Finance — financial amounts and ratios",
  sales: "Sales",
  delivery: "Delivery and projects",
  resources: "Resources — capacity summaries",
  operations: "Operations",
  marketing: "Marketing",
  other: "Other confirmed business summaries",
};
const fallbackReasons: Record<string, string> = {
  external_off: "External processing is off for this answer.",
  consent_required: "External-processing consent is required for live AI.",
  company_policy_off:
    "External processing is not approved for these business categories.",
  secure_state_unavailable: "Secure conversation state is not configured.",
  provider_unavailable:
    "No approved live provider route is currently available.",
  no_eligible_facts:
    "There are no eligible authorized facts for external processing.",
  provider_quota: "The free provider allowance is unavailable or exhausted.",
  question_quota: "The configured AI question allowance was reached.",
  provider_or_validation_failure:
    "The provider was unavailable or its answer could not be safely validated.",
  pasted_records_blocked:
    "Pasted source records were withheld from external processing.",
  period_clarification: "A matching reporting period needs clarification.",
};
export function GovernedAsk({ company }: { company: Company }) {
  const m = useGovernedModule(company),
    location = useLocation(),
    api = m.base + "/intelligence/ask";
  const [status, setStatus] = useState<AskStatus | null>(null),
    [loadError, setLoadError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [question, setQuestion] = useState(
      () => new URLSearchParams(location.search).get("question") || "",
    ),
    [messages, setMessages] = useState<
      { question: string; answer: AskAnswer }[]
    >([]),
    [sending, setSending] = useState(false),
    [requestError, setRequestError] = useState(""),
    [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"policy" | "consent" | null>(null),
    [categories, setCategories] = useState<string[]>([]),
    [policyEnabled, setPolicyEnabled] = useState(false),
    [consentBusy, setConsentBusy] = useState(false),
    [consentError, setConsentError] = useState("");
  const memory = useRef<string | undefined>(undefined),
    pending = useRef<Request | null>(null),
    epoch = useRef(0),
    authority = useRef(""),
    consentVersion = useRef<string | null>(null),
    cacheKey = useRef("");
  function clear(forget = true) {
    if (forget && cacheKey.current) clearAskMemory(cacheKey.current);
    epoch.current++;
    memory.current = undefined;
    pending.current = null;
    setMessages([]);
    setSending(false);
    setRequestError("");
  }
  useEffect(() => {
    if (!m.report) {
      setStatus(null);
      clear(false);
      if (m.error) clearAskMemory();
      return;
    }
    let active = true;
    setLoadError("");
    serverRequest<AskStatus>(api + "?" + intelligenceQuery(location.search))
      .then((v) => {
        if (!active) return;
        if (
          v.authorization.fingerprint !== m.report!.authorization.fingerprint ||
          v.datasetRevision !== m.report!.datasetRevision ||
          v.context.key !== m.report!.context.key
        ) {
          setStatus(null);
          clear();
          m.retry();
          return;
        }
        if (
          authority.current &&
          (authority.current !== v.proof ||
            consentVersion.current !==
              `${v.approval}:${v.consentVersion || "none"}`)
        ) {
          clear();
          setNotice(
            "Business data, access or consent changed. Previous answers were cleared; ask again using current evidence.",
          );
        }
        const k = JSON.stringify([
          company.id,
          v.authorization.fingerprint,
          v.context.key,
        ]);
        const consentKey = `${v.approval}:${v.consentVersion || "none"}`;
        if (!authority.current) {
          const saved = readAskMemory(k, v.proof, consentKey);
          if (saved) {
            setMessages(saved.messages);
            memory.current = saved.memory;
          }
        }
        cacheKey.current = k;
        authority.current = v.proof;
        consentVersion.current = `${v.approval}:${v.consentVersion || "none"}`;
        setStatus(v);
      })
      .catch((e) => {
        if (active) {
          setStatus(null);
          clear();
          setLoadError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [m.report, refresh, api, location.search]);
  const ready =
    !!status &&
    status.datasetRevision === m.report?.datasetRevision &&
    status.authorization.fingerprint === m.report?.authorization.fingerprint;
  async function changeConsent(granted: boolean) {
    if (!status) return;
    setConsentBusy(true);
    setConsentError("");
    try {
      await serverRequest(api + "/consent", "POST", {
        approval: status.approval,
        granted,
      });
      clear();
      setDialog(null);
      setRefresh((v) => v + 1);
      setNotice(
        granted
          ? "External AI consent saved for these approved categories. You can revoke it at any time."
          : "External AI consent revoked. Future questions use built-in answers.",
      );
    } catch (e) {
      setConsentError((e as Error).message);
    } finally {
      setConsentBusy(false);
    }
  }
  async function savePolicy() {
    if (!status) return;
    setConsentBusy(true);
    setConsentError("");
    try {
      await serverRequest(api + "/policy", "POST", {
        enabled: policyEnabled,
        categories,
        companyVersion: status.companyVersion,
      });
      clear();
      setStatus(null);
      setDialog(null);
      m.retry();
      setRefresh((v) => v + 1);
    } catch (e) {
      setConsentError((e as Error).message);
    } finally {
      setConsentBusy(false);
    }
  }
  function context() {
    const p = new URLSearchParams(intelligenceQuery(location.search));
    return Object.fromEntries(
      [...new Set(p.keys())].map((k) => [
        k,
        p.getAll(k).length > 1 ? p.getAll(k) : p.get(k)!,
      ]),
    );
  }
  async function submit(retry = false, text?: string) {
    if (!ready || sending) return;
    const q = (text || question).trim();
    if (!retry && !q) return;
    const request = retry
      ? pending.current
      : {
          requestId: crypto.randomUUID(),
          question: q,
          context: context(),
          ...(memory.current ? { memory: memory.current } : {}),
          ...(m.query.get("focus") ? { focus: m.query.get("focus")! } : {}),
          external: !!status?.consented,
        };
    if (!request) return;
    pending.current = request;
    setSending(true);
    setRequestError("");
    const active = epoch.current;
    try {
      const answer = await serverRequest<AskAnswer>(
        api + "/turn",
        "POST",
        request,
      );
      if (active !== epoch.current) return;
      if (
        answer.companyId !== company.id ||
        answer.proof !== status!.proof ||
        answer.authorization.fingerprint !== status!.authorization.fingerprint
      ) {
        clear();
        setNotice("Reporting context changed. Start a new question.");
        setRefresh((v) => v + 1);
        return;
      }
      memory.current = answer.memory || undefined;
      const next = [...messages, { question: request.question, answer }];
      setMessages(next);
      writeAskMemory(cacheKey.current, {
        proof: answer.proof,
        consent: consentVersion.current || "",
        memory: answer.memory || undefined,
        messages: next,
        expires: Date.now() + 1800000,
      });
      setQuestion("");
      pending.current = null;
    } catch (e) {
      if (active !== epoch.current) return;
      const msg = (e as Error).message;
      if (e instanceof ApiError && [401, 403, 409].includes(e.status)) {
        clear();
        setQuestion(request.question);
        setNotice(msg);
        setRefresh((v) => v + 1);
      } else setRequestError(msg);
    } finally {
      if (active === epoch.current) setSending(false);
    }
  }
  const citations = (ids: string[], answer: AskAnswer) => (
    <span className="intel-inline-links">
      {ids.map((id) => {
        const f = answer.facts.find((f) => f.id === id);
        return f ? (
          <Link key={id} to={m.link(f.evidenceHref || f.href, m.origin)}>
            [{id}]
          </Link>
        ) : null;
      })}
    </span>
  );
  return (
    <GovernedModule
      title="Ask Aynor"
      description="Executive questions, grounded in your authorized business evidence."
      module={m}
      back={m.back || undefined}
      actions={
        <Button
          variant="secondary"
          onClick={() => {
            clear();
            setNotice("");
          }}
        >
          New conversation
        </Button>
      }
    >
      {loadError && !m.error && (
        <>
          <ErrorBox>{loadError}</ErrorBox>
          <Button variant="secondary" onClick={() => setRefresh((v) => v + 1)}>
            Retry assistant
          </Button>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {!ready && !loadError && (
        <p role="status">Verifying assistant access and reporting context…</p>
      )}
      {ready && (
        <>
          <Panel title="External AI">
            <Status>
              {status.consented && status.provider.configured
                ? "Consented · free-only"
                : "Built-in answers available"}
            </Status>
            <p>
              {status.consented
                ? "Your consent applies to the approved categories until you revoke it or their approval changes."
                : "External AI needs both company authorization and your consent. Built-in answers do not send your question to a provider."}
            </p>
            {status.categories.length > 0 && (
              <p>
                Categories:{" "}
                {status.categories.map((c) => categoryLabels[c]).join(" · ")}
              </p>
            )}
            {!status.memoryAvailable && (
              <p>
                Secure conversation state is not configured; built-in answers
                remain available.
              </p>
            )}
            {!status.provider.configured && (
              <p>Live AI is unavailable: {status.provider.reason}</p>
            )}
            <ErrorBox>{!dialog ? consentError : ""}</ErrorBox>
            <div className="intel-footer-actions">
              {status.authorization.canManageSources && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCategories(status.companyPolicy.categories);
                    setPolicyEnabled(status.companyPolicy.enabled);
                    setConsentError("");
                    setDialog("policy");
                  }}
                >
                  Authorize data categories
                </Button>
              )}
              {status.consented ? (
                <Button
                  variant="text"
                  busy={consentBusy}
                  onClick={() => changeConsent(false)}
                >
                  Revoke external AI consent
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={
                    !status.categories.length ||
                    !status.provider.configured ||
                    !status.memoryAvailable
                  }
                  onClick={() => {
                    setConsentError("");
                    setDialog("consent");
                  }}
                >
                  Allow external AI
                </Button>
              )}
            </div>
          </Panel>
          <section
            className="intel-conversation"
            aria-label="Executive conversation"
          >
            {!messages.length && !sending && (
              <div className="intel-question-list">
                {[
                  "Summarize the performance and concerns in my reporting scope.",
                  "How are our goals progressing, and what should I investigate?",
                  "Which confirmed dependencies need attention?",
                ].map((q) => (
                  <button key={q} onClick={() => setQuestion(q)}>
                    <Sparkles size={15} />
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message, i) => (
              <article className="intel-answer" key={i}>
                <h2>{message.question}</h2>
                <Status>
                  {message.answer.mode === "ai"
                    ? "AI interpretation · governed facts"
                    : "Validated-data fallback"}
                </Status>
                {message.answer.reason && (
                  <p>
                    {fallbackReasons[message.answer.reason] ||
                      "Built-in evidence was used."}
                  </p>
                )}
                {message.answer.clarification && (
                  <p>{message.answer.clarification}</p>
                )}
                {!!message.answer.facts.length && (
                  <Panel title="Validated facts and defined targets">
                    {message.answer.facts.map((f) => (
                      <div key={f.id}>
                        <h3>
                          [{f.id}] {f.label}
                        </h3>
                        <p>{f.statement}</p>
                        <p>
                          {f.department || "Authorized company scope"} ·{" "}
                          {f.period} · {f.state}
                        </p>
                        <Link to={m.link(f.evidenceHref || f.href, m.origin)}>
                          Investigate {f.label}
                        </Link>
                      </div>
                    ))}
                  </Panel>
                )}
                {!!message.answer.interpretations.length && (
                  <Panel title="AI interpretation">
                    {message.answer.interpretations.map((p, j) => (
                      <div key={j}>
                        <p>{p.text}</p>
                        {citations(p.citations, message.answer)}
                      </div>
                    ))}
                  </Panel>
                )}
                {!!message.answer.steps.length && (
                  <Panel title="Suggested investigations">
                    {message.answer.steps.map((s, j) => (
                      <div key={j}>
                        <p>{s.text}</p>
                        {citations(s.citations, message.answer)}
                      </div>
                    ))}
                    <p>No business action is executed.</p>
                  </Panel>
                )}
              </article>
            ))}
            {sending && (
              <p role="status">
                Retrieving authorized facts and preparing a grounded answer…
              </p>
            )}
            <ErrorBox>{requestError}</ErrorBox>
            {requestError && (
              <Button variant="secondary" onClick={() => submit(true)}>
                Retry question
              </Button>
            )}
            {messages.length >= status.limits.maxTurns ? (
              <Blank
                title="Start a fresh conversation"
                text="This conversation has reached its safe context limit. A new conversation uses current evidence."
                action={
                  <Button onClick={() => clear()}>New conversation</Button>
                }
              />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <label className="field">
                  <span>Your question</span>
                  <textarea
                    aria-label="Your question"
                    style={{ width: "100%" }}
                    rows={3}
                    maxLength={2000}
                    value={question}
                    disabled={sending}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about performance, goals, dependencies or the supporting evidence…"
                  />
                </label>
                <div className="intel-footer-actions">
                  <Button
                    type="submit"
                    busy={sending}
                    disabled={!question.trim()}
                  >
                    <Send size={14} />
                    Ask Aynor
                  </Button>
                </div>
              </form>
            )}
            <p className="intel-muted">
              Conversations stay in this browser’s memory for this session.
              Source and permission changes reset earlier answers. Do not enter
              passwords or credentials.
            </p>
          </section>
        </>
      )}
      {dialog === "policy" && (
        <Modal
          title="Authorize external business summaries"
          onClose={() => {
            if (!consentBusy) setDialog(null);
          }}
        >
          <ErrorBox>{consentError}</ErrorBox>
          <p>
            Owner/Admin approval permits external processing only for authorized
            summaries in these categories. Finance includes amounts. Raw
            spreadsheet rows, payroll-marked sources and unrestricted notes are
            excluded.
          </p>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={policyEnabled}
                onChange={(e) => setPolicyEnabled(e.target.checked)}
                disabled={consentBusy}
              />
              Enable approved external processing
            </span>
          </label>
          {Object.entries(categoryLabels).map(([id, label]) => (
            <label className="auto-ai-consent" key={id}>
              <span>
                <input
                  type="checkbox"
                  checked={categories.includes(id)}
                  disabled={consentBusy}
                  onChange={(e) =>
                    setCategories((cs) =>
                      e.target.checked
                        ? [...cs, id]
                        : cs.filter((c) => c !== id),
                    )
                  }
                />
                {label}
              </span>
            </label>
          ))}
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={consentBusy}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              busy={consentBusy}
              disabled={policyEnabled && !categories.length}
              onClick={savePolicy}
            >
              Save category authorization
            </Button>
          </div>
        </Modal>
      )}
      {dialog === "consent" && (
        <Modal
          title="Allow external AI explanations?"
          onClose={() => {
            if (!consentBusy) setDialog(null);
          }}
        >
          <ErrorBox>{consentError}</ErrorBox>
          <p>
            Your question and a small selection of authorized summaries from{" "}
            {status?.categories.map((c) => categoryLabels[c]).join(", ")} will
            be processed by OpenRouter and {status?.provider.provider}.
          </p>
          <p>
            Known names are replaced with aliases. Raw spreadsheet rows,
            credentials, payroll-marked sources, owner notes and full
            conversation history are not sent. A few recent redacted questions
            and fact references support follow-ups. Do not include private
            information that is unnecessary for your question.
          </p>
          <p>
            {status?.provider.privacyMode === "zdr"
              ? "The configured route requires zero-data-retention eligibility."
              : "This route uses an operator-reviewed retention policy; zero retention is not promised."}{" "}
            {status?.provider.policyUrl && (
              <a
                href={status.provider.policyUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Provider privacy policy
              </a>
            )}
          </p>
          <p>
            This approval is remembered for these permitted categories. You can
            revoke it at any time; data already sent cannot be recalled.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={consentBusy}
              onClick={() => setDialog(null)}
            >
              Use built-in answers
            </Button>
            <Button busy={consentBusy} onClick={() => changeConsent(true)}>
              I agree to external processing
            </Button>
          </div>
        </Modal>
      )}
    </GovernedModule>
  );
}
