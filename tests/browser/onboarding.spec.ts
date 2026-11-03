import { test, expect } from "@playwright/test";
test("signup through complete company setup and saved workspace", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/welcome");
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Alex Morgan");
  await page.getByLabel("Email address").fill(`alex.${Date.now()}@aynor.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("A-strong-password-2026");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "One quick check." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page).toHaveURL(/\/companies$/);
  await page
    .getByRole("link", { name: "Create company", exact: true })
    .first()
    .click();
  await page.getByLabel("Company name").fill("Vordx Technologies");
  await page.getByLabel("Industry").selectOption("Technology & software");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/onboarding\/departments$/);
  for (const name of ["Finance", "Project Delivery", "Human Resources"])
    await page.getByRole("button", { name: new RegExp("^" + name) }).click();
  await page.screenshot({
    path: "/tmp/aynor-artifacts/departments.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/priorities$/);
  await page.getByRole("button", { name: /Revenue growth/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Explore with sample data" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Select Business performance · 2026",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Use selected sources" }).click();
  await page
    .getByRole("button", { name: "Discover sample structures" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A structure worth exploring." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm Monthly Revenue", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm Operating Expenses", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("KPI name").fill("Revenue");
  await page.getByRole("button", { name: "Add metric", exact: true }).click();
  await page.getByLabel("Calculation").fill("Sum of monthly revenue");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  await page.getByLabel("Goal name").fill("Grow recurring revenue");
  await page.getByLabel("Related KPI").selectOption("Revenue");
  await page.getByLabel("Target value").fill("500000");
  await page.getByLabel("Deadline").fill("2027-01-01");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Everything in its place." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("1 sample sources", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enter Aynor", exact: true }).click();
  await page.getByRole("link", { name: "Open dashboard", exact: true }).click();
  await expect(
    page.getByText("LIMITED WORKSPACE", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Grow recurring revenue" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/aynor-artifacts/overview.png",
    fullPage: true,
  });
  await expect(page.locator("body")).not.toContainText("undefined");
  expect(errors).toEqual([]);
});
test("mobile authentication has no overflow and recoverable OAuth error", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("alert")).toContainText("not configured");
  await page.getByLabel("Full name").fill("Alex");
  await page.getByLabel("Password", { exact: true }).fill("a-secret-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.screenshot({
    path: "/tmp/aynor-artifacts/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("invited new user keeps invitation context through signup and verification", async ({
  browser,
}) => {
  const email = `invitee.${Date.now()}@aynor.test`;
  const owner = await browser.newContext();
  const signup = await owner.request.post("/api/auth/signup", {
    data: {
      name: "Workspace Owner",
      email: `inviter.${Date.now()}@aynor.test`,
      password: "A-strong-password-2026",
    },
  });
  const a = await signup.json();
  await owner.request.post("/api/auth/verify", {
    data: { token: a.developmentToken },
  });
  const create = await owner.request.post("/api/companies", {
    data: {
      name: "Invitation workspace",
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
  });
  const c = await create.json();
  const inv = await owner.request.post(`/api/companies/${c.id}/invitations`, {
    data: { email, role: "Executive", scope: [] },
  });
  const invitation = await inv.json();
  const guest = await browser.newContext();
  const page = await guest.newPage();
  await page.goto(invitation.developmentLink);
  await expect(page).toHaveURL(/auth\/login/);
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByLabel("Full name").fill("Invited Executive");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("A-strong-password-2026");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You’re invited." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Invitation workspace", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/companies/${c.id}/overview`));
  await expect(page.getByRole("link", { name: "Workspace setup" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Team & permissions" }),
  ).toHaveCount(0);
  await owner.close();
  await guest.close();
});

test("unsaved changes, additional company, company isolation, and mobile workspace", async ({
  page,
}) => {
  const email = `switch.${Date.now()}@aynor.test`;
  const a = await (
    await page.request.post("/api/auth/signup", {
      data: { name: "Taylor Owner", email, password: "A-strong-password-2026" },
    })
  ).json();
  await page.request.post("/api/auth/verify", {
    data: { token: a.developmentToken },
  });
  const profile = {
    industry: "Technology",
    country: "Pakistan",
    currency: "PKR",
    timezone: "Asia/Karachi",
  };
  const c = await (
    await page.request.post("/api/companies", {
      data: { ...profile, name: "First Company" },
    })
  ).json();
  const second = await (
    await page.request.post("/api/companies", {
      data: { ...profile, name: "Second Company" },
    })
  ).json();
  await page.goto(`/companies/${c.id}/onboarding/departments`);
  await page.getByRole("button", { name: /^Finance/ }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await expect(page).toHaveURL(/overview$/);
  await expect(
    page.getByText("LIMITED WORKSPACE", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /First Company Owner/ }).click();
  await page.getByRole("link", { name: /Second Company Owner/ }).click();
  await expect(page).toHaveURL(new RegExp(second.id + "/overview"));
  await expect(
    page.getByRole("heading", { name: "Your business priorities" }),
  ).toBeVisible();
  expect(await page.getByText("First Company", { exact: true }).count()).toBe(
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Resume setup", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "How does your company work?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/aynor-artifacts/mobile-workspace.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page).toHaveURL(/priorities$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "What matters most?" }),
  ).toBeVisible();
});
