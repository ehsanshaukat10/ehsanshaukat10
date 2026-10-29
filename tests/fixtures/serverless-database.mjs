import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
export async function fixtureDatabase() {
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;",
  );
  for (const file of [
    "202610270001_aynor_foundation.sql",
    "202610270002_serverless_operations.sql",
  ])
    await pg.exec(
      readFileSync(
        new URL("../../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await pg.exec("SET ROLE service_role");
  const control = {
    csv: null,
    hold: null,
    googleCalls: 0,
    tokens: 0,
    invalidGrant: false,
    tokenLifetime: 3600,
    fail: false,
    authUsers: new Map(),
    emailsSent: 0,
    authError: null,
    autoConfirm: false,
    currentMonthGoogle: false,
  };
  const encode = (value) =>
    value !== null && typeof value === "object" ? JSON.stringify(value) : value;
  async function fetchImpl(input, options = {}) {
    const url = new URL(input),
      method = options.method || "GET";
    if (
      url.hostname === "test.supabase.co" &&
      url.pathname.startsWith("/auth/v1/")
    ) {
      if (options.headers.apikey !== "sb_secret_test_fixture_only")
        throw Error("Auth server key missing");
      if (url.pathname.endsWith("/settings"))
        return Response.json({
          mailer_autoconfirm: control.autoConfirm,
          disable_signup: false,
        });
      if (control.authError)
        return Response.json(
          {
            code: control.authError,
            message: "private provider diagnostic must not leak",
          },
          { status: control.authError.includes("rate") ? 429 : 400 },
        );
      const body = JSON.parse(options.body);
      const account = control.authUsers.get(body.email);
      if (url.pathname.endsWith("/signup")) {
        control.emailsSent++;
        if (!account)
          control.authUsers.set(body.email, {
            id: crypto.randomUUID(),
            email: body.email,
            password: body.password,
            user_metadata: body.data,
            email_confirmed_at: null,
          });
        return Response.json({
          id: control.authUsers.get(body.email).id,
          email: body.email,
          email_confirmed_at: null,
        });
      }
      if (url.pathname.endsWith("/resend")) {
        control.emailsSent++;
        return Response.json({});
      }
      if (!account || account.password !== body.password)
        return Response.json({ code: "invalid_credentials" }, { status: 400 });
      if (!account.email_confirmed_at)
        return Response.json({ code: "email_not_confirmed" }, { status: 400 });
      const { password, ...identity } = account;
      return Response.json({
        user: identity,
        access_token: "private-provider-token",
        refresh_token: "private-provider-refresh",
      });
    }
    if (url.hostname === "oauth2.googleapis.com") {
      control.tokens++;
      return control.invalidGrant
        ? Response.json({ error: "invalid_grant" }, { status: 400 })
        : Response.json({
            access_token: "fixture-access",
            refresh_token: "fixture-refresh",
            expires_in: control.tokenLifetime,
            scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
          });
    }
    if (url.hostname === "sheets.googleapis.com") {
      if (options.headers.Authorization !== "Bearer fixture-access")
        throw Error("Google token missing");
      const now = new Date(),
        date = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - (control.currentMonthGoogle ? 0 : 1),
            1,
          ),
        )
          .toISOString()
          .slice(0, 10);
      return url.pathname.includes("/values/")
        ? Response.json({
            values: [
              ["Date", "Revenue", "Expenses"],
              [date, 500, 200],
            ],
          })
        : Response.json({
            properties: { title: "Private report" },
            sheets: [
              {
                properties: { sheetId: 0, title: "Finance", sheetType: "GRID" },
              },
            ],
          });
    }
    if (url.hostname === "docs.google.com") {
      control.googleCalls++;
      if (control.hold) await control.hold;
      if (control.fail) return new Response("unavailable", { status: 503 });
      const now = new Date(),
        dates = [1, 2].map((n) =>
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1))
            .toISOString()
            .slice(0, 10),
        );
      return new Response(
        control.csv ??
          `Date,Revenue,Expenses\n${dates[0]},1000,400\n${dates[1]},2000,800\n`,
      );
    }
    if (url.hostname !== "test.supabase.co")
      throw Error("Unexpected external request: " + url.hostname);
    if (options.headers.apikey !== "sb_secret_test_fixture_only")
      throw Error("Server secret missing");
    if (options.headers.Authorization)
      throw Error("Modern API keys must not be passed as JWT bearer tokens");
    const name = url.pathname.replace("/rest/v1/", ""),
      body = options.body ? JSON.parse(options.body) : null;
    try {
      if (name.startsWith("rpc/")) {
        const fn = name.slice(4);
        if (!/^aynor_[a-z_]+$/.test(fn)) throw Error("Bad function");
        const keys = Object.keys(body || {});
        const result = await pg.query(
          `SELECT public.${fn}(${keys.map((key, i) => `"${key}" => $${i + 1}`).join(",")}) AS result`,
          keys.map((key) => encode(body[key])),
        );
        return Response.json(result.rows[0].result);
      }
      if (!/^aynor_[a-z_]+$/.test(name)) throw Error("Bad table");
      const args = [],
        where = [];
      for (const [key, value] of url.searchParams) {
        if (["select", "limit", "on_conflict"].includes(key)) continue;
        if (!/^[a-z_]+$/.test(key)) throw Error("Bad column");
        const match = /^(eq|gt|lt)\.(.*)$/s.exec(value);
        if (!match) throw Error("Bad filter");
        args.push(match[2]);
        where.push(
          `"${key}" ${{ eq: "=", gt: ">", lt: "<" }[match[1]]} $${args.length}`,
        );
      }
      const condition = where.length ? " WHERE " + where.join(" AND ") : "";
      if (method === "GET") {
        const select = url.searchParams.get("select") || "*";
        if (select.includes("user:")) {
          const result = await pg.query(
            "SELECT m.user_id,m.role,m.scope,jsonb_build_object('id',u.id,'name',u.name,'email',u.email) AS \"user\" FROM public.aynor_members m JOIN public.aynor_users u ON u.id=m.user_id" +
              condition.replaceAll('"company_id"', "m.company_id"),
            args,
          );
          return Response.json(result.rows);
        }
        if (select !== "*" && !/^[a-z_,]+$/.test(select))
          throw Error("Bad select");
        const result = await pg.query(
          `SELECT ${select} FROM public.${name}${condition} LIMIT ${Number(url.searchParams.get("limit") || 1001)}`,
          args,
        );
        return Response.json(result.rows);
      }
      if (method === "POST") {
        const keys = Object.keys(body);
        if (keys.some((key) => !/^[a-z_]+$/.test(key)))
          throw Error("Bad column");
        const conflict = url.searchParams.get("on_conflict");
        if (conflict && !/^[a-z_]+$/.test(conflict))
          throw Error("Bad conflict");
        const result = await pg.query(
          `INSERT INTO public.${name}(${keys.map((k) => '"' + k + '"').join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")})${options.headers.Prefer?.includes("ignore-duplicates") ? ` ON CONFLICT(${conflict}) DO NOTHING` : ""} RETURNING *`,
          keys.map((key) => encode(body[key])),
        );
        return Response.json(result.rows);
      }
      if (method === "PATCH") {
        const keys = Object.keys(body);
        const result = await pg.query(
          `UPDATE public.${name} SET ${keys.map((key, i) => `"${key}"=$${args.length + i + 1}`).join(",")}${condition} RETURNING *`,
          [...args, ...keys.map((key) => encode(body[key]))],
        );
        return Response.json(result.rows);
      }
      if (method === "DELETE") {
        const result = await pg.query(
          `DELETE FROM public.${name}${condition} RETURNING *`,
          args,
        );
        return Response.json(result.rows);
      }
      throw Error("Unsupported method");
    } catch (error) {
      return Response.json(
        { code: error.code || "TEST_ERROR", message: error.message },
        { status: 400 },
      );
    }
  }
  return { pg, fetchImpl, control, close: () => pg.close() };
}
