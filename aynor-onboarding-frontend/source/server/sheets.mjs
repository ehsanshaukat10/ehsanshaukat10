import { createSourceCatalog } from "./source-catalog.mjs";
import {
  suggestHeader,
  profileColumns,
  validateTable,
  tableSummary,
  validateRelationships,
} from "../shared/table-data.mjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
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
  const catalog = createSourceCatalog({ db, google, member });
  function present(c, snapshot) {
    const interrupted =
      c?.status === "syncing" && Number(c.lease_until || 0) < Date.now();
    return {
      configured: google.configured(),
      googleSetup: google.configuration(),
      connected: !!c,
      mode: c?.spreadsheet?.startsWith("upload:")
        ? "upload"
        : c?.public_url
          ? "public"
          : "oauth",
      spreadsheet: c?.spreadsheet || null,
      tabId: c?.tab_id ?? null,
      tabTitle: c?.tab_title || null,
      mapping:
        c?.mapping?.kind === "tables"
          ? Object.fromEntries(
              c.mapping.tables.map((t) => [t.title, t.purpose || "Other"]),
            )
          : c?.mapping || null,
      dataKind: c?.mapping?.kind === "tables" ? "tables" : "financial",
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
          (!c?.spreadsheet?.startsWith("upload:") &&
            Date.now() - Number(snapshot.created) > 86400000)),
      intervalMs: 0,
      syncMode: "manual",
    };
  }
  async function status(company, actor) {
    const existing = await db.one("sheet_connections", {
      company_id: "eq." + company,
    });
    if (existing?.mapping?.kind === "catalog")
      return catalog.status(company, actor);
    const read = await db.rpc("sheet_read", {
      p_actor: actor,
      p_company: company,
      p_snapshot: false,
    });
    return present(read.connection, read.snapshot);
  }
  async function sync(actor, company) {
    const current = await db.one("sheet_connections", {
      company_id: "eq." + company,
    });
    if (current?.spreadsheet?.startsWith("upload:"))
      fail(
        409,
        "This source is an uploaded file. Upload the updated workbook to refresh its data.",
      );
    const c = await db.rpc("sheet_claim", {
      p_actor: actor,
      p_company: company,
    });
    try {
      const range = "'" + c.tab_title.replaceAll("'", "''") + "'!A1:BA10002";
      const values =
        c.mapping.kind === "tables"
          ? []
          : c.public_url
            ? await google.publicRows(c.public_url)
            : (
                await google.read(
                  company,
                  `${c.spreadsheet}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
                )
              ).values || [];
      let snapshot;
      try {
        snapshot =
          c.mapping.kind === "tables"
            ? await readTables(company, c.mapping, c.spreadsheet, c.public_url)
            : validateRows(values, c.mapping);
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
  async function inspect(company, input, tabId, headerRow) {
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
      `${id}/values/${encodeURIComponent("'" + tab.title.replaceAll("'", "''") + "'!A1:BA101")}`,
    );
    let headers;
    try {
      headerRow =
        headerRow === undefined
          ? suggestHeader(values.values || [])
          : headerRow;
      if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow > 99)
        fail(422, "Choose a header row between 1 and 100.");
      headers = (values.values || [])
        .slice(headerRow)
        .some((row) => row.some((cell) => String(cell ?? "").trim()))
        ? columns((values.values || []).slice(headerRow))
        : [];
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
      headerRow,
      rawPreview: (values.values || []).slice(0, 100),
      profiles: profileColumns(
        headers,
        (values.values || []).slice(headerRow + 1),
      ),
      preview: (values.values || []).slice(headerRow + 1, headerRow + 6),
    };
  }
  async function readTables(
    company,
    mapping,
    spreadsheet,
    publicUrl,
    uploaded,
  ) {
    if (
      !Array.isArray(mapping.tables) ||
      !mapping.tables.length ||
      mapping.tables.length > 10
    )
      fail(422, "Choose between 1 and 10 tables per import.");
    if (
      new Set(mapping.tables.map((t) => t?.tabId)).size !==
      mapping.tables.length
    )
      fail(422, "Choose each worksheet once.");
    const tables = [];
    let metadata;
    if (!publicUrl && !uploaded)
      metadata = await google.read(
        company,
        `${spreadsheet}?fields=sheets(properties(sheetId,title,sheetType))`,
      );
    for (const config of mapping.tables) {
      if (
        !config ||
        typeof config !== "object" ||
        !Number.isInteger(config.tabId) ||
        config.tabId < 0 ||
        typeof config.title !== "string" ||
        !["ymd", "dmy", "mdy", "excel"].includes(config.dateFormat)
      )
        fail(422, "Review each table and its date format.");
      let values;
      let title = config.title;
      if (uploaded)
        values = uploaded.find((t) => t?.tabId === config.tabId)?.values;
      else if (publicUrl) {
        if (mapping.tables.length !== 1)
          fail(
            422,
            "A shared URL imports its selected tab only. Use Connect Google or Excel for multiple tabs.",
          );
        values = await google.publicRows(publicUrl);
      } else {
        const tab = metadata.sheets.find(
          (t) =>
            t.properties.sheetId === config.tabId &&
            t.properties.sheetType === "GRID",
        )?.properties;
        if (!tab)
          fail(
            422,
            "A selected worksheet no longer exists. Read the spreadsheet again.",
          );
        title = tab.title;
        values =
          (
            await google.read(
              company,
              `${spreadsheet}/values/${encodeURIComponent("'" + title.replaceAll("'", "''") + "'!A1:BA10101")}?valueRenderOption=FORMATTED_VALUE`,
            )
          ).values || [];
      }
      try {
        tables.push(validateTable(values, { ...config, title }, columns));
      } catch (error) {
        fail(422, `${title}: ${error.message}`);
      }
    }
    let relationships;
    try {
      relationships = validateRelationships(
        tables,
        mapping.tables,
        mapping.relationships,
      );
    } catch (error) {
      fail(422, error.message);
    }
    const snapshot = {
      kind: "tables",
      tables,
      relationships,
      rowCount: tables.reduce((sum, t) => sum + t.rowCount, 0),
    };
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 3 * 1024 * 1024)
      fail(
        422,
        "Selected tables exceed 3 MB. Import fewer tabs or ignore large text columns.",
      );
    return snapshot;
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
        // The full state, including destination, was bound to this user/company
        // and consumed above. Only fixed same-origin destinations are allowed.
        const destination = state.split(".")[1];
        const back =
          "/companies/" +
          pending.company_id +
          (["integrations", "mapping"].includes(destination)
            ? "/onboarding/" + destination
            : "/settings/connections");
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
          let email = null;
          try {
            const identity = await google.fetchGoogle(
              "https://openidconnect.googleapis.com/v1/userinfo",
              { headers: { Authorization: "Bearer " + token.access_token } },
            );
            if (identity.email_verified && typeof identity.email === "string")
              email = identity.email;
          } catch {
            /* Account identity is optional for older read-only grants. */
          }
          await db.rpc("sheet_configure", {
            p_actor: user.id,
            p_company: pending.company_id,
            p_config: {
              credentials: google.seal({
                ...token,
                email,
                expires: Date.now() + Number(token.expires_in || 3600) * 1000,
              }),
            },
            p_reset: false,
          });
          return redirect(back + "?google=connected");
        } catch {
          return redirect(back + "?google=failed");
        }
      }
      const catalogRoute = path.match(
        /^\/companies\/([a-f0-9-]{36})\/sources(?:\/([a-z0-9-]+)(?:\/(inspect|map|sync|skip))?)?$/i,
      );
      if (catalogRoute) {
        const [, company, id, action] = catalogRoute;
        await member(company, user.id, true);
        if (id === "google-files" && method === "GET")
          return send(await google.files(company));
        const operation = action || (id ? "remove" : "sources");
        return send(
          await catalog.handle({
            company,
            actor: user.id,
            action: operation,
            id,
            method,
            body,
          }),
        );
      }
      const match = path.match(
        /^\/companies\/([a-f0-9-]{36})\/sheets(?:\/(authorize|inspect|public|upload|tables|mapping|sync|overview|events))?$/i,
      );
      if (!match) return false;
      const [, company, action] = match;
      await member(company, user.id, true);
      const currentConnection = await db.one("sheet_connections", {
        company_id: "eq." + company,
      });
      if (currentConnection?.mapping?.kind === "catalog") {
        if (action === "overview" && method === "GET")
          return send({
            source: await catalog.status(company, user.id),
            data: await catalog.overview(
              company,
              user.id,
              url.searchParams.get("period"),
            ),
          });
        if (["tables", "mapping", "upload", "public", "sync"].includes(action))
          fail(
            409,
            "Manage each connected source from Data connections. Existing sources have been preserved.",
          );
      }
      if (!action && method === "GET")
        return send(await status(company, user.id));
      if (action === "events")
        fail(
          405,
          "Hosted mode uses status polling and manual sync, not persistent event streams.",
        );
      if (action === "tables" && method === "POST") {
        const mapping = {
          kind: "tables",
          tables: body.tables,
          relationships: body.relationships || [],
        };
        let spreadsheet,
          publicUrl = null,
          uploaded;
        if (body.mode === "upload") {
          if (
            !Array.isArray(body.uploaded) ||
            body.uploaded.length > 10 ||
            typeof body.name !== "string" ||
            !/\.(xlsx|csv)$/i.test(body.name) ||
            body.name.length > 180
          )
            fail(400, "Choose an Excel or CSV workbook.");
          uploaded = body.uploaded;
          spreadsheet = "upload:" + randomUUID();
        } else if (body.mode === "public") {
          try {
            publicUrl = publicSheetUrl(body.url);
          } catch (error) {
            fail(400, error.message);
          }
          spreadsheet = "shared:" + randomUUID();
        } else if (body.mode === "oauth") {
          try {
            spreadsheet = sheetId(body.url);
          } catch (error) {
            fail(400, error.message);
          }
        } else fail(400, "Choose a supported source.");
        // Fetch and validate every selected table before replacing saved data.
        const snapshot = await readTables(
          company,
          mapping,
          spreadsheet,
          publicUrl,
          uploaded,
        );
        mapping.tables = mapping.tables.map((config, index) => ({
          tabId: config.tabId,
          title: snapshot.tables[index].title,
          purpose: snapshot.tables[index].purpose,
          headerRow: config.headerRow ?? 0,
          types: config.types,
          dateFormat: config.dateFormat,
          ...(config.endRow === undefined ? {} : { endRow: config.endRow }),
        }));
        mapping.relationships = mapping.relationships.map(
          ({ from, to, fromColumn, toColumn }) => ({
            from,
            to,
            fromColumn,
            toColumn,
          }),
        );
        await db.rpc("sheet_configure", {
          p_actor: user.id,
          p_company: company,
          p_config: {
            spreadsheet,
            public_url: publicUrl,
            tab_id: 0,
            tab_title: snapshot.tables
              .map((t) => t.title)
              .join(" · ")
              .slice(0, 150),
            mapping,
          },
          p_reset: true,
        });
        const claim = await db.rpc("sheet_claim", {
          p_actor: user.id,
          p_company: company,
        });
        if (claim.spreadsheet !== spreadsheet)
          fail(409, "Source changed. Review it and retry.");
        const saved = await db.rpc("sheet_publish", {
          p_actor: user.id,
          p_company: company,
          p_generation: claim.generation,
          p_lease: claim.lease_id,
          p_data: snapshot,
        });
        if (!saved)
          fail(
            409,
            "Source changed during import. Retry with the current connection.",
          );
        return send(await status(company, user.id));
      }
      if (action === "upload" && method === "POST") {
        const { name, tabTitle, values, mapping } = body;
        if (
          typeof name !== "string" ||
          !/\.(xlsx|csv)$/i.test(name) ||
          name.length > 180 ||
          typeof tabTitle !== "string" ||
          !tabTitle.trim() ||
          tabTitle.length > 150
        )
          fail(400, "Choose an Excel (.xlsx) or CSV file and a worksheet.");
        if (
          !Array.isArray(values) ||
          !values.length ||
          values.length > 10001 ||
          values.some(
            (row) =>
              !Array.isArray(row) ||
              row.length > 52 ||
              row.some(
                (cell) =>
                  cell !== null &&
                  ((typeof cell !== "string" &&
                    typeof cell !== "number" &&
                    typeof cell !== "boolean") ||
                    (typeof cell === "string" && cell.length > 10000) ||
                    (typeof cell === "number" && !Number.isFinite(cell))),
              ),
          )
        )
          fail(
            422,
            "Use a worksheet with up to 10,000 records and 52 columns. Remove oversized cell contents before importing.",
          );
        let headers;
        try {
          headers = columns(values);
        } catch (error) {
          fail(422, error.message);
        }
        if (!mapping)
          return send({
            spreadsheetId: "upload:preview",
            title: name,
            tabs: [{ sheetId: 0, title: tabTitle }],
            tabId: 0,
            tabTitle,
            headers,
            preview: values.slice(1, 6),
            rowCount: values
              .slice(1)
              .filter((row) => row.some((cell) => String(cell ?? "").trim()))
              .length,
          });
        if (
          typeof mapping !== "object" ||
          Object.keys(mapping)
            .filter((k) => !["_headerRow", "_dateFormat"].includes(k))
            .sort()
            .join(",") !== "date,expenses,revenue" ||
          Object.values(mapping).some((value) => typeof value !== "string")
        )
          fail(400, "Choose date, revenue and expenses columns.");
        let snapshot;
        // Validate completely before replacing any existing source or report.
        try {
          snapshot = validateRows(values, mapping);
        } catch (error) {
          fail(422, error.message);
        }
        const id = "upload:" + randomUUID();
        await db.rpc("sheet_configure", {
          p_actor: user.id,
          p_company: company,
          p_config: {
            spreadsheet: id,
            tab_id: 0,
            tab_title: name + " · " + tabTitle,
            public_url: null,
            mapping,
          },
          p_reset: true,
        });
        const claim = await db.rpc("sheet_claim", {
          p_actor: user.id,
          p_company: company,
        });
        if (claim.spreadsheet !== id)
          fail(
            409,
            "The source changed during import. Review the current connection before retrying.",
          );
        const published = await db.rpc("sheet_publish", {
          p_actor: user.id,
          p_company: company,
          p_generation: claim.generation,
          p_lease: claim.lease_id,
          p_data: snapshot,
        });
        if (!published)
          fail(
            409,
            "The source changed during import. Retry with the current connection.",
          );
        return send(await status(company, user.id));
      }
      if (action === "authorize" && method === "POST") {
        if (!google.configured()) {
          const setup = google.configuration();
          fail(
            503,
            "Google connection needs deployment setup. " +
              (setup.missing.length
                ? "Missing: " + setup.missing.join(", ") + ". "
                : "") +
              (setup.invalid.length
                ? "Check: " + setup.invalid.join(", ") + ". "
                : "") +
              "Add these in Vercel Production and redeploy.",
          );
        }
        const callback = new URL(env.GOOGLE_REDIRECT_URI);
        if (
          callback.protocol !== "https:" ||
          callback.pathname !== "/api/integrations/google/callback"
        )
          fail(
            503,
            "Configure an HTTPS Google callback ending in /api/integrations/google/callback.",
          );
        if (callback.origin !== url.origin)
          fail(
            409,
            "Connect Google from " +
              callback.origin +
              ". Google must return to the same domain as your signed-in session.",
          );
        await db.remove("sheet_oauth", { expires: "lt." + Date.now() });
        const destination = ["integrations", "mapping"].includes(body.returnTo)
          ? body.returnTo
          : "connections";
        const state = randomBytes(32).toString("hex") + "." + destination;
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
          scope: scope + " openid email",
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
          headers = columns(rows.slice(body.headerRow ?? suggestHeader(rows)));
        } catch (error) {
          fail(error.status || 422, error.message);
        }
        const segments = new URL(canonical).pathname.split("/");
        const id = segments[3] === "e" ? segments[4] : segments[3];
        if (!body.previewOnly)
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
          headerRow: body.headerRow ?? suggestHeader(rows),
          rawPreview: rows.slice(0, 100),
          profiles: profileColumns(
            headers,
            rows.slice((body.headerRow ?? suggestHeader(rows)) + 1, 101),
          ),
          preview: rows.slice(
            (body.headerRow ?? suggestHeader(rows)) + 1,
            (body.headerRow ?? suggestHeader(rows)) + 6,
          ),
        });
      }
      if (action === "inspect" && method === "POST") {
        // Respect the tab selected in a normal Google Sheets share link.
        let tabId = body.tabId;
        if (tabId === undefined) {
          try {
            const link = new URL(body.url);
            const gid =
              link.searchParams.get("gid") ||
              new URLSearchParams(link.hash.slice(1)).get("gid");
            if (gid && /^\d{1,12}$/.test(gid)) tabId = Number(gid);
          } catch {
            /* sheetId also accepts a bare spreadsheet ID. */
          }
        }
        return send(await inspect(company, body.url, tabId, body.headerRow));
      }
      if (action === "mapping" && method === "PUT") {
        const mapping = body.mapping;
        if (
          !mapping ||
          Object.keys(mapping)
            .filter((k) => !["_headerRow", "_dateFormat"].includes(k))
            .sort()
            .join(",") !== "date,expenses,revenue" ||
          Object.values(mapping).some(
            (v) => typeof v !== "string" || !v.trim() || v.length > 150,
          ) ||
          new Set([mapping.date, mapping.revenue, mapping.expenses]).size !== 3
        )
          fail(
            400,
            "Choose three distinct date, revenue and expenses columns.",
          );
        if (body.publicUrl) {
          let canonical, rows;
          try {
            canonical = publicSheetUrl(body.publicUrl);
            rows = await google.publicRows(canonical);
            validateRows(rows, mapping);
          } catch (error) {
            fail(error.status || 422, error.message);
          }
          const segments = new URL(canonical).pathname.split("/");
          const id = segments[3] === "e" ? segments[4] : segments[3];
          if (body.spreadsheetId !== id || body.tabId !== 0)
            fail(409, "Read columns again for the current URL.");
          await db.rpc("sheet_configure", {
            p_actor: user.id,
            p_company: company,
            p_config: {
              credentials: "",
              public_url: canonical,
              spreadsheet: id,
              tab_id: 0,
              tab_title: "Shared sheet",
              mapping,
            },
            p_reset: true,
          });
          return send(await sync(user.id, company));
        }
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
        } else
          tab = await inspect(
            company,
            body.spreadsheetId,
            body.tabId,
            Number(mapping._headerRow || 0),
          );
        const financialValues = c.public_url
          ? await google.publicRows(c.public_url)
          : (
              await google.read(
                company,
                `${tab.spreadsheetId}/values/${encodeURIComponent("'" + tab.tabTitle.replaceAll("'", "''") + "'!A1:BA10101")}?valueRenderOption=FORMATTED_VALUE`,
              )
            ).values || [];
        try {
          validateRows(financialValues, mapping);
        } catch (error) {
          fail(422, error.message);
        }
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
            data =
              snapshot.data.kind === "tables"
                ? tableSummary(snapshot.data)
                : aggregate(
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
