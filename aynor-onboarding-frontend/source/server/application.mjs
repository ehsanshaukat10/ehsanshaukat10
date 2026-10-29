import {
  randomUUID,
  randomBytes,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { createDatabase, fail } from "./database.mjs";
import { workspaceSchema } from "./contracts.mjs";
import { createServerlessSheets } from "./sheets.mjs";
import { createRegistration } from "./registration.mjs";
import { authenticatedDestination } from "../shared/journey.mjs";
const derive = promisify(scrypt),
  hash = (value) => createHash("sha256").update(value).digest("hex");
const uuid = (value) => z.string().uuid().safeParse(value).success;
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  verified: !!u.verified,
});
async function password(value) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await derive(value, salt, 64)).toString("hex");
}
async function validPassword(value, stored) {
  const [salt, key] = String(stored).split(":");
  if (!salt || !key || !/^[a-f0-9]{128}$/i.test(key)) return false;
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    await derive(value, salt, 64),
  );
}
function profile(body) {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      industry: z.string().min(1).max(120),
      country: z.string().min(1).max(100),
      currency: z.string().regex(/^[A-Z]{3}$/),
      timezone: z.string().max(100),
      website: z.string().max(1000).optional().default(""),
      size: z.string().max(100).optional().default(""),
      businessModel: z.string().max(80).optional().default(""),
    })
    .safeParse(body);
  if (!parsed.success) fail(400, "Complete the required company details.");
  const p = parsed.data;
  try {
    new Intl.DateTimeFormat("en", { timeZone: p.timezone });
    if (p.website) {
      const u = new URL(p.website);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
        throw Error();
    }
  } catch {
    fail(400, "Check the website address and time zone.");
  }
  return p;
}
const emptyData = () => ({
  departments: [],
  priorities: [],
  sources: [],
  mappings: [],
  kpis: [],
  goals: [],
  steps: {},
  step: "departments",
  completed: false,
});
export function createApplication({
  env = process.env,
  fetchImpl = fetch,
  database,
} = {}) {
  const db = database || createDatabase({ env, fetchImpl });
  const registration = createRegistration({ env, fetchImpl });
  async function member(company, actor, admin = false) {
    if (!uuid(company)) fail(404, "Workspace not found.");
    const c = await db.one("companies", {
      id: "eq." + company,
      archived: "eq.false",
    });
    if (!c) fail(404, "Workspace unavailable.");
    const m = await db.one("members", {
      company_id: "eq." + company,
      user_id: "eq." + actor,
    });
    if (!m) fail(403, "You do not have access to this workspace.");
    if (admin && !["Owner", "Admin"].includes(m.role))
      fail(403, "An Owner or Admin is required.");
    return { ...m, company: c };
  }
  async function view(company, actor) {
    const m = await member(company, actor),
      c = m.company;
    let data = c.data;
    if (!["Owner", "Admin"].includes(m.role))
      data = {
        departments: ["Viewer", "Department Manager"].includes(m.role)
          ? c.data.departments.filter((d) => m.scope.includes(d))
          : c.data.departments,
        completed: c.data.completed,
        step: c.data.step,
      };
    return {
      id: c.id,
      ...c.profile,
      data,
      role: m.role,
      scope: m.scope,
      version: c.version,
    };
  }
  const sheets = createServerlessSheets({ db, member, env, fetchImpl });
  async function rate(key, max = 20, window = 600000) {
    if (
      !(await db.rpc("rate_limit", {
        p_key: hash(key),
        p_max: max,
        p_window: window,
      }))
    )
      fail(429, "Too many attempts. Wait before trying again.");
  }
  async function bootstrap() {
    const email = env.INITIAL_OWNER_EMAIL?.trim().toLowerCase(),
      secret = env.INITIAL_OWNER_PASSWORD;
    if (!email && !secret) return;
    if (
      !z.string().email().safeParse(email).success ||
      !secret ||
      secret.trim().length < 16 ||
      secret.length > 200
    )
      fail(
        503,
        !email
          ? "INITIAL_OWNER_EMAIL is missing from this deployment. Add your email as its Value in Vercel Production, then redeploy."
          : !z.string().email().safeParse(email).success
            ? "INITIAL_OWNER_EMAIL is not a valid email address. Its Value must contain only your email address in Vercel Production, then redeploy."
            : !secret
              ? "INITIAL_OWNER_PASSWORD is missing from this deployment. Save it as a Secret in Vercel Production, then redeploy."
              : secret.trim().length < 16
                ? "INITIAL_OWNER_PASSWORD is too short. Save a new password with at least 16 characters in Vercel Production, then redeploy."
                : "INITIAL_OWNER_PASSWORD exceeds 200 characters. Save a shorter password in Vercel Production, then redeploy.",
      );
    const existing = await db.one("users", { email: "eq." + email });
    if (existing) {
      if (!existing.verified)
        fail(503, "Initial owner account needs administrator review.");
      return;
    }
    await db.insert(
      "users",
      {
        id: randomUUID(),
        name: "Workspace owner",
        email,
        password: await password(secret),
        verified: true,
      },
      {
        query: { on_conflict: "email" },
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
    );
  }
  return async function handle(req, res) {
    let cookie;
    const send = (data, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      });
      res.end(JSON.stringify(data));
      return true;
    };
    const redirect = (path) => {
      res.writeHead(303, { Location: path, "Cache-Control": "no-store" });
      res.end();
      return true;
    };
    try {
      const url = new URL(
        req.url,
        "https://" + (req.headers.host || "localhost"),
      );
      const path =
        url.pathname === "/api/handler" || url.pathname === "/api/handler.js"
          ? "/" + (url.searchParams.get("route") || "")
          : url.pathname.replace(/^\/api/, "");
      const method = req.method || "GET";
      const bodyLimit = /^\/companies\/[a-f0-9-]{36}\/sheets\/upload$/i.test(
        path,
      )
        ? 3 * 1024 * 1024
        : 200000;
      if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method))
        fail(405, "Method not allowed.");
      let body = {};
      if (!["GET", "HEAD"].includes(method)) {
        if (req.headers["sec-fetch-site"] === "cross-site")
          fail(403, "Cross-site request rejected.");
        if (
          req.headers.origin &&
          req.headers.origin !== "https://" + req.headers.host &&
          !(
            env.NODE_ENV !== "production" &&
            req.headers.origin === "http://" + req.headers.host
          )
        )
          fail(403, "Request origin does not match this application.");
        if (
          req.headers["content-type"] &&
          !req.headers["content-type"]
            .toLowerCase()
            .startsWith("application/json")
        )
          fail(415, "Use application/json.");
        if (req.body !== undefined) {
          if (
            Buffer.byteLength(
              typeof req.body === "string"
                ? req.body
                : JSON.stringify(req.body),
            ) > bodyLimit
          )
            fail(413, "Request too large.");
          try {
            body =
              typeof req.body === "string" ? JSON.parse(req.body) : req.body;
          } catch {
            fail(400, "Invalid JSON.");
          }
        } else {
          let raw = "";
          for await (const chunk of req) {
            raw += chunk;
            if (Buffer.byteLength(raw) > bodyLimit)
              fail(413, "Request too large.");
          }
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            fail(400, "Invalid JSON.");
          }
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          fail(400, "Invalid request body.");
      }
      if (path === "/config" && method === "GET") {
        const ready = !!(await db.one("schema_versions", {
          version: "eq.202610270002_serverless_operations",
        }));
        return send({
          development: false,
          developmentSession: false,
          googleOAuth: sheets.configured(),
          publicSheets: true,
          emailDelivery: "supabase",
          publicSignup: true,
          syncMode: "manual",
          databaseReady: ready,
        });
      }
      if (path === "/health" && method === "GET") {
        if (
          !(await db.one("schema_versions", {
            version: "eq.202610270002_serverless_operations",
          }))
        )
          fail(503, "Run the second AYNOR setup script.");
        return send({ status: "ok", storage: "supabase", syncMode: "manual" });
      }
      if (path === "/dev/session")
        fail(403, "Development access is never available in hosted mode.");
      const token = req.headers.cookie
          ?.split(";")
          .map((v) => v.trim())
          .find((v) => v.startsWith("aynor_session="))
          ?.slice(14),
        session = token
          ? await db.one("sessions", {
              token: "eq." + hash(token),
              expires: "gt." + Date.now(),
            })
          : null;
      const user = session
        ? await db.one("users", { id: "eq." + session.user_id })
        : null;
      if (path === "/session" && method === "GET")
        return send({ user: user ? safeUser(user) : null });
      if (path === "/auth/logout" && method === "POST") {
        if (token) await db.remove("sessions", { token: "eq." + hash(token) });
        cookie =
          "aynor_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
        return send({ ok: true });
      }
      if (
        ["/auth/signup", "/auth/resend"].includes(path) &&
        method === "POST"
      ) {
        const email =
          typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!z.string().email().max(254).safeParse(email).success)
          fail(400, "Enter a valid email address.");
        const ip = String(
          req.headers["x-forwarded-for"] ||
            req.socket?.remoteAddress ||
            "unknown",
        )
          .split(",")[0]
          .trim();
        await rate("registration:" + ip, 10, 3600000);
        await rate("confirmation:" + email, 3, 600000);
        if (path === "/auth/resend") {
          await registration.resend(email, url.origin);
          return send({ ok: true });
        }
        if (
          !z.string().trim().min(1).max(100).safeParse(body.name).success ||
          typeof body.password !== "string" ||
          body.password.trim().length < 10 ||
          body.password.length > 200
        )
          fail(400, "Enter your name and a password of 10–200 characters.");
        if (await db.one("users", { email: "eq." + email }))
          fail(
            409,
            "An account already exists for this email. Sign in instead.",
          );
        return send(
          await registration.signup({
            email,
            password: body.password,
            name: body.name.trim(),
            origin: url.origin,
          }),
          201,
        );
      }
      if (path === "/auth/login" && method === "POST") {
        const ip = String(
          req.headers["x-forwarded-for"] ||
            req.socket?.remoteAddress ||
            "unknown",
        )
          .split(",")[0]
          .trim();
        await rate("login:" + ip, 20);
        await bootstrap();
        const email =
          typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        let candidate = z.string().email().safeParse(email).success
          ? await db.one("users", { email: "eq." + email })
          : null;
        if (
          z.string().email().safeParse(email).success &&
          (!candidate || candidate.password.startsWith("supabase:")) &&
          typeof body.password === "string" &&
          body.password.length <= 200
        ) {
          const identity = await registration.login(email, body.password);
          if (!uuid(identity.id))
            fail(503, "Account service returned an invalid identity.");
          if (!candidate) {
            await db.insert(
              "users",
              {
                id: identity.id,
                email,
                name: String(
                  identity.user_metadata?.name || email.split("@")[0],
                ).slice(0, 100),
                password: "supabase:" + identity.id,
                verified: true,
              },
              {
                query: { on_conflict: "email" },
                prefer: "resolution=ignore-duplicates,return=minimal",
              },
            );
            candidate = await db.one("users", { email: "eq." + email });
          }
          if (candidate?.password !== "supabase:" + identity.id)
            fail(401, "Email or password is incorrect.");
        } else if (
          !candidate ||
          typeof body.password !== "string" ||
          body.password.length > 200 ||
          !(await validPassword(body.password, candidate.password))
        )
          fail(401, "Email or password is incorrect.");
        if (!candidate || !candidate.verified)
          fail(401, "Email or password is incorrect.");
        const memberships = await db.rows("members", {
          user_id: "eq." + candidate.id,
        });
        const companies = (
          await Promise.all(
            memberships.map(async (membership) => {
              const company = await db.one("companies", {
                id: "eq." + membership.company_id,
                archived: "eq.false",
              });
              return company
                ? { id: company.id, role: membership.role, data: company.data }
                : null;
            }),
          )
        ).filter(Boolean);
        const destination = authenticatedDestination(companies, body.next);
        const next = randomBytes(32).toString("hex");
        await db.insert("sessions", {
          token: hash(next),
          user_id: candidate.id,
          expires: Date.now() + 604800000,
        });
        cookie = `aynor_session=${next}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
        return send({ user: safeUser(candidate), destination });
      }
      if (
        [
          "/auth/recover",
          "/auth/reset",
          "/auth/verify",
          "/auth/google",
        ].includes(path)
      )
        fail(
          503,
          "This account operation is not enabled yet. Email signup and sign-in are available.",
        );
      if (!user) fail(401, "Your session has expired. Please sign in.");
      if (!user.verified) fail(403, "Verified account required.");
      if (!["GET", "HEAD"].includes(method))
        await rate("mutation:" + user.id, 90, 60000);
      if (path === "/companies" && method === "GET") {
        const memberships = await db.rows("members", {
          user_id: "eq." + user.id,
        });
        if (memberships.length > 1000)
          fail(413, "Too many workspaces. Contact support.");
        const companies = await Promise.all(
          memberships.map(async (m) => {
            const c = await db.one("companies", {
              id: "eq." + m.company_id,
              archived: "eq.false",
            });
            return c ? view(c.id, user.id) : null;
          }),
        );
        return send(companies.filter(Boolean));
      }
      if (path === "/companies" && method === "POST") {
        const p = profile(body),
          key = req.headers["idempotency-key"];
        if (key && (typeof key !== "string" || key.length > 200))
          fail(400, "Invalid request key.");
        const id = await db.rpc("company_create", {
          p_actor: user.id,
          p_profile: p,
          p_data: emptyData(),
          p_key: key || null,
        });
        return send(await view(id, user.id), 201);
      }
      if (path === "/invitations" && method === "GET") {
        const invites = await db.rows("invites", {
          email: "eq." + user.email,
          status: "eq.pending",
        });
        return send(
          await Promise.all(
            invites.map(async (i) => {
              const c = await db.one("companies", {
                id: "eq." + i.company_id,
                archived: "eq.false",
              });
              return {
                ...i,
                token: undefined,
                company: c?.profile.name || "Unavailable workspace",
              };
            }),
          ),
        );
      }
      const invitation = path.match(
        /^\/invitations\/([^/]+)(?:\/(accept|decline))?$/,
      );
      if (invitation) {
        const value = invitation[1],
          i = await db.one(
            "invites",
            uuid(value)
              ? { id: "eq." + value }
              : { token: "eq." + hash(value) },
          );
        if (!i) fail(404, "Invitation unavailable.");
        if (i.email !== user.email)
          fail(403, "Sign in with the invited email address.");
        if (i.status !== "pending") fail(409, "Invitation already handled.");
        if (Number(i.expires) < Date.now()) fail(410, "Invitation expired.");
        const c = await db.one("companies", {
          id: "eq." + i.company_id,
          archived: "eq.false",
        });
        if (!c) fail(404, "Workspace unavailable.");
        if (method === "GET")
          return send({
            id: i.id,
            company: c.profile.name,
            role: i.role,
            scope: i.scope,
          });
        if (method === "POST" && invitation[2])
          return send({
            companyId: await db.rpc("invitation_respond", {
              p_actor: user.id,
              p_invite: i.id,
              p_accept: invitation[2] === "accept",
            }),
          });
        fail(405, "Method not allowed.");
      }
      if (
        await sheets.handle({ path, url, method, body, user, send, redirect })
      )
        return;
      const route = path.match(
        /^\/companies\/([a-f0-9-]{36})(?:\/(profile|members|invitations|leave|archive))?(?:\/([a-f0-9-]{36}))?$/i,
      );
      if (route) {
        const [, id, resource, item] = route;
        if (!resource && method === "GET") return send(await view(id, user.id));
        if ((!resource || resource === "profile") && method === "PATCH") {
          await member(id, user.id, true);
          if (!Number.isInteger(body.version) || body.version < 1)
            fail(400, "Workspace version required.");
          let payload;
          if (resource === "profile") payload = profile(body);
          else {
            const parsed = workspaceSchema.safeParse(body.data);
            if (!parsed.success) fail(400, "Invalid workspace configuration.");
            payload = parsed.data;
            if (payload.demo || payload.sources.length)
              fail(
                400,
                "Use live Data connections; sample sources cannot be saved in hosted mode.",
              );
            if (
              new Set(payload.departments.map((v) => v.toLowerCase())).size !==
                payload.departments.length ||
              payload.mappings.some(
                (m) =>
                  !m.ignored && !payload.departments.includes(m.department),
              )
            )
              fail(400, "Resolve duplicate departments and their mappings.");
          }
          await db.rpc("company_update", {
            p_actor: user.id,
            p_company: id,
            p_version: body.version,
            p_payload: payload,
            p_profile: resource === "profile",
          });
          return send(await view(id, user.id));
        }
        if (resource === "members") {
          await member(id, user.id, true);
          if (method === "GET") {
            const members = await db.rows("members", {
              company_id: "eq." + id,
              select: "user_id,role,scope,user:aynor_users(id,name,email)",
            });
            return send(
              members.map((m) => ({ ...m.user, role: m.role, scope: m.scope })),
            );
          }
          if (!uuid(item)) fail(404, "Member unavailable.");
          if (!["PATCH", "DELETE"].includes(method))
            fail(405, "Method not allowed.");
          await db.rpc("member_change", {
            p_actor: user.id,
            p_company: id,
            p_target: item,
            p_operation: method === "DELETE" ? "remove" : "update",
            p_role: body.role || null,
            p_scope: body.scope || [],
          });
          return send({ ok: true });
        }
        if (resource === "invitations") {
          await member(id, user.id, true);
          if (method === "GET")
            return send(
              await db.rows("invites", {
                company_id: "eq." + id,
                select: "id,email,role,scope,expires,status",
              }),
            );
          fail(
            503,
            "Invitation email delivery is not configured for hosted mode.",
          );
        }
        if (["leave", "archive"].includes(resource) && method === "POST") {
          await db.rpc("member_change", {
            p_actor: user.id,
            p_company: id,
            p_target: user.id,
            p_operation: resource,
          });
          return send({ ok: true });
        }
      }
      fail(404, "Endpoint not found.");
    } catch (error) {
      return send(
        {
          error: error.status
            ? error.message
            : "The request failed. Please retry shortly.",
        },
        error.status || 500,
      );
    }
  };
}
