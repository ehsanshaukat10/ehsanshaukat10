import { build } from "vite";
import { writeFileSync } from "node:fs";

const result = await build({
  base: "./",
  plugins: [
    {
      name: "standalone-html-routing",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/src/main.tsx"))
          return code.replaceAll("BrowserRouter", "HashRouter");
        if (id.endsWith("/src/features/team/Team.tsx"))
          return code.replaceAll(
            "location.origin + l.link",
            "location.href.split('#')[0] + '#' + l.link",
          );
      },
    },
  ],
  build: { write: false, assetsInlineLimit: Infinity },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(
  (r) => r.output,
);
const js = outputs
  .filter((o) => o.type === "chunk")
  .map((o) => o.code)
  .join("\n");
const css = outputs
  .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
  .map((o) => o.source)
  .join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#4045ff"><title>AYNOR — Interactive onboarding prototype</title><style>${css.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>if(!location.hash)location.hash="/auth/signup";</script><script type="module">${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
writeFileSync("aynor.html", html);
console.log(
  `Created aynor.html (${Math.round(Buffer.byteLength(html) / 1024)} KB), including application, styles, and fonts.`,
);
