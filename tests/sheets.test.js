import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createSheetsService } from "../server/sheets/service.js";
import {
  sheetId,
  publicSheetUrl,
  parseCSV,
  validateRows,
  aggregate,
} from "../server/sheets/validation.js";
const id = "abcdefghijklmnopqrstuvwx1234",
  published =
    "https://docs.google.com/spreadsheets/d/e/2PACXabcdefghijklmnopqrstuvwx/pub?output=csv&gid=0";
const mapping = { date: "Date", revenue: "Revenue", expenses: "Costs" };
const valid = [
  ["Date", "Revenue", "Costs"],
  ["2026-09-01", 1000, 600],
  ["2026-09-01", 200, 50],
  ["2026-08-15", 300, 100],
];
function fixture(configured = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE companies(id TEXT PRIMARY KEY,archived INTEGER DEFAULT 0); INSERT INTO companies(id) VALUES('a'),('b'); CREATE TABLE sessions(token TEXT,expires INTEGER);",
  );
  const env = configured
    ? {
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        GOOGLE_REDIRECT_URI:
          "http://localhost:5173/api/integrations/google/callback",
        SHEETS_ENCRYPTION_KEY: "ab".repeat(32),
      }
    : {};
  const control = {
    values: valid,
    error: 0,
    tokenCalls: 0,
    tokenLifetime: 3600,
    csv: "Date,Revenue,Costs\n2026-09-01,1000,600\n",
    redirect: false,
    hold: null,
  };
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === "oauth2.googleapis.com") {
      control.tokenCalls++;
      return Response.json({
        access_token: "sensitive-access",
        refresh_token: "sensitive-refresh",
        expires_in: control.tokenLifetime,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      });
    }
    if (control.hold) await control.hold;
    if (control.error)
      return Response.json(
        { error: "access denied" },
        { status: control.error },
      );
    if (url.hostname === "docs.google.com") {
      if (control.redirect)
        return new Response(null, {
          status: 302,
          headers: { Location: "http://169.254.169.254/latest/meta-data" },
        });
      return new Response(control.csv);
    }
    if (url.hostname !== "sheets.googleapis.com")
      throw Error("unexpected host");
    assert.equal(options.headers.Authorization, "Bearer sensitive-access");
    return url.pathname.includes("/values/")
      ? Response.json({ values: control.values })
      : Response.json({
          properties: { title: "Finance" },
          sheets: [
            { properties: { sheetId: 0, title: "Report", sheetType: "GRID" } },
          ],
        });
  };
  const membership = (company, user, edit) => {
    if (company !== user || (edit && user === "viewer"))
      throw Object.assign(Error("Forbidden"), { status: 403 });
    return { role: "Owner" };
  };
  const service = createSheetsService({
    db,
    membership,
    audit() {},
    env,
    fetchImpl,
  });
  async function call(
    action,
    method = "GET",
    body = {},
    user = "a",
    company = "a",
  ) {
    let result, code, redirect;
    const path =
      action === "callback"
        ? "/api/integrations/google/callback"
        : `/api/companies/${company}/sheets${action ? "/" + action : ""}`;
    const url = new URL("http://localhost" + path);
    if (action === "callback")
      for (const [key, value] of Object.entries(body))
        url.searchParams.set(key, value);
    const res = {
      writeHead(status, headers) {
        code = status;
        redirect = headers.Location;
      },
      end() {},
    };
    await service.handle({
      req: { headers: {} },
      res,
      url,
      path,
      method,
      body,
      user: { id: user },
      send(data, status = 200) {
        result = data;
        code = status;
      },
    });
    return { data: result, status: code, redirect };
  }
  async function authorize() {
    const consent = await call("authorize", "POST");
    const state = new URL(consent.data.url).searchParams.get("state");
    await call("callback", "GET", { state, code: "code" });
    return state;
  }
  return { db, service, control, call, authorize };
}
test("strict source identifiers, CSV parsing, monetary/date validation and reporting windows", () => {
  assert.equal(
    sheetId("https://docs.google.com/spreadsheets/d/" + id + "/edit"),
    id,
  );
  for (const bad of [
    "http://127.0.0.1/a",
    "https://docs.google.com.evil.test/spreadsheets/d/" + id,
    "https://user:pass@docs.google.com/spreadsheets/d/" + id,
  ])
    assert.throws(() => sheetId(bad));
  assert.throws(() => publicSheetUrl("http://169.254.169.254/"));
  assert.deepEqual(
    parseCSV('\uFEFFDate,"Revenue","Costs"\r\n2026-09-01,"1,200.50",40\r\n'),
    [
      ["Date", "Revenue", "Costs"],
      ["2026-09-01", "1,200.50", "40"],
    ],
  );
  assert.throws(() => parseCSV('a,b\n"unclosed,1'));
  assert.throws(() => parseCSV('a,b\n"100"2,3'));
  assert.throws(() =>
    validateRows([valid[0], ["2026-09-01", 1, 2, "extra"]], mapping),
  );
  const snapshot = validateRows(valid, mapping);
  assert.equal(snapshot.rowCount, 3);
  assert.equal(snapshot.points[1].revenue, 1200);
  for (const row of [
    ["2026-02-30", 10, 5],
    ["2026-09-01", "NaN", 5],
    ["2026-09-01", "1.234,50", 5],
    ["2026-09-01", "", 5],
  ])
    assert.throws(() => validateRows([valid[0], row], mapping));
  assert.throws(() => validateRows([["Date", "Date", "Costs"]], mapping));
  const report = aggregate(snapshot, "quarter", new Date("2026-10-27"));
  assert.equal(report.totals.revenue, 1500);
  assert.equal(report.totals.costs, 750);
  assert.equal(report.totals.margin, 50);
  assert.equal(
    aggregate(snapshot, "month", new Date("2026-10-27")).totals.revenue,
    1200,
  );
  assert.equal(
    aggregate(snapshot, "month", new Date("2027-10-27")).points.length,
    0,
  );
});
test("private OAuth binding, encrypted credentials, mapping, atomic sync, stale snapshot and deletion", async (t) => {
  const f = fixture();
  t.after(() => {
    f.service.close();
    f.db.close();
  });
  const consent = await f.call("authorize", "POST");
  const state = new URL(consent.data.url).searchParams.get("state");
  await assert.rejects(
    () => f.call("callback", "GET", { state, code: "x" }, "b"),
    /expired|match/,
  );
  await f.call("callback", "GET", { state, code: "x" });
  await assert.rejects(
    () => f.call("callback", "GET", { state, code: "x" }),
    /expired/,
  );
  assert.ok(
    !f.db
      .prepare("SELECT credentials FROM sheet_connections")
      .get()
      .credentials.includes("sensitive"),
  );
  assert.ok(!JSON.stringify((await f.call("")).data).includes("sensitive"));
  await assert.rejects(
    () => f.call("inspect", "POST", { url: id }, "b", "a"),
    /Forbidden/,
  );
  const inspected = await f.call("inspect", "POST", { url: id });
  assert.deepEqual(inspected.data.headers, ["Date", "Revenue", "Costs"]);
  await assert.rejects(
    () =>
      f.call("mapping", "PUT", {
        spreadsheetId: id,
        tabId: 0,
        mapping: { ...mapping, date: "Revenue" },
      }),
    /distinct/,
  );
  await f.call("mapping", "PUT", { spreadsheetId: id, tabId: 0, mapping });
  await f.service.sync("a");
  assert.equal(f.service.status("a").status, "synced");
  assert.equal(f.service.status("a").hasSnapshot, true);
  const first = f.db.prepare("SELECT data FROM sheet_snapshots").get().data;
  f.control.values = [valid[0], ["2026-09-01", "wrong", 1]];
  await f.service.sync("a");
  assert.equal(f.service.status("a").status, "error");
  assert.match(f.service.status("a").error, /Row 2/);
  assert.equal(f.service.status("a").stale, true);
  assert.equal(
    f.db.prepare("SELECT data FROM sheet_snapshots").get().data,
    first,
  );
  f.control.values = valid;
  await f.service.sync("a");
  assert.equal(f.service.status("a").status, "synced");
  f.control.error = 401;
  await f.service.sync("a");
  assert.equal(f.service.status("a").status, "reauth_required");
  assert.equal(f.service.status("a").hasSnapshot, true);
  f.control.error = 0;
  let release;
  f.control.hold = new Promise((r) => (release = r));
  const task = f.service.sync("a");
  await f.call("", "DELETE");
  release();
  await task;
  assert.equal(f.service.status("a").connected, false);
  assert.equal(f.service.status("a").hasSnapshot, false);
});
test("published CSV works without OAuth credentials and rejects unsafe redirects", async (t) => {
  const f = fixture(false);
  t.after(() => {
    f.service.close();
    f.db.close();
  });
  await assert.rejects(() => f.call("authorize", "POST"), /not configured/);
  const inspected = await f.call("public", "POST", { url: published });
  assert.equal(inspected.data.headers[1], "Revenue");
  await f.call("mapping", "PUT", {
    spreadsheetId: inspected.data.spreadsheetId,
    tabId: 0,
    mapping,
  });
  await f.service.sync("a");
  assert.equal(f.service.status("a").status, "synced");
  assert.equal(f.service.status("a").mode, "public");
  f.control.redirect = true;
  await f.service.sync("a");
  assert.match(f.service.status("a").error, /redirect/);
  assert.equal(f.service.status("a").hasSnapshot, true);
});

