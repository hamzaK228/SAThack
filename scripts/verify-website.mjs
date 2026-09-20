import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.TEST_URL || "http://localhost:3001";
const output = process.env.TEST_OUTPUT || "/tmp/sathack-verification";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
async function visit(path) {
  const before = Date.now();
  const response = await page.goto(`${base}${path}`);
  assert.ok(response.status() < 400, `${path}: HTTP ${response.status()}`);
  await page.locator("h1").first().waitFor();
  assert.equal(
    await page.getByText("Could not load this page", { exact: true }).count(),
    0,
    path,
  );
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  ) {
    await page.screenshot({ path: `${output}/overflow.png` });
    console.log(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            width: Math.round(el.getBoundingClientRect().width),
          }))
          .slice(-20),
      ),
    );
    assert.fail(`${path}: horizontal overflow`);
  }
  console.log(`PASS ${path} (${Date.now() - before}ms)`);
}
try {
  for (const route of [
    "/",
    "/auth",
    "/auth/forgot",
    "/auth/reset",
    "/privacy",
    "/terms",
  ])
    await visit(route);
  await page.goto(`${base}/auth`);
  await page.getByRole("tab", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(process.env.QA_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 30000 });
  console.log("PASS sign in");
  await page.getByRole("link", { name: "Back to site", exact: true }).click();
  await page.waitForURL(`${base}/`);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.waitForURL(`${base}/dashboard`);
  console.log("PASS back to site keeps the signed-in session");
  for (const route of [
    "/dashboard",
    "/dashboard/question-bank",
    "/dashboard/settings",
    "/dashboard/saved",
    "/dashboard/review",
    "/dashboard/analytics",
    "/dashboard/vocab",
    "/dashboard/leaderboard",
    "/dashboard/test",
    "/dashboard/plan",
    "/dashboard/tutor",
    "/dashboard/community",
  ])
    await visit(route);
  await visit("/dashboard/test?mode=adaptive");
  await page.getByRole("button", { name: /^(Start|Start new test)$/ }).click();
  await page.locator(".exam-choice, .exam-input").first().waitFor();
  const question = await page.locator(".exam-stem").innerText();
  const timeBefore = await page.getByRole("timer").innerText();
  const firstChoice = page.locator(".exam-choice").first();
  const saveResponse = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().includes("/dashboard/test"),
  );
  await firstChoice.click();
  await saveResponse;
  await page.getByRole("button", { name: /Question 1/ }).click();
  await page.getByRole("heading", { name: "Review your answers" }).waitFor();
  await page.waitForTimeout(1200);
  assert.notEqual(
    await page.getByRole("timer").innerText(),
    timeBefore,
    "Timer stopped in review",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Continue test", exact: true })
    .click();
  await page.locator(".exam-choice.selected").waitFor();
  assert.equal(
    await page.locator(".exam-stem").innerText(),
    question,
    "Resume changed questions",
  );
  await page
    .locator(".exam-shell")
    .screenshot({ path: `${output}/assessment-desktop.png` });
  await page.getByRole("button", { name: /Question 1/ }).click();
  await page.getByRole("button", { name: "Next module", exact: true }).click();
  await page
    .getByText("Reading & Writing - Module 2", { exact: true })
    .waitFor();
  console.log("PASS adaptive answers, review clock, resume, module transition");
  await visit("/dashboard/session?section=math&status=all");
  await page.locator(".session-question").first().waitFor();
  await page.screenshot({ path: `${output}/practice-desktop.png` });
  const check = page.getByRole("button", { name: "Check", exact: true });
  assert.ok(await check.isVisible());
  assert.ok(
    await page.getByRole("button", { name: /next question/i }).isVisible(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("/dashboard/session?section=reading_writing&status=all");
  await page.screenshot({ path: `${output}/practice-mobile.png` });
  for (const route of [
    "/",
    "/auth",
    "/dashboard/question-bank",
    "/dashboard/settings",
    "/dashboard/test?mode=adaptive",
    "/dashboard/community",
  ])
    await visit(route);
  await page.screenshot({ path: `${output}/assessment-mobile.png` });
  await visit("/dashboard/test");
  const testCards = page.locator("a.practice-test-card");
  assert.equal(await testCards.count(), 10, "Expected ten digital practice tests");
  await testCards.first().click();
  await page
    .getByRole("button", { name: /^(Continue test|Start|Start new test)$/ })
    .first()
    .waitFor();
  const startNewTest = page.getByRole("button", {
    name: "Start new test",
    exact: true,
  });
  const continueTest = page.getByRole("button", {
    name: "Continue test",
    exact: true,
  });
  if (await startNewTest.count()) await startNewTest.click();
  else if (await continueTest.count()) await continueTest.click();
  else await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".exam-choice, .exam-input").first().waitFor();
  assert.equal(await page.locator(".dash-sidebar, .dash-rail").count(), 0);
  assert.equal(await page.locator(".digital-question-scan").count(), 0);
  assert.equal(await page.getByText("Reading & Writing - Module 1", { exact: true }).count(), 1);
  const markForReview = page.getByRole("button", { name: /Mark for Review/ });
  await markForReview.click();
  assert.equal(await markForReview.getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  assert.equal(await page.getByRole("timer").innerText(), "--:--");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Eliminate answers" }).click();
  await page.getByRole("button", { name: "Eliminate answer A" }).click();
  assert.equal(await page.locator(".exam-choice-wrap.eliminated").count(), 1);
  await page.getByRole("button", { name: "Notepad" }).click();
  await page.getByLabel("Scratch notes").fill("Practice-test verification note");
  await page.getByRole("button", { name: "Close notepad" }).click();
  await page.getByRole("button", { name: "Notepad" }).click();
  assert.equal(
    await page.getByLabel("Scratch notes").inputValue(),
    "Practice-test verification note",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  console.log("PASS ten native digital tests and focused exam controls");
  assert.deepEqual(errors, [], "Browser errors");
  console.log("PASS browser errors: none");
} catch (error) {
  console.log(
    "Failed at",
    page.url(),
    await page.locator(".feedback, [role=alert]").allTextContents(),
  );
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
