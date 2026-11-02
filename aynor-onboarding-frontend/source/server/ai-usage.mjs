import { createHash } from "node:crypto";
export function limit(value, fallback, max) {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? Math.min(n, max) : 0;
}
export async function reserveAiCall(db, env, purpose = "normal") {
  const daily = limit(env.AYNOR_AI_APPLICATION_DAILY_LIMIT, 40, 100),
    day = new Date().toISOString().slice(0, 10);
  if (!daily) return false;
  const reserve = (key, max) =>
    max
      ? db.rpc("rate_limit", {
          p_key: createHash("sha256").update(key).digest("hex"),
          p_max: max,
          p_window: 86400000,
        })
      : false;
  if (
    purpose === "diagnostic" &&
    !(await reserve(
      `ai:diagnostic:${day}`,
      limit(env.AYNOR_AI_DIAGNOSTIC_GLOBAL_DAILY_LIMIT, 5, 10),
    ))
  )
    return false;
  // Mapping, Ask and diagnostics all consume this same hard application-wide ceiling.
  return reserve(`ai:application:${day}`, daily);
}
