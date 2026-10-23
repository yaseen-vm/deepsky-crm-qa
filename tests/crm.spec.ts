import { test, expect, Page } from "@playwright/test";

type LoginControls = {
  email: ReturnType<Page["locator"]>;
  password: ReturnType<Page["locator"]>;
  submit: ReturnType<Page["locator"]>;
};

async function findLoginControls(page: Page): Promise<LoginControls> {
  const emailCandidates = [
    page.getByLabel(/email|username/i).first(),
    page.locator('input[type="email"]').first(),
    page.locator('input[name*="email" i]').first(),
    page.locator('input[autocomplete="username"]').first(),
  ];
  const passwordCandidates = [
    page.getByLabel(/password/i).first(),
    page.locator('input[type="password"]').first(),
    page.locator('input[name*="password" i]').first(),
  ];
  const submitCandidates = [
    page.getByRole("button", { name: /sign in|log in|login|continue/i }).first(),
    page.locator('button[type="submit"]').first(),
    page.locator('input[type="submit"]').first(),
  ];
  const choose = async (items: typeof emailCandidates) => {
    for (const item of items) {
      if (await item.count().catch(() => 0)) return item;
    }
    return items[0];
  };
  return {
    email: await choose(emailCandidates),
    password: await choose(passwordCandidates),
    submit: await choose(submitCandidates),
  };
}

function visibleAppError(page: Page) {
  return page.getByText(/internal server error|application error|something went wrong|unhandled exception/i).first();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  const controls = await findLoginControls(page);
  await expect(controls.email, "could not locate an email/username field").toBeVisible();
  await expect(controls.password, "could not locate a password field").toBeVisible();
  await controls.email.fill(email);
  await controls.password.fill(password);
  await controls.submit.click();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

test.describe("staging smoke and resilience", () => {
  test("landing page loads without a visible generic application error", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    const response = await page.goto("/");
    expect(response, "navigation returned no HTTP response").not.toBeNull();
    expect(response!.status(), "landing page returned a server error").toBeLessThan(500);
    await expect(visibleAppError(page)).toHaveCount(0);
    expect(pageErrors, "uncaught browser errors on initial load").toEqual([]);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("known same-origin navigation links do not lead directly to server errors", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.locator('a[href]').evaluateAll(anchors =>
      anchors.map(a => (a as HTMLAnchorElement).href)
        .filter(href => href.startsWith(window.location.origin))
    );
    const unique = [...new Set(hrefs)].slice(0, 30);
    for (const href of unique) {
      const response = await request.get(href, { failOnStatusCode: false });
      expect(response.status(), `same-origin link returned HTTP ${response.status()}: ${href}`).toBeLessThan(500);
    }
  });

  test("configured role routes return no server errors", async ({ page, request }) => {
    const paths = [
      ...(process.env.ADMIN_PATHS || "").split(",").map(p => p.trim()).filter(Boolean),
      ...(process.env.FIELDSTAFF_PATHS || "").split(",").map(p => p.trim()).filter(Boolean),
    ];
    test.skip(paths.length === 0, "Set ADMIN_PATHS/FIELDSTAFF_PATHS after confirming real application routes.");
    for (const path of paths) {
      const url = new URL(path, process.env.BASE_URL || "https://deepsky-crm-staging.xenora.workers.dev/").toString();
      const response = await request.get(url, { failOnStatusCode: false });
      expect(response.status(), `configured route returned HTTP ${response.status()}: ${path}`).toBeLessThan(500);
    }
  });

  test("invalid login is rejected without an uncaught browser exception", async ({ page }) => {
    await page.goto("/");
    const controls = await findLoginControls(page);
    test.skip(!(await controls.email.count()) || !(await controls.password.count()) || !(await controls.submit.count()),
      "Login controls not detected; adjust findLoginControls() to match the current UI.");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await controls.email.fill("qa-invalid-user@example.invalid");
    await controls.password.fill("definitely-not-a-valid-password");
    await controls.submit.click();
    await page.waitForTimeout(1200);
    expect(errors, "invalid login caused uncaught browser errors").toEqual([]);
    const stillOnLogin = await controls.password.isVisible().catch(() => false);
    const bodyText = await page.locator("body").innerText();
    const hasRejectionSignal = /invalid|incorrect|failed|unable|not found|credentials|try again|required/i.test(bodyText);
    expect(stillOnLogin || hasRejectionSignal, "invalid login produced no visible rejection signal").toBeTruthy();
  });

  test("admin staging login reaches an authenticated-looking page", async ({ page }) => {
    test.skip(!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD, "Add ADMIN_EMAIL and ADMIN_PASSWORD repository secrets.");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await login(page, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
    await expect(visibleAppError(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toBeEmpty();
    expect(errors, "admin login triggered uncaught browser errors").toEqual([]);
    const loginFormStillVisible = await page.locator('input[type="password"]').isVisible().catch(() => false);
    expect(loginFormStillVisible, "password field remains visible; login may not have succeeded").toBeFalsy();
  });

  test("field-staff staging login reaches an authenticated-looking page", async ({ page }) => {
    test.skip(!process.env.FIELDSTAFF_EMAIL || !process.env.FIELDSTAFF_PASSWORD, "Add FIELDSTAFF_EMAIL and FIELDSTAFF_PASSWORD repository secrets.");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await login(page, process.env.FIELDSTAFF_EMAIL!, process.env.FIELDSTAFF_PASSWORD!);
    await expect(visibleAppError(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toBeEmpty();
    expect(errors, "field-staff login triggered uncaught browser errors").toEqual([]);
    const loginFormStillVisible = await page.locator('input[type="password"]').isVisible().catch(() => false);
    expect(loginFormStillVisible, "password field remains visible; login may not have succeeded").toBeFalsy();
  });

  test("visible search input safely handles empty, wildcard-heavy, and unusual text", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    const search = page.locator('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i], input[name*="search" i]').first();
    test.skip(!(await search.count()) || !(await search.isVisible().catch(() => false)),
      "No visible search field on landing page; add module-specific search routes/selectors.");
    for (const value of ["", "deepsky-qa-no-match-938241", "%%%%%%%%%%%%%%%%%%%%%%%%%%%%", "'\"<>\\\\", "a".repeat(512)]) {
      await search.fill(value);
      await search.press("Enter").catch(() => undefined);
      await page.waitForTimeout(150);
      await expect(visibleAppError(page)).toHaveCount(0);
    }
    expect(errors, "search inputs produced uncaught browser errors").toEqual([]);
  });
});
