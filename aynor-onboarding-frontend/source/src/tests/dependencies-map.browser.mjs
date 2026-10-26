import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5175";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base + "/prototype");
  await page
    .getByRole("button", {
      name: "Open Workspace overview screen",
      exact: true,
    })
    .click();
  await page
    .locator(".primary-nav")
    .getByRole("link", { name: "Dependencies", exact: true })
    .click();
  await expect(page.locator(".dep-node")).toHaveCount(11);
  await expect(page.locator(".dep-wire")).toHaveCount(8);
  await expect(
    page.getByRole("link", { name: "Person Sana Ahmed", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".dep-node.is-dimmed")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Focus Sana Ahmed", exact: true })
    .click();
  await expect(page.locator(".dep-inspector h3")).toHaveText("Sana Ahmed");
  await expect(
    page.getByRole("button", { name: "Focus Sana Ahmed", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(1, 1);
  await expect(page.locator(".dep-wire.is-lit")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".dep-inspector h3")).toHaveText("Sana Ahmed");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
    "110%",
  );
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
    "100%",
  );
  await page
    .getByRole("link", {
      name: "Explain Atlas migration owner relationship",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: "Connected delivery risk.",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(".intel-back").click();
  await expect(page.locator(".dep-inspector h3")).toHaveText("Sana Ahmed");
  await page.getByLabel("Search entities").fill("not-in-records");
  await expect(
    page.getByRole("heading", { name: "No matching entities", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  for (const width of [390, 768, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await expect(page.locator(".dep-map")).toBeVisible();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS dependency graph: deduplicated nodes, directed edges, focus/trace persistence, zoom/reset, keyboard relationship navigation, empty search and responsive containment",
  );
} finally {
  await browser.close();
}
