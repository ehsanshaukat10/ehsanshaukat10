import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (request) => {
  if (
    process.env.SERVERLESS_TEST === "true" &&
    new URL(request.url()).pathname.endsWith("/sheets/events")
  )
    errors.push("Hosted manual mode opened an SSE stream");
});
try {
  if (process.env.SERVERLESS_TEST === "true") {
    await page.goto("http://127.0.0.1:5176/auth/login");
    await expect(
      page.getByRole("heading", { name: "Welcome back.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Skip for now/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Forgot password?", exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Email address", { exact: true })
      .fill("owner@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("incorrect-password-for-check");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByText("Email or password is incorrect.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "Try an account created in this prototype",
    );
    await page
      .getByLabel("Password", { exact: true })
      .fill("a-long-test-password-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  } else await page.goto("http://127.0.0.1:5176/entry");
  await expect(
    page.getByRole("heading", {
      name: "Let’s build your workspace.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Live Sheet Company");
  await page
    .getByLabel("Industry", { exact: false })
    .selectOption("Technology & software");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "How does your company work?",
      exact: true,
    }),
  ).toBeVisible();
  const company = new URL(page.url()).pathname.split("/")[2];
  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your data", exact: true }),
  ).toBeVisible();
  await page.goto(
    `http://127.0.0.1:5176/companies/${company}/settings/connections`,
  );
  await page.getByRole("button", { name: "Paste URL", exact: true }).click();
  await page
    .getByLabel("Sheet URL", { exact: true })
    .fill(
      "https://docs.google.com/spreadsheets/d/e/2PACXabcdefghijklmnopqrstuvwx/pub?output=csv&gid=0",
    );
  await page.getByRole("button", { name: "Read columns", exact: true }).click();
  await page.getByLabel("Date column", { exact: true }).selectOption("Date");
  await page
    .getByLabel("Money in column", { exact: true })
    .selectOption("Revenue");
  await page
    .getByLabel("Money out column", { exact: true })
    .selectOption("Expenses");
  await page
    .getByRole("button", { name: "Use these columns", exact: true })
    .click();
  await expect(page.locator(".live-source .intel-status")).toHaveText("synced");
  await page.goto(`http://127.0.0.1:5176/companies/${company}/overview`);
  await expect(
    page
      .locator(".intel-kpi")
      .filter({ has: page.locator("span").filter({ hasText: /^Revenue$/ }) }),
  ).toContainText("3,000");
  await expect(
    page.locator(".intel-kpi").filter({
      has: page.locator("span").filter({ hasText: /^Operating profit$/ }),
    }),
  ).toContainText("1,800");
  await expect(page.locator(".live-records tbody tr")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".live-records tbody tr")).toHaveCount(2);
  if (process.env.SERVERLESS_TEST === "true") {
    await page.goto(
      `http://127.0.0.1:5176/companies/${company}/settings/connections`,
    );
    await expect(page.locator(".live-source")).toContainText("Manual sync");
    await expect(page.locator(".live-source")).not.toContainText("every 0");
    await page.goto(`http://127.0.0.1:5176/companies/${company}/overview`);
    await expect(page.locator(".live-records tbody tr")).toHaveCount(2);
  }
  await page.screenshot({
    path: "/tmp/aynor-live-overview.png",
    fullPage: true,
  });
  if (process.env.SERVERLESS_TEST !== "true") {
    const viewerContext = await browser.newContext();
    try {
      const response = await viewerContext.request.post(
        "http://127.0.0.1:5176/api/auth/signup",
        {
          data: {
            name: "Scoped Viewer",
            email: "viewer-live@example.test",
            password: "Strong-password-123",
          },
        },
      );
      const account = await response.json();
      assert.ok(response.ok());
      assert.ok(
        (
          await viewerContext.request.post(
            "http://127.0.0.1:5176/api/auth/verify",
            { data: { token: account.developmentToken } },
          )
        ).ok(),
      );
      const invitation = await page.request.post(
        `http://127.0.0.1:5176/api/companies/${company}/invitations`,
        {
          data: {
            email: "viewer-live@example.test",
            role: "Viewer",
            scope: ["Finance"],
          },
        },
      );
      const invited = await invitation.json();
      assert.ok(invitation.ok());
      const token = invited.developmentLink.split("/").pop();
      assert.ok(
        (
          await viewerContext.request.post(
            `http://127.0.0.1:5176/api/invitations/${token}/accept`,
            { data: {} },
          )
        ).ok(),
      );
      const viewerPage = await viewerContext.newPage();
      viewerPage.on("pageerror", (error) => errors.push(error.message));
      await viewerPage.goto(
        `http://127.0.0.1:5176/companies/${company}/overview`,
      );
      await expect(
        viewerPage.getByRole("heading", {
          name: "Scoped reporting",
          exact: true,
        }),
      ).toBeVisible();
      assert.equal(
        (
          await viewerContext.request.get(
            `http://127.0.0.1:5176/api/companies/${company}/sheets/overview`,
          )
        ).status(),
        403,
      );
      await viewerPage.goto(
        `http://127.0.0.1:5176/companies/${company}/settings/connections`,
      );
      await expect(
        viewerPage.getByRole("heading", {
          name: "Administrator access required",
          exact: true,
        }),
      ).toBeVisible();
      console.log(
        "PASS actual scoped member can open the shell but cannot read company-wide snapshots or manage connections",
      );
    } finally {
      await viewerContext.close();
    }
  }

  for (const width of [390, 768, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
  }
  await page.goto(
    `http://127.0.0.1:5176/companies/${company}/settings/connections`,
  );
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await page.goto(`http://127.0.0.1:5176/companies/${company}/overview`);
  await expect(
    page.getByRole("heading", {
      name: "Connect your first spreadsheet",
      exact: true,
    }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    process.env.SERVERLESS_TEST === "true"
      ? "PASS serverless frontend → owner sign-in → PostgreSQL company creation → public sheet → atomic mapping/manual sync → calculated report → reload → responsive layouts → disconnect; no SSE"
      : "PASS live frontend → development session → real company creation → public connection → server mapping → sync events → calculated dashboard → reload → responsive layouts → disconnect clears data",
  );
} catch (error) {
  console.log(await page.locator("body").innerText());
  await page.screenshot({
    path: "/tmp/aynor-live-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