test("expired private credentials refresh once across concurrent reads and rate errors preserve snapshots", async (t) => {
  const f = fixture();
  t.after(() => {
    f.service.close();
    f.db.close();
  });
  f.control.tokenLifetime = -120;
  await f.authorize();
  f.control.tokenLifetime = 3600;
  await Promise.all([
    f.call("inspect", "POST", { url: id }),
    f.call("inspect", "POST", { url: id }),
  ]);
  assert.equal(f.control.tokenCalls, 2);
  await f.call("mapping", "PUT", { spreadsheetId: id, tabId: 0, mapping });
  await f.service.sync("a");
  f.control.error = 429;
  await f.service.sync("a");
  const status = f.service.status("a");
  assert.equal(status.hasSnapshot, true);
  assert.equal(status.status, "error");
  assert.ok(status.nextSync > Date.now() + 50000);
  assert.match(status.error, /rate limit/);
});

test("an old sync cannot publish after a replacement source reuses the same revision", async (t) => {
  const f = fixture(false);
  t.after(() => {
    f.service.close();
    f.db.close();
  });
  const inspected = await f.call("public", "POST", { url: published });
  await f.call("mapping", "PUT", {
    spreadsheetId: inspected.data.spreadsheetId,
    tabId: 0,
    mapping,
  });
  await f.service.sync("a");
  f.db.prepare("DELETE FROM sheet_snapshots").run();
  let release;
  f.control.hold = new Promise((resolve) => (release = resolve));
  const original = f.control.csv;
  // Hold the upstream read while a replacement source reuses the revision.
  const task = f.service.sync("a");
  f.db
    .prepare(
      "UPDATE sheet_connections SET generation='replacement-source',status='ready' WHERE company_id='a'",
    )
    .run();
  release();
  await task;
  assert.equal(f.service.status("a").hasSnapshot, false);
  assert.equal(f.service.status("a").status, "ready");
  f.control.hold = null;
  f.control.csv = original;
  await f.service.sync("a");
  assert.equal(f.service.status("a").hasSnapshot, true);
});
