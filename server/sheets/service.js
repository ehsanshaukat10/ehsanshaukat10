import {
  randomBytes,
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  sheetId,
  columns,
  validateRows,
  aggregate,
  publicSheetUrl,
  parseCSV,
} from "./validation.js";
const digest = (v) => createHash("sha256").update(v).digest("hex");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const scopes = "https://www.googleapis.com/auth/spreadsheets.readonly";
export function createSheetsService({
  db,
  membership,
  audit,
  env = process.env,
  fetchImpl = fetch,
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS sheet_oauth(state TEXT PRIMARY KEY,user_id TEXT,company_id TEXT,expires INTEGER);
    CREATE TABLE IF NOT EXISTS sheet_connections(company_id TEXT PRIMARY KEY,credentials TEXT NOT NULL,spreadsheet TEXT,tab_id INTEGER,tab_title TEXT,mapping TEXT,status TEXT NOT NULL DEFAULT 'connected',error TEXT,last_attempt INTEGER,last_success INTEGER,next_sync INTEGER DEFAULT 0,failures INTEGER DEFAULT 0,revision INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sheet_snapshots(company_id TEXT PRIMARY KEY,data TEXT NOT NULL,created INTEGER NOT NULL,revision INTEGER NOT NULL);`);
  if (
    !db
      .prepare("PRAGMA table_info(sheet_connections)")
      .all()
      .some((c) => c.name === "public_url")
  )
    db.exec("ALTER TABLE sheet_connections ADD COLUMN public_url TEXT");
  if (
    !db
      .prepare("PRAGMA table_info(sheet_connections)")
      .all()
      .some((c) => c.name === "generation")
  )
    db.exec(
      "ALTER TABLE sheet_connections ADD COLUMN generation TEXT NOT NULL DEFAULT ''",
    );
  for (const row of db
    .prepare("SELECT company_id FROM sheet_connections WHERE generation='' ")
    .all())
    db.prepare(
      "UPDATE sheet_connections SET generation=? WHERE company_id=?",
    ).run(randomUUID(), row.company_id);
  const get = (sql, ...args) => db.prepare(sql).get(...args),
    run = (sql, ...args) => db.prepare(sql).run(...args);
  const configured = () =>
    !!(
      env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REDIRECT_URI &&
      /^[a-f0-9]{64}$/i.test(env.SHEETS_ENCRYPTION_KEY || "")
    );
  const jobs = new Map(),
    listeners = new Map(),
    refreshes = new Map();
  const interval = Math.max(
    30000,
    Number(env.SHEETS_SYNC_INTERVAL_MS) || 60000,
  );
  function key() {
    if (!configured())
      fail(
        503,
        "Google Sheets is not configured. Set the OAuth credentials, callback URL and encryption key on the server.",
      );
    return Buffer.from(env.SHEETS_ENCRYPTION_KEY, "hex");
  }
  function seal(value) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key(), iv),
      encrypted = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
      ]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((v) => v.toString("base64"))
      .join(".");
  }
  function open(value) {
    const [iv, tag, data] = value
      .split(".")
      .map((v) => Buffer.from(v, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"),
    );
  }
  async function google(url, options = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      fail(
        502,
        "Google could not be reached. Your previous snapshot is retained; retry shortly.",
      );
    }
    const reader = response.body?.getReader();
    let length = 0,
      chunks = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 5 * 1024 * 1024) {
          await reader.cancel();
          fail(
            413,
            "The sheet response is too large. Use a smaller reporting tab.",
          );
        }
        chunks.push(Buffer.from(value));
      }
    }
    let data;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      fail(502, "Google returned an invalid response. Retry shortly.");
    }
    if (!response.ok) {
      if (response.status === 401 || data.error === "invalid_grant")
        fail(
          401,
          "Google access has expired or was revoked. Reconnect your account.",
        );
      if (response.status === 403)
        fail(
          403,
          "Google denied access. Check spreadsheet sharing and enable the Google Sheets API.",
        );
      if (response.status === 404)
        fail(404, "Spreadsheet or tab not found. Check the link and access.");
      if (response.status === 429)
        fail(
          429,
          "Google rate limit reached. Automatic sync will retry with backoff.",
        );
      fail(502, "Google could not complete this request. Retry shortly.");
    }
    return data;
  }
  async function publicRows(url) {
    let response,
      target = publicSheetUrl(url);
    try {
      for (let hop = 0; hop < 4; hop++) {
        response = await fetchImpl(target, {
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const next = new URL(response.headers.get("location") || "", target);
        if (
          next.protocol !== "https:" ||
          next.username ||
          next.password ||
          next.port ||
          !(
            next.hostname === "docs.google.com" ||
            /^[a-z0-9-]+\.googleusercontent\.com$/.test(next.hostname)
          )
        )
          fail(422, "Google returned an unsupported export redirect.");
        await response.body?.cancel();
        target = next.href;
      }
    } catch (error) {
      if (error.status) throw error;
      fail(
        502,
        "Published sheet could not be reached. Check that it is published as CSV.",
      );
    }
    if (!response.ok)
      fail(
        422,
        "Published sheet is unavailable. Publish the selected tab as CSV and retry.",
      );
    const reader = response.body.getReader();
    let chunks = [],
      size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        fail(413, "Published CSV exceeds 5 MB. Use a smaller reporting tab.");
      }
      chunks.push(Buffer.from(value));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (/^\s*</.test(text))
      fail(
        422,
        "Google returned a web page instead of CSV. Use a published CSV link.",
      );
    try {
      return parseCSV(text);
    } catch (error) {
      fail(422, error.message);
    }
  }
  async function access(company) {
    if (refreshes.has(company)) return refreshes.get(company);
    const job = (async () => {
      const connection = get(
        "SELECT * FROM sheet_connections WHERE company_id=?",
        company,
      );
      if (!connection)
        fail(409, "Connect Google before selecting a spreadsheet.");
      if (connection.public_url)
        fail(409, "Connect Google to inspect a private spreadsheet.");
      const credentials = open(connection.credentials);
      if (credentials.expires > Date.now() + 60000)
        return credentials.access_token;
      if (!credentials.refresh_token)
        fail(401, "Reconnect Google to allow automatic refresh.");
      const token = await google("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: credentials.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      if (!token.access_token)
        fail(502, "Google did not return a valid access token.");
      const refreshed = run(
        "UPDATE sheet_connections SET credentials=? WHERE company_id=? AND credentials=?",
        seal({
          ...credentials,
          ...token,
          expires: Date.now() + Number(token.expires_in || 3600) * 1000,
        }),
        company,
        connection.credentials,
      );
      if (!refreshed.changes)
        fail(
          409,
          "The Google connection changed during refresh. Retry with the current connection.",
        );
      return token.access_token;
    })();
    refreshes.set(company, job);
    try {
      return await job;
    } finally {
      refreshes.delete(company);
    }
  }
  async function read(company, path) {
    const token = await access(company);
    return google("https://sheets.googleapis.com/v4/spreadsheets/" + path, {
      headers: { Authorization: "Bearer " + token },
    });
  }
  function status(company) {
    const c = get(
        "SELECT * FROM sheet_connections WHERE company_id=?",
        company,
      ),
      snapshot = get(
        "SELECT created,revision FROM sheet_snapshots WHERE company_id=?",
        company,
      );
    return {
      configured: configured(),
      connected: !!c,
      mode: c?.public_url ? "public" : "oauth",
      spreadsheet: c?.spreadsheet || null,
      tabId: c?.tab_id ?? null,
      tabTitle: c?.tab_title || null,
      mapping: c?.mapping ? JSON.parse(c.mapping) : null,
      status: c?.status || "disconnected",
      error: c?.error || null,
      lastAttempt: c?.last_attempt || null,
      lastSuccess: c?.last_success || null,
      nextSync: c?.next_sync || null,
      revision: c?.revision || 0,
      hasSnapshot: !!snapshot,
      stale:
        !!snapshot &&
        (Date.now() - snapshot.created > interval * 3 || !!c?.error),
      intervalMs: interval,
    };
  }
  function emit(company) {
    for (const send of listeners.get(company) || []) send(status(company));
  }
  async function sync(company) {
    if (jobs.has(company)) return jobs.get(company);
    if (jobs.size >= 4) fail(429, "Sync capacity is busy. Retry shortly.");
    const task = (async () => {
      const c = get(
        "SELECT * FROM sheet_connections WHERE company_id=?",
        company,
      );
      if (!c?.spreadsheet || !c?.mapping)
        fail(409, "Choose a spreadsheet tab and save its field mapping first.");
      run(
        "UPDATE sheet_connections SET status='syncing',error=NULL,last_attempt=? WHERE company_id=?",
        Date.now(),
        company,
      );
      emit(company);
      try {
        const range = "'" + c.tab_title.replaceAll("'", "''") + "'!A1:BA10002";
        const rows = c.public_url
          ? { values: await publicRows(c.public_url) }
          : await read(
              company,
              `${c.spreadsheet}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
            );
        let snapshot;
        try {
          snapshot = validateRows(rows.values || [], JSON.parse(c.mapping));
        } catch (error) {
          fail(422, error.message);
        }
        // A source/configuration may be removed or remapped during an in-flight read.
        const current = get(
          "SELECT * FROM sheet_connections WHERE company_id=?",
          company,
        );
        if (
          !current ||
          current.revision !== c.revision ||
          current.generation !== c.generation
        )
          return;
        const now = Date.now(),
          revision = c.revision + 1;
        db.exec("BEGIN IMMEDIATE");
        try {
          run(
            "INSERT INTO sheet_snapshots VALUES(?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET data=excluded.data,created=excluded.created,revision=excluded.revision",
            company,
            JSON.stringify(snapshot),
            now,
            revision,
          );
          run(
            "UPDATE sheet_connections SET status='synced',error=NULL,last_success=?,next_sync=?,failures=0,revision=? WHERE company_id=?",
            now,
            now + interval,
            revision,
            company,
          );
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      } catch (error) {
        const current = get(
          "SELECT * FROM sheet_connections WHERE company_id=?",
          company,
        );
        if (
          current &&
          current.revision === c.revision &&
          current.generation === c.generation
        )
          run(
            "UPDATE sheet_connections SET status=?,error=?,failures=failures+1,next_sync=? WHERE company_id=?",
            error.status === 401 ? "reauth_required" : "error",
            error.status
              ? error.message
              : error.message?.startsWith("Row ")
                ? error.message
                : "Validation failed. Review source headers, dates and numeric values.",
            Date.now() +
              Math.min(900000, interval * 2 ** Math.min(c.failures + 1, 5)),
            company,
          );
      } finally {
        emit(company);
      }
    })();
    jobs.set(company, task);
    try {
      return await task;
    } finally {
      jobs.delete(company);
    }
  }
  const timer = setInterval(() => {
    for (const c of db
      .prepare(
        "SELECT s.company_id FROM sheet_connections s JOIN companies c ON c.id=s.company_id WHERE c.archived=0 AND s.mapping IS NOT NULL AND s.status!='reauth_required' AND (s.public_url IS NOT NULL OR ?) AND s.next_sync<=?",
      )
      .all(configured() ? 1 : 0, Date.now()))
      sync(c.company_id).catch(() => {});
  }, 5000);
  timer.unref();
  return {
    configured,
    sync,
    status,
    close() {
      clearInterval(timer);
    },
    async handle({ req, res, url, path, method, body, user, send }) {
      if (path === "/api/integrations/google/callback") {
        if (method !== "GET") fail(405, "Method not allowed.");
        const state = url.searchParams.get("state");
        const pending =
          state &&
          get(
            "DELETE FROM sheet_oauth WHERE state=? AND user_id=? AND expires>? RETURNING *",
            digest(state),
            user.id,
            Date.now(),
          );
        if (!pending)
          fail(
            400,
            "Google authorization expired or did not match your session. Start again.",
          );
        membership(pending.company_id, user.id, true);
        const destination =
          "/companies/" + pending.company_id + "/settings/connections";
        if (url.searchParams.has("error")) {
          res.writeHead(303, { Location: destination + "?google=cancelled" });
          res.end();
          return true;
        }
        const token = await google("https://oauth2.googleapis.com/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: env.GOOGLE_REDIRECT_URI,
            code: url.searchParams.get("code") || "",
            grant_type: "authorization_code",
          }),
        });
        if (!token.access_token || !token.scope?.split(" ").includes(scopes))
          fail(403, "Read-only spreadsheet permission was not granted.");
        // Never reuse a previous account refresh token after a new consent grant.
        if (!token.refresh_token)
          fail(
            409,
            "Google did not grant offline access. Revoke the previous grant and reconnect.",
          );
        const previous = get(
          "SELECT public_url FROM sheet_connections WHERE company_id=?",
          pending.company_id,
        );
        if (previous?.public_url) {
          run(
            "DELETE FROM sheet_connections WHERE company_id=?",
            pending.company_id,
          );
          run(
            "DELETE FROM sheet_snapshots WHERE company_id=?",
            pending.company_id,
          );
        }
        run(
          "INSERT INTO sheet_connections(company_id,credentials,generation) VALUES(?,?,?) ON CONFLICT(company_id) DO UPDATE SET credentials=excluded.credentials,generation=excluded.generation,public_url=NULL,status=CASE WHEN mapping IS NULL THEN 'connected' ELSE 'ready' END,error=NULL,next_sync=0,revision=revision+1",
          pending.company_id,
          seal({
            ...token,
            expires: Date.now() + Number(token.expires_in || 3600) * 1000,
          }),
          randomUUID(),
        );
        audit(pending.company_id, user.id, "sheets.authorized");
        emit(pending.company_id);
        res.writeHead(303, { Location: destination + "?google=connected" });
        res.end();
        return true;
      }
      const match = path.match(
        /^\/api\/companies\/([^/]+)\/sheets(?:\/(authorize|public|inspect|mapping|sync|overview|events))?$/,
      );
      if (!match) return false;
      const [, company, action] = match;
      const member = membership(company, user.id, action !== "overview");
      // This initial financial dataset is company-wide; scoped roles cannot read it.
      if (!["Owner", "Admin"].includes(member.role))
        fail(
          403,
          "An Owner or Admin is required to access company-wide financial data.",
        );
      if (!action && method === "GET") {
        send(status(company));
        return true;
      }
      if (action === "authorize" && method === "POST") {
        key();
        const redirect = new URL(env.GOOGLE_REDIRECT_URI);
        if (
          redirect.protocol !== "https:" &&
          !["localhost", "127.0.0.1"].includes(redirect.hostname)
        )
          fail(503, "Google callback must use HTTPS outside localhost.");
        run("DELETE FROM sheet_oauth WHERE expires<?", Date.now());
        const state = randomBytes(32).toString("hex");
        run(
          "INSERT INTO sheet_oauth VALUES(?,?,?,?)",
          digest(state),
          user.id,
          company,
          Date.now() + 600000,
        );
        const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        consent.search = new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          response_type: "code",
          scope: scopes,
          state,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        }).toString();
        send({ url: consent.href });
        return true;
      }
      if (action === "public" && method === "POST") {
        let url;
        try {
          url = publicSheetUrl(body.url);
        } catch (error) {
          fail(400, error.message);
        }
        const values = await publicRows(url);
        let headers;
        try {
          headers = columns(values);
        } catch (error) {
          fail(422, error.message);
        }
        if (jobs.has(company))
          fail(409, "A sync is running. Wait before replacing this source.");
        const id = new URL(url).pathname.split("/")[4];
        run(
          "INSERT INTO sheet_connections(company_id,credentials,spreadsheet,tab_id,tab_title,public_url,generation) VALUES(?, '', ?, 0, 'Published report', ?, ?) ON CONFLICT(company_id) DO UPDATE SET credentials='',spreadsheet=excluded.spreadsheet,tab_id=0,tab_title='Published report',public_url=excluded.public_url,generation=excluded.generation,mapping=NULL,status='connected',error=NULL,last_success=NULL,revision=revision+1",
          company,
          id,
          url,
          randomUUID(),
        );
        run("DELETE FROM sheet_snapshots WHERE company_id=?", company);
        audit(company, user.id, "sheets.public.connected");
        emit(company);
        send({
          spreadsheetId: id,
          title: "Published report",
          tabs: [{ sheetId: 0, title: "Published report" }],
          tabId: 0,
          tabTitle: "Published report",
          headers,
        });
        return true;
      }
      if (action === "inspect" && method === "POST") {
        let id;
        try {
          id = sheetId(body.url);
        } catch (error) {
          fail(400, error.message);
        }
        const metadata = await read(
          company,
          `${id}?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,sheetType))`,
        );
        const tabs = metadata.sheets
          .filter((s) => s.properties.sheetType === "GRID")
          .map((s) => s.properties);
        if (!tabs.length)
          fail(400, "This spreadsheet has no supported grid tabs.");
        const tab =
          body.tabId === undefined
            ? tabs[0]
            : tabs.find((t) => t.sheetId === body.tabId);
        if (!tab) fail(400, "Choose an available spreadsheet tab.");
        const result = await read(
          company,
          `${id}/values/${encodeURIComponent("'" + tab.title.replaceAll("'", "''") + "'!A1:BA1")}`,
        );
        let headers;
        try {
          headers = columns(result.values || []);
        } catch (error) {
          fail(422, error.message);
        }
        send({
          spreadsheetId: id,
          title: metadata.properties.title,
          tabs,
          tabId: tab.sheetId,
          tabTitle: tab.title,
          headers,
        });
        return true;
      }
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
        const current = get(
          "SELECT * FROM sheet_connections WHERE company_id=?",
          company,
        );
        if (current?.public_url && body.spreadsheetId !== current.spreadsheet)
          fail(409, "Inspect the published source again before mapping.");
        let id;
        try {
          id =
            current?.public_url && body.spreadsheetId === current.spreadsheet
              ? current.spreadsheet
              : sheetId(body.spreadsheetId);
        } catch (error) {
          fail(400, error.message);
        }
        // Recheck metadata server-side; never trust a client-supplied range or tab title.
        const metadata = current?.public_url
          ? {
              sheets: [
                {
                  properties: {
                    sheetId: 0,
                    title: "Published report",
                    sheetType: "GRID",
                  },
                },
              ],
            }
          : await read(
              company,
              `${id}?fields=sheets(properties(sheetId,title,sheetType))`,
            );
        const tab = metadata.sheets.find(
          (s) =>
            s.properties.sheetId === body.tabId &&
            s.properties.sheetType === "GRID",
        )?.properties;
        if (!tab)
          fail(
            400,
            "The selected tab no longer exists. Inspect the spreadsheet again.",
          );
        if (jobs.has(company))
          fail(
            409,
            "A sync is running. Wait for it to finish before changing mapping.",
          );
        run(
          "UPDATE sheet_connections SET spreadsheet=?,tab_id=?,tab_title=?,mapping=?,generation=?,status='ready',error=NULL,last_success=NULL,last_attempt=NULL,next_sync=0,revision=revision+1 WHERE company_id=?",
          id,
          tab.sheetId,
          tab.title,
          JSON.stringify(mapping),
          randomUUID(),
          company,
        );
        // Never display a different source under newly edited mapping.
        run("DELETE FROM sheet_snapshots WHERE company_id=?", company);
        audit(company, user.id, "sheets.mapping.updated");
        emit(company);
        void sync(company).catch(() => {});
        send(status(company), 202);
        return true;
      }
      if (action === "sync" && method === "POST") {
        if (jobs.size >= 4 && !jobs.has(company))
          fail(429, "Sync capacity is busy. Retry shortly.");
        const c = get(
          "SELECT * FROM sheet_connections WHERE company_id=?",
          company,
        );
        if (!c?.mapping) fail(409, "Save a mapping first.");
        if (
          c.last_attempt &&
          Date.now() - c.last_attempt < 10000 &&
          !jobs.has(company)
        )
          fail(429, "Wait 10 seconds before requesting another sync.");
        void sync(company).catch(() => {});
        send(status(company), 202);
        return true;
      }
      if (action === "overview" && method === "GET") {
        const snapshot = get(
          "SELECT * FROM sheet_snapshots WHERE company_id=?",
          company,
        );
        let data = null;
        if (snapshot) {
          try {
            data = aggregate(
              JSON.parse(snapshot.data),
              url.searchParams.get("period") || "quarter",
            );
          } catch (error) {
            fail(400, error.message);
          }
        }
        send({ source: status(company), data });
        return true;
      }
      if (action === "events" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
        const sendEvent = (data) => {
          try {
            membership(company, user.id, true);
            res.write("event: sync\ndata: " + JSON.stringify(data) + "\n\n");
          } catch {
            res.end();
          }
        };
        if (!listeners.has(company)) listeners.set(company, new Set());
        listeners.get(company).add(sendEvent);
        sendEvent(status(company));
        const heartbeat = setInterval(() => {
          const session = req.headers.cookie?.match(
            /(?:^|;\s*)aynor_session=([^;]+)/,
          )?.[1];
          if (
            !session ||
            !get(
              "SELECT token FROM sessions WHERE token=? AND expires>?",
              digest(session),
              Date.now(),
            )
          )
            return res.end();
          try {
            membership(company, user.id, true);
            res.write(": heartbeat\n\n");
          } catch {
            res.end();
          }
        }, 15000);
        heartbeat.unref();
        res.on("close", () => {
          clearInterval(heartbeat);
          listeners.get(company)?.delete(sendEvent);
          if (!listeners.get(company)?.size) listeners.delete(company);
        });
        return true;
      }
      if (!action && method === "DELETE") {
        run("DELETE FROM sheet_connections WHERE company_id=?", company);
        run("DELETE FROM sheet_snapshots WHERE company_id=?", company);
        run("DELETE FROM sheet_oauth WHERE company_id=?", company);
        audit(company, user.id, "sheets.disconnected");
        emit(company);
        send({ ok: true });
        return true;
      }
      fail(405, "Method not allowed.");
    },
  };
}
