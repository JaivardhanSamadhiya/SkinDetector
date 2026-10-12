export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 12_000_000;
export const MAX_IMAGE_EDGE = 8192;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type FileValidation = { valid: boolean; error?: string };
export function validateImageFile(file: Pick<File, "size" | "type">): FileValidation {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return { valid: false, error: "Choose a JPEG, PNG, or WebP image." };
  if (!Number.isFinite(file.size) || file.size <= 0) return { valid: false, error: "This file is empty or unreadable. Choose another image." };
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: "This image is too large. The limit is 10 MB." };
  return { valid: true };
}
export async function decodeImage(file: File): Promise<{ width: number; height: number }> {
  const admission = validateImageFile(file);
  if (!admission.valid) throw new Error(admission.error);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = readImageDimensions(bytes);
  if (!header) throw new Error("This file is not a supported, readable JPEG, PNG, or WebP image.");
  if (readImageType(bytes) !== file.type) throw new Error("The file contents do not match its image type. Choose an original JPEG, PNG, or WebP image.");
  if (isAnimatedImage(bytes)) throw new Error("Animated images are unsupported. Choose a single-frame JPEG, PNG, or WebP image.");
  validateDimensions(header.width, header.height);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let dimensions: { width: number; height: number };
  try { dimensions = { width: bitmap.width, height: bitmap.height }; } finally { bitmap.close(); }
  if (!dimensions.width || !dimensions.height) throw new Error("The image could not be decoded. Try a different file.");
  validateDimensions(dimensions.width, dimensions.height);
  return dimensions;
}
export function validateDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) throw new Error("Resize this image to at most 12 megapixels and 8192 pixels per side before uploading.");
}
export function readImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
function isAnimatedImage(bytes: Uint8Array): boolean {
  if (readImageType(bytes) === "image/webp" && bytes.length >= 21 && String.fromCharCode(...bytes.slice(12, 16)) === "VP8X") return Boolean(bytes[20] & 2);
  if (readImageType(bytes) !== "image/png") return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    if (offset + 12 + length > bytes.length) break;
    if (String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) === "acTL") return true;
    offset += length + 12;
  }
  return false;
}
export function readImageDimensions(bytes: Uint8Array): {width:number;height:number}|null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && readImageType(bytes) === "image/png") return {width:view.getUint32(16),height:view.getUint32(20)};
  if (bytes.length >= 4 && bytes[0]===255 && bytes[1]===216) {
    let offset=2; while (offset+4<=bytes.length) { if(bytes[offset]!==255) {offset++;continue;} const marker=bytes[offset+1]; if(marker===216||marker===217) {offset+=2;continue;} if(marker===218) break; const length=view.getUint16(offset+2); if(length<2||offset+2+length>bytes.length) break; if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7) return {height:view.getUint16(offset+5),width:view.getUint16(offset+7)}; offset+=length+2; }
  }
  if(bytes.length>=30 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP") {
    const format=String.fromCharCode(...bytes.slice(12,16));
    if(format==="VP8X") return {width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)};
    if(format==="VP8 " && bytes[23]===157&&bytes[24]===1&&bytes[25]===42) return {width:view.getUint16(26,true)&16383,height:view.getUint16(28,true)&16383};
    if(format==="VP8L" && bytes[20]===47) return {width:1+bytes[21]+((bytes[22]&63)<<8),height:1+((bytes[22]&192)>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)};
  }
  return null;
}
