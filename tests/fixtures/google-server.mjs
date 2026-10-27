// Test process only: Google is controlled; browser/API traffic uses real HTTP.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "docs.google.com") {
    const rows = [1, 2].map((offset, index) => {
      const now = new Date();
      const date = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
      )
        .toISOString()
        .slice(0, 10);
      return `${date},${(index + 1) * 1000},${(index + 1) * 400}`;
    });
    return new Response("Date,Revenue,Expenses\n" + rows.join("\n"));
  }
  return realFetch(input, options);
};
await import("../../server/index.js");
