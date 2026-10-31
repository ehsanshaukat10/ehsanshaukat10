import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizedCachedSnapshot,
  intelligenceCacheKey,
  intelligenceQuery,
} from "../aynor-onboarding-frontend/source/src/features/live/intelligence-cache.ts";
const authority = {
  version: 1,
  companyId: "company-a",
  authorization: {
    role: "Viewer",
    fingerprint: "actor-a-role-viewer-dept-finance-policy-v1",
  },
  datasetRevision: "revision-a",
  context: { key: "scope-a-period-month-filter-paid" },
};
const report = { ...authority, executive: { version: 1, scopes: [] } };
test("intelligence cache requires current proof and cannot cross company, user, access, reporting scope or source revision", () => {
  assert.ok(authorizedCachedSnapshot(report, "company-a", authority));
  assert.ok(!authorizedCachedSnapshot(report, "company-b", authority));
  assert.ok(
    !authorizedCachedSnapshot(
      { executive: report.executive },
      "company-a",
      authority,
    ),
    "Legacy caches cannot bypass authorization",
  );
  for (const changed of [
    { ...authority, datasetRevision: "revision-b" },
    { ...authority, context: { key: "another-scope" } },
    {
      ...authority,
      authorization: {
        ...authority.authorization,
        fingerprint: "same-role-new-department-or-grants",
      },
    },
    {
      ...authority,
      authorization: { ...authority.authorization, role: "Executive" },
    },
  ]) {
    assert.ok(!authorizedCachedSnapshot(report, "company-a", changed));
    assert.notEqual(
      intelligenceCacheKey("actor-a", "company-a", authority),
      intelligenceCacheKey("actor-a", "company-a", changed),
    );
  }
  assert.notEqual(
    intelligenceCacheKey("actor-a", "company-a", authority),
    intelligenceCacheKey("actor-b", "company-a", authority),
  );
  assert.equal(
    intelligenceQuery(
      "?scope=a&period=month&department=Sales&tag=a&tag=b&evidence=secret&revision=old&returnTo=bad",
    ),
    "scope=a&period=month&department=Sales&tag=a&tag=b",
  );
});
