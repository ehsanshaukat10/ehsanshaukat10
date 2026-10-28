import { randomBytes, createHash } from "node:crypto";
import { fail } from "./database.mjs";
import { createGoogle, scope } from "./google.mjs";
import {
  sheetId,
  columns,
  publicSheetUrl,
  validateRows,
  aggregate,
} from "./sheets-validation.mjs";
const hash = (v) => createHash("sha256").update(v).digest("hex");
export function createServerlessSheets({
  db,
  member,
  env = process.env,
  fetchImpl = fetch,
}) {
  const google = createGoogle({ db, env, fetchImpl });
  function present(c, snapshot) {
    const interrupted =
      c?.status === "syncing" && Number(c.lease_until || 0) < Date.now();
    return {
      configured: google.configured(),
      connected: !!c,
      mode: c?.public_url ? "public" : "oauth",
      spreadsheet: c?.spreadsheet || null,
      tabId: c?.tab_id ?? null,
      tabTitle: c?.tab_title || null,
      mapping: c?.mapping || null,
      status: interrupted ? "error" : c?.status || "disconnected",
      error: interrupted
        ? "Sync was interrupted. Click Sync now to retry."
        : c?.error || null,
      lastAttempt: c?.last_attempt || null,
      lastSuccess: c?.last_success || null,
      nextSync: null,
      revision: c?.revision || 0,
      hasSnapshot: !!snapshot,
      stale:
        !!snapshot &&
        (!!c?.error ||
          interrupted ||
          Date.now() - Number(snapshot.created) > 86400000),
      intervalMs: 0,
      syncMode: "manual",
    };
  }
  async function status(company, actor) {
    const read = await db.rpc("sheet_read", {
      p_actor: actor,
      p_company: company,
      p_snapshot: false,
    });
    return present(read.connection, read.snapshot);
  }
  async function sync(actor, company) {
    const c = await db.rpc("sheet_claim", {
      p_actor: actor,
      p_company: company,
    });
    try {
      const range = "'" + c.tab_title.replaceAll("'", "''") + "'!A1:BA10002";
      const values = c.public_url
        ? await google.publicRows(c.public_url)
        : (
            await google.read(
              company,
              `${c.spreadsheet}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
            )
          ).values || [];
      let snapshot;
      try {
        snapshot = validateRows(values, c.mapping);
      } catch (error) {
        fail(422, error.message);
      }
      const published = await db.rpc("sheet_publish", {
        p_actor: actor,
        p_company: company,
        p_generation: c.generation,
        p_lease: c.lease_id,
        p_data: snapshot,
      });
      if (!published)
        fail(
          409,
          "Source changed or this sync expired. Retry with the current connection.",
        );
    } catch (error) {
      await db.rpc("sheet_publish", {
        p_actor: actor,
        p_company: company,
        p_generation: c.generation,
        p_lease: c.lease_id,
        p_data: null,
        p_error: error.status
          ? error.message
          : "Sync failed. Previous valid data is retained.",
        p_reauth: error.status === 401,
      });
      throw error;
    }
    return status(company, actor);
  }
  async function inspect(company, input, tabId) {
    let id;
    try {
      id = sheetId(input);
    } catch (error) {
      fail(400, error.message);
    }
    const metadata = await google.read(
      company,
      `${id}?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,sheetType))`,
    );
    const tabs = metadata.sheets
        .filter((s) => s.properties.sheetType === "GRID")
        .map((s) => s.properties),
      tab =
        tabId === undefined ? tabs[0] : tabs.find((t) => t.sheetId === tabId);
    if (!tab) fail(422, "Choose an available grid tab.");
    const values = await google.read(
      company,
      `${id}/values/${encodeURIComponent("'" + tab.title.replaceAll("'", "''") + "'!A1:BA6")}`,
    );
    let headers;
    try {
      headers = columns(values.values || []);
    } catch (error) {
      fail(422, error.message);
    }
    return {
      spreadsheetId: id,
      title: metadata.properties.title,
      tabs,
      tabId: tab.sheetId,
      tabTitle: tab.title,
      headers,
      preview: (values.values || []).slice(1, 6),
    };
  }
  return {
    configured: google.configured,
    status,
    async handle({ path, url, method, body, user, send, redirect }) {
      if (path === "/integrations/google/callback") {
        if (method !== "GET") fail(405, "Method not allowed.");
        const state = url.searchParams.get("state") || "";
        const pending = (
          await db.remove("sheet_oauth", {
            state: "eq." + hash(state),
            user_id: "eq." + user.id,
            expires: "gt." + Date.now(),
          })
        )?.[0];
        if (!pending)
          fail(
            400,
            "Authorization expired or did not match this session. Start again.",
          );
        await member(pending.company_id, user.id, true);
        const back =
          "/companies/" + pending.company_id + "/settings/connections";
        if (url.searchParams.has("error"))
          return redirect(back + "?google=cancelled");
        try {
          const token = await google.fetchGoogle(
            "https://oauth2.googleapis.com/token",
            {
              method: "POST",
              body: new URLSearchParams({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                redirect_uri: env.GOOGLE_REDIRECT_URI,
                grant_type: "authorization_code",
                code: url.searchParams.get("code") || "",
              }),
            },
          );
          if (
            !token.access_token ||
            !token.refresh_token ||
            !token.scope?.split(" ").includes(scope)
          )
            fail(403, "Read-only offline access was not granted.");
          const previous = await db.one("sheet_connections", {
            company_id: "eq." + pending.company_id,
          });
          await db.rpc("sheet_configure", {
            p_actor: user.id,
            p_company: pending.company_id,
            p_config: {
              credentials: google.seal({
                ...token,
                expires: Date.now() + Number(token.expires_in || 3600) * 1000,
              }),
              public_url: null,
              ...(previous?.public_url
                ? {
                    mapping: null,
                    spreadsheet: null,
                    tab_id: null,
                    tab_title: null,
                  }
                : {}),
            },
            p_reset: !!previous?.public_url,
          });
          return redirect(back + "?google=connected");
        } catch {
          return redirect(back + "?google=failed");
        }
      }
      const match = path.match(
        /^\/companies\/([a-f0-9-]{36})\/sheets(?:\/(authorize|inspect|public|mapping|sync|overview|events))?$/i,
      );
      if (!match) return false;
      const [, company, action] = match;
      await member(company, user.id, true);
      if (!action && method === "GET")
        return send(await status(company, user.id));
      if (action === "events")
        fail(
          405,
          "Hosted mode uses status polling and manual sync, not persistent event streams.",
        );
      if (action === "authorize" && method === "POST") {
        if (!google.configured())
          fail(
            503,
            "Configure Google OAuth on the server first, or use Published sheet.",
          );
        const callback = new URL(env.GOOGLE_REDIRECT_URI);
        if (
          callback.protocol !== "https:" ||
          callback.pathname !== "/api/integrations/google/callback"
        )
          fail(
            503,
            "Configure an HTTPS Google callback ending in /api/integrations/google/callback.",
          );
        await db.remove("sheet_oauth", { expires: "lt." + Date.now() });
        const state = randomBytes(32).toString("hex");
        await db.insert("sheet_oauth", {
          state: hash(state),
          company_id: company,
          user_id: user.id,
          expires: Date.now() + 600000,
        });
        const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        consent.search = new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          response_type: "code",
          scope,
          state,
          access_type: "offline",
          prompt: "consent",
        }).toString();
        return send({ url: consent.href });
      }
      if (action === "public" && method === "POST") {
        let canonical;
        try {
          canonical = publicSheetUrl(body.url);
        } catch (error) {
          fail(400, error.message);
        }
        let headers, rows;
        try {
          rows = await google.publicRows(canonical);
          headers = columns(rows);
        } catch (error) {
          fail(error.status || 422, error.message);
        }
        const id = new URL(canonical).pathname.split("/")[4];
        await db.rpc("sheet_configure", {
          p_actor: user.id,
          p_company: company,
          p_config: {
            credentials: "",
            public_url: canonical,
            spreadsheet: id,
            tab_id: 0,
            tab_title: "Published report",
            mapping: null,
          },
          p_reset: true,
        });
        return send({
          spreadsheetId: id,
          title: "Published report",
          tabs: [{ sheetId: 0, title: "Published report" }],
          tabId: 0,
          tabTitle: "Published report",
          headers,
          preview: rows.slice(1, 6),
        });
      }
      if (action === "inspect" && method === "POST")
        return send(await inspect(company, body.url, body.tabId));
      if (action === "mapping" && method === "PUT") {
        const mapping = body.mapping;
        if (
          !mapping ||
          Object.keys(mapping).sort().join(",") !== "date,expenses,revenue" ||
          Object.values(mapping).some(
            (v) => typeof v !== "string" || !v.trim() || v.length > 150,
          ) ||
          new Set(Object.values(mapping)).size !== 3
        )
          fail(
            400,
            "Choose three distinct date, revenue and expenses columns.",
          );
        const c = await db.one("sheet_connections", {
          company_id: "eq." + company,
        });
        if (!c) fail(409, "Connect a sheet first.");
        let tab;
        if (c.public_url) {
          if (body.spreadsheetId !== c.spreadsheet || body.tabId !== 0)
            fail(409, "Inspect this published source again.");
          tab = {
            spreadsheetId: c.spreadsheet,
            tabId: 0,
            tabTitle: "Published report",
          };
        } else tab = await inspect(company, body.spreadsheetId, body.tabId);
        await db.rpc("sheet_configure", {
          p_actor: user.id,
          p_company: company,
          p_config: {
            spreadsheet: tab.spreadsheetId,
            tab_id: tab.tabId,
            tab_title: tab.tabTitle,
            mapping,
          },
          p_reset: true,
        });
        return send(await sync(user.id, company));
      }
      if (action === "sync" && method === "POST")
        return send(await sync(user.id, company));
      if (action === "overview" && method === "GET") {
        const read = await db.rpc("sheet_read", {
          p_actor: user.id,
          p_company: company,
          p_snapshot: true,
        });
        const snapshot = read.snapshot;
        let data = null;
        if (snapshot)
          try {
            data = aggregate(
              snapshot.data,
              url.searchParams.get("period") || "quarter",
            );
          } catch (error) {
            fail(400, error.message);
          }
        return send({ source: present(read.connection, read.snapshot), data });
      }
      if (!action && method === "DELETE") {
        await db.rpc("sheet_disconnect", {
          p_actor: user.id,
          p_company: company,
        });
        return send({ ok: true });
      }
      fail(405, "Method not allowed.");
    },
  };
}
