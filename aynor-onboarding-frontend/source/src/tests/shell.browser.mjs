import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5174";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const p = await b.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(base + "/prototype");
await p
  .getByRole("button", { name: "Open Workspace overview screen", exact: true })
  .click();
await p.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
const content = await p.locator(".exec-dashboard").innerText();
await expect(p.locator(".sidebar-account")).toContainText("Alex Morgan");
assert.equal(
  await p
    .locator(".workspace-header")
    .getByText("Alex Morgan", { exact: true })
    .count(),
  0,
);
await p.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
await expect(p.locator(".workspace-sidebar")).toHaveCSS("width", "80px");
await p.getByRole("link", { name: "Departments", exact: true }).focus();
await expect(p.getByRole("tooltip")).toHaveText("Departments");
await p.keyboard.press("Enter");
await expect(
  p.getByRole("link", { name: "Departments", exact: true }),
).toHaveAttribute("aria-current", "page");
await p.reload();
await p.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
await expect(p.locator(".workspace-sidebar")).toHaveCSS("width", "80px");
await p.getByRole("button", { name: "Expand sidebar", exact: true }).click();
await p.getByRole("link", { name: "Overview", exact: true }).click();
assert.equal(await p.locator(".exec-dashboard").innerText(), content);
await p.getByRole("button", { name: "Upgrade plan", exact: true }).click();
await expect(p.getByRole("dialog")).toContainText("No payment");
await p.getByRole("button", { name: "Pro Team insights", exact: true }).click();
await p.getByRole("button", { name: "Done", exact: true }).click();
await expect(p.locator(".sidebar-plan-badge")).toHaveText("Pro");
await p.getByRole("button", { name: "Account and subscription" }).click();
await expect(p.getByRole("dialog")).toContainText("Pro plan");
await p.getByRole("button", { name: "Close", exact: true }).click();
await p.screenshot({ path: "/tmp/aynor-shell-desktop.png", fullPage: false });
for (const width of [390, 768, 1440, 2560]) {
  await p.setViewportSize({ width, height: 900 });
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    `Overflow ${width}`,
  );
}
await p.setViewportSize({ width: 390, height: 844 });
await expect(p.locator(".primary-nav")).toBeHidden();
await p.getByRole("button", { name: "Expand sidebar", exact: true }).click();
await expect(p.locator(".primary-nav")).toBeVisible();
await p.screenshot({ path: "/tmp/aynor-shell-mobile.png", fullPage: false });
await p.evaluate(() => {
  const key = "aynor.frontend-prototype.v1",
    data = JSON.parse(localStorage.getItem(key));
  data.users.find((u) => u.id === "sample-alex").name =
    "Alexandria Morgan " + "Longname ".repeat(15);
  data.companies.find((c) => c.id === "preview-workspace").name =
    "International Business " + "Corporation ".repeat(20);
  localStorage.setItem(key, JSON.stringify(data));
});
await p.reload();
await p.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
await p.getByRole("button", { name: "Expand sidebar", exact: true }).click();
assert.equal(
  await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
  false,
);
assert.ok(
  await p
    .locator(".sidebar-account-copy strong")
    .evaluate((e) => e.scrollWidth > e.clientWidth),
);
await p.setViewportSize({ width: 1440, height: 1000 });
await p.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
await p.getByRole("button", { name: /Switch company:/ }).click();
await expect(p.locator(".switcher-menu")).toBeVisible();
await p.keyboard.press("Escape");
await expect(p.locator(".switcher-menu")).toHaveCount(0);
assert.deepEqual(errors, []);
console.log(
  "PASS shell collapse/persistence, focus tooltips, navigation, unchanged Overview text, account/plan preview and responsive layout",
);
await b.close();
