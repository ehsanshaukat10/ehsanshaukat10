import { randomBytes } from "node:crypto";
import { fail } from "./database.mjs";

// Supabase delivers confirmation emails and proves email ownership. Provider
// tokens stay on this server; Aynor continues using its HttpOnly app session.
export function createRegistration({ env, fetchImpl }) {
  async function request(
    path,
    body,
    login = false,
    method = "POST",
    accessToken,
  ) {
    let base;
    try {
      base = new URL(env.SUPABASE_URL);
    } catch {
      fail(503, "Account service is not configured.");
    }
    if (
      base.protocol !== "https:" ||
      !base.hostname.endsWith(".supabase.co") ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      !env.SUPABASE_SECRET_KEY
    )
      fail(503, "Account service is not configured.");
    let response, data;
    try {
      response = await fetchImpl(new URL("/auth/v1/" + path, base), {
        method,
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          ...(accessToken
            ? { Authorization: "Bearer " + accessToken }
            : path.startsWith("admin/") &&
                env.SUPABASE_SECRET_KEY.startsWith("eyJ")
              ? { Authorization: "Bearer " + env.SUPABASE_SECRET_KEY }
              : {}),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      data = await response.json();
      if (!data || typeof data !== "object") throw Error();
    } catch {
      fail(503, "Account service is temporarily unavailable. Please retry.");
    }
    if (!response.ok) {
      if (accessToken)
        fail(
          response.status === 429 ? 429 : 403,
          "This email link has expired or is invalid. Request a new link and try again.",
        );
      if (
        response.status === 429 ||
        /rate_limit/.test(data.code || data.error_code || "")
      )
        fail(
          429,
          "Too many attempts or confirmation emails. Wait a few minutes before trying again.",
        );
      const code = data.code || data.error_code;
      if (!login && ["user_already_exists", "email_exists"].includes(code))
        fail(
          409,
          "An account already exists for this email. Sign in, or resend its confirmation email.",
        );
      if (login && code === "email_not_confirmed")
        fail(
          403,
          "Confirm your email using the link in your inbox, then sign in.",
        );
      if (login && response.status < 500)
        fail(401, "Email or password is incorrect.");
      if (login)
        fail(
          503,
          "Sign-in service is temporarily unavailable. Please retry shortly.",
        );
      if (code === "weak_password")
        fail(400, "Choose a stronger password with at least 10 characters.");
      if (code === "email_address_not_authorized")
        fail(
          503,
          "Supabase's default sender cannot email this address. Configure custom SMTP in Supabase Authentication to enable signup for other emails.",
        );
      if (code === "email_address_invalid")
        fail(400, "Use a valid email address that you can access.");
      if (code === "signup_disabled")
        fail(
          503,
          "Email signup is disabled in Supabase. Enable new user signups under Authentication settings.",
        );
      fail(
        503,
        "Confirmation email could not be sent. Check Supabase Authentication email settings or retry shortly.",
      );
    }
    return data;
  }
  async function requireConfirmation() {
    const settings = await request("settings", undefined, false, "GET");
    if (settings.mailer_autoconfirm !== false)
      fail(
        503,
        "Email confirmation is required. Enable Confirm email in Supabase Authentication before continuing.",
      );
  }
  async function verifiedIdentity(accessToken) {
    if (
      typeof accessToken !== "string" ||
      accessToken.length < 10 ||
      accessToken.length > 16000
    )
      fail(403, "Open the verification link from your email to continue.");
    const user = await request("user", undefined, false, "GET", accessToken);
    if (!user.email_confirmed_at || !user.email || !user.id)
      fail(403, "Your email has not been verified yet.");
    return user;
  }
  return {
    verifiedIdentity,
    async confirm(input) {
      await requireConfirmation();
      if (input.tokenHash) {
        if (
          typeof input.tokenHash !== "string" ||
          input.tokenHash.length > 1000 ||
          !["signup", "email"].includes(input.type)
        )
          fail(403, "Invalid confirmation link.");
        const data = await request("verify", {
          token_hash: input.tokenHash,
          type: input.type,
        });
        return verifiedIdentity(data.access_token);
      }
      return verifiedIdentity(input.accessToken);
    },
    async recover(email, origin, legacy) {
      if (legacy) {
        try {
          // Create no session and assert no email ownership here. Recovery email
          // must prove ownership before the legacy password can be changed.
          await request("admin/users", {
            email,
            password: randomBytes(32).toString("hex"),
            email_confirm: false,
            user_metadata: { name: legacy.name },
          });
        } catch (error) {
          if (error.status !== 409) throw error;
        }
      }
      await request(
        "recover?redirect_to=" + encodeURIComponent(origin + "/auth/confirmed"),
        { email },
      );
    },
    async reset(input, consume) {
      let token = input.accessToken;
      if (input.tokenHash) {
        const data = await request("verify", {
          token_hash: input.tokenHash,
          type: "recovery",
        });
        token = data.access_token;
      }
      const user = await verifiedIdentity(token);
      await consume(user);
      await request("user", { password: input.password }, false, "PUT", token);
      return user;
    },
    async signup({ email, password, name, origin }) {
      await requireConfirmation();
      const data = await request(
        "signup?redirect_to=" + encodeURIComponent(origin + "/auth/confirmed"),
        { email, password, data: { name } },
      );
      return {
        email,
        verificationRequired: !(data.user || data).email_confirmed_at,
      };
    },
    async resend(email, origin) {
      await request(
        "resend?redirect_to=" + encodeURIComponent(origin + "/auth/confirmed"),
        {
          type: "signup",
          email,
        },
      );
    },
    async login(email, password) {
      await requireConfirmation();
      const data = await request(
        "token?grant_type=password",
        { email, password },
        true,
      );
      const user = data.user;
      if (!user?.email_confirmed_at || user.email?.toLowerCase() !== email)
        fail(403, "Confirm your email before signing in.");
      return user;
    },
  };
}
