import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const consent = "I understand this is research, not a diagnosis, and I have permission to use this image.";
type ParityArtifact = { model_version: string; samples: { filename: string; status: string; scores: { id: string; label: string; score: number }[] }[] };
function parityArtifact(): ParityArtifact {
  // Generated from executed PyTorch inference; never used by the live application.
  const artifact = JSON.parse(readFileSync("models/browser_parity.json", "utf8")) as ParityArtifact;
  if (!artifact.samples?.length) throw new Error("Real PyTorch parity outputs are required for the browser inference check.");
  return artifact;
}
function researchSample(): string {
  return join("public/demo", parityArtifact().samples[0].filename);
}

async function selectSample(page: Page) {
  await page.goto("/analysis/");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles(researchSample());
  await expect(page.getByAltText("Your selected skin image")).toBeVisible();
  await page.getByRole("radio", { name: "Dermoscopic image", exact: true }).check();
  await page.getByRole("checkbox", { name: consent, exact: true }).check();
}

test("real ONNX upload-to-results flow exposes scores, CAM and deletion without transmitting the image", async ({ page }) => {
  const imagePosts: string[] = [];
  let modelDownloaded = false;
  page.on("request", request => { if (request.method() === "POST") imagePosts.push(request.url()); });
  page.on("response", response => { if (response.url().endsWith("/model/model.onnx") && response.ok()) modelDownloaded = true; });
  await selectSample(page);
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "Model ranking", exact: true })).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(7);
  const scores = await page.locator(".score-row > div:first-child > span:last-child").allTextContents();
  const labels = await page.locator(".score-row > div:first-child > span:first-child").allTextContents();
  const expected = parityArtifact().samples[0];
  expect(scores.every(text => Number.isFinite(Number(text)) && Number(text) >= 0 && Number(text) <= 1)).toBe(true);
  expect(scores.reduce((sum, text) => sum + Number(text), 0)).toBeCloseTo(1, 2);
  expect(labels).toEqual(expected.scores.map(score => score.label));
  expected.scores.forEach((expectedScore, index) => expect(Math.abs(Number(scores[index]) - expectedScore.score)).toBeLessThanOrEqual(.001));
  await expect(page.getByText("They are not probabilities that you have a condition.", { exact: false })).toBeVisible();
  await expect(page.getByText(`Model ${parityArtifact().model_version}`, { exact: true })).toBeVisible();
  await expect(page.getByAltText("Model activation overlay")).toBeVisible();
  const opacity = page.getByLabel("Overlay opacity", { exact: false });
  await opacity.press("Home");
  for (let step = 0; step < 20; step++) await opacity.press("ArrowRight");
  await expect(page.getByAltText("Model activation overlay")).toHaveCSS("opacity", "0.2");
  expect(modelDownloaded).toBe(true);
  expect(imagePosts).toEqual([]);
  await page.getByRole("link", { name: "Delete image and result", exact: true }).click();
  await expect(page).toHaveURL(/\/analysis\/$/);
  await expect(page.getByAltText("Your selected skin image")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze image", exact: true })).toBeDisabled();
  await page.goto("/results/");
  await expect(page.getByRole("heading", { name: "Your results belong to this session.", exact: true })).toBeVisible();
});

for (const imageType of ["Other image", "Not sure"]) test(`${imageType} receives no model scores`, async ({ page }) => {
  await selectSample(page);
  await page.getByRole("radio", { name: imageType, exact: true }).check();
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "This image isn't supported.", exact: true })).toBeVisible();
  await expect(page.getByText("Unable to assess", { exact: true })).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(0);
});

for (const sampleIndex of [1, 2]) test(`additional licensed sample ${sampleIndex} matches real PyTorch inference and uncertainty`, async ({ page }) => {
  const expected = parityArtifact().samples[sampleIndex];
  await page.goto("/analysis/");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles(join("public/demo", expected.filename));
  await page.getByRole("radio", { name: "Dermoscopic image", exact: true }).check();
  await page.getByRole("checkbox", { name: consent, exact: true }).check();
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "Model ranking", exact: true })).toBeVisible();
  const scores = await page.locator(".score-row > div:first-child > span:last-child").allTextContents();
  const labels = await page.locator(".score-row > div:first-child > span:first-child").allTextContents();
  expect(labels).toEqual(expected.scores.map(score => score.label));
  expected.scores.forEach((score, index) => expect(Math.abs(Number(scores[index]) - score.score)).toBeLessThanOrEqual(.001));
  if (expected.status === "uncertain") {
    await expect(page.getByText("Unable to assess", { exact: true })).toBeVisible();
    await expect(page.getByText(/the model output is uncertain/i)).toBeVisible();
  }
});

test("blank low-quality images are rejected with retake guidance", async ({ page }) => {
  await page.goto("/analysis/");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  // Generated technical test input, not a skin image and never a demo prediction.
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#000"; context.fillRect(0, 0, 128, 128);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Choose a skin image", { exact: true }).setInputFiles({ name: "quality-test.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") });
  await page.getByRole("radio", { name: "Dermoscopic image", exact: true }).check();
  await page.getByRole("checkbox", { name: consent, exact: true }).check();
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "A clearer image is needed.", exact: true })).toBeVisible();
  await expect(page.getByText(/The image is too dark/)).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(0);
});

test("unavailable model download fails safely with no fabricated prediction", async ({ page }) => {
  // Intentional network failure fixture, not a mock classifier or live model output.
  await page.route("**/model/model.onnx", route => route.abort("failed"));
  await selectSample(page);
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\/$/);
  await expect(page.getByRole("heading", { name: "No classification was made.", exact: true })).toBeVisible();
  await expect(page.locator(".score-row")).toHaveCount(0);
  await expect(page.getByAltText("Model activation overlay")).toHaveCount(0);
});

test("invalid, corrupt and oversized files receive actionable upload errors", async ({ page }) => {
  await page.goto("/analysis/");
  const input = page.getByLabel("Choose a skin image", { exact: true });
  const uploadError = page.getByRole("main").getByRole("alert");
  await input.setInputFiles({ name: "untrusted.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') });
  await expect(uploadError).toContainText("Choose a JPEG, PNG, or WebP image.");
  await input.setInputFiles({ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(uploadError).toContainText("10 MB");
  await input.setInputFiles({ name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) });
  await expect(uploadError).toContainText("empty");
  await input.setInputFiles({ name: "corrupt.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(uploadError).toBeVisible();
  await expect(page.getByAltText("Your selected skin image")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze image", exact: true })).toBeDisabled();
});

test("drag-and-drop, replacement and mobile navigation stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analysis/");
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  const sample = researchSample();
  const bytes = Array.from(readFileSync(sample));
  const transfer = await page.evaluateHandle(({ bytes, name }) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], name, { type: "image/png" }));
    return data;
  }, { bytes, name: sample.split(/[\\/]/).pop()! });
  await page.locator(".drop-zone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByAltText("Your selected skin image")).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace image", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete selected image", exact: true }).click();
  await expect(page.locator(".drop-zone")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
