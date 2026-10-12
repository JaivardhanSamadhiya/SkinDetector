import { test, expect } from "@playwright/test";

test("quick guide explains the survey and research flow and closes with keyboard focus restored", async ({ page }) => {
  await page.goto("/");
  const summary = page.locator("summary", { hasText: "Quick guide" });
  await summary.focus();
  await summary.press("Enter");
  const guide = page.getByRole("region", { name: "SkinSnap navigation guide" });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading", { name: "Share your preferences", exact: true })).toBeVisible();
  await expect(guide.getByRole("heading", { name: "Choose a supported image", exact: true })).toBeVisible();
  await expect(guide.getByText("Smartphone portraits are unsupported.", { exact: false })).toBeVisible();
  await expect(guide.getByText("They do not treat the predicted lesion category.", { exact: false })).toBeVisible();
  await guide.getByRole("button", { name: "Close quick guide", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await expect(summary).toBeFocused();
  await summary.press("Enter");
  await guide.getByRole("link", { name: "Our research", exact: false }).click();
  await expect(page).toHaveURL(/\/research\/$/);
  await expect(guide).toBeHidden();
});

test("mobile navigation and guide remain readable and expose startup and workflow pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analysis/");
  await page.locator("summary", { hasText: "Quick guide" }).click();
  const guide = page.getByRole("region", { name: "SkinSnap navigation guide" });
  await expect(guide).toBeVisible();
  const guideBounds = await guide.boundingBox();
  expect(guideBounds).not.toBeNull();
  expect(guideBounds!.x).toBeGreaterThanOrEqual(0);
  expect(guideBounds!.x + guideBounds!.width).toBeLessThanOrEqual(390);
  await guide.getByRole("button", { name: "Close quick guide", exact: true }).click();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const menu = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
  await expect(menu.getByRole("link", { name: "How it works", exact: true })).toBeVisible();
  await menu.getByRole("link", { name: "Startup", exact: true }).click();
  await expect(page).toHaveURL(/\/startup\/$/);
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
