/** Accept a domain or full address without requiring a protocol in the form. */
export function normalizeWebsite(value: string): string {
  const input = value.trim();
  if (!input) return "";
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input)
    ? input
    : `https://${input}`;
  try {
    const url = new URL(candidate);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname.includes(".") ||
      /\s/.test(input) ||
      url.username ||
      url.password
    )
      throw Error();
    return url.href.replace(/\/$/, "");
  } catch {
    throw Error("Enter a valid website, such as yourcompany.com.");
  }
}
