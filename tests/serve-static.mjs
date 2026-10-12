// Loopback-only production-export server used by browser tests; not a hosting service.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";

const root = resolve("out");
const mime = { ".html": "text/html", ".txt": "text/plain; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".woff2": "font/woff2", ".onnx": "application/octet-stream" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    let target = resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Outside export");
    if ((await stat(target)).isDirectory()) target = resolve(target, "index.html");
    const bytes = await readFile(target);
    response.writeHead(200, { "Content-Type": mime[extname(target)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(bytes);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
  }
});
server.listen(3100, "127.0.0.1", () => process.stdout.write("SkinSnap export ready at http://127.0.0.1:3100\n"));
process.on("SIGTERM", () => server.close());
