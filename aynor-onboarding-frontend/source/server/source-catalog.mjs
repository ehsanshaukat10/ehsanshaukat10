import { randomUUID, createHash } from "node:crypto";
import { fail } from "./database.mjs";
import {
  columns,
  sheetId,
  publicSheetUrl,
  validateRows,
  aggregate,
} from "./sheets-validation.mjs";
import {
  suggestHeader,
  profileColumns,
  validateTable,
  tableSummary,
} from "../shared/table-data.mjs";
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createSourceCatalog({ db, google, member }) {
  async function read(company, actor) {
    const state = await db.rpc("sheet_read", {
      p_actor: actor,
      p_company: company,
      p_snapshot: true,
    });
    const data = state.snapshot?.data;
    if (data?.kind === "catalog") return { ...state, catalog: data };
    const c = state.connection;
    const sources = [];
    if (c?.spreadsheet && c.mapping && data) {
      const id = "legacy-" + company,
        mode = c.spreadsheet.startsWith("upload:")
          ? "upload"
          : c.public_url
            ? "public"
            : "oauth";
      const oldMapping =
        c.mapping.kind === "catalog" ? c.mapping.legacy : c.mapping;
      if (!oldMapping)
        return { ...state, catalog: { kind: "catalog", sources: [] } };
      const configs =
        oldMapping.kind === "tables"
          ? oldMapping.tables
          : [
              {
                tabId: c.tab_id || 0,
                title: c.tab_title,
                headerRow: Number(oldMapping._headerRow || 0),
                dateFormat: oldMapping._dateFormat || "ymd",
                legacyMapping: oldMapping,
              },
            ];
      const tables = data.kind === "tables" ? data.tables : [];
      sources.push({
        id,
        mode,
        title: c.tab_title || "Existing spreadsheet",
        url: c.public_url || c.spreadsheet,
        spreadsheet: c.spreadsheet,
        tabs: configs.map((config, i) => ({
          tabId: config.tabId,
          title: config.title || c.tab_title,
          config,
          table: tables[i] || null,
          financial: !data.kind ? data : null,
          department: config.department || "",
          lastSuccess: c.last_success,
        })),
        lastSuccess: c.last_success,
        relationships: data.relationships || [],
        legacy: true,
      });
    }
    for (const source of sources)
      if (source.mode === "oauth") {
        try {
          const meta = await metadata(company, source.url);
          source.title = meta.title;
          for (const tab of meta.tabs) {
            const existing = source.tabs.find((t) => t.tabId === tab.tabId);
            if (existing) existing.title = tab.title;
            else source.tabs.push(tab);
          }
        } catch {
          /* Saved reports stay usable when Google is temporarily unavailable. */
        }
      }
    return { ...state, catalog: { kind: "catalog", sources } };
  }
  async function initialize(company) {
    let c = await db.one("sheet_connections", { company_id: "eq." + company });
    if (!c) {
      try {
        await db.insert("sheet_connections", {
          company_id: company,
          credentials: "",
          spreadsheet: "catalog",
          mapping: { kind: "catalog" },
          status: "ready",
        });
      } catch (e) {
        if (e.status !== 409) throw e;
      }
      c = await db.one("sheet_connections", { company_id: "eq." + company });
    }
    if (c.mapping?.kind !== "catalog") {
      const changed = await db.update(
        "sheet_connections",
        {
          company_id: "eq." + company,
          generation: "eq." + c.generation,
          lease_id: "is.null",
        },
        { mapping: { kind: "catalog", legacy: c.mapping } },
      );
      if (!changed?.length)
        fail(409, "A sync or connection change is in progress. Retry shortly.");
    }
    return c;
  }
  async function mutate(company, actor, task) {
    // Existing SQL lease serializes all source edits. Never reset/delete the snapshot.
    const before = await read(company, actor);
    await initialize(company);
    const current = await db.one("sheet_connections", {
      company_id: "eq." + company,
    });
    await db.update(
      "sheet_connections",
      {
        company_id: "eq." + company,
        generation: "eq." + current.generation,
        lease_id: "is.null",
      },
      { last_attempt: null },
    );
    const lease = await db.rpc("sheet_claim", {
      p_actor: actor,
      p_company: company,
    });
    try {
      const latest = await read(company, actor);
      const catalog =
        latest.snapshot?.data?.kind === "catalog"
          ? latest.catalog
          : before.catalog;
      const result = await task(catalog);
      if (Buffer.byteLength(JSON.stringify(catalog)) > 3 * 1024 * 1024)
        fail(
          413,
          "Your saved sources exceed 3 MB. Use smaller workbooks or remove an unused source.",
        );
      const saved = await db.rpc("sheet_publish", {
        p_actor: actor,
        p_company: company,
        p_generation: lease.generation,
        p_lease: lease.lease_id,
        p_data: catalog,
      });
      if (!saved)
        fail(
          409,
          "The connection changed during this operation. Your previous report remains available. Refresh and retry.",
        );
      return result;
    } catch (error) {
      await db.rpc("sheet_publish", {
        p_actor: actor,
        p_company: company,
        p_generation: lease.generation,
        p_lease: lease.lease_id,
        p_data: null,
        p_error: error.message,
        p_reauth: false,
      });
      throw error;
    }
  }
  function summary(source) {
    return {
      id: source.id,
      mode: source.mode,
      title: source.title,
      url: source.url,
      lastSuccess: source.lastSuccess || null,
      error: source.error || null,
      changes: source.changes || null,
      tabs: source.tabs.map((tab) => ({
        tabId: tab.tabId,
        title: tab.title,
        department: tab.department || "",
        mapped: !!(tab.table || tab.financial),
        skipped: !!tab.skipped,
        rowCount: tab.table?.rowCount || tab.financial?.rowCount || 0,
        config: tab.config || null,
        error: tab.error || null,
        lastSuccess: tab.lastSuccess || null,
        changes: tab.changes || null,
      })),
    };
  }
  async function account(company) {
    const c = await db.one("sheet_connections", {
      company_id: "eq." + company,
    });
    if (!c?.credentials) return null;
    try {
      const token = google.open(c.credentials);
      return { email: token.email || null, connected: true };
    } catch {
      return { email: null, connected: false };
    }
  }
  async function list(company, actor) {
    const state = await read(company, actor);
    return {
      sources: state.catalog.sources.map(summary),
      account: await account(company),
      revision: state.connection?.revision || 0,
      googleSetup: google.configuration(),
      syncing: state.connection?.status === "syncing",
      error: state.connection?.error || null,
    };
  }
  async function status(company, actor) {
    const state = await read(company, actor),
      sources = state.catalog.sources;
    const tabs = sources.flatMap((s) => s.tabs),
      mapped = tabs.filter((t) => t.table || t.financial);
    return {
      configured: google.configured(),
      googleSetup: google.configuration(),
      connected: !!sources.length || !!(await account(company))?.connected,
      hasSources: !!sources.length,
      dataKind: "tables",
      mode: "catalog",
      tabTitle:
        sources.length === 1
          ? sources[0].title
          : `${sources.length} connected sources`,
      sourceCount: sources.length,
      mapping: Object.fromEntries(
        sources.flatMap((source) =>
          source.tabs
            .filter((t) => t.table || t.financial)
            .map((tab) => [
              `${source.title} / ${tab.title}`,
              tab.department || "Unassigned",
            ]),
        ),
      ),
      status: state.connection?.status || "disconnected",
      error: state.connection?.error || null,
      hasSnapshot: !!mapped.length,
      lastSuccess:
        Math.max(0, ...mapped.map((t) => t.lastSuccess || 0)) || null,
      lastAttempt: state.connection?.last_attempt || null,
      revision: state.connection?.revision || 0,
      stale: tabs.some((t) => t.error),
      syncMode: "manual",
      intervalMs: 0,
      mappedCount: mapped.length,
      unmappedCount: tabs.length - mapped.length,
    };
  }
  async function metadata(company, url) {
    let id;
    try {
      id = sheetId(url);
    } catch (e) {
      fail(400, e.message);
    }
    const data = await google.read(
      company,
      `${id}?fields=properties(title),sheets(properties(sheetId,title,sheetType))`,
    );
    return {
      spreadsheet: id,
      title: data.properties.title,
      tabs: data.sheets
        .filter((s) => s.properties.sheetType === "GRID")
        .map((s) => ({
          tabId: s.properties.sheetId,
          title: s.properties.title,
        })),
    };
  }
  async function rows(company, source, tab, preview = false) {
    if (source.mode === "upload") {
      const values = source.workbook?.find(
        (s) => s.tabId === tab.tabId,
      )?.values;
      if (!values)
        fail(
          409,
          "This older upload needs to be uploaded again to change its columns.",
        );
      return values;
    }
    if (source.mode === "public") return google.publicRows(source.url);
    return (
      (
        await google.read(
          company,
          `${source.spreadsheet}/values/${encodeURIComponent("'" + tab.title.replaceAll("'", "''") + `'!A1:BA${preview ? 101 : 10101}`)}?valueRenderOption=FORMATTED_VALUE`,
        )
      ).values || []
    );
  }
  function getSource(catalog, id) {
    const s = catalog.sources.find((s) => s.id === id);
    if (!s) fail(404, "Source not found in this workspace.");
    return s;
  }
  async function inspect(company, actor, id, tabId, headerRow) {
    const state = await read(company, actor),
      source = getSource(state.catalog, id),
      tab = source.tabs.find((t) => t.tabId === tabId);
    if (!tab) fail(404, "Worksheet not found.");
    const values = await rows(company, source, tab, true);
    const header = headerRow ?? tab.config?.headerRow ?? suggestHeader(values);
    if (!Number.isInteger(header) || header < 0 || header > 99)
      fail(400, "Choose a header row from 1 to 100.");
    const headers = values
      .slice(header)
      .some((row) => row.some((v) => String(v ?? "").trim()))
      ? columns(values.slice(header))
      : [];
    return {
      sourceId: id,
      tabId,
      title: tab.title,
      parentTitle: source.title,
      headerRow: header,
      headers,
      preview: values.slice(header + 1, header + 7),
      profiles: profileColumns(headers, values.slice(header + 1, 101)),
      config: tab.config || null,
      department: tab.department || "",
      rawPreview: values.slice(0, 100),
    };
  }
  function refreshTable(values, config, before) {
    const table = validateTable(values, config, columns),
      props = config.properties || [],
      headers = columns(values.slice(config.headerRow));
    if (
      (config.headers && digest(config.headers) !== digest(headers)) ||
      (before && digest(before.headers) !== digest(table.headers))
    )
      throw Error(
        "Column names or their order changed. Review this page’s mapping before syncing. Your previous data is retained.",
      );
    if (props.includes("money_in") && props.includes("money_out"))
      table.financial = aggregate(
        validateRows(values, {
          date: headers[props.indexOf("date")],
          revenue: headers[props.indexOf("money_in")],
          expenses: headers[props.indexOf("money_out")],
          _headerRow: String(config.headerRow),
          _dateFormat: config.dateFormat,
        }),
        "all",
      );
    return table;
  }
  async function overview(company, actor, period) {
    const state = await read(company, actor),
      tables = [],
      relationships = [];
    let offset = 0;
    for (const source of state.catalog.sources) {
      const imported = source.tabs.filter((t) => t.table || t.financial);
      for (const relation of source.relationships || []) {
        const from = source.tabs[relation.from],
          to = source.tabs[relation.to];
        if (!from?.table || !to?.table) continue;
        const a = from.table.headers.indexOf(relation.fromColumn),
          b = to.table.headers.indexOf(relation.toColumn);
        if (a < 0 || b < 0) continue;
        const target = to.table.rows
            .map((row) => row[b])
            .filter((v) => v !== null),
          keys = new Set(target.map((v) => JSON.stringify(v)));
        if (keys.size !== target.length) continue;
        relationships.push({
          ...relation,
          from: offset + imported.indexOf(from),
          to: offset + imported.indexOf(to),
          matched: from.table.rows.filter((row) =>
            keys.has(JSON.stringify(row[a])),
          ).length,
        });
      }
      offset += imported.length;
    }
    for (const source of state.catalog.sources)
      for (const tab of source.tabs) {
        if (tab.table)
          tables.push({
            ...tab.table,
            parentTitle: source.title,
            department: tab.department || "",
            sourceId: source.id,
            tabId: tab.tabId,
            lastSuccess: tab.lastSuccess,
            changes: tab.changes,
            error: tab.error,
          });
        else if (tab.financial) {
          const data = aggregate(tab.financial, period || "all");
          tables.push({
            title: tab.title,
            parentTitle: source.title,
            department: tab.department || "",
            headers: ["Date", "Revenue", "Expenses"],
            types: ["date", "currency", "currency"],
            rows: data.points.map((p) => [p.date, p.revenue, p.costs]),
            rowCount: data.points.length,
            financial: data,
            sourceId: source.id,
            tabId: tab.tabId,
          });
        }
      }
    return tables.length
      ? {
          ...tableSummary({ tables, relationships }),
          sources: state.catalog.sources.map(summary),
        }
      : null;
  }
  return {
    read,
    list,
    status,
    overview,
    async handle({ company, actor, action, id, method, body }) {
      await member(company, actor, true);
      if (action === "sources" && method === "GET") return list(company, actor);
      if (action === "sources" && method === "POST") {
        let source;
        if (body.mode === "oauth") {
          const meta = await metadata(company, body.url);
          source = { id: randomUUID(), mode: "oauth", url: body.url, ...meta };
        } else if (body.mode === "public") {
          let url;
          try {
            url = publicSheetUrl(body.url);
          } catch (e) {
            fail(400, e.message);
          }
          await google.publicRows(url);
          source = {
            id: randomUUID(),
            mode: "public",
            url,
            title: String(body.title || "Shared spreadsheet").slice(0, 150),
            tabs: [{ tabId: 0, title: "Shared worksheet" }],
          };
        } else if (body.mode === "upload") {
          if (
            typeof body.name !== "string" ||
            !/^.{1,175}\.(xlsx|csv)$/i.test(body.name) ||
            !Array.isArray(body.sheets) ||
            !body.sheets.length ||
            body.sheets.length > 50
          )
            fail(400, "Choose an Excel or CSV workbook.");
          for (const sheet of body.sheets) {
            if (
              typeof sheet.name !== "string" ||
              !Array.isArray(sheet.rows) ||
              sheet.rows.length > 10101 ||
              sheet.rows.some(
                (row) =>
                  !Array.isArray(row) ||
                  row.length > 52 ||
                  row.some(
                    (v) =>
                      v !== null &&
                      (!["string", "number", "boolean"].includes(typeof v) ||
                        String(v).length > 10000),
                  ),
              )
            )
              fail(
                422,
                "Use up to 10,000 records and 52 columns per worksheet.",
              );
          }
          source = {
            id: randomUUID(),
            mode: "upload",
            title: body.name,
            tabs: body.sheets.map((s, i) => ({
              tabId: i,
              title: s.name.slice(0, 150),
            })),
            workbook: body.sheets.map((s, i) => ({ tabId: i, values: s.rows })),
          };
        } else fail(400, "Choose a connection method.");
        let selectedId = source.id;
        await mutate(company, actor, async (catalog) => {
          const existing = catalog.sources.find(
            (s) =>
              s.mode === source.mode &&
              (source.mode === "oauth"
                ? s.spreadsheet === source.spreadsheet
                : source.mode === "public"
                  ? s.url === source.url
                  : s.title === source.title),
          );
          if (existing) {
            selectedId = existing.id;
            const old = new Map(existing.tabs.map((t) => [t.tabId, t]));
            existing.tabs = source.tabs.map((t) => ({
              ...t,
              ...old.get(t.tabId),
              title: t.title,
            }));
            if (source.workbook) {
              existing.workbook = source.workbook;
              for (const tab of existing.tabs.filter(
                (t) => t.config && !t.config.legacyMapping,
              )) {
                try {
                  const table = refreshTable(
                    await rows(company, existing, tab),
                    tab.config,
                    tab.table,
                  );
                  tab.changes = changes(tab.table, table);
                  tab.table = table;
                  tab.error = null;
                  tab.lastSuccess = Date.now();
                } catch (error) {
                  tab.error = error.message;
                }
              }
            }
            existing.title = source.title;
            existing.url = source.url;
          } else {
            if (catalog.sources.length >= 10)
              fail(422, "Use up to 10 sources per workspace.");
            catalog.sources.push(source);
          }
        });
        return { ...(await list(company, actor)), selectedId };
      }
      if (action === "inspect" && method === "POST")
        return inspect(company, actor, id, body.tabId, body.headerRow);
      if (action === "skip" && method === "POST") {
        await mutate(company, actor, async (catalog) => {
          const source = getSource(catalog, id),
            tab = source.tabs.find((t) => t.tabId === body.tabId);
          if (!tab) fail(404, "Worksheet not found.");
          tab.skipped = !!body.skipped;
        });
        return list(company, actor);
      }
      if (action === "map" && method === "POST") {
        if (
          !Array.isArray(body.tables) ||
          !body.tables.length ||
          body.tables.length > 10
        )
          fail(400, "Choose up to 10 worksheet pages.");
        const membership = await member(company, actor, true),
          departments = membership.company.data.departments || [];
        await mutate(company, actor, async (catalog) => {
          const source = getSource(catalog, id),
            errors = [],
            prepared = [];
          for (const config of body.tables) {
            const tab = source.tabs.find((t) => t.tabId === config.tabId);
            if (!tab) {
              errors.push("Worksheet not found.");
              continue;
            }
            try {
              if (!departments.includes(config.department))
                throw Error("Choose one of your workspace departments.");
              const values = await rows(company, source, tab);
              const props = config.properties;
              if (!Array.isArray(props))
                throw Error("Choose a property for every column.");
              const types = props.map((p) =>
                ["money_in", "money_out"].includes(p) ? "currency" : p,
              );
              const clean = {
                title: tab.title,
                headerRow: config.headerRow ?? 0,
                dateFormat: config.dateFormat || "ymd",
                types,
                headers: columns(values.slice(config.headerRow ?? 0)),
              };
              const table = validateTable(values, clean, columns);
              let financial;
              const headers = columns(values.slice(clean.headerRow));
              const dateIndex = props.indexOf("date"),
                revenueIndex = props.indexOf("money_in"),
                expenseIndex = props.indexOf("money_out");
              if (revenueIndex >= 0 || expenseIndex >= 0) {
                if (
                  dateIndex < 0 ||
                  props.filter((p) => p === "date").length !== 1 ||
                  revenueIndex < 0 ||
                  expenseIndex < 0 ||
                  props.filter((p) => p === "money_in").length !== 1 ||
                  props.filter((p) => p === "money_out").length !== 1
                )
                  throw Error(
                    "For financial charts, assign Date, Money in and Money out once each. Otherwise choose Currency or Number.",
                  );
                financial = aggregate(
                  validateRows(values, {
                    date: headers[dateIndex],
                    revenue: headers[revenueIndex],
                    expenses: headers[expenseIndex],
                    _headerRow: String(clean.headerRow),
                    _dateFormat: clean.dateFormat,
                  }),
                  "all",
                );
                table.financial = financial;
              }
              prepared.push({
                tab,
                table,
                config: {
                  ...clean,
                  properties: props,
                  department: config.department,
                },
              });
            } catch (e) {
              errors.push(`${tab.title}: ${e.message}`);
            }
          }
          if (errors.length) fail(422, errors.join("\n"));
          for (const { tab, table, config } of prepared) {
            tab.changes = changes(tab.table, table);
            tab.table = table;
            tab.config = config;
            tab.department = config.department;
            tab.skipped = false;
            tab.error = null;
            tab.lastSuccess = Date.now();
          }
        });
        return list(company, actor);
      }
      if (action === "sync" && method === "POST") {
        await mutate(
          company,
          actor,
          async (catalog) => {
            const source = getSource(catalog, id);
            if (source.mode === "upload")
              fail(
                409,
                "Upload the updated workbook to refresh this source. Its other mapped sources stay connected.",
              );
            if (source.mode === "oauth") {
              const meta = await metadata(company, source.url);
              const old = new Map(source.tabs.map((t) => [t.tabId, t]));
              source.tabs = meta.tabs.map((t) => ({
                ...t,
                ...old.get(t.tabId),
                title: t.title,
              }));
              source.title = meta.title;
              for (const [key, tab] of old)
                if (!source.tabs.some((t) => t.tabId === key))
                  source.tabs.push({
                    ...tab,
                    error:
                      "This worksheet was removed from Google. Last saved data retained.",
                  });
            }
            let failed = 0;
            for (const tab of source.tabs.filter((t) => t.config)) {
              try {
                const values = await rows(company, source, tab);
                if (tab.config.legacyMapping) {
                  tab.financial = validateRows(
                    values,
                    tab.config.legacyMapping,
                  );
                  tab.lastSuccess = Date.now();
                  continue;
                }
                const table = refreshTable(values, tab.config, tab.table);
                tab.changes = changes(tab.table, table);
                tab.table = table;
                tab.error = null;
                tab.lastSuccess = Date.now();
              } catch (e) {
                tab.error = e.message;
                failed++;
              }
            }
            source.error = failed
              ? `${failed} worksheet${failed === 1 ? " needs" : "s need"} attention. Previous data is still visible.`
              : null;
            source.lastSuccess = Date.now();
          },
          true,
        );
        return list(company, actor);
      }
      if (action === "remove" && method === "DELETE") {
        await mutate(company, actor, async (catalog) => {
          getSource(catalog, id);
          catalog.sources = catalog.sources.filter((s) => s.id !== id);
        });
        return list(company, actor);
      }
      fail(405, "Method not allowed.");
    },
  };
}
function changes(before, after) {
  if (!before)
    return {
      added: after.rowCount,
      removed: 0,
      updated: 0,
      checked: Date.now(),
    };
  let updated = 0;
  for (let i = 0; i < Math.min(before.rows.length, after.rows.length); i++)
    if (digest(before.rows[i]) !== digest(after.rows[i])) updated++;
  return {
    added: Math.max(0, after.rowCount - before.rowCount),
    removed: Math.max(0, before.rowCount - after.rowCount),
    updated,
    checked: Date.now(),
  };
}
