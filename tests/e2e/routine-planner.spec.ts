import { test, expect } from "@playwright/test";

test("priced choices update the combination and manual quote form together without carrying old quotes", async ({ page }) => {
  await page.goto("/routine/");
  await expect(page.getByTestId("routine-subtotal")).toContainText("$39.46");
  const budget = page.getByTestId("routine-budget");
  await budget.getByRole("textbox", { name: "Price for Vanicream Gentle Facial Cleanser", exact: true }).fill("9.99");
  await page.getByRole("radio", { name: "Choose CeraVe Foaming Facial Cleanser", exact: true }).check();
  await expect(page.getByTestId("routine-subtotal")).toContainText("$43.26");
  await expect(budget.getByRole("textbox", { name: "Price for Vanicream Gentle Facial Cleanser", exact: true })).toHaveCount(0);
  await expect(budget.getByRole("textbox", { name: "Price for CeraVe Foaming Facial Cleanser", exact: true })).toHaveValue("");
  await page.getByRole("checkbox", { name: "Niacinamide", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Choose CeraVe Foaming Facial Cleanser", exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Choose Vanicream Gentle Facial Cleanser", exact: true })).toBeChecked();
  await expect(page.getByTestId("routine-subtotal")).toContainText("$39.46");
  await page.getByRole("button", { name: "Clear this session", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Niacinamide", exact: true })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Choose Vanicream Gentle Facial Cleanser", exact: true })).toBeChecked();
});

test("standalone routine planner checks real entered quotes, reuses basics, and clears session data without model access", async ({ page }) => {
  const unexpectedRequests: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" || /\/model\/(model\.onnx|manifest\.json)/.test(request.url())) unexpectedRequests.push(request.url());
  });
  await page.goto("/routine/");
  await expect(page.getByRole("heading", { name: "A simpler routine. A clearer shopping list." })).toBeVisible();
  const budget = page.getByTestId("routine-budget");
  await expect(budget.getByTestId("budget-status")).toContainText("incomplete");
  const prices = budget.getByRole("textbox", { name: /^Price for / });
  await expect(prices).toHaveCount(3);
  for (const price of await prices.all()) {
    await expect(price).toHaveValue("");
    await price.fill("10.00");
  }
  await budget.getByRole("textbox", { name: "Sales tax amount", exact: true }).fill("1.50");
  await budget.getByRole("textbox", { name: "Delivery amount", exact: true }).fill("2.00");
  await budget.getByRole("textbox", { name: "Spending limit", exact: true }).fill("35.00");
  await expect(budget.getByTestId("budget-status")).toContainText("Within your entered limit");
  await expect(budget.getByTestId("budget-status")).toContainText("$33.50");
  await page.getByLabel("Preferred moisturizer feel").selectOption("rich");
  await expect(budget.getByRole("textbox", { name: "Price for Vanicream Moisturizing Cream", exact: true })).toHaveValue("");
  await expect(budget.getByTestId("budget-status")).toContainText("incomplete");
  await budget.getByRole("textbox", { name: "Spending limit", exact: true }).fill("25");
  await budget.getByLabel("Currency", { exact: true }).selectOption("EUR");
  await expect(budget.getByRole("textbox", { name: "Spending limit", exact: true })).toHaveValue("");
  for (const name of ["Cleanser", "Moisturizer", "Sunscreen"]) await page.getByRole("checkbox", { name, exact: true }).check();
  await expect(budget.getByRole("textbox", { name: /^Price for / })).toHaveCount(0);
  for (const name of ["Sales tax amount", "Delivery amount", "Spending limit"]) await budget.getByRole("textbox", { name, exact: true }).fill("0");
  await expect(budget.getByTestId("budget-status")).toContainText("Within your entered limit");
  await expect(budget.getByTestId("budget-status")).toContainText("€0.00");
  await page.getByRole("button", { name: "Clear this session", exact: true }).click();
  await expect(budget.getByLabel("Currency", { exact: true })).toHaveValue("USD");
  await expect(budget.getByRole("textbox", { name: /^Price for / })).toHaveCount(3);
  for (const amount of await budget.getByRole("textbox").all()) await expect(amount).toHaveValue("");
  for (const name of ["Cleanser", "Moisturizer", "Sunscreen"]) await expect(page.getByRole("checkbox", { name, exact: true })).not.toBeChecked();
  expect(unexpectedRequests).toEqual([]);
});

test("routine survey and spending checker fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/routine/");
  await expect(page.getByTestId("routine-budget")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit preferences", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
