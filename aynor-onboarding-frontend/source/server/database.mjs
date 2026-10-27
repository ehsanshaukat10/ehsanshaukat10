export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function createDatabase({ env = process.env, fetchImpl = fetch } = {}) {
  const base = env.SUPABASE_URL,
    secret = env.SUPABASE_SECRET_KEY;
  function config() {
    let url;
    try {
      url = new URL(base);
    } catch {
      fail(503, "Set SUPABASE_URL in Vercel.");
    }
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".supabase.co") ||
      url.pathname !== "/" ||
      url.username ||
      url.password
    )
      fail(
        503,
        "SUPABASE_URL must be the HTTPS project address, without /rest.",
      );
    if (!secret || secret.startsWith("sb_publishable_"))
      fail(503, "Set the backend SUPABASE_SECRET_KEY in Vercel.");
    return url;
  }
  async function request(
    path,
    { method = "GET", body, query = {}, prefer = "return=representation" } = {},
  ) {
    const url = new URL("/rest/v1/" + path, config());
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          apikey: secret,
          ...(secret.startsWith("eyJ")
            ? { Authorization: "Bearer " + secret }
            : {}),
          "Content-Type": "application/json",
          Prefer: prefer,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
    } catch {
      fail(503, "Database connection unavailable. Retry shortly.");
    }
    let result;
    try {
      const text = await response.text();
      result = text ? JSON.parse(text) : null;
    } catch {
      fail(503, "Database returned an invalid response.");
    }
    if (!response.ok) {
      const known = /^(400|403|404|409|410|429):(.+)$/.exec(
        result?.message || "",
      );
      if (known) fail(Number(known[1]), known[2]);
      if (result?.code === "23505")
        fail(409, "This record already exists. Reload and try again.");
      if (["42P01", "PGRST202", "PGRST205"].includes(result?.code))
        fail(
          503,
          "Database setup is incomplete. Run both AYNOR Supabase setup scripts.",
        );
      // Provider messages/details can contain record values or password hashes.
      // Report only an allowlisted code and our fixed operation identifier.
      const code = /^[A-Z0-9_]{1,20}$/.test(String(result?.code || ""))
        ? String(result.code)
        : `HTTP_${response.status}`;
      const operation = /^[a-z_]+(?:\/[a-z_]+)?$/.test(path)
        ? `${method} ${path}`
        : method;
      const reference = `${operation}; ${code}`;
      console.error("Supabase request failed", {
        method,
        operation: path,
        code,
        status: response.status,
      });
      if (code === "42501")
        fail(
          503,
          `Supabase denied database permissions (${reference}). The AYNOR server-role grants or row security need checking.`,
        );
      if (code === "PGRST204")
        fail(
          503,
          `Supabase does not recognize a required database column (${reference}). The schema or API schema cache needs checking.`,
        );
      if (response.status === 401 || code === "PGRST301")
        fail(
          503,
          `Supabase rejected the server credential (${reference}). Check the deployed SUPABASE_URL and SUPABASE_SECRET_KEY.`,
        );
      fail(
        503,
        `Database request failed (${reference}). No password or source data is included in this error.`,
      );
    }
    return result;
  }
  const table = (name) => "aynor_" + name;
  return {
    request,
    rows: (name, query = {}) =>
      request(table(name), { query: { select: "*", limit: 1001, ...query } }),
    async one(name, query = {}) {
      return (
        (
          await request(table(name), {
            query: { select: "*", limit: 1, ...query },
          })
        )?.[0] || null
      );
    },
    insert: (name, body, options = {}) =>
      request(table(name), { method: "POST", body, ...options }),
    update: (name, query, body) =>
      request(table(name), { method: "PATCH", query, body }),
    remove: (name, query) => request(table(name), { method: "DELETE", query }),
    rpc: (name, body) => request("rpc/aynor_" + name, { method: "POST", body }),
  };
}
