import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authenticatedDestination,
  workspaceDestination,
  safeReturnPath,
} from "../aynor-onboarding-frontend/source/shared/journey.mjs";
const pending = {
  id: "pending-id",
  role: "Owner",
  data: { completed: false, step: "mapping" },
};
const complete = {
  id: "ready-id",
  role: "Owner",
  data: { completed: true, step: "complete" },
};
test("customer entry never silently bypasses pending setup, including dashboard next links", () => {
  assert.equal(
    authenticatedDestination([], "/companies/unknown/overview"),
    "/companies/new",
  );
  assert.equal(
    authenticatedDestination([pending], "/companies/pending-id/overview"),
    "/companies/pending-id/onboarding/mapping",
  );
  assert.equal(
    authenticatedDestination(
      [pending],
      "/companies/pending-id/settings/connections",
    ),
    "/companies/pending-id/onboarding/mapping",
  );
  assert.equal(authenticatedDestination([complete, pending]), "/companies");
  assert.equal(
    authenticatedDestination([complete], "/companies/ready-id/overview"),
    "/companies/ready-id/overview",
  );
  assert.equal(
    workspaceDestination({
      ...pending,
      data: { completed: false, step: "complete" },
    }),
    "/companies/pending-id/onboarding/review",
  );
  assert.equal(
    workspaceDestination({ ...pending, role: "Viewer" }),
    "/companies/pending-id/overview",
  );
  assert.equal(
    authenticatedDestination([pending], "/invite/approved-token"),
    "/invite/approved-token",
  );
  assert.equal(
    authenticatedDestination([pending], "/companies/not-a-membership/overview"),
    "/companies/pending-id/onboarding/mapping",
  );
  for (const url of [
    "https://evil.test",
    "//evil.test",
    "/companies/../../evil",
    "/companies/abc\\evil",
    "/companies/a\n",
  ])
    assert.equal(safeReturnPath(url), "/entry");
});

test("multi-company re-login always offers selection; completed review never reopens stale step 3", () => {
  assert.equal(
    authenticatedDestination(
      [complete, pending],
      "/companies/ready-id/overview",
    ),
    "/companies",
  );
  assert.equal(
    authenticatedDestination([complete, pending], "/invite/approved-token"),
    "/invite/approved-token",
  );
  assert.equal(
    authenticatedDestination([
      {
        ...pending,
        data: {
          completed: false,
          step: "integrations",
          steps: { review: "completed" },
        },
      },
    ]),
    "/companies/pending-id/overview",
  );
});

test("completed company login ignores obsolete onboarding bookmarks", () => {
  assert.equal(
    authenticatedDestination(
      [{ ...complete, data: { completed: true, step: "integrations" } }],
      "/companies/ready-id/onboarding/integrations",
    ),
    "/companies/ready-id/overview",
  );
});
