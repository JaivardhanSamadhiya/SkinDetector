import { test, expect } from "@playwright/test";

const consent = "I understand this is research, not a diagnosis, and I have permission to use this image.";

test("top catalog picks stay distinct from a chosen alternative and explain survey-only habits", async ({ page }) => {
  await page.goto("/routine/");
  await page.getByLabel("How does your skin usually feel?").selectOption("dry");
  await page.getByLabel("Preferred moisturizer feel").selectOption("light");
  await page.getByRole("checkbox", { name: "Niacinamide", exact: true }).check();

  const picks = page.getByTestId("top-catalog-matches");
  await expect(picks.locator("[data-top-match]")).toHaveCount(3);
  await expect(picks).toContainText("comparative effectiveness and individual tolerance have not been established");
  const moisturizerPick = picks.locator('[data-top-match="vanicream-daily-moisturizer"]');
  await expect(moisturizerPick).toContainText("$13.99 USD");
  await moisturizerPick.click();
  await expect(page).toHaveURL(/#routine-moisturizer-options$/);

  const moisturizer = page.locator('[data-routine-step="moisturizer"]');
  const top = moisturizer.locator('[data-product-option="vanicream-daily-moisturizer"]');
  const alternative = moisturizer.locator('[data-product-option="vanicream-moisturizing-cream"]');
  await expect(top).toContainText("Top catalog match");
  await expect(top).toContainText("matches your selected light-texture preference");
  await expect(alternative).toContainText("differs from your light-texture preference");
  await alternative.getByRole("radio").check();
  await expect(alternative.getByRole("radio")).toBeChecked();
  await expect(alternative).toContainText("Selected");
  await expect(top.getByRole("radio")).not.toBeChecked();
  await expect(top).toContainText("Top catalog match");
  await expect(moisturizerPick).toBeVisible();
  await expect(page.getByTestId("routine-subtotal")).toContainText("$38.66");

  const habits = page.getByTestId("lifestyle-guidance");
  await expect(habits).toHaveAttribute("data-basis", "preferences_only");
  await expect(habits.locator('[data-basis="accepted_appearance"]')).toHaveCount(0);
  const dryComfort = habits.locator('[data-habit="dry-feel-comfort"]');
  await expect(dryComfort).toHaveAttribute("data-basis", "survey");
  await expect(dryComfort).toContainText("does not identify why your skin feels dry");
  await expect(dryComfort.getByRole("link")).toHaveAttribute("href", "https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin");
});

test("failed photo metadata cannot supply disease-specific product or lifestyle claims", async ({ page }) => {
  const imagePosts: string[] = [], weights: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST") imagePosts.push(request.url());
    if (/\.onnx(?:\?|$)/.test(request.url())) weights.push(request.url());
  });
  // Simulate an actual metadata fetch failure, never a fabricated prediction.
  await page.route(/\/model[^/]*\/manifest\.json(?:\?.*)?$/, route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "test metadata outage" }),
  }));
  await page.goto("/analysis/");
  await page.getByLabel("How does your skin usually feel?").selectOption("dry");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles("public/demo-clinical/dermatitis.png");
  await page.getByRole("radio", { name: "Close-up skin photo", exact: true }).check();
  await page.getByRole("checkbox", { name: consent, exact: true }).check();
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "No classification was made.", exact: true })).toBeVisible();
  await expect(page.getByTestId("condition-match-decision")).toHaveAttribute("data-status", "general_only");
  await expect(page.getByTestId("top-catalog-matches").locator('[data-top-match="vanicream-moisturizing-cream"]')).toBeVisible();
  const habits = page.getByTestId("lifestyle-guidance");
  await expect(habits).toHaveAttribute("data-basis", "preferences_only");
  await expect(habits).toContainText("No accepted image category was used");
  await expect(habits.locator('[data-basis="accepted_appearance"]')).toHaveCount(0);
  await expect(habits.locator('[data-habit="dermatitis-comfort"]')).toHaveCount(0);
  await expect(habits.locator('[data-habit="acne-gentle-habits"]')).toHaveCount(0);
  await expect(page.locator(".score-row")).toHaveCount(0);
  expect(imagePosts).toEqual([]);
  expect(weights).toEqual([]);
});
