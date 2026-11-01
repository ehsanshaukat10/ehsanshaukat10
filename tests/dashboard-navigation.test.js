import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionsLink,
  overviewReturn,
  evidenceReturn,
  evidenceLink,
  moduleReturn,
  businessLink,
} from "../aynor-onboarding-frontend/source/src/features/live/dashboard-navigation.ts";
test("connections and nested records retain exact company, scope, period, repeated filters and hash", () => {
  const overview =
    "/companies/a/overview?scope=s2&period=quarter&department=Sales&tag=one&tag=two#performance";
  const target = connectionsLink(
    "a",
    "/companies/a/connections?business=1&source=book&tab=2",
    overview,
  );
  const params = new URL(target, "https://aynor.invalid").searchParams;
  assert.equal(overviewReturn("a", params.get("returnTo")), overview);
  const records = connectionsLink(
    "a",
    "/companies/a/connections?records=1",
    target,
  );
  assert.equal(
    new URL(records, "https://aynor.invalid").searchParams.get("returnTo"),
    overview,
  );
  assert.equal(
    new URL(target, "https://aynor.invalid").searchParams.get("source"),
    "book",
  );
});
test("return links reject cross-company, external and nested return destinations", () => {
  for (const path of [
    "//evil.test/companies/a/overview",
    "https://evil.test/companies/a/overview",
    "/companies/b/overview",
    "/companies/a/connections",
    "/companies/a/overview/../connections",
  ])
    assert.equal(overviewReturn("a", path), null);
  assert.equal(
    overviewReturn("a", "/companies/a/overview?scope=a&returnTo=bad"),
    "/companies/a/overview?scope=a",
  );
  assert.equal(
    connectionsLink(
      "b",
      "/companies/b/connections",
      "/companies/a/overview?scope=a",
    ),
    "/companies/b/connections",
  );
});
test("evidence retains reporting filters and returns without evidence-only parameters", () => {
  const url = evidenceLink(
    "/companies/a/overview?scope=s&evidence=delivery.overdue_projects&source=b&tab=1",
    "?scope=s&period=month&department=Design&tag=a&tag=b",
  );
  const back = evidenceReturn("a", url);
  assert.equal(
    back,
    "/companies/a/overview?scope=s&period=month&department=Design&tag=a&tag=b",
  );
  assert.ok(!back.includes("source="));
});

test("Departments and Actions preserve context through evidence and mapping correction, without cross-company returns", () => {
  const origin =
    "/companies/a/departments/Design?department=Design&period=quarter&tag=a&tag=b#measures";
  const action = businessLink(
    "a",
    "/companies/a/actions/rec?scope=s2",
    "?scope=s1&department=Design&period=quarter&tag=a&tag=b",
    origin,
  );
  const url = new URL(action, "https://aynor.invalid");
  assert.equal(url.searchParams.get("scope"), "s2");
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(moduleReturn("a", url.searchParams.get("from")), origin);
  const correction = connectionsLink(
    "a",
    "/companies/a/connections?map=1",
    action,
  );
  assert.equal(
    new URL(correction, "https://aynor.invalid").searchParams.get("returnTo"),
    moduleReturn("a", action),
  );
  const evidence = businessLink(
    "a",
    "/companies/a/overview?evidence=delivery.overdue_projects&scope=s2&revision=abc",
    url.search,
    action,
  );
  assert.equal(evidenceReturn("a", evidence), moduleReturn("a", action));
  for (const unsafe of [
    "https://evil.test/companies/a/actions",
    "/companies/b/actions",
    "/companies/a/settings",
    "/companies/a/actions/x/../../settings",
  ])
    assert.equal(moduleReturn("a", unsafe), null);
  assert.equal(businessLink("b", action, ""), "/companies/b/overview");
});
