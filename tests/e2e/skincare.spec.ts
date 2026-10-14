import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const consent = "I understand this is research, not a diagnosis, and I have permission to use this image.";
const manifest = JSON.parse(readFileSync("models/browser_parity.json", "utf8")) as {samples:{filename:string}[]};

async function upload(page: import("@playwright/test").Page, domain: "Dermoscopic image" | "Other image" = "Dermoscopic image") {
  await page.getByLabel("Choose a skin image", { exact:true }).setInputFiles(join("public/demo", manifest.samples[0].filename));
  await expect(page.getByAltText("Your selected skin image")).toBeVisible();
  await page.getByRole("radio", { name:domain, exact:true }).check();
  await page.getByRole("checkbox", { name:consent, exact:true }).check();
  await page.getByRole("button", { name:"Analyze image", exact:true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
}

test("survey carries into real results, displays a combination, and edits without rerunning inference", async ({ page }) => {
  const posts:string[] = []; let modelRequests = 0;
  page.on("request", request => { if(request.method()==="POST") posts.push(request.url()); if(request.url().endsWith("/model/model.onnx")) modelRequests++; });
  await page.goto("/analysis/");
  await page.getByLabel("How does your skin usually feel?").selectOption("dry");
  await page.getByLabel("Does it react easily to new products?").selectOption("yes");
  await page.getByLabel("Preferred moisturizer feel").selectOption("rich");
  await page.getByRole("checkbox", {name:"Niacinamide",exact:true}).check();
  await page.getByRole("checkbox", {name:"Cleanser",exact:true}).check();
  await page.getByRole("button", {name:"Save preferences",exact:true}).click();
  await expect(page.getByText("Preferences saved for this session",{exact:true})).toBeVisible();
  await upload(page);
  await expect(page.getByRole("heading",{name:"Your skincare starting point.",exact:true})).toBeVisible();
  await expect(page.locator("[data-routine-step]")).toHaveCount(3);
  await expect(page.locator('[data-routine-step="cleanser"]')).toContainText("Keep your existing cleanser");
  await expect(page.locator('[data-routine-step="cleanser"]').getByRole("link")).toHaveCount(0);
  await expect(page.locator('[data-routine-step="moisturizer"]')).toContainText("Vanicream Moisturizing Cream");
  await expect(page.getByRole("radio", { name: "Choose Vanicream Moisturizing Cream", exact: true })).toBeChecked();
  await expect(page.getByTestId("result-care-guidance")).toHaveAttribute("data-label-id", "nv");
  await expect(page.getByTestId("result-care-guidance")).toContainText("cannot establish that a spot is benign");
  await expect(page.getByTestId("routine-subtotal")).toContainText("$28.67");
  const cream = page.locator('[data-product-option="vanicream-moisturizing-cream"]');
  await expect(cream).toContainText("$13.19");
  await expect(cream).toContainText("16 oz jar");
  await expect(cream.getByRole("link", { name: "View at Target", exact: true })).toHaveAttribute("href", "https://www.target.com/p/-/A-14768513");
  await page.getByRole("radio", { name: "Choose Vanicream Daily Facial Moisturizer", exact: true }).check();
  await expect(page.getByTestId("routine-subtotal")).toContainText("$29.47");
  await expect(page.getByText("For your everyday routine, independent of the lesion result.",{exact:true})).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(7);
  const beforeEdit = modelRequests;
  await page.getByRole("button",{name:"Adjust preferences",exact:true}).click();
  await page.getByLabel("Preferred moisturizer feel").selectOption("light");
  await expect(page.locator('[data-routine-step="moisturizer"]')).toContainText("Vanicream Daily Facial Moisturizer");
  await expect(page.getByRole("radio", { name: "Choose Vanicream Daily Facial Moisturizer", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "Niacinamide", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Cleanser", exact: true }).uncheck();
  await expect(page.getByRole("radio", { name: "Choose CeraVe Foaming Facial Cleanser", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Niacinamide", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Choose CeraVe Foaming Facial Cleanser", exact: true })).toHaveCount(0);
  expect(modelRequests).toBe(beforeEdit);
  expect(posts).toEqual([]);
  await page.getByRole("link",{name:"Delete image and result",exact:true}).click();
  await expect(page.getByLabel("How does your skin usually feel?")).toHaveValue("unsure");
  await expect(page.getByRole("checkbox",{name:"Niacinamide",exact:true})).not.toBeChecked();
  await expect(page.getByRole("checkbox",{name:"Cleanser",exact:true})).not.toBeChecked();
});

test("an unsupported image still offers independent general care without pretending to diagnose", async ({ page }) => {
  await page.goto("/analysis/");
  await page.getByRole("button",{name:"Skip · use general basics",exact:true}).click();
  await upload(page,"Other image");
  await expect(page.getByRole("heading",{name:"This image isn't supported.",exact:true})).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Your skincare starting point.",exact:true})).toBeVisible();
  await expect(page.getByText("For your everyday routine, independent of the lesion result.",{exact:true})).toBeVisible();
  await expect(page.getByTestId("result-care-guidance")).toHaveAttribute("data-label-id", "none");
  await expect(page.getByTestId("result-care-guidance")).toContainText("cannot identify acne, rosacea, eczema");
  await expect(page.getByTestId("routine-subtotal")).toContainText("$39.46");
});

test("a real uncertain model output never supplies label-specific care or treatment products", async ({ page }) => {
  await page.goto("/analysis/");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.getByLabel("Choose a skin image", { exact:true }).setInputFiles(join("public/demo", manifest.samples[2].filename));
  await page.getByRole("radio", { name:"Dermoscopic image", exact:true }).check();
  await page.getByRole("checkbox", { name:consent, exact:true }).check();
  await page.getByRole("button", { name:"Analyze image", exact:true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name:"Unable to assess reliably.", exact:true })).toBeVisible();
  await expect(page.getByTestId("result-care-guidance")).toHaveAttribute("data-label-id", "none");
  await expect(page.getByTestId("result-care-guidance")).toContainText("uncertainty rule rejected");
  await expect(page.getByTestId("result-care-guidance")).not.toContainText("highest-ranked dataset category");
  await expect(page.locator(".score-row")).toHaveCount(7);
  await expect(page.getByTestId("routine-subtotal")).toContainText("$39.46");
});

test("mobile survey preserves owned basics and refresh erases the session", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/analysis/");
  for(const name of ["Cleanser","Moisturizer","Sunscreen"]) await page.getByRole("checkbox",{name,exact:true}).check();
  await page.getByRole("button",{name:"Save preferences",exact:true}).click();
  await upload(page);
  for(const id of ["cleanser","moisturizer","sunscreen"]) await expect(page.locator(`[data-routine-step="${id}"]`)).toContainText(`Keep your existing ${id}`);
  await expect(page.getByRole("link",{name:"Check manufacturer details",exact:true})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading",{name:"Your results belong to this session.",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Choose an image",exact:true}).click();
  await expect(page.getByRole("checkbox",{name:"Moisturizer",exact:true})).not.toBeChecked();
});
