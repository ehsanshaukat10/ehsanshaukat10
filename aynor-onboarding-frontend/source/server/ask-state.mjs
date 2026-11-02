import {
  hkdfSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export function createAskState(env) {
  const seed = env.AYNOR_CHAT_STATE_KEY || env.SHEETS_ENCRYPTION_KEY;
  const key = /^[a-f0-9]{64}$/i.test(seed || "")
    ? Buffer.from(
        hkdfSync(
          "sha256",
          Buffer.from(seed, "hex"),
          Buffer.from("aynor.ask.v1"),
          Buffer.from("memory-and-idempotency"),
          32,
        ),
      )
    : null;
  return {
    configured: !!key,
    seal(value, binding) {
      if (!key) throw Error("state_unavailable");
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(binding));
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
        "base64url",
      );
    },
    open(token, binding) {
      if (!key || typeof token !== "string" || token.length > 64000)
        throw Error("invalid_state");
      try {
        const bytes = Buffer.from(token, "base64url");
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          bytes.subarray(0, 12),
        );
        decipher.setAAD(Buffer.from(binding));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return JSON.parse(
          Buffer.concat([
            decipher.update(bytes.subarray(28)),
            decipher.final(),
          ]).toString(),
        );
      } catch {
        throw Error("invalid_state");
      }
    },
  };
}
