import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// This test executes the published genuine WASM artifact. There are no route
// interceptions, prediction fixtures, or simulated model outputs. The sample
// is an attributed SCIN development image, not independent accuracy evidence.
const manifest = JSON.parse(readFileSync("public/model-photo/manifest.json", "utf8"));

test("real photo WASM rankings flow to a priced survey routine without condition-based shopping", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!manifest.available || !manifest.deployment_validation?.browser_verified,
    "Actual photo artifact browser verification must pass before its full app workflow can run.");
  const downloadedParts = new Set<string>(), posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  page.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    if (/^\/model-photo\/model\.part-[1-9][0-9]*\.bin$/.test(pathname) && response.ok()) downloadedParts.add(pathname);
  });
  await page.goto("/analysis/");
  await expect(page.getByTestId("photo-readiness")).toHaveAttribute("data-state", "ready");
  await page.getByLabel("Total budget for new products (USD)").fill("40");
  await page.getByLabel("How does your skin usually feel?").selectOption("dry");
  await page.getByLabel("Preferred moisturizer feel").selectOption("rich");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles("public/demo-clinical/dermatitis.png");
  await expect(page.getByAltText("Your selected skin image", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Close-up skin photo", exact: true }).check();
  await page.getByRole("checkbox", { name: "I understand this is research, not a diagnosis, and I have permission to use this image.", exact: true }).check();
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/, { timeout: 270_000 });
  await expect(page.getByRole("heading", { name: "Unable to assess reliably.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model ranking", exact: true })).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(3);
  await expect(page.getByText(`Model ${manifest.version}`, { exact: true })).toBeVisible();
  await expect(page.getByTestId("condition-match-decision")).toHaveAttribute("data-status", "general_only");
  await expect(page.getByTestId("condition-match-decision")).toHaveAttribute("data-condition-id", "none");
  await expect(page.getByRole("radio", { name: "Choose Vanicream Moisturizing Cream", exact: true })).toBeChecked();
  await expect(page.getByTestId("routine-subtotal")).toContainText("$38.66");
  await expect(page.getByAltText("Model activation overlay")).toHaveCount(0);
  expect(downloadedParts.size).toBe(manifest.onnx.parts.length);
  expect(posts).toEqual([]);
  const scores = await page.locator(".score-row > div:first-child > span:last-child").allTextContents();
  expect(scores.every(value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1)).toBe(true);
  expect(Math.abs(scores.reduce((sum, value) => sum + Number(value), 0) - 1)).toBeLessThan(.002);
});
