import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  askTurnInput,
  askPolicyInput,
  askPolicyStored,
  askAnswerSchema,
} from "./ask-contracts.mjs";
import { buildAskFacts, externalFact, redactQuestion } from "./ask-facts.mjs";
import {
  resolvePlan,
  fallbackAnswer,
  localSelection,
  unavailableRelativePeriod,
} from "./ask-answer.mjs";
import { createAskProvider } from "./ask-provider.mjs";
import { createAskState } from "./ask-state.mjs";
import { digest } from "./intelligence-policy.mjs";
import { limit } from "./ai-usage.mjs";
import { fail } from "./database.mjs";
export function createAskService({
  intelligence,
  db,
  env = process.env,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  const provider = createAskProvider({ env, db, fetchImpl }),
    crypto = createAskState(env);
  const bundle = (company, actor, context = {}) =>
    intelligence.withAuthorizedState(company, actor, context, (state) =>
      buildAskFacts(state, now),
    );
  const runtime = (company, actor, session, op, payload = {}) =>
    db.rpc("ask_runtime", {
      p_actor: actor,
      p_company: company,
      p_session: session.token,
      p_operation: op,
      p_payload: payload,
    });
  function policyFor(b) {
    const stored = askPolicyStored.safeParse(b.companyData.askPolicy);
    return stored.success
      ? stored.data
      : { enabled: false, categories: [], revision: "none" };
  }
  function effective(b) {
    const p = policyFor(b),
      route = provider.describe();
    const available = [
      ...new Set(
        [...b.policy.scopes.values()]
          .filter((e) => !e.protection.sensitivities.includes("payroll"))
          .map((e) => e.protection.category),
      ),
    ];
    const categories = p.enabled
      ? p.categories.filter((c) => available.includes(c)).sort()
      : [];
    return {
      policy: p,
      categories,
      route,
      approval: digest([p.revision, p.enabled, categories, route.policyHash]),
    };
  }
  async function consentStatus(company, actor, session, b) {
    const e = effective(b),
      record = await runtime(company, actor, session, "status");
    return {
      ...e,
      record,
      granted: !!(record?.granted && record.approval === e.approval),
    };
  }
  function limits() {
    return {
      user: limit(env.AYNOR_ASK_USER_DAILY_LIMIT, 5, 100),
      company: limit(env.AYNOR_ASK_COMPANY_DAILY_LIMIT, 20, 500),
      applicationCalls: limit(env.AYNOR_AI_APPLICATION_DAILY_LIMIT, 40, 100),
      maxCallsPerTurn: 2,
      maxTurns: 10,
    };
  }
  async function questionQuota(company, actor) {
    const day = new Date(now()).toISOString().slice(0, 10),
      caps = limits();
    for (const [scope, max] of [
      [`ask:user:${actor}:${day}`, caps.user],
      [`ask:company:${company}:${day}`, caps.company],
    ])
      if (
        !max ||
        !(await db.rpc("rate_limit", {
          p_key: digest(scope),
          p_max: max,
          p_window: 86400000,
        }))
      )
        return false;
    return true;
  }
  function binding(company, actor, session, purpose) {
    return JSON.stringify(["ask-v1", purpose, company, actor, session.token]);
  }
  function memoryFor(token, b, company, actor, session, consent) {
    if (!token) return { turns: 0, selected: [], questions: [] };
    let m;
    try {
      m = crypto.open(token, binding(company, actor, session, "memory"));
    } catch {
      fail(
        409,
        "Conversation context expired or changed. Start a new conversation.",
      );
    }
    if (
      m.proof !== b.proof ||
      m.approval !== consent.approval ||
      m.consentVersion !== (consent.record?.version || "none") ||
      m.expires <= now() ||
      m.turns >= 10
    )
      fail(
        409,
        "Data, access or conversation context changed. Start a new conversation with current evidence.",
      );
    return m;
  }
  return {
    async status(company, actor, session, context = {}) {
      const b = await bundle(company, actor, context),
        s = await consentStatus(company, actor, session, b);
      return {
        companyId: company,
        companyVersion: b.companyVersion,
        proof: b.proof,
        authorization: b.report.authorization,
        datasetRevision: b.report.datasetRevision,
        context: b.report.context,
        companyPolicy: {
          enabled: s.policy.enabled,
          categories: b.policy.admin ? s.policy.categories : s.categories,
        },
        approval: s.approval,
        consented: s.granted,
        consentVersion: s.record?.version || null,
        provider: s.route,
        memoryAvailable: crypto.configured,
        limits: limits(),
        categories: s.categories,
        catalogue: b.facts.slice(0, 80).map((f) => ({
          id: f.id,
          kind: f.kind,
          label: f.label,
          state: f.state,
          period: f.period,
        })),
        truncated: b.facts.length > 80,
      };
    },
    async policy(company, actor, session, body) {
      const r = askPolicyInput.safeParse(body);
      if (!r.success) fail(400, "Review the business data categories.");
      const b = await bundle(company, actor);
      if (!b.policy.admin)
        fail(
          403,
          "An Owner or Admin authorizes external business-data processing.",
        );
      if (r.data.companyVersion !== b.companyVersion)
        fail(409, "Company configuration changed. Refresh before saving.");
      const categories = [...new Set(r.data.categories)].sort(),
        old = policyFor(b);
      if (
        old.enabled !== r.data.enabled ||
        JSON.stringify([...old.categories].sort()) !==
          JSON.stringify(categories)
      ) {
        const policy = {
          enabled: r.data.enabled,
          categories,
          revision: randomUUID(),
          approvedBy: actor,
          approvedAt: now(),
        };
        await db.rpc("company_update", {
          p_actor: actor,
          p_company: company,
          p_version: b.companyVersion,
          p_payload: { ...b.companyData, askPolicy: policy },
          p_profile: false,
        });
      }
      return this.status(company, actor, session);
    },
    async consent(company, actor, session, body) {
      const parsed = z
        .object({ approval: z.string().length(64), granted: z.boolean() })
        .strict()
        .safeParse(body);
      if (!parsed.success) fail(400, "Review external-processing consent.");
      const b = await bundle(company, actor),
        e = effective(b);
      if (
        parsed.data.granted &&
        (parsed.data.approval !== e.approval || !e.categories.length)
      )
        fail(
          409,
          "Permitted data categories changed. Review the consent details.",
        );
      await runtime(company, actor, session, "consent", {
        approval: e.approval,
        granted: parsed.data.granted,
      });
      return this.status(company, actor, session);
    },
    async turn(company, actor, session, body) {
      const parsed = askTurnInput.safeParse(body);
      if (!parsed.success)
        fail(
          400,
          "Ask a question of at most 2,000 characters in a supported reporting context.",
        );
      const input = parsed.data;
      const b = await bundle(company, actor, input.context),
        consent = await consentStatus(company, actor, session, b),
        memory = memoryFor(input.memory, b, company, actor, session, consent);
      const allowed = b.facts.filter(
        (f) =>
          f.externalEligible &&
          f.categories.every((c) => consent.categories.includes(c)),
      );
      const external =
        input.external &&
        consent.granted &&
        consent.categories.length > 0 &&
        consent.route.configured &&
        crypto.configured &&
        allowed.length > 0;
      const requestHash = digest(input),
        claim = {
          id: input.requestId,
          bodyHash: requestHash,
          proof: digest([
            b.proof,
            consent.approval,
            consent.record?.version || "none",
            consent.route.configured,
          ]),
          approval: consent.approval,
          consentVersion: consent.record?.version || "",
          external,
          membership: b.membership,
        };
      let claimed = false;
      if (crypto.configured) {
        const result = await runtime(company, actor, session, "claim", claim);
        if (result.status === "done") {
          let cached;
          try {
            cached = crypto.open(
              result.response,
              binding(company, actor, session, "answer"),
            );
          } catch {
            fail(409, "Saved answer expired. Start a new request.");
          }
          return cached;
        }
        if (result.status !== "claimed")
          fail(409, "An answer is already being prepared. Retry shortly.");
        claimed = true;
      }
      let answer,
        mode = "fallback",
        reason = !input.external
          ? "external_off"
          : !consent.granted
            ? "consent_required"
            : !consent.categories.length
              ? "company_policy_off"
              : !crypto.configured
                ? "secure_state_unavailable"
                : !consent.route.configured
                  ? "provider_unavailable"
                  : !allowed.length
                    ? "no_eligible_facts"
                    : null,
        calls = 0,
        inferenceCalls = 0;
      const usage = [];
      const started = now();
      try {
        const pastedRecord =
          /\t|^\s*[\[{]|^\s*\|.*\||\n[^\n]*(?:,[^,\n]*){3}/m.test(
            input.question,
          );
        if (pastedRecord) {
          answer = resolvePlan(
            { facts: [], reasoning: [], clarification: "metric" },
            b,
            b.facts,
          );
          answer.clarification =
            "Ask a concise business question rather than pasting source records. You can investigate authorized records inside Aynor.";
          reason = "pasted_records_blocked";
        } else if (unavailableRelativePeriod(input.question, b)) {
          answer = resolvePlan(
            { facts: [], reasoning: [], clarification: "period" },
            b,
            b.facts,
          );
          reason = "period_clarification";
        } else if (external && (await questionQuota(company, actor))) {
          try {
            let chosen = localSelection(
              input.question,
              b,
              memory.selected,
              input.focus,
            ).filter((f) => allowed.some((a) => a.id === f.id));
            // A financial explanation needs the already-governed operands, not a new calculation.
            const financialScopes = new Set(
              chosen
                .filter(
                  (f) =>
                    f.kind === "metric" &&
                    /^finance\.(revenue|expenses|profit|margin)$/.test(
                      f.metricId,
                    ),
                )
                .flatMap((f) => f.scopes),
            );
            chosen = [
              ...new Map(
                [
                  ...chosen,
                  ...allowed.filter(
                    (f) =>
                      f.kind === "metric" &&
                      financialScopes.has(f.scopes[0]) &&
                      /^finance\.(revenue|expenses|profit|margin)$/.test(
                        f.metricId,
                      ),
                  ),
                ].map((f) => [f.id, f]),
              ).values(),
            ].slice(0, 20);
            if (!chosen.length && allowed.length <= 20) chosen = allowed;
            const question = redactQuestion(input.question, b),
              previous = memory.selected
                .map((id) => allowed.find((f) => f.id === id)?.ref)
                .filter(Boolean),
              history = memory.questions.slice(-3);
            const catalogueMode = !chosen.length;
            const catalogue = allowed.slice(0, 60).map((f) => {
              const x = externalFact(f, b);
              return {
                id: x.id,
                kind: x.kind,
                measure: x.measure,
                metricId: x.metricId,
                department: x.department,
                scopes: x.scopes,
                period: x.period,
                state: x.state,
                from: x.from,
                to: x.to,
                entity: x.entity,
              };
            });
            const initial = chosen.map((f) => externalFact(f, b));
            async function complete(payload) {
              const check = await bundle(company, actor, input.context),
                current = await consentStatus(company, actor, session, check);
              if (
                check.proof !== b.proof ||
                !current.granted ||
                current.approval !== consent.approval ||
                current.record.version !== consent.record.version
              )
                fail(
                  409,
                  "Access, evidence or consent changed while preparing this answer.",
                );
              if (now() - started > 14000) throw Error("turn_timeout");
              calls++;
              const response = await provider.complete(payload, {
                onInference: () => {
                  inferenceCalls++;
                },
              });
              usage.push(response.usage);
              return response.answer;
            }
            let raw = await complete({
              mode: catalogueMode ? "catalogue" : "answer",
              question,
              previousQuestions: history,
              previousFacts: previous,
              today: b.today,
              context: {
                period: b.report.context.period,
                department:
                  b.departments.find(
                    (d) => d.name === b.report.context.department,
                  )?.alias || "Authorized scopes",
              },
              facts: initial,
              catalogue,
            });
            const plan = askAnswerSchema.safeParse(raw);
            if (!plan.success) throw Error("invalid_answer");
            if (plan.data.select) {
              if (
                !catalogueMode &&
                plan.data.select.every((id) => chosen.some((f) => f.ref === id))
              )
                throw Error("unnecessary_retrieval");
              if (
                plan.data.facts.length ||
                plan.data.reasoning.length ||
                plan.data.clarification !== "none"
              )
                throw Error("invalid_answer");
              const available = new Set(catalogue.map((f) => f.id));
              if (plan.data.select.some((id) => !available.has(id)))
                throw Error("invalid_selection");
              chosen = [...new Set(plan.data.select)].map((id) =>
                allowed.find((f) => f.ref === id),
              );
              raw = await complete({
                mode: "answer",
                question,
                previousQuestions: history,
                previousFacts: previous,
                today: b.today,
                facts: chosen.map((f) => externalFact(f, b)),
              });
            }
            answer = resolvePlan(raw, b, chosen);
            mode = "ai";
            reason = null;
          } catch (e) {
            if (e.status === 409) throw e;
            reason = ["quota", "application_quota"].includes(e.message)
              ? "provider_quota"
              : "provider_or_validation_failure";
          }
        } else if (external) reason = "question_quota";
        if (!answer)
          answer = fallbackAnswer(
            input.question,
            b,
            memory.selected,
            input.focus,
          );
        const fresh = await bundle(company, actor, input.context),
          current = await consentStatus(company, actor, session, fresh);
        if (
          fresh.proof !== b.proof ||
          current.approval !== consent.approval ||
          (external &&
            (!current.granted ||
              current.record.version !== consent.record?.version))
        )
          fail(
            409,
            "Evidence, reporting access or consent changed. Refresh and start a new conversation.",
          );
        const result = {
          ...answer,
          companyId: company,
          proof: b.proof,
          datasetRevision: b.report.datasetRevision,
          authorization: b.report.authorization,
          context: b.report.context,
          mode,
          reason,
          usage: {
            calls: inferenceCalls,
            planningAttempts: calls,
            attempted: inferenceCalls > 0,
            ...(usage.length ? { tokens: usage } : {}),
          },
          memory: crypto.configured
            ? crypto.seal(
                {
                  proof: b.proof,
                  approval: consent.approval,
                  consentVersion: consent.record?.version || "none",
                  turns: memory.turns + 1,
                  selected: answer.selected,
                  questions: [
                    ...memory.questions.slice(-2),
                    pastedRecord
                      ? "[pasted records withheld]"
                      : redactQuestion(input.question, b),
                  ],
                  expires: Math.min(session.expires, now() + 1800000),
                },
                binding(company, actor, session, "memory"),
              )
            : null,
          limits: limits(),
        };
        if (claimed)
          await runtime(company, actor, session, "finish", {
            ...claim,
            fence: b.fence,
            actionVersions: b.actionVersions,
            response: crypto.seal(
              result,
              binding(company, actor, session, "answer"),
            ),
          });
        return result;
      } catch (e) {
        if (claimed)
          await runtime(company, actor, session, "release", {
            id: input.requestId,
          }).catch(() => {});
        throw e;
      }
    },
  };
}
