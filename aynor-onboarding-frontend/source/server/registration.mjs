import { fail } from "./database.mjs";

// Supabase delivers confirmation emails and proves email ownership. Provider
// tokens stay on this server; Aynor continues using its HttpOnly app session.
export function createRegistration({ env, fetchImpl }) {
  async function request(path, body, login = false) {
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
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      data = await response.json();
      if (!data || typeof data !== "object") throw Error();
    } catch {
      fail(503, "Account service is temporarily unavailable. Please retry.");
    }
    if (!response.ok) {
      if (
        response.status === 429 ||
        /rate_limit/.test(data.code || data.error_code || "")
      )
        fail(
          429,
          "Too many attempts or confirmation emails. Wait a few minutes before trying again.",
        );
      const code = data.code || data.error_code;
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
  return {
    async signup({ email, password, name, origin }) {
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
