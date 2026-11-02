// Transport and pricing policy are separate from feature prompts and future billing policy.
export function zeroPriced(model) {
  return (
    (model.id?.endsWith(":free") || model.id === "openrouter/free") &&
    model.pricing &&
    Object.hasOwn(model.pricing, "prompt") &&
    Object.hasOwn(model.pricing, "completion") &&
    Object.values(model.pricing).every(
      (p) =>
        ["string", "number"].includes(typeof p) &&
        String(p).trim() !== "" &&
        Number.isFinite(Number(p)) &&
        Number(p) === 0,
    )
  );
}
export function createOpenRouterTransport({
  env = process.env,
  fetchImpl = fetch,
  timeout = 12000,
}) {
  return {
    async request(path, options = {}) {
      if (!["models", "chat/completions"].includes(path))
        throw Error("invalid_route");
      const response = await fetchImpl("https://openrouter.ai/api/v1/" + path, {
        ...options,
        headers: {
          Authorization: "Bearer " + env.OPENROUTER_API_KEY?.trim(),
          "Content-Type": "application/json",
          ...options.headers,
        },
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
      });
      const reader = response.body?.getReader();
      let raw = "",
        size = 0;
      if (!reader) throw Error("invalid_response");
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > (path === "models" ? 4000000 : 64000)) {
          await reader.cancel();
          throw Error("response_limit");
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
      if (!response.ok) {
        const e = Error(
          {
            401: "invalid_key",
            402: "credit_limit",
            403: "access_denied",
            404: "no_route",
            429: "quota",
          }[response.status] || "unavailable",
        );
        e.httpStatus = response.status;
        throw e;
      }
      try {
        return JSON.parse(raw);
      } catch {
        throw Error("invalid_response");
      }
    },
  };
}
