// Explicit opt-in; standalone exports always retain their offline prototype mode.
export const serverMode =
  import.meta.env.VITE_HOSTED_APP === true ||
  import.meta.env.VITE_API_MODE === "server";
export async function serverRequest<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error(
      "The API did not return JSON. Check the server and proxy configuration.",
    );
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      /session has expired/i.test(result.error || "")
    )
      window.dispatchEvent(new Event("session-expired"));
    throw Error(result.error || `Request failed (${response.status}).`);
  }
  return result;
}
