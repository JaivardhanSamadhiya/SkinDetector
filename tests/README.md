# Test boundaries

Unit fixtures validate file admission controls and the response schema. They are not predictions and are never included in the app. Browser tests run the production static export, including real ONNX inference when an artifact/demo image is present. Failure tests intentionally block model downloads to exercise the unavailable state. The Python test suite covers server decode/preprocessing/model loading/endpoints and real artifact loading separately.

Run `npm run test:unit`, then `npx playwright install chromium` and `npm run test:e2e`. Browser tests build the export automatically; to reuse a freshly verified build, set `PLAYWRIGHT_SKIP_BUILD=1`. To target an already running frontend set `PLAYWRIGHT_BASE_URL` (tests will not start another server). Reports are in `playwright-report/`; traces/screenshots from failed tests are in `test-results/` and must not contain personal patient images.
