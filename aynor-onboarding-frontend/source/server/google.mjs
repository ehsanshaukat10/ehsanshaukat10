import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { fail } from "./database.mjs";
import { publicSheetUrl, parseCSV } from "./sheets-validation.mjs";
export const scope = "https://www.googleapis.com/auth/spreadsheets.readonly";
export function createGoogle({ db, env = process.env, fetchImpl = fetch }) {
  const configured = () =>
    !!(
      env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REDIRECT_URI &&
      /^[a-f0-9]{64}$/i.test(env.SHEETS_ENCRYPTION_KEY || "")
    );
  function key() {
    if (!configured())
      fail(
        503,
        "Private Sheets requires Google OAuth credentials and a 64-character hexadecimal encryption key. Published sheets need neither.",
      );
    return Buffer.from(env.SHEETS_ENCRYPTION_KEY, "hex");
  }
  function seal(value) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key(), iv),
      data = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
      ]);
    return [iv, cipher.getAuthTag(), data]
      .map((v) => v.toString("base64"))
      .join(".");
  }
  function open(value) {
    try {
      const [iv, tag, data] = value
          .split(".")
          .map((v) => Buffer.from(v, "base64")),
        decipher = createDecipheriv("aes-256-gcm", key(), iv);
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([decipher.update(data), decipher.final()]).toString(),
      );
    } catch (error) {
      if (error.status) throw error;
      fail(
        503,
        "Stored Google credentials could not be read. Check the encryption key or reconnect.",
      );
    }
  }
  async function text(response) {
    const reader = response.body?.getReader(),
      chunks = [];
    let size = 0;
    try {
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 5 * 1024 * 1024) {
            await reader.cancel();
            fail(413, "Source exceeds 5 MB. Use a smaller reporting tab.");
          }
          chunks.push(Buffer.from(value));
        }
    } catch (error) {
      if (error.status) throw error;
      fail(
        502,
        "Source read interrupted. Previous data is retained; retry shortly.",
      );
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function fetchGoogle(url, options = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(18000),
      });
    } catch {
      fail(502, "Google could not be reached. Retry shortly.");
    }
    let data;
    try {
      data = JSON.parse(await text(response));
    } catch (error) {
      if (error.status) throw error;
      fail(502, "Google returned an invalid response.");
    }
    if (!response.ok) {
      if (response.status === 401 || data.error === "invalid_grant")
        fail(401, "Google access expired or was revoked. Reconnect Google.");
      if (response.status === 403)
        fail(
          403,
          "Google denied access. Check spreadsheet sharing and enable Sheets API.",
        );
      if (response.status === 404) fail(404, "Spreadsheet or tab not found.");
      if (response.status === 429)
        fail(429, "Google rate limit reached. Wait before syncing again.");
      fail(502, "Google could not complete the request. Retry shortly.");
    }
    return data;
  }
  async function access(company) {
    const c = await db.one("sheet_connections", {
      company_id: "eq." + company,
    });
    if (!c || c.public_url)
      fail(409, "Connect Google before reading private sheets.");
    const credentials = open(c.credentials);
    if (credentials.expires > Date.now() + 60000)
      return credentials.access_token;
    if (!credentials.refresh_token)
      fail(401, "Reconnect Google to enable offline access.");
    const token = await fetchGoogle("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: credentials.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    if (!token.access_token) fail(502, "Google returned no access token.");
    const changed = await db.update(
      "sheet_connections",
      { company_id: "eq." + company, credentials: "eq." + c.credentials },
      {
        credentials: seal({
          ...credentials,
          ...token,
          expires: Date.now() + Number(token.expires_in || 3600) * 1000,
        }),
      },
    );
    if (!changed?.length) {
      const current = await db.one("sheet_connections", {
        company_id: "eq." + company,
      });
      if (!current || current.generation !== c.generation)
        fail(409, "Connection changed. Retry.");
      return open(current.credentials).access_token;
    }
    return token.access_token;
  }
  async function read(company, path) {
    return fetchGoogle(
      "https://sheets.googleapis.com/v4/spreadsheets/" + path,
      { headers: { Authorization: "Bearer " + (await access(company)) } },
    );
  }
  async function publicRows(input) {
    let url;
    try {
      url = publicSheetUrl(input);
    } catch (error) {
      fail(400, error.message);
    }
    let response;
    for (let i = 0; i < 4; i++) {
      try {
        response = await fetchImpl(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(18000),
        });
      } catch {
        fail(502, "Published sheet could not be reached.");
      }
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const next = new URL(response.headers.get("location") || "", url);
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
        fail(422, "Unsupported source redirect.");
      await response.body?.cancel();
      url = next.href;
    }
    if (!response.ok)
      fail(
        422,
        "Published CSV is unavailable. Check its publication settings.",
      );
    const value = await text(response);
    if (/^\s*</.test(value))
      fail(422, "Use the published CSV link, not a Google web page.");
    try {
      return parseCSV(value);
    } catch (error) {
      fail(422, error.message);
    }
  }
  return { configured, seal, open, fetchGoogle, read, publicRows };
}
