import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scopeAskMemory,
  writeAskMemory,
  readAskMemory,
  clearAskMemory,
} from "../aynor-onboarding-frontend/source/src/features/live/ask-memory.ts";
import { reserveAiCall } from "../aynor-onboarding-frontend/source/server/ai-usage.mjs";
test("Ask browser memory requires current proof, consent, TTL and principal/company", () => {
  scopeAskMemory("a", "company");
  const entry = {
    proof: "p",
    consent: "c",
    expires: Date.now() + 10000,
    messages: [],
  };
  writeAskMemory("key", entry);
  assert.equal(readAskMemory("key", "p", "c"), entry);
  assert.equal(readAskMemory("key", "p", "different"), null);
  writeAskMemory("key", entry);
  scopeAskMemory("b", "company");
  assert.equal(readAskMemory("key", "p", "c"), null);
  writeAskMemory("key", { ...entry, expires: 0 });
  assert.equal(readAskMemory("key", "p", "c"), null);
  writeAskMemory("key", entry);
  assert.equal(readAskMemory("key", "changed", "c"), null);
  clearAskMemory();
});
test("Mapping, assistant and diagnostics share one application ceiling", async () => {
  const seen = new Map();
  const db = {
    async rpc(_, p) {
      const n = (seen.get(p.p_key) || 0) + 1;
      seen.set(p.p_key, n);
      return n <= p.p_max;
    },
  };
  const env = { AYNOR_AI_APPLICATION_DAILY_LIMIT: "2" };
  assert.equal(await reserveAiCall(db, env), true);
  assert.equal(await reserveAiCall(db, env, "diagnostic"), true);
  assert.equal(await reserveAiCall(db, env), false);
  assert.equal(
    await reserveAiCall(db, { AYNOR_AI_APPLICATION_DAILY_LIMIT: "0" }),
    false,
  );
});
