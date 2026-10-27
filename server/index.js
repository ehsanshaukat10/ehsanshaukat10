import { createSheetsService } from "./sheets/service.js";
import http from "node:http";
import { z } from "zod";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
const production = process.env.NODE_ENV === "production";
const dir = process.env.DATA_DIR || ".data";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(`${dir}/aynor.sqlite`);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,password TEXT,verified INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,profile TEXT,data TEXT,version INTEGER DEFAULT 1,archived INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS members(company_id TEXT,user_id TEXT,role TEXT,scope TEXT DEFAULT '[]',PRIMARY KEY(company_id,user_id));
CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,company_id TEXT,email TEXT,role TEXT,scope TEXT,token TEXT UNIQUE,expires INTEGER,status TEXT,inviter TEXT);
CREATE TABLE IF NOT EXISTS challenges(token TEXT PRIMARY KEY,user_id TEXT,type TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,company_id TEXT,user_id TEXT,action TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS mutations(user_id TEXT,key TEXT,result TEXT,PRIMARY KEY(user_id,key));`);
const q = (s, ...a) => db.prepare(s).get(...a);
const all = (s, ...a) => db.prepare(s).all(...a);
const run = (s, ...a) => db.prepare(s).run(...a);
const hash = (t) => createHash("sha256").update(t).digest("hex");
const password = (p) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
};
const validPassword = (p, s) => {
  const [salt, key] = s.split(":");
  return timingSafeEqual(Buffer.from(key, "hex"), scryptSync(p, salt, 64));
};
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const email = (e) =>
  typeof e === "string" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) &&
  e.length < 255;
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  verified: !!u.verified,
});
const audit = (c, u, a) =>
  run("INSERT INTO audit VALUES(?,?,?,?,?)", randomUUID(), c, u, a, Date.now());
const manager = (r) => ["Owner", "Admin"].includes(r);
const workspaceSchema = z.object({
  departments: z.array(z.string().trim().min(1).max(80)).max(100),
  priorities: z.array(z.string().trim().min(1).max(100)).max(100),
  sources: z
    .array(
      z.enum([
        "Business performance · 2026",
        "Project delivery tracker",
        "Team & capacity",
      ]),
    )
    .max(3),
  mappings: z
    .array(
      z.object({
        field: z.string().min(1).max(150),
        department: z.string().max(80),
        meaning: z.string().max(150),
        confirmed: z.boolean(),
        ignored: z.boolean().optional(),
      }),
    )
    .max(200),
  kpis: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        department: z.string().max(80),
        target: z.string().max(50),
        period: z.enum(["Monthly", "Quarterly", "Yearly"]),
        enabled: z.boolean(),
        calculation: z.string().max(1000),
      }),
    )
    .max(100),
  goals: z
    .array(
      z.object({
        id: z.string().uuid(),
        description: z.string().max(2000).optional(),
        name: z.string().min(1).max(150),
        kpi: z.string().max(100),
        target: z.string().max(50),
        deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        owner: z.string().max(100),
      }),
    )
    .max(100),
  steps: z.record(
    z.string().max(30),
    z.enum([
      "not started",
      "completed",
      "skipped",
      "in progress",
      "needs review",
    ]),
  ),
  step: z.enum([
    "departments",
    "priorities",
    "integrations",
    "sources",
    "discovery",
    "mapping",
    "readiness",
    "kpis",
    "goals",
    "invite",
    "review",
    "complete",
    "company",
  ]),
  completed: z.boolean(),
  demo: z.boolean().optional(),
  discovered: z.boolean().optional(),
  connected: z.boolean().optional(),
});

function membership(c, u, edit = false) {
  const m = q("SELECT * FROM members WHERE company_id=? AND user_id=?", c, u);
  if (!m) fail(403, "You do not have access to this workspace.");
  const company = q("SELECT * FROM companies WHERE id=? AND archived=0", c);
  if (!company) fail(404, "This workspace is unavailable.");
  if (edit && !manager(m.role))
    fail(403, "An Owner or Admin is required for this action.");
  return { ...m, company };
}
function view(c, u) {
  const m = membership(c, u);
  let data = JSON.parse(m.company.data);
  if (!manager(m.role)) {
    data = {
      departments: ["Viewer", "Department Manager"].includes(m.role)
        ? data.departments.filter((d) => JSON.parse(m.scope).includes(d))
        : data.departments,
      completed: data.completed,
      step: data.step,
    };
  }
  return {
    id: c,
    ...JSON.parse(m.company.profile),
    data,
    role: m.role,
    scope: JSON.parse(m.scope),
    version: m.company.version,
  };
}
const limits = new Map();
function rate(key, max = 25) {
  const now = Date.now();
  const v = limits.get(key) || { n: 0, t: now };
  if (now - v.t > 600000) {
    v.n = 0;
    v.t = now;
  }
  if (++v.n > max)
    fail(429, "Too many attempts. Please try again in ten minutes.");
  limits.set(key, v);
}
function challenge(u, type) {
  const token = randomBytes(32).toString("hex");
  run("DELETE FROM challenges WHERE user_id=? AND type=?", u, type);
  run(
    "INSERT INTO challenges VALUES(?,?,?,?)",
    hash(token),
    u,
    type,
    Date.now() + 1800000,
  );
  return production ? {} : { developmentToken: token };
}
const sheets = createSheetsService({ db, membership, audit });
async function api(req, res) {
  let cookie;
  const send = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const method = req.method;
    let b = {};
    if (!["GET", "HEAD"].includes(method)) {
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`
      )
        fail(403, "Request origin does not match this application.");
      if (req.headers["sec-fetch-site"] === "cross-site")
        fail(403, "Cross-site request rejected.");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 200000) fail(413, "Request is too large.");
      }
      try {
        b = raw ? JSON.parse(raw) : {};
      } catch {
        fail(400, "Invalid request.");
      }
    }
    const sessionToken = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("aynor_session="))
      ?.slice(14);
    const session = sessionToken
      ? q(
          "SELECT * FROM sessions WHERE token=? AND expires>?",
          hash(sessionToken),
          Date.now(),
        )
      : null;
    const user = session
      ? q("SELECT * FROM users WHERE id=?", session.user_id)
      : null;
    const login = (u) => {
      const token = randomBytes(32).toString("hex");
      run(
        "INSERT INTO sessions VALUES(?,?,?)",
        hash(token),
        u.id,
        Date.now() + 86400000 * 7,
      );
      cookie = `aynor_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${production ? "; Secure" : ""}`;
    };
    if (path === "/api/config")
      return send({
        development: !production,
        googleOAuth: sheets.configured(),
        publicSheets: true,
        developmentSession:
          !production && process.env.ENABLE_DEV_SESSION === "true",
        emailDelivery: false,
      });
    if (path === "/api/dev/session" && method === "POST") {
      const hostname = new URL(`http://${req.headers.host}`).hostname;
      if (
        production ||
        process.env.ENABLE_DEV_SESSION !== "true" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress,
        )
      )
        fail(
          403,
          "Development access is disabled outside explicitly enabled localhost development.",
        );
      rate("dev:" + req.socket.remoteAddress, 10);
      // A random, HttpOnly session, not a shared public demo account.
      if (user) return send({ user: safeUser(user) });
      const id = randomUUID();
      run(
        "INSERT INTO users(id,email,name,password,verified) VALUES(?,?,?,?,1)",
        id,
        `${id}@development.invalid`,
        "Developer",
        password(randomBytes(32).toString("hex")),
      );
      const developer = q("SELECT * FROM users WHERE id=?", id);
      login(developer);
      return send({ user: safeUser(developer) }, 201);
    }
    if (path === "/api/auth/signup" && method === "POST") {
      if (production)
        fail(
          503,
          "Email delivery is not configured. Signup is disabled in production.",
        );
      rate(req.socket.remoteAddress + ":signup", 10);
      if (
        !email(b.email) ||
        !b.name?.trim() ||
        typeof b.password !== "string" ||
        b.password.length < 10 ||
        b.password.length > 200
      )
        fail(
          400,
          "Use a valid email, your name, and a password of 10–200 characters.",
        );
      if (q("SELECT id FROM users WHERE email=?", b.email.toLowerCase()))
        fail(409, "An account with this email already exists. Please sign in.");
      const u = {
        id: randomUUID(),
        name: b.name.trim().slice(0, 100),
        email: b.email.toLowerCase(),
        verified: 0,
      };
      run(
        "INSERT INTO users(id,email,name,password) VALUES(?,?,?,?)",
        u.id,
        u.email,
        u.name,
        password(b.password),
      );
      login(u);
      return send({ user: safeUser(u), ...challenge(u.id, "verify") }, 201);
    }
    if (path === "/api/auth/login" && method === "POST") {
      rate(req.socket.remoteAddress + ":login");
      const u = email(b.email)
        ? q("SELECT * FROM users WHERE email=?", b.email.toLowerCase())
        : null;
      if (
        !u ||
        typeof b.password !== "string" ||
        b.password.length > 200 ||
        !validPassword(b.password, u.password)
      )
        fail(401, "Email or password is incorrect.");
      login(u);
      return send({ user: safeUser(u) });
    }
    if (path === "/api/auth/recover" && method === "POST") {
      rate(req.socket.remoteAddress + ":recover", 8);
      if (production)
        fail(
          503,
          "Password recovery email is not configured. Contact your administrator.",
        );
      if (!email(b.email)) fail(400, "Enter a valid email address.");
      const u = q("SELECT * FROM users WHERE email=?", b.email.toLowerCase());
      const result = u ? challenge(u.id, "reset") : {};
      return send({
        message: "If an account exists, a reset link will be sent.",
        ...result,
      });
    }
    if (path === "/api/auth/reset" && method === "POST") {
      rate(req.socket.remoteAddress + ":reset");
      const c = q(
        "SELECT * FROM challenges WHERE token=? AND type=? AND expires>?",
        hash(String(b.token)),
        "reset",
        Date.now(),
      );
      if (!c)
        fail(400, "This reset link is invalid or expired. Request another.");
      if (
        typeof b.password !== "string" ||
        b.password.length < 10 ||
        b.password.length > 200
      )
        fail(400, "Use a password of 10–200 characters.");
      run(
        "UPDATE users SET password=? WHERE id=?",
        password(b.password),
        c.user_id,
      );
      run("DELETE FROM challenges WHERE token=?", c.token);
      run("DELETE FROM sessions WHERE user_id=?", c.user_id);
      return send({ ok: true });
    }
    if (path === "/api/session")
      return send({ user: user ? safeUser(user) : null });
    if (!user) fail(401, "Your session has expired. Please sign in.");
    if (path === "/api/auth/logout" && method === "POST") {
      run("DELETE FROM sessions WHERE token=?", hash(sessionToken));
      cookie = "aynor_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
      return send({ ok: true });
    }
    if (path === "/api/auth/resend" && method === "POST") {
      if (production) fail(503, "Email delivery is not configured.");
      rate(user.id + ":resend", 5);
      return send(challenge(user.id, "verify"));
    }
    if (path === "/api/auth/verify" && method === "POST") {
      rate(user.id + ":verify");
      const c = q(
        "SELECT * FROM challenges WHERE token=? AND user_id=? AND type=? AND expires>?",
        hash(String(b.token)),
        user.id,
        "verify",
        Date.now(),
      );
      if (!c) fail(400, "The verification code is invalid or expired.");
      run("UPDATE users SET verified=1 WHERE id=?", user.id);
      run("DELETE FROM challenges WHERE token=?", c.token);
      return send({ user: { ...safeUser(user), verified: true } });
    }
    if (!user.verified)
      fail(403, "Verify your email before accessing workspaces.");
    if (path === "/api/companies" && method === "GET")
      return send(
        all("SELECT company_id FROM members WHERE user_id=?", user.id)
          .filter((m) =>
            q(
              "SELECT id FROM companies WHERE id=? AND archived=0",
              m.company_id,
            ),
          )
          .map((m) => view(m.company_id, user.id)),
      );
    if (path === "/api/companies" && method === "POST") {
      if (
        !b.name?.trim() ||
        !b.industry ||
        !b.country ||
        !b.currency ||
        !b.timezone
      )
        fail(400, "Complete all required company details.");
      if (b.website && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(b.website))
        fail(400, "Use a full website address beginning with https://.");
      try {
        new Intl.DateTimeFormat("en", { timeZone: b.timezone });
      } catch {
        fail(400, "Choose a valid time zone.");
      }
      const key = req.headers["idempotency-key"];
      if (key) {
        const prev = q(
          "SELECT result FROM mutations WHERE user_id=? AND key=?",
          user.id,
          key,
        );
        if (prev) return send(JSON.parse(prev.result));
      }
      const id = randomUUID();
      const profile = {
        name: b.name.trim().slice(0, 120),
        industry: b.industry,
        country: b.country,
        currency: b.currency,
        timezone: b.timezone,
        website: b.website || "",
        size: b.size || "",
        businessModel:
          typeof b.businessModel === "string"
            ? b.businessModel.slice(0, 80)
            : "",
      };
      run(
        "INSERT INTO companies(id,profile,data) VALUES(?,?,?)",
        id,
        JSON.stringify(profile),
        JSON.stringify({
          departments: [],
          priorities: [],
          sources: [],
          mappings: [],
          kpis: [],
          goals: [],
          steps: {},
          step: "departments",
          completed: false,
        }),
      );
      run(
        "INSERT INTO members(company_id,user_id,role) VALUES(?,?,?)",
        id,
        user.id,
        "Owner",
      );
      audit(id, user.id, "company.created");
      const result = view(id, user.id);
      if (key)
        run(
          "INSERT INTO mutations VALUES(?,?,?)",
          user.id,
          key,
          JSON.stringify(result),
        );
      return send(result, 201);
    }
    if (path === "/api/invitations" && method === "GET")
      return send(
        all(
          "SELECT i.id,i.company_id,i.email,i.role,i.scope,i.status,i.expires,c.profile FROM invites i JOIN companies c ON c.id=i.company_id WHERE i.email=? AND i.status='pending' AND c.archived=0",
          user.email,
        ).map((i) => ({
          ...i,
          company: JSON.parse(i.profile).name,
          profile: undefined,
        })),
      );
    const inv = path.match(
      /^\/api\/invitations\/([^/]+)(?:\/(accept|decline))?$/,
    );
    if (inv) {
      const i = q(
        "SELECT * FROM invites WHERE id=? OR token=?",
        inv[1],
        hash(inv[1]),
      );
      if (!i) fail(404, "Invitation not found or revoked.");
      if (i.email !== user.email)
        fail(
          403,
          "Sign in with the email address this invitation was sent to.",
        );
      if (i.status !== "pending")
        fail(409, `This invitation has been ${i.status}.`);
      if (i.expires < Date.now())
        fail(410, "This invitation has expired. Ask the inviter to resend it.");
      const c = q(
        "SELECT * FROM companies WHERE id=? AND archived=0",
        i.company_id,
      );
      if (!c) fail(404, "This company is no longer available.");
      if (method === "GET")
        return send({
          id: i.id,
          company: JSON.parse(c.profile).name,
          role: i.role,
          scope: JSON.parse(i.scope),
          inviter: q("SELECT name FROM users WHERE id=?", i.inviter)?.name,
        });
      if (method === "POST" && inv[2]) {
        if (inv[2] === "accept") {
          run(
            "INSERT OR IGNORE INTO members VALUES(?,?,?,?)",
            i.company_id,
            user.id,
            i.role,
            i.scope,
          );
          run(
            "UPDATE invites SET status='accepted' WHERE id=? AND status='pending'",
            i.id,
          );
          audit(i.company_id, user.id, "invitation.accepted");
        } else run("UPDATE invites SET status='declined' WHERE id=?", i.id);
        return send({ companyId: i.company_id });
      }
    }
    if (
      await sheets.handle({ req, res, url, path, method, body: b, user, send })
    )
      return;
    const match = path.match(
      /^\/api\/companies\/([^/]+)(?:\/(members|invitations|leave|archive|profile))?(?:\/([^/]+))?$/,
    );
    if (match) {
      const [, id, resource, item] = match;
      if (!resource && method === "GET") return send(view(id, user.id));
      if (!resource && method === "PATCH") {
        const m = membership(id, user.id, true);
        if (b.version !== m.company.version)
          fail(
            409,
            "This workspace changed in another tab. Reload before saving.",
          );
        const parsed = workspaceSchema.safeParse(b.data);
        if (!parsed.success)
          fail(
            400,
            "Invalid workspace configuration. Check the field values and try again.",
          );
        const data = parsed.data;
        if (!data || typeof data !== "object" || Array.isArray(data))
          fail(400, "Invalid workspace configuration.");
        for (const key of [
          "departments",
          "priorities",
          "sources",
          "mappings",
          "kpis",
          "goals",
        ])
          if (!Array.isArray(data[key])) fail(400, `Invalid ${key}.`);
        if (
          data.departments.some(
            (x) => typeof x !== "string" || !x.trim() || x.length > 80,
          ) ||
          new Set(data.departments.map((x) => x.toLowerCase())).size !==
            data.departments.length
        )
          fail(
            400,
            "Departments must have unique names of up to 80 characters.",
          );
        if (data.sources.length && (!data.demo || !data.connected))
          fail(
            400,
            "Live Google Sheets is not configured. Use the labeled sample adapter.",
          );
        if (
          data.mappings.some(
            (x) => !data.departments.includes(x.department) && !x.ignored,
          )
        )
          fail(400, "Resolve mappings for removed departments before saving.");
        const updated = run(
          "UPDATE companies SET data=?,version=version+1 WHERE id=? AND version=?",
          JSON.stringify(data),
          id,
          b.version,
        );
        if (!updated.changes)
          fail(409, "Concurrent update. Reload and try again.");
        audit(id, user.id, "configuration.updated");
        return send(view(id, user.id));
      }
      if (resource === "profile" && method === "PATCH") {
        const m = membership(id, user.id, true);
        if (b.version !== m.company.version)
          fail(409, "This company changed. Reload before saving.");
        if (
          !b.name?.trim() ||
          !b.industry ||
          !b.country ||
          !b.currency ||
          !b.timezone
        )
          fail(400, "Complete all required company details.");
        if (b.website && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(b.website))
          fail(400, "Enter a valid full website URL.");
        try {
          new Intl.DateTimeFormat("en", { timeZone: b.timezone });
        } catch {
          fail(400, "Choose a valid time zone.");
        }
        run(
          "UPDATE companies SET profile=?,version=version+1 WHERE id=?",
          JSON.stringify({
            name: b.name.trim().slice(0, 120),
            industry: b.industry,
            country: b.country,
            currency: b.currency,
            timezone: b.timezone,
            website: b.website || "",
            size: b.size || "",
            businessModel:
              typeof b.businessModel === "string"
                ? b.businessModel.slice(0, 80)
                : "",
          }),
          id,
        );
        audit(id, user.id, "company.profile.updated");
        return send(view(id, user.id));
      }
      if (resource === "members") {
        const m = membership(id, user.id, true);
        if (method === "GET")
          return send(
            all(
              "SELECT u.id,u.name,u.email,m.role,m.scope FROM members m JOIN users u ON u.id=m.user_id WHERE m.company_id=?",
              id,
            ).map((x) => ({ ...x, scope: JSON.parse(x.scope) })),
          );
        const target = q(
          "SELECT * FROM members WHERE company_id=? AND user_id=?",
          id,
          item,
        );
        if (!target) fail(404, "Member not found.");
        if (target.role === "Owner")
          fail(
            403,
            "Ownership changes require a separate protected transfer flow.",
          );
        if (m.role !== "Owner")
          fail(403, "Only the Owner can change member permissions.");
        if (method === "DELETE")
          run("DELETE FROM members WHERE company_id=? AND user_id=?", id, item);
        else if (method === "PATCH") {
          if (
            !["Admin", "Executive", "Department Manager", "Viewer"].includes(
              b.role,
            )
          )
            fail(400, "Invalid role.");
          if (
            !Array.isArray(b.scope) ||
            b.scope.some(
              (x) => !JSON.parse(m.company.data).departments.includes(x),
            )
          )
            fail(400, "Invalid department scope.");
          if (
            ["Department Manager", "Viewer"].includes(b.role) &&
            !b.scope.length
          )
            fail(400, "Assign at least one department.");
          run(
            "UPDATE members SET role=?,scope=? WHERE company_id=? AND user_id=?",
            b.role,
            JSON.stringify(b.scope),
            id,
            item,
          );
        } else fail(405, "Method not allowed.");
        audit(id, user.id, "member.updated");
        return send({ ok: true });
      }
      if (resource === "invitations") {
        const m = membership(id, user.id, true);
        if (method === "GET")
          return send(
            all(
              "SELECT id,email,role,scope,expires,status FROM invites WHERE company_id=?",
              id,
            ),
          );
        if (method === "DELETE") {
          run(
            "UPDATE invites SET status='revoked' WHERE id=? AND company_id=? AND status='pending'",
            item,
            id,
          );
          return send({ ok: true });
        }
        if (method === "POST") {
          if (production)
            fail(503, "Invitation email delivery is not configured.");
          rate(user.id + ":invite", 30);
          if (item) {
            const existing = q(
              "SELECT * FROM invites WHERE id=? AND company_id=?",
              item,
              id,
            );
            if (!existing || existing.status !== "pending")
              fail(409, "Only pending invitations can be resent.");
            if (m.role === "Admin" && existing.role === "Admin")
              fail(403, "Only Owners may manage Admin invitations.");
            const token = randomBytes(32).toString("hex");
            run(
              "UPDATE invites SET token=?,expires=? WHERE id=?",
              hash(token),
              Date.now() + 7 * 86400000,
              item,
            );
            audit(id, user.id, "invitation.resent");
            return send({
              id: item,
              email: existing.email,
              developmentLink: `/invite/${token}`,
              message: "Development invitation refreshed. No email was sent.",
            });
          }
          if (!email(b.email)) fail(400, "Enter a valid email.");
          const e = b.email.toLowerCase();
          if (e === user.email) fail(400, "You are already a member.");
          if (
            !["Admin", "Executive", "Department Manager", "Viewer"].includes(
              b.role,
            )
          )
            fail(400, "Invitations cannot grant ownership.");
          if (m.role === "Admin" && b.role === "Admin")
            fail(403, "Only Owners may invite Admins.");
          const scope = Array.isArray(b.scope) ? b.scope : [];
          if (
            scope.some(
              (x) => !JSON.parse(m.company.data).departments.includes(x),
            )
          )
            fail(400, "Invalid department scope.");
          if (
            ["Department Manager", "Viewer"].includes(b.role) &&
            !scope.length
          )
            fail(400, "Choose at least one permitted department.");
          if (
            q(
              "SELECT u.id FROM users u JOIN members m ON u.id=m.user_id WHERE m.company_id=? AND u.email=?",
              id,
              e,
            )
          )
            fail(409, "This person is already a member.");
          if (
            q(
              "SELECT id FROM invites WHERE company_id=? AND email=? AND status='pending' AND expires>?",
              id,
              e,
              Date.now(),
            )
          )
            fail(
              409,
              "An invitation is already pending. Revoke it before resending.",
            );
          const token = randomBytes(32).toString("hex");
          const iid = randomUUID();
          run(
            "INSERT INTO invites VALUES(?,?,?,?,?,?,?,?,?)",
            iid,
            id,
            e,
            b.role,
            JSON.stringify(scope),
            hash(token),
            Date.now() + 7 * 86400000,
            "pending",
            user.id,
          );
          audit(id, user.id, "invitation.created");
          return send({
            id: iid,
            developmentLink: `/invite/${token}`,
            message: "Development invitation created. Email was not sent.",
          });
        }
      }
      if (resource === "leave" && method === "POST") {
        const m = membership(id, user.id);
        if (m.role === "Owner")
          fail(403, "Transfer ownership before leaving this company.");
        run(
          "DELETE FROM members WHERE company_id=? AND user_id=?",
          id,
          user.id,
        );
        return send({ ok: true });
      }
      if (resource === "archive" && method === "POST") {
        const m = membership(id, user.id);
        if (m.role !== "Owner")
          fail(403, "Only the Owner can archive this company.");
        run("UPDATE companies SET archived=1 WHERE id=?", id);
        audit(id, user.id, "company.archived");
        return send({ ok: true });
      }
    }
    fail(404, "This endpoint does not exist.");
  } catch (e) {
    send(
      {
        error: e.status
          ? e.message
          : "An unexpected server error occurred. Please try again.",
      },
      e.status || 500,
    );
    if (!e.status) console.error(e);
  }
}
const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.url.startsWith("/api/")) return api(req, res);
  if (production) {
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400);
      return res.end("Invalid URL");
    }
    let file = resolve(process.env.FRONTEND_DIST || "dist", "." + pathname);
    if (
      !file.startsWith(resolve(process.env.FRONTEND_DIST || "dist") + "/") ||
      !existsSync(file) ||
      !extname(file)
    )
      file = resolve(process.env.FRONTEND_DIST || "dist", "index.html");
    try {
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
      };
      res.setHeader(
        "Content-Type",
        types[extname(file)] || "application/octet-stream",
      );
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end("Build the app with npm run build first.");
    }
  } else {
    res.writeHead(404);
    res.end("Use the Vite development server.");
  }
});
server.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(
    `AYNOR API listening on ${process.env.PORT || 3001}; ${production ? "production" : "development adapters enabled"}`,
  ),
);
