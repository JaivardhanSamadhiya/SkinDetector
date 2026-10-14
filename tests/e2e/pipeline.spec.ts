import { test, expect } from "@playwright/test";

const consent = "I understand this is research, not a diagnosis, and I have permission to use this image.";

test("survey must be explicitly saved before image analysis, and later edits need saving again", async ({ page }) => {
  await page.goto("/analysis/");
  await expect(page.getByRole("navigation", { name: "Your routine steps" })).toBeVisible();
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles("public/demo-clinical/dermatitis.png");
  await page.getByRole("radio", { name: "Close-up skin photo", exact: true }).check();
  await page.getByRole("checkbox", { name: consent, exact: true }).check();
  const analyze = page.getByRole("button", { name: "Analyze image", exact: true });
  await expect(analyze).toBeDisabled();
  await expect(page.getByTestId("survey-required")).toBeVisible();
  await page.getByLabel("How does your skin usually feel?").selectOption("dry");
  await page.getByLabel("Total budget for new products (USD)").fill("40");
  await expect(analyze).toBeDisabled();
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(analyze).toBeEnabled();
  await page.getByRole("button", { name: "Edit preferences", exact: true }).click();
  await page.getByLabel("Total budget for new products (USD)").fill("35");
  await expect(analyze).toBeDisabled();
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(analyze).toBeEnabled();
});

test("saved budget and preferences reach priced general care and habits after an unavailable photo result", async ({ page }) => {
  // This is an intentional error-state fixture. No model outputs or accuracy are fabricated.
  await page.route("**/model-photo/manifest.json", route => route.fulfill({ status: 404, body: "Unavailable test release" }));
  const posts: string[] = [], modelRequests: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST") posts.push(request.url());
    if (request.url().endsWith("/model-photo/model.onnx")) modelRequests.push(request.url());
  });
  await page.goto("/analysis/");
  await expect(page.getByTestId("photo-readiness")).toHaveAttribute("data-state", "unpublished");
  await page.getByLabel("Total budget for new products (USD)").fill("40");
  await page.getByLabel("How does your skin usually feel?").selectOption("dry");
  await page.getByLabel("Preferred moisturizer feel").selectOption("rich");
  await page.getByRole("checkbox", { name: "Niacinamide", exact: true }).check();
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles("public/demo-clinical/dermatitis.png");
  await page.getByRole("radio", { name: "Close-up skin photo", exact: true }).check();
  await page.getByRole("checkbox", { name: consent, exact: true }).check();
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "No classification was made.", exact: true })).toBeVisible();
  await expect(page.getByTestId("condition-match-decision")).toHaveAttribute("data-status", "general_only");
  await expect(page.getByTestId("condition-match-decision")).toHaveAttribute("data-condition-id", "none");
  await expect(page.getByTestId("top-catalog-matches")).toContainText("Vanicream");
  await expect(page.getByRole("radio", { name: "Choose Vanicream Moisturizing Cream", exact: true })).toBeChecked();
  await expect(page.getByTestId("routine-subtotal")).toContainText("$38.66");
  await expect(page.getByTestId("routine-budget-status")).toHaveAttribute("data-status", "within_budget");
  await expect(page.getByTestId("routine-budget-status")).toContainText("$40.00");
  const moisturizer = page.locator('[data-routine-step="moisturizer"]');
  await expect(moisturizer).toContainText("Why Vanicream Moisturizing Cream is the starting match");
  await expect(moisturizer.getByRole("link", { name: "View at Target", exact: true }).first()).toHaveAttribute("href", /^https:\/\/www\.target\.com\//);
  await expect(page.getByTestId("lifestyle-guidance")).toHaveAttribute("data-basis", "preferences_only");
  await expect(page.getByTestId("lifestyle-guidance")).toContainText("Why it appears:");
  await expect(page.locator('.score-row')).toHaveCount(0);
  expect(posts).toEqual([]);
  expect(modelRequests).toEqual([]);
});

test("explicit general basics completes step one on mobile without inventing a condition", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analysis/");
  await page.getByRole("button", { name: "Skip · use general basics", exact: true }).click();
  await expect(page.getByTestId("survey-required")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze image", exact: true })).toBeDisabled();
  await expect(page.locator(".pipeline-steps .complete")).toContainText("Your preferences");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
