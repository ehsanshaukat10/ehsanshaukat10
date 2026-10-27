import { randomUUID } from "node:crypto";

// Operator-provisioned initial identity, not public signup or a login bypass.
// Existing accounts are never modified and passwords are never logged.
export function bootstrapOwner({ db, hashPassword, env = process.env }) {
  const email = env.INITIAL_OWNER_EMAIL?.trim().toLowerCase();
  const password = env.INITIAL_OWNER_PASSWORD;
  if (!email && !password) return;
  if (!email || !password)
    throw Error(
      "Set both INITIAL_OWNER_EMAIL and INITIAL_OWNER_PASSWORD, or remove both after provisioning.",
    );
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw Error("INITIAL_OWNER_EMAIL must be a valid email address.");
  if (password.trim().length < 16 || password.length > 200)
    throw Error("INITIAL_OWNER_PASSWORD must contain 16–200 characters.");
  const existing = db
    .prepare("SELECT id,verified FROM users WHERE email=?")
    .get(email);
  if (existing) {
    if (!existing.verified)
      throw Error(
        "Initial owner email belongs to an unverified account. Use a different owner email or resolve that account before deployment.",
      );
    return existing.id;
  }
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users(id,email,name,password,verified) VALUES(?,?,?,?,1)",
  ).run(id, email, "Workspace owner", hashPassword(password));
  return id;
}
