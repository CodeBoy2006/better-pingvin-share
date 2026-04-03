# Backend API black-box suites

`backend/test/system/` contains the suite manifests, Postman environment, and scripted regressions that power `Batch F`.

## Commands

- `npm run test:system` / `npm run test:system:smoke`: PR-safe smoke coverage.
- `npm run test:system:full-regression`: the full Newman + scripted regression suite for nightly or pre-release gates.
- `npm run test:system:v1`: ad-hoc `/api/v1` collection debugging without the suite manifest.

## Layout

- `environments/runtime.postman_environment.json`: shared Newman runtime variables.
- `suites/smoke.json`: filtered smoke suite for quick feedback.
- `suites/full-regression.json`: full legacy + `/api/v1` regression suite.
- `scenarios/anonymous-owner-flow.mjs`: scripted anonymous-owner regression that depends on the admin bootstrap from the legacy share step.
- `helpers/http-scenario.mjs`: request/response snapshot helper for script-driven regressions.

## Artifacts

Each suite writes to `test-results/backend/system/<suite>/`:

- `runtime.json`, `prisma.log`, and `backend.log`
- one numbered directory per step with `summary.json`, `report.html`, `newman.json`, `newman.junit.xml`, or `script.log`
- per-request snapshots under `snapshots/`

## CI intent

- `smoke` is the intended PR-required backend black-box gate.
- `full-regression` is intended for nightly, release-candidate, or manual deep-dive runs.
- Batch H should wire these commands into GitHub Actions once the workflow layer is updated.
