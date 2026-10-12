import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_SIZE, decodeImage, readImageDimensions, validateDimensions, validateImageFile } from "@/lib/image-validation";

describe("upload admission controls", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("permits a nonempty supported %s image for decoding", (type) => {
    expect(validateImageFile({ type, size: 2048 }).valid).toBe(true);
  });

  it.each(["image/svg+xml", "image/gif", "application/javascript", "text/html", ""])("rejects %s before decode", (type) => {
    const result = validateImageFile({ type, size: 2048 });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/JPEG.*PNG.*WebP/i);
  });

  it("distinguishes empty files from oversized files with actionable feedback", () => {
    expect(validateImageFile({ type: "image/png", size: 0 })).toMatchObject({ valid: false, error: expect.stringMatching(/empty/i) });
    expect(validateImageFile({ type: "image/png", size: MAX_FILE_SIZE + 1 })).toMatchObject({ valid: false, error: expect.stringMatching(/10 MB/i) });
    expect(validateImageFile({ type: "image/png", size: MAX_FILE_SIZE }).valid).toBe(true);
  });
});

function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  view.setUint32(16, width); view.setUint32(20, height);
  bytes[24] = 8; bytes[25] = 2;
  return bytes;
}

describe("bounded decoding and orientation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads dimensions before attempting expensive image allocation", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);
    const file = new File([pngHeader(4000, 4000)], "header-only.png", { type: "image/png" });
    await expect(decodeImage(file)).rejects.toThrow(/12 megapixels/);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("rejects corrupt headers before decoding", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);
    await expect(decodeImage(new File(["not an image"], "wrong.png", { type: "image/png" }))).rejects.toThrow(/readable/);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("asks the browser to apply orientation and releases decoded bitmap memory", async () => {
    // The bitmap is a decoder test double; real corrupt decoding is covered in Chromium.
    const close = vi.fn();
    const createBitmap = vi.fn().mockResolvedValue({ width: 200, height: 100, close });
    vi.stubGlobal("createImageBitmap", createBitmap);
    const file = new File([pngHeader(100, 200)], "orientation-test.png", { type: "image/png" });
    await expect(decodeImage(file)).resolves.toEqual({ width: 200, height: 100 });
    expect(createBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects impossible dimensions and very long edges", () => {
    expect(() => validateDimensions(0, 280)).toThrow();
    expect(() => validateDimensions(9000, 10)).toThrow();
    expect(() => validateDimensions(4000, 4000)).toThrow();
    expect(() => validateDimensions(3000, 4000)).not.toThrow();
  });

  it("reads PNG and extended WebP geometry without trusting the filename", () => {
    expect(readImageDimensions(pngHeader(321, 456))).toEqual({ width: 321, height: 456 });
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
    webp.set([255, 0, 0, 127, 0, 0], 24);
    expect(readImageDimensions(webp)).toEqual({ width: 256, height: 128 });
  });

  it("rejects a raster whose bytes disagree with the declared MIME type", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);
    await expect(decodeImage(new File([pngHeader(28, 28)], "spoof.jpg", { type: "image/jpeg" }))).rejects.toThrow(/contents do not match/i);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("requires the complete PNG signature", () => {
    const bytes = pngHeader(28, 28); bytes[7] = 0;
    expect(readImageDimensions(bytes)).toBeNull();
  });

  it.each([NaN, Infinity, -1, 28.5])("rejects nonintegral or impossible geometry %s", value => {
    expect(() => validateDimensions(value, 28)).toThrow();
    expect(() => validateDimensions(28, value)).toThrow();
  });

  it("rejects animated PNG before allocating bitmap memory", async () => {
    const bytes = new Uint8Array(53); bytes.set(pngHeader(28, 28));
    new DataView(bytes.buffer).setUint32(33, 8); bytes.set(new TextEncoder().encode("acTL"), 37);
    const createBitmap = vi.fn(); vi.stubGlobal("createImageBitmap", createBitmap);
    await expect(decodeImage(new File([bytes], "animation.png", { type: "image/png" }))).rejects.toThrow(/Animated images/i);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("rejects animated WebP before allocating bitmap memory", async () => {
    const bytes = new Uint8Array(30); bytes.set(new TextEncoder().encode("RIFF"), 0); bytes.set(new TextEncoder().encode("WEBPVP8X"), 8); bytes[20] = 2;
    const createBitmap = vi.fn(); vi.stubGlobal("createImageBitmap", createBitmap);
    await expect(decodeImage(new File([bytes], "animation.webp", { type: "image/webp" }))).rejects.toThrow(/Animated images/i);
    expect(createBitmap).not.toHaveBeenCalled();
  });
});
