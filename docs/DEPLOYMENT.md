# Setup and deployment

The default application is a static Next.js export with browser ONNX inference. Python is optional for dermoscopy only; ordinary-photo inference always stays on-device. Historical MobileNet remains disabled. Photo-v2's float32 repair evaluation and actual Chromium WASM verification are complete, with full UI/hosted deployment checks still required; all v2 research outputs remain uncertain and cannot drive condition-based products. Missing/failed artifacts must produce unavailable, never a manufactured prediction. [The v2 report](PHOTO_EVALUATION_REPORT.md) separates computation readiness from useful condition identification.

## Local frontend

Use Node.js 22 or newer and npm:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Leave `NEXT_PUBLIC_INFERENCE_URL` empty for local browser processing. Build and serve the production artifact:

```powershell
npm run build
npm start
```

The build emits `out/`, which includes the app, model and same-origin ONNX runtime. Do not serve `legacy/`, datasets, local environments or the whole repository as the site's document root.

The scripts use Next's Webpack path and a Windows-only filesystem compatibility preload. This workspace's virtual drive returns `EISDIR` when `readlink` targets a normal file; the preload normalizes that error to `EINVAL` only after confirming the path is not a symlink. Linux and ordinary filesystem behavior are unchanged. Matching optional CSS binaries are locked for Windows x64 and Linux x64 GNU/musl.

The post-build step also adds the flattened segment-prefetch filenames requested by Next's static router when Windows writes them as nested directories. Serve exported `.txt` files as `text/plain` (or `text/x-component`); otherwise Next falls back to a full page load and loses the in-memory image session. The included test server and Nginx configuration provide the required MIME types. Keep all generated export files when deploying.

## Vercel

Import the SkinDetector GitHub repository into Vercel. Select Next.js; install with `npm ci` and build with `npm run build`. The app uses `output: "export"`, so Vercel serves the static application. Leave `NEXT_PUBLIC_INFERENCE_URL` unset for browser inference. Verify hosted `/model/manifest.json`, `/model/model.onnx`, historical `/model-clinical/` manifests/reports, photo-v2 `/model-photo/manifest.json`, every graph part referenced by that manifest, and `/ort/` assets. Run real upload/inference on the actual hosted origin before claiming deployment works. Photo-v2 parts total about 346 MB; splitting them below 20 MiB does not reduce browser memory or total download, and host bandwidth/file limits require checking.

If using an API, set `NEXT_PUBLIC_INFERENCE_URL=https://your-research-service.example` and rebuild. Public env changes cannot be applied only at runtime because the frontend is static. Configure backend CORS to the exact deployment origin. Do not point a public HTTPS website at a private localhost HTTP server.

No account credentials are included. A committed configuration and successful local build are not evidence of an actual cloud deployment; record the real verified deployment URL separately when available.

## Verified private deployment

[SkinSnap on Sites](https://skinsnap-research-lab.jauntyghost8.chatgpt.site) was published privately and tested on its actual HTTPS origin. Chromium loaded the separate dermoscopic model/WASM, completed genuine lesion inference and matched displayed scores to PyTorch; no image-inference POST was sent. This evidence belongs to that earlier deployment and does not establish the latest photo-v2 browser repair. Historical MobileNet stays unavailable. V2 has completed artifact evaluation and actual Chromium WASM verification; full upload-to-results integration and the production build passed; hosted publication is verified separately, and its research outputs remain uncertain and cannot drive condition-specific care. This is owner-private Sites hosting, not a provisioned Vercel/Render service. Preserve the audience; see dated [validation evidence](VALIDATION.md) for the subsequently verified deployment/version.

For Sites packaging on Windows with GNU tar, set `TAR_OPTIONS=--force-local` in the packaging process so a drive-letter archive path is not interpreted as a remote host. The source helper handles exact-source commit/push and archives only the exported static assets and hosting manifest. Source credentials belong in hidden stdin only; never commit tokens or preview authorization.

## Docker static frontend

```powershell
docker build -t skinsnap-web .
docker run --rm -p 8080:80 skinsnap-web
```

Open `http://localhost:8080`. For optional server inference, supply the public service URL at build time using `--build-arg NEXT_PUBLIC_INFERENCE_URL=...`. The image serves only `out/`. Inspect Docker/hosting logs and request capture settings against [the privacy documentation](SECURITY_AND_PRIVACY.md).

## Optional Python inference service

Follow the backend setup and artifact commands in the main README and [training documentation](TRAINING.md). Use the supplied backend Dockerfile for a container host; ensure the model checkpoint/manifest are deployed with the service. Health checks should distinguish service liveness from model availability. An API returning a liveness response while lacking weights is not a working classifier deployment.

`render.yaml` supplies a Render blueprint for this optional Docker service. It requests `ALLOWED_ORIGINS` during deployment; set the exact HTTPS frontend origin (comma-separated if more than one is intended). See the [Render blueprint specification](https://render.com/docs/blueprint-spec) and [port-binding documentation](https://render.com/docs/web-services#port-binding). The template fixes `PORT=8000` to match the container command. Rebuild the frontend with the real public API URL after the backend has been verified.

For a local pair of containers, `docker compose up --build` starts the browser-inference frontend. To exercise server mode instead:

```powershell
$env:NEXT_PUBLIC_INFERENCE_URL = "http://localhost:8000"
docker compose --profile api up --build
```

Here `localhost:8000` is reached by the browser, not by the web container. In production use the public HTTPS API origin.

Choose a host with enough memory for the pinned PyTorch runtime and verify upload timeouts/body limits. Do not assume any host's free tier, price or availability. Place the service behind HTTPS, configure exact CORS origins and rate/concurrency controls, and disable body/image logging. Verify the real inference response plus model version before recording the demo.

## Checks before showing a demo

Run unit/backend/browser tests and a production build. Use licensed research examples only, check model provenance and actual evaluation, verify unavailable/unsupported states, and test the deployed origin. Follow [competition disclosure notes](COMPETITION_NOTES.md) before submitting. A startup presentation does not change the dataset's noncommercial license.
