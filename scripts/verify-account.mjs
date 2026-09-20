import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.TEST_URL || "http://localhost:3001";
if (process.env.QA_DISPOSABLE !== "true")
  throw new Error("Use a disposable QA account only.");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
async function login() {
  await page.goto(`${base}/auth`);
  await page.getByRole("tab", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(process.env.QA_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}
try {
  await login();
  await page.goto(`${base}/dashboard/session?section=math&status=all`);
  const choice = page.locator(".session-choice").first();
  if (await choice.count()) await choice.click();
  else await page.locator(".session-input").fill("2");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  assert.ok(
    await page.getByRole("button", { name: "Check", exact: true }).isDisabled(),
  );
  const save = page.getByRole("button", { name: /Save/ }).first();
  if ((await save.getAttribute("aria-pressed")) !== "true") await save.click();
  await page.waitForTimeout(1500);
  await page.goto(`${base}/dashboard/settings`);
  await page.getByLabel("Target score (400–1600)").fill("1450");
  await page.getByRole("button", { name: "Save goals", exact: true }).click();
  await page.getByRole("button", { name: /Saved/ }).waitFor();
  await page.reload();
  assert.equal(
    await page.getByLabel("Target score (400–1600)").inputValue(),
    "1450",
  );
  const response = await page.request.get(`${base}/account/export`);
  assert.equal(response.status(), 200);
  const data = await response.json();
  assert.ok(JSON.stringify(data).includes("1450"));
  assert.ok(data.practice_attempts.length > 0);
  assert.ok(data.saved_questions.length > 0);
  console.log("PASS question check/save, goal persistence, account export");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(/\/auth/);
  await login();
  console.log("PASS sign out and sign in again");
  await page.goto(`${base}/dashboard/settings`);
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await page.getByLabel("Current password").fill(process.env.QA_PASSWORD);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete my account", exact: true })
    .click();
  await page.waitForURL(base + "/", { timeout: 30000 });
  assert.equal(
    (await page.request.get(`${base}/account/export`)).status(),
    401,
  );
  console.log("PASS disposable account deletion and revoked access");
} catch (error) {
  console.log(page.url(), await page.locator("[role=alert]").allTextContents());
  throw error;
} finally {
  await browser.close();
}
