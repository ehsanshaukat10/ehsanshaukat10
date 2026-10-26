import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, Plus, Send, Sparkles } from "lucide-react";
import { Button, ErrorBox, Field } from "../../components/ui";
import { totals } from "../dashboard/model";
import {
  Blank,
  Evidence,
  Loading,
  ModulePage,
  Panel,
  useExecutive,
  useLocalState,
  type Conversation,
  type Message,
  type ModuleProps,
  type Executive,
} from "./shared";
function answerQuestion(question: string, context: string, e: Executive) {
  const specific =
    /expense|cost|profit|revenue|cash|payment|invoice|receivable|goal|target|objective|project|delivery|depend|resource|capacity|client|concentrat|attention|today|issue|recommend|risk|alternative|action/i.test(
      question,
    );
  const text = (specific ? question : question + " " + context).toLowerCase(),
    s = e.sample,
    links: { label: string; path: string }[] = [],
    evidence: string[] = [];
  let answer = "";
  if (!s) {
    answer =
      "There are no validated performance records for this workspace. Configure a source, confirm its field mapping, then investigate a supported metric. Your configured departments and goals are retained.";
    links.push({
      label: "Review data connections",
      path: e.base + "/settings/connections",
    });
    evidence.push(
      `${e.company.data.departments.length} configured departments; ${e.company.data.goals.length} configured goals. These are setup records, not measured performance.`,
    );
  } else if (
    /expense|cost|profit|revenue|cash|payment|invoice|receivable/.test(text) &&
    s.covered.some((d) => /finance|sales/i.test(d))
  ) {
    const dept =
      e.company.data.departments.find((d) => /finance/i.test(d)) ||
      e.company.data.departments.find((d) => /sales/i.test(d))!;
    const t = totals(s),
      selectedIndex = s.points.findIndex((point) =>
        new RegExp("(?:^|\\W)" + point.label + "(?:\\W|$)", "i").test(context),
      ),
      last = selectedIndex >= 0 ? s.points[selectedIndex] : s.points.at(-1)!,
      previous =
        selectedIndex > 0
          ? s.points[selectedIndex - 1]
          : selectedIndex === 0
            ? null
            : s.points.at(-2)!;
    if (!s.covered.some((d) => /finance/i.test(d))) {
      const t = totals(s);
      answer = `Available sales records show revenue of ${e.money(t.revenue)}. Expense, profit and receivables breakdowns are not available in the covered department scope.`;
      evidence.push(
        "No financial breakdown has been inferred for uncovered departments.",
      );
      links.push({
        label: "Open sales revenue",
        path:
          e.base +
          "/departments/" +
          encodeURIComponent(dept) +
          "/metrics/revenue",
      });
    } else if (/invoice|receivable|payment/.test(text)) {
      answer = `The illustrative records contain three overdue invoices totaling ${e.money(32400)}. Confirm an owner and next contact date before treating a collection as committed.`;
      evidence.push(
        `${e.money(14400)} + ${e.money(10000)} + ${e.money(8000)} = ${e.money(32400)}. All three are over 30 days overdue.`,
      );
      links.push({
        label: s.risks.some((r) => r.type === "receivables")
          ? "Review collection recommendation"
          : "Open overdue receivables",
        path: s.risks.some((r) => r.type === "receivables")
          ? e.base + "/actions/receivables"
          : e.base +
            "/departments/" +
            encodeURIComponent(dept) +
            "/metrics/receivables",
      });
    } else {
      answer = `Revenue is ${e.money(t.revenue)} and operating expenses are ${e.money(t.costs)} for the selected period. Operating margin is ${t.margin.toFixed(1)}%. ${last.label} costs are ${e.money(last.costs)}. ${previous ? `That is ${((last.costs / previous.costs - 1) * 100).toFixed(1)}% versus ${previous.label}.` : "No earlier interval is available within this reporting range."} These records do not establish a root cause on their own.`;
      evidence.push(
        `Revenue − costs = ${e.money(t.revenue - t.costs)}. Margin = (revenue − costs) / revenue × 100.`,
        `${last.label} costs: ${e.money(last.costs)}.${previous ? " Preceding costs: " + e.money(previous.costs) + "." : ""}`,
      );
      links.push({
        label: "Open expense metric",
        path:
          e.base +
          "/departments/" +
          encodeURIComponent(dept) +
          "/metrics/costs" +
          (selectedIndex >= 0 ? "?point=" + encodeURIComponent(last.date) : ""),
      });
    }
  } else if (
    /expense|cost|profit|revenue|cash|payment|invoice|receivable/.test(text)
  ) {
    answer =
      "The required financial fields are not available in the covered department scope. Reconnect or remap an authorized source before interpreting a change.";
    links.push({
      label: "Review data coverage",
      path: e.base + "/settings/connections",
    });
  } else if (/goal|target|objective/.test(text)) {
    answer = e.company.data.goals.length
      ? `${e.company.data.goals.length} goals are configured. Open a goal to compare its supported actual value with its target and deadline. Missing actual values cannot establish whether a goal is behind schedule.`
      : "No goals are configured. Create a measurable objective before assessing progress.";
    evidence.push(
      ...e.company.data.goals
        .slice(0, 3)
        .map(
          (g) =>
            `${g.name}: target ${g.target}; due ${g.deadline}; measure ${g.kpi}.`,
        ),
    );
    links.push({ label: "Review goals", path: e.base + "/goals" });
  } else if (
    /project|delivery|depend|resource|capacity|client|concentrat/.test(text)
  ) {
    const focused = s.projects.filter((p) =>
      [p.name, p.owner, p.client].some((name) =>
        text.includes(name.toLowerCase()),
      ),
    );
    const projects = focused.length ? focused : s.projects;
    const conflict = s.risks.find(
      (r) =>
        r.type === "resource" &&
        projects.some((p) => r.evidence.some((line) => line.includes(p.owner))),
    );
    answer = projects.length
      ? `${projects.length} projects have relevant delivery records; ${projects.filter((p) => p.status !== "On track").length} are flagged for attention. ${conflict ? "The recorded shared-specialist demand is 46 hours against 40 available. Confirm ownership and sequence commitments before changing a promise." : "No resource conflict is established for these selected records."}`
      : "No project relationships are available in your department scope.";
    evidence.push(
      ...projects
        .slice(0, 3)
        .map((p) => `${p.name}: ${p.status}, due ${p.due}. ${p.evidence}`),
    );
    links.push({
      label: "Investigate dependencies",
      path: e.base + "/dependencies",
    });
  } else if (
    /attention|today|issue|recommend|risk|alternative|action/.test(text)
  ) {
    answer = s.risks.length
      ? `${s.risks.length} issues are supported by the available illustrative records. Prioritize the high-severity items, confirm an accountable owner, and record a deliberate next step. No external operations have been executed.`
      : "No critical issues are flagged in the available records. Missing or unmapped data is excluded from this assessment.";
    evidence.push(...s.risks.map((r) => `${r.title}. ${r.impact}`));
    links.push({ label: "Review decisions", path: e.base + "/actions" });
  } else {
    answer =
      "Which business question would you like to investigate? I can use available records for business performance, delivery dependencies, goals and supported recommendations. Other fields are not available in this preview.";
    links.push({ label: "Explore departments", path: e.base + "/departments" });
  }
  if (s)
    evidence.push(
      `Source: ${s.source}; as of ${s.asOf.toISOString().slice(0, 10)}. Coverage: ${s.covered.join(", ")}.`,
    );
  return { answer, evidence, links };
}
export function Ask({ company }: ModuleProps) {
  const e = useExecutive(company),
    local = useLocalState(company),
    location = useLocation(),
    nav = useNavigate(),
    id = location.pathname.split("/")[4],
    access = company.role + ":" + [...company.scope].sort().join("|");
  const threads = local.state.conversations.filter((t) => t.access === access),
    thread = threads.find((t) => t.id === id);
  const [input, setInput] = useState(
      () =>
        e.query.get("question") ||
        sessionStorage.getItem("aynor.ask.pending") ||
        "",
    ),
    [stage, setStage] = useState(""),
    [stream, setStream] = useState(""),
    [requestError, setRequestError] = useState(""),
    [lastQuestion, setLastQuestion] = useState(""),
    [pending, setPending] = useState<Conversation | null>(null);
  const alive = useRef(true),
    failed = useRef(false);
  useEffect(() => {
    alive.current = true;
    sessionStorage.removeItem("aynor.ask.pending");
    return () => {
      alive.current = false;
    };
  }, []);
  const context = e.query.get("context") || thread?.context || "",
    origin = e.back || thread?.origin,
    period = thread?.period || e.period;
  const suggestions = e.sample
    ? [
        "What needs my attention today?",
        ...(e.company.data.departments.some((d) => /finance|sales/i.test(d))
          ? ["Why did expenses change?"]
          : []),
        ...(e.sample.projects.length ? ["Which projects are at risk?"] : []),
        "How are goals progressing?",
      ]
    : [
        "What data do I need to get started?",
        "Which departments have missing data?",
        "How can I set a measurable goal?",
      ];
  async function submit(question: string) {
    if (stage || !question.trim()) return;
    setLastQuestion(question);
    setInput("");
    setRequestError("");
    setStream("");
    setStage("Thinking");
    await new Promise((r) => setTimeout(r, 220));
    if (!alive.current) return;
    setStage("Retrieving company information");
    await new Promise((r) => setTimeout(r, 220));
    if (!alive.current) return;
    const responseMode = e.query.get("response");
    if (responseMode === "error" && !failed.current) {
      failed.current = true;
      setStage("");
      setRequestError(
        "Couldn't prepare a response. Your question is retained; try again.",
      );
      return;
    }
    const result =
      responseMode === "unavailable"
        ? {
            answer:
              "The supporting source is unavailable. Reconnect or refresh it before relying on an explanation.",
            evidence: [] as string[],
            links: [
              {
                label: "Recover data source",
                path: e.base + "/settings/connections",
              },
            ],
          }
        : responseMode === "ambiguous"
          ? {
              answer:
                "Do you mean revenue, delivery commitments, or a particular goal? Choose a specific entity to narrow the question.",
              evidence: [] as string[],
              links: [] as { label: string; path: string }[],
            }
          : answerQuestion(question, context, e);
    setStage("Preparing response");
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const chunks = result.answer.match(/.{1,70}(?:\s|$)/g) || [result.answer];
      let text = "";
      for (const chunk of chunks) {
        if (!alive.current) return;
        text += chunk;
        setStream(text);
        await new Promise((r) => setTimeout(r, 70));
      }
    }
    if (!alive.current) return;
    const message: Message = {
      id: crypto.randomUUID(),
      question,
      answer: result.answer,
      evidence: result.evidence,
      links: result.links,
      status: "complete",
      date: new Date().toISOString(),
    };
    const next: Conversation = {
      id: thread?.id || crypto.randomUUID(),
      title: thread?.title || question.slice(0, 70),
      context,
      origin: origin || e.base + "/ask",
      period,
      access,
      messages: [...(thread?.messages || []), message],
    };
    setPending(next);
    if (
      await local.commit(
        {
          ...local.state,
          conversations: [
            next,
            ...local.state.conversations.filter((t) => t.id !== next.id),
          ],
        },
        "Conversation saved in this browser.",
      )
    ) {
      setPending(null);
      nav(
        e.link(
          e.base +
            "/ask/" +
            next.id +
            (context ? "?context=" + encodeURIComponent(context) : ""),
          origin,
        ),
        { replace: !!thread },
      );
    }
    setStage("");
    setStream("");
  }
  if (id && !thread && !pending)
    return (
      <ModulePage
        title="Conversation unavailable"
        exec={e}
        back={e.back || e.link(e.base + "/ask")}
      >
        <Blank
          title="This conversation is not available"
          text="It may belong to a different company or access scope."
          action={
            <Link to={e.link(e.base + "/ask")}>Start a new question</Link>
          }
        />
      </ModulePage>
    );
  return (
    <ModulePage
      title="Ask Aynor"
      description={context || "A focused question. A traceable answer."}
      exec={e}
      back={origin || undefined}
      actions={
        thread && (
          <Link className="button secondary" to={e.link(e.base + "/ask")}>
            <Plus size={14} />
            New question
          </Link>
        )
      }
    >
      <div className="intel-assistant-layout">
        {threads.length > 0 && (
          <aside className="intel-conversation-history">
            <h3>Recent conversations</h3>
            {threads.slice(0, 12).map((t) => (
              <Link
                className={thread?.id === t.id ? "active" : ""}
                key={t.id}
                to={e.link(
                  e.base + "/ask/" + t.id + "?period=" + t.period,
                  t.origin,
                )}
              >
                {t.title}
              </Link>
            ))}
          </aside>
        )}
        <section className="intel-conversation">
          <p className="intel-muted">
            Local assistant preview · responses use available workspace
            evidence, not an external AI service.
          </p>
          {!thread && !stage && (
            <div className="intel-question-list">
              {suggestions.map((q) => (
                <button key={q} onClick={() => submit(q)}>
                  <Sparkles size={15} />
                  {q}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          )}
          {(thread || (local.error ? pending : null))?.messages.map((m) => (
            <article className="intel-answer" key={m.id}>
              <h2>{m.question}</h2>
              <p>{m.answer}</p>
              {m.evidence.length > 0 && (
                <details>
                  <summary>Supporting evidence & calculations</summary>
                  {m.evidence.map((v, i) => (
                    <p key={i}>{v}</p>
                  ))}
                  <p className="intel-muted">
                    Answer recorded {new Date(m.date).toLocaleString()} ·
                    reporting context retained with this conversation.
                  </p>
                </details>
              )}
              <div className="intel-inline-links">
                {m.links.map((l) => (
                  <Link
                    key={l.path}
                    to={e.link(l.path, location.pathname + location.search)}
                  >
                    {l.label}
                    <ArrowUpRight size={12} />
                  </Link>
                ))}
              </div>
            </article>
          ))}
          {stage && (
            <div role="status">
              <h3>{lastQuestion}</h3>
              <LoadingAssistant stage={stage} />
              {stream && <p>{stream}</p>}
            </div>
          )}
          {requestError && <h3>{lastQuestion}</h3>}
          <ErrorBox>
            {requestError || (local.error !== e.error ? local.error : "")}
          </ErrorBox>
          {requestError && (
            <Button variant="secondary" onClick={() => submit(lastQuestion)}>
              Retry question
            </Button>
          )}
          {local.error && pending && (
            <Button
              variant="secondary"
              busy={local.busy}
              onClick={async () => {
                if (
                  await local.commit(
                    {
                      ...local.state,
                      conversations: [
                        pending,
                        ...local.state.conversations.filter(
                          (t) => t.id !== pending.id,
                        ),
                      ],
                    },
                    "Conversation saved.",
                  )
                ) {
                  nav(e.link(e.base + "/ask/" + pending.id, origin));
                  setPending(null);
                }
              }}
            >
              Retry saving conversation
            </Button>
          )}
          <form
            className="intel-assistant-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
          >
            <Field
              label="Your question"
              placeholder="Ask about a metric, risk or business decision"
              value={input}
              onChange={(v) => setInput(v.target.value)}
              disabled={!!stage}
              required
            />
            <Button
              busy={!!stage || local.busy}
              disabled={!input.trim() || !!stage}
            >
              <Send size={14} />
              Ask
            </Button>
          </form>
          {thread && (
            <div className="intel-follow-ups">
              {suggestions.slice(0, 2).map((q) => (
                <button key={q} disabled={!!stage} onClick={() => submit(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </ModulePage>
  );
}
function LoadingAssistant({ stage }: { stage: string }) {
  return (
    <div className="intel-loading">
      <span className="loading-line" />
      {stage}…
    </div>
  );
}
