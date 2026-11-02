import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePlan,
  unavailableRelativePeriod,
} from "../aynor-onboarding-frontend/source/server/ask-answer.mjs";
import {
  redactQuestion,
  externalFact,
} from "../aynor-onboarding-frontend/source/server/ask-facts.mjs";
import { createAskState } from "../aynor-onboarding-frontend/source/server/ask-state.mjs";
import { createAskProvider } from "../aynor-onboarding-frontend/source/server/ask-provider.mjs";
import { createOpenRouterTransport } from "../aynor-onboarding-frontend/source/server/openrouter-provider.mjs";
const period = {
  kind: "interval",
  start: "2026-10-01",
  endExclusive: "2026-11-01",
};
const facts = [
  {
    id: "a",
    ref: "F1",
    kind: "metric",
    label: "Recognized revenue",
    metricId: "finance.revenue",
    department: "Finance",
    scopes: ["a"],
    period,
    unit: "currency",
    currency: "USD",
    value: 300,
    state: "validated",
    href: "/companies/a/overview",
    definition: "Confirmed revenue",
    next: "Investigate records.",
  },
  {
    id: "b",
    ref: "F2",
    kind: "metric",
    label: "Recognized revenue",
    metricId: "finance.revenue",
    department: "Sales",
    scopes: ["b"],
    period,
    unit: "currency",
    currency: "USD",
    value: 400,
    state: "validated",
    href: "/companies/a/overview",
    definition: "Confirmed revenue",
  },
];
const b = {
  facts,
  departments: [
    { name: "Finance", alias: "Department D1" },
    { name: "IT", alias: "Department D2" },
  ],
  aliases: [{ id: "r", alias: "resource E1", terms: ["Sara", "R1"] }],
  today: "2026-11-02",
};
test("AI-selected comparisons render only validated compatible values with accurate direction and citations", () => {
  const r = resolvePlan(
    {
      facts: ["F1", "F2"],
      reasoning: [{ type: "compare", facts: ["F1", "F2"] }],
    },
    b,
    facts,
  );
  assert.match(r.interpretations[0].text, /Sales has the higher/);
  assert.match(r.facts[0].statement, /300.00/);
  assert.deepEqual(r.interpretations[0].citations, ["F1", "F2"]);
  for (const changed of [
    { currency: "EUR" },
    { unit: "count" },
    { period: { ...period, endExclusive: "2026-12-01" } },
    { metricId: "finance.expenses" },
    { state: "stale" },
    { scopes: ["a"] },
  ])
    assert.throws(() =>
      resolvePlan(
        { reasoning: [{ type: "compare", facts: ["F1", "F2"] }] },
        b,
        [facts[0], { ...facts[1], ...changed }],
      ),
    );
});
test("provider prose, invented facts, URLs, arbitrary operations and uncited operands never become an answer", () => {
  for (const p of [
    { text: "Revenue 99999", facts: ["F1"] },
    { facts: ["F999"] },
    { facts: ["F1"], reasoning: [{ type: "execute", facts: ["F1"] }] },
    { facts: ["F1"], reasoning: [{ type: "compare", facts: ["F1", "F999"] }] },
    { select: ["F1"] },
    { facts: ["F1"], url: "https://evil.test" },
  ])
    assert.throws(() => resolvePlan(p, b, facts));
  assert.throws(
    () => resolvePlan({ facts: ["F2"] }, b, [facts[0]]),
    "An authorized but externally unapproved fact cannot be cited by the model",
  );
});
test("goals, dependencies and coexisting concerns use supported reasoning rather than invented causes or predictions", () => {
  const extra = [
    {
      ...facts[0],
      id: "g",
      ref: "F3",
      kind: "goal",
      label: "Private goal title",
      state: "unassessed",
      value: null,
      target: 0,
      progress: null,
      baseline: null,
      assessment: "Unassessed",
      lifecycle: "Active",
      deadline: "2026-11-15",
      deadlinePassed: false,
    },
    {
      ...facts[0],
      id: "d",
      ref: "F4",
      kind: "dependency",
      label: "Resource dependency",
      value: 2,
      unit: "count",
      currency: null,
      definition: "Two confirmed references",
      entity: "resource E1",
    },
  ];
  const r = resolvePlan(
    {
      facts: ["F3", "F4"],
      reasoning: [
        { type: "goal_progress", facts: ["F3"] },
        { type: "shared_dependency", facts: ["F4"] },
      ],
      clarification: "cause_not_established",
    },
    b,
    extra,
  );
  assert.match(r.facts[0].statement, /actual unassessed/);
  assert.match(r.interpretations[0].text, /cannot be established/);
  assert.match(r.interpretations[1].text, /do not prove/);
  assert.match(r.clarification, /do not establish a cause/);
  assert.throws(() =>
    resolvePlan(
      { reasoning: [{ type: "shared_dependency", facts: ["F1"] }] },
      b,
      facts,
    ),
  );
});
test("redaction uses name boundaries and the external serializer omits internal names, raw definitions and source URLs", () => {
  const text = redactQuestion(
    "IT profit for Sara R1. password=hunter2 https://example.test/private sk-or-v1-abcdefghijkl",
    b,
  );
  assert.match(text, /Department D2 profit for resource E1 resource E1/);
  assert.ok(!text.includes("hunter2"));
  assert.ok(!text.includes("https://"));
  assert.equal(redactQuestion("profit", b), "profit");
  const serialized = JSON.stringify(
    externalFact(
      {
        ...facts[0],
        label: "Recognized revenue",
        definition: "raw secret note",
        ownerLabel: "Private person",
        href: "https://example.test/private",
      },
      b,
    ),
  );
  assert.ok(!serialized.includes("raw secret"));
  assert.ok(!serialized.includes("Private person"));
  assert.ok(!serialized.includes("https://"));
  assert.ok(!serialized.includes("Finance"));
});
test("conversation tokens are encrypted, purpose/session-bound and tamper-resistant", () => {
  const c = createAskState({ SHEETS_ENCRYPTION_KEY: "aa".repeat(32) });
  const token = c.seal(
    { question: "Private question", selected: ["a"] },
    "actor/company/session/memory",
  );
  assert.deepEqual(c.open(token, "actor/company/session/memory").selected, [
    "a",
  ]);
  assert.ok(
    !Buffer.from(token, "base64url").toString().includes("Private question"),
  );
  assert.throws(() => c.open(token, "other-user"));
  assert.throws(() =>
    c.open(token.slice(0, -3) + "abc", "actor/company/session/memory"),
  );
  assert.equal(createAskState({}).configured, false);
});
test("relative reporting periods trigger clarification rather than silently substituting a historical total", () => {
  assert.equal(unavailableRelativePeriod("How was last month?", b), false);
  assert.equal(
    unavailableRelativePeriod("How are we doing this week?", b),
    true,
  );
  assert.equal(unavailableRelativePeriod("today", b), true);
  assert.equal(unavailableRelativePeriod("this month", b), true);
});
test("paid mode, absent privacy review and expired provider approval disable inference before any network call", async () => {
  const base = {
    AYNOR_ASK_ENABLED: "true",
    OPENROUTER_API_KEY: "fixture-only",
    AYNOR_ASK_MODEL: "fixture/executive:free",
    AYNOR_ASK_PROVIDER: "fixture",
    AYNOR_ASK_PRIVACY_APPROVED: "true",
    AYNOR_ASK_PRIVACY_POLICY_URL: "https://example.test/privacy",
    AYNOR_ASK_PRIVACY_REVIEWED_AT: new Date().toISOString(),
  };
  let calls = 0;
  for (const change of [
    { AYNOR_ASK_BILLING_MODE: "paid" },
    { AYNOR_ASK_PRIVACY_APPROVED: "false" },
    { AYNOR_ASK_MODEL: "paid/model" },
    { AYNOR_ASK_PRIVACY_REVIEWED_AT: "2020-01-01" },
    { AYNOR_ASK_PROVIDER: "" },
  ]) {
    const p = createAskProvider({
      env: { ...base, ...change },
      db: {},
      fetchImpl: () => {
        calls++;
        throw Error("must not call");
      },
    });
    assert.equal(p.describe().configured, false);
    await assert.rejects(() => p.complete({}));
  }
  assert.equal(calls, 0);
});
test("the shared transport enforces time and response-size limits", async () => {
  const timed = createOpenRouterTransport({
    timeout: 2,
    env: {},
    fetchImpl: (_u, { signal }) =>
      new Promise((_r, reject) => {
        signal.addEventListener("abort", () => reject(Error("timeout")));
        setTimeout(() => {}, 10);
      }),
  });
  await assert.rejects(() => timed.request("models"), /timeout/);
  const oversized = createOpenRouterTransport({
    env: {},
    fetchImpl: async () => new Response("x".repeat(64001)),
  });
  await assert.rejects(
    () => oversized.request("chat/completions"),
    /response_limit/,
  );
  await assert.rejects(
    () => oversized.request("https://evil.test"),
    /invalid_route/,
  );
});
