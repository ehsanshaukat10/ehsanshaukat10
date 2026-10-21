import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  apiRequests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url());
});
const base = "http://127.0.0.1:5173";
const output = "/tmp/aynor-complete-onboarding";
mkdirSync(output, { recursive: true });
const headings = [
  "Create your account",
  "Welcome back.",
  "One quick check.",
  "Let’s get you back.",
  "A fresh start.",
  "Your companies.",
  "Let’s build your workspace.",
  "Your company, in focus.",
  "How does your company work?",
  "What matters most?",
  "Connect the dots.",
  "Choose your sources.",
  "Finding the connections.",
  "Make sense of everything.",
  "Here’s what we found.",
  "Measure what matters.",
  "Where are you heading?",
  "Better decisions, together.",
  "You’re invited.",
  "The right people.",
  "Everything in its place.",
  "Your workspace is ready.",
  "A clearer picture.",
];
try {
  await page.goto(base + "/prototype");
  await page.getByRole("heading", { name: /A thoughtful start/ }).waitFor();
  const labels = await page
    .locator("button.screen-card")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));
  assert.equal(labels.length, 23);
  await page.screenshot({
    path: output + "/all-23-screens.png",
    fullPage: true,
  });
  for (let i = 0; i < labels.length; i++) {
    if (i)
      await page
        .getByRole("link", { name: "All 23 screens", exact: true })
        .click();
    await page.getByRole("button", { name: labels[i], exact: true }).click();
    await page
      .getByRole("heading", {
        name: new RegExp(headings[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .first()
      .waitFor();
    if (i === 13)
      await page.getByLabel("Meaning for Monthly Revenue").waitFor();
    if (i === 16)
      await page
        .getByRole("heading", {
          name: "Build predictable recurring revenue",
          exact: true,
        })
        .waitFor();
    if (i === 17) await page.getByLabel("Invitation email 1").waitFor();
    await page.screenshot({
      path: output + `/${String(i + 1).padStart(2, "0")}-screen.png`,
      fullPage: true,
    });
    console.log(`PASS ${i + 1}/23 ${labels[i]}`);
  }
  await page.getByRole("link", { name: "All 23 screens", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: output + "/all-screens-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .getByRole("button", { name: "Open Departments screen", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "How does your company work?" })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: output + "/departments-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Next preview screen", exact: true })
    .click();
  await page.getByRole("heading", { name: "What matters most?" }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  console.log(
    "PASS mobile gallery, mobile navigation, zero backend requests and zero runtime errors.",
  );
} finally {
  await browser.close();
}
