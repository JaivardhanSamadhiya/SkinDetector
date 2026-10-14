import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const consent = "I understand this is research, not a diagnosis, and I have permission to use this image.";
const manifest = JSON.parse(readFileSync("public/model-clinical/manifest.json", "utf8"));

test("unavailable photo release is visible before upload and cannot trigger purchases by condition", async ({ page }) => {
  expect(manifest.available).toBe(false);
  expect(manifest.readiness.passed).toBe(false);
  const posts: string[] = [], modelDownloads: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST") posts.push(request.url());
    if (request.url().endsWith("/model-photo/model.onnx")) modelDownloads.push(request.url());
  });
  await page.route("**/model-photo/manifest.json", route => route.fulfill({ status: 404, body: "No released photo artifact" }));
  await page.goto("/analysis/");
  await expect(page.getByTestId("photo-readiness")).toHaveAttribute("data-state", "unpublished");
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
  await expect(page.getByRole("radio", { name: "Choose Vanicream Moisturizing Cream", exact: true })).toBeChecked();
  await expect(page.getByTestId("routine-subtotal")).toContainText("$38.66");
  await expect(page.locator(".score-row")).toHaveCount(0);
  await expect(page.getByAltText("Model activation overlay")).toHaveCount(0);
  expect(modelDownloads).toEqual([]);
  expect(posts).toEqual([]);
});

test("changing an archived manifest availability flag cannot bypass the current photo release checks", async ({ page }) => {
  await page.route("**/model-photo/manifest.json", route => route.fulfill({
    json: { ...manifest, available: true, readiness: { ...manifest.readiness, passed: true } },
  }));
  await page.goto("/analysis/");
  await expect(page.getByTestId("photo-readiness")).toHaveAttribute("data-state", "unavailable");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles("public/demo-clinical/dermatitis.png");
  await page.getByRole("radio", { name: "Close-up skin photo", exact: true }).check();
  await page.getByRole("checkbox", { name: consent, exact: true }).check();
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "No classification was made.", exact: true })).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(0);
  await expect(page.getByTestId("condition-match-decision")).toHaveAttribute("data-status", "general_only");
});

test("skin-photo thumbnails are rejected despite a valid file format", async ({ page }) => {
  const oldDemo = JSON.parse(readFileSync("public/demo/manifest.json", "utf8")).images[0];
  await page.goto("/analysis/");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles(`public${oldDemo.path}`);
  await page.getByRole("radio", { name: "Close-up skin photo", exact: true }).check();
  await page.getByRole("checkbox", { name: consent, exact: true }).check();
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "A clearer image is needed.", exact: true })).toBeVisible();
  await expect(page.getByText(/at least 128 pixels in both directions/)).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(0);
});
