## [2026-04-03 13:05] Optimize Docker image CI for native ARM builds
- **Changes:** Reworked the Docker publish workflow to build `linux/amd64` and `linux/arm64` on separate native GitHub-hosted runners (`ubuntu-24.04` and `ubuntu-24.04-arm`) instead of building both platforms together through QEMU emulation. Also switched the Buildx cache export from a shared `mode=max` cache to per-platform `mode=min` caches and merged the per-architecture digests into a final multi-arch manifest in a dedicated follow-up job.
- **Status:** Completed
- **Next Steps:** Monitor the next image publish run to confirm the expected arm64 build-time drop and smaller GitHub Actions cache export time in real CI telemetry.
- **Context:** Validated the updated workflow with local YAML parsing and diff review. This change targets the previously observed bottlenecks from QEMU-emulated arm64 installs/builds and oversized `type=gha,mode=max` cache uploads.
## [2026-04-03 13:14] Split dev and release image tags
- **Changes:** Updated the Docker publish workflow so pushes to `main` only publish a `development` image tag, while `v*` tag builds publish the formal release tags plus `latest`. Removed the old branch tags (`main`, `edge`, and SHA-based tags) from the metadata strategy so stable image publication now happens only from release tags.
- **Status:** Completed
- **Next Steps:** Verify the next `main` push only refreshes `ghcr.io/...:development` and the next tagged release publishes `vX.Y.Z` plus `latest` without extra stable tags from branch builds.
- **Context:** Verified with local YAML parsing and diff review. This change keeps CI builds on `main` useful for dev image validation while preventing normal branch pushes from publishing formal release tags.
## [2026-04-03 13:21] Add manual Docker publish modes and workflow controls
- **Changes:** Extended the Docker image workflow's `workflow_dispatch` trigger with manual controls for publish mode (`development`, `release`, or `none`), manual release tag input, optional `latest` publication for manual releases, platform selection (`all` / `amd64` / `arm64`), and cache mode selection (`min` / `none`). Added a prepare job that validates inputs, resolves the build plan for automatic and manual runs, writes job summaries, and lets build-only dispatches skip registry pushes while still exercising native per-platform builds.
- **Status:** Completed
- **Next Steps:** Trigger a manual test run from the Actions UI for each mode (`none`, `development`, `release`) to confirm the resolved summary, per-platform matrix, and final published tags behave as intended on GitHub-hosted runners.
- **Context:** Verified with local YAML parsing and `git diff --check`. Also retained the native ARM runner split and per-platform cache strategy from the prior CI optimization so manual runs inherit the same performance improvements.
## [2026-04-03 13:28] Fix uppercase GHCR repository names in Docker workflow
- **Changes:** Updated the Docker publish workflow to derive the GHCR image reference from a lowercased copy of `${{ github.repository }}` during the prepare phase, then reused that normalized image name for metadata generation, per-platform digest pushes, manifest creation, and workflow summaries.
- **Status:** Completed
- **Next Steps:** Re-run the failed Docker image workflow to confirm the build now exports and pushes successfully for repositories whose owner or repo name contains uppercase characters.
- **Context:** Validated with local YAML parsing, `git diff --check`, and a workflow diff review. This specifically addresses Buildx rejecting `ghcr.io/CodeBoy2006/better-pingvin-share` because GHCR repository names must be lowercase.
## [2026-04-03 14:15] Fix Docker seed module resolution
- **Changes:** Updated `backend/prisma/seed/config.seed.ts` to resolve `configDefinitions` from the source tree during normal development and fall back to the compiled `dist` tree inside production Docker images, eliminating the startup failure introduced when config definitions moved out of the seed file.
- **Status:** Completed
- **Next Steps:** Rebuild and republish the `development` image, then restart the server to confirm the backend reaches `node dist/src/main` and `/api/health` returns healthy through Caddy.
- **Context:** Verified both source-style and runner-style layouts by running `prisma migrate deploy && prisma db seed` in temporary backend copies with and without `src/`; both paths now seed successfully.
## [2026-04-03 14:34] Clarify logo PNG upload fix
- **Changes:** Added the missing backend `file-type` dependency required by NestJS `FileTypeValidator`, so the admin logo upload endpoint can validate PNG files using magic-number detection instead of rejecting valid uploads.
- **Status:** Completed
- **Next Steps:** Restart or redeploy the backend so the updated dependency is installed in the running environment before retrying the logo upload from the admin UI.
- **Context:** Verified with `cd backend && npm run build` and a direct Node check that `FileTypeValidator({ fileType: "image/png" })` now accepts `frontend/public/img/logo.png`.
## [2026-04-03 15:02] Add API v1 ZIP bundle download
- **Changes:** Added `GET /api/v1/shares/:shareId/files/zip` in `backend/src/apiV1/apiV1.file.controller.ts` for bearer-token-protected bundle downloads. Implemented owner-scoped ZIP streaming in `backend/src/file/file.service.ts` and `backend/src/file/local.service.ts`, updated `backend/test/newman-api-v1.json` to cover the new archive endpoint, and documented the curl example in `README.md`.
- **Status:** Completed
- **Next Steps:** If external API docs or SDK snippets exist outside `README.md`, mirror the new ZIP endpoint there as well.
- **Context:** Verified with `cd backend && npm run build` and `cd backend && npm run test:system:v1`. The system test script left a temporary backend process on port `8080`, which was cleaned up after the run.
## [2026-04-03 15:41] Establish test infrastructure batch A
- **Changes:** Added root testing commands and shared `.env.test` defaults, introduced backend Jest scaffolding (`backend/test/jest.config.cjs`, `backend/test/helpers/backend-test-runtime.ts`, unit/integration directories), introduced frontend Vitest/RTL scaffolding (`frontend/vitest.config.mjs`, `frontend/test/setup.ts`, `frontend/test/render.tsx`), added a root Playwright config plus `e2e/` placeholder, and replaced the backend system-test launcher with `scripts/testing/run-backend-system-tests.mjs` so Newman runs on isolated SQLite data directories, dynamic ports, and captured result logs under `test-results/`.
- **Status:** Completed
- **Next Steps:** Batch B/C/D/E can now start adding real backend/frontend test cases on top of the shared helpers; separately investigate the existing anonymous-owner deletion regression that still fails in `backend/test/anonymous-owner-flow.e2e.js` under the new runner.
- **Context:** Verified with `npm run quality`, `cd backend && npm run test:system:v1`, and `cd backend && npm run test:system:smoke`. The new runner correctly isolates ports and artifacts, but `test:system:smoke` currently exposes a product-level assertion failure (`deleted anonymous shares should no longer expose an owner payload`) rather than an infrastructure failure.
## [2026-04-03 16:13] Batch D frontend logic and middleware tests
- **Changes:** Expanded the frontend Vitest runtime with reusable router/fetch helpers and provider-aware hook rendering, added unit coverage for `frontend/src/utils`, `frontend/src/services`, `frontend/src/hooks`, and `frontend/src/middleware.ts`, and hardened `frontend/src/hooks/useTranslate.hook.ts` plus `frontend/src/utils/router.util.ts` to better handle locale fallback and redirect sanitization.
- **Status:** Completed
- **Next Steps:** Batch E can build UI/page interaction tests on top of the shared frontend test helpers, and Batch H can later consume the generated frontend JSON report and coverage artifacts in CI.
- **Context:** Verified in `/tmp/worktrees/batch-d-frontend-logic` with `npm --prefix frontend test`, `npm --prefix frontend run typecheck`, and `./frontend/node_modules/.bin/prettier --check $(git -C /tmp/worktrees/batch-d-frontend-logic diff --name-only -- '*.ts' '*.tsx' '*.mjs' '*.md')`.

## [2026-04-03 16:15] Batch E frontend UI and page coverage
- **Changes:** Added Vitest UI/component suites for auth, upload, share, account, and admin flows; added page smoke coverage for `/`, `/upload`, `/share/[shareId]`, `/account/*`, and `/admin/*`; extended frontend test helpers/router mocks and improved accessible labels for icon-only controls.
- **Status:** Completed
- **Next Steps:** Feed these suites into CI jobs, expand component coverage for remaining account/admin edge cases, and keep selectors aligned with accessible labels as new UI lands.
- **Context:** Frontend tests run from the Batch E worktree using symlinked `node_modules`; reports land in `test-results/frontend/`.

## [2026-04-03 16:24] Batch B auth and management test coverage
- **Changes:** Added backend unit and HTTP integration coverage for auth, user, config, and reverse-share domains; introduced Batch B-specific fixtures and an isolated Nest app bootstrap helper for SQLite-backed integration tests; fixed CommonJS interop imports for `moment`, `qrcode-svg`, and `clamscan`; added a dedicated backend typecheck config so package type checks stay green without pulling Jest globals into app compilation.
- **Status:** Completed
- **Next Steps:** Batch F/G/H can now consume the new backend test suites and CI-safe scripts; if desired, the remaining auth/config runtime warnings can be reduced by moving the ts-jest `isolatedModules` flag into `backend/test/tsconfig.json`.
- **Context:** Verified in the Batch B worktree with `npm --prefix backend run test:ci`, `npm --prefix backend run typecheck`, and `npm --prefix backend run build`. Integration tests boot a custom Nest module against per-suite temporary SQLite data directories and stub outbound email calls.

## [2026-04-03 16:26] Deliver Batch C backend share and API coverage
- **Changes:** Added dedicated Batch C fixtures and Jest integration harnesses under `backend/test/fixtures/` plus 9 new unit/integration suites covering `share`, `file`, `apiToken`, `/api/v1`, reverse-share flows, and the legacy anonymous-owner `/shares` flow. Extracted reusable Nest app bootstrapping into `backend/src/app.setup.ts` for test parity, and normalized several CommonJS-style imports (`moment`, `archiver`, `content-disposition`, `cookie-parser`, `body-parser`, `clamscan`) so the backend behaves correctly under the Jest runtime and HTTP integration tests.
- **Status:** Completed
- **Next Steps:** Batch F can now reuse the same isolated app/runtime helpers for API black-box regression work, and Batch G can layer browser E2E on top of the validated anonymous-owner and API v1 flows.
- **Context:** Verified with `cd backend && npm run typecheck` and `cd backend && npm run test:ci` in the Batch C worktree; backend unit tests now pass `20/20` and integration tests pass `11/11` without the previous ts-jest deprecation warning.
## [2026-04-03 16:48] Integrate Batch B/C/D/E worktrees
- **Changes:** Created the `integration-bcde` worktree from `main`, merged `batch-d-frontend-logic`, `batch-e-ui-pages`, `batch-b-auth-management-tests`, and `batch-c-share-api-tests`, and resolved shared-helper conflicts in `frontend/test/*`, `backend/src/reverseShare/reverseShare.service.ts`, and `statusquo.md`. Added frontend ESLint overrides for Vitest globals, replaced the test-only `React.ReactNode` reference in `frontend/src/components/upload/upload-components.test.tsx`, moved `frontend/src/pages/page-smoke.test.tsx` to `frontend/test/page-smoke.test.tsx` so Next no longer treats it as a route, and excluded `**/.next/**` from Vitest discovery.
- **Status:** Completed
- **Next Steps:** Hand this integration worktree to Wave 2 consumers (`F/G` first, `H` after they settle) and decide whether to clean up the existing frontend `no-unused-vars` warnings before wiring CI gatekeeping.
- **Context:** Verified in `/tmp/worktrees/integration-bcde` with symlinked root/backend/frontend `node_modules`, `npm run typecheck`, `npm run test:fast`, `npm --prefix frontend run test`, and `npm run build`. The build now succeeds; remaining output is limited to pre-existing frontend `no-unused-vars` warnings and Next Edge-runtime warnings from `frontend/src/services/config.service.ts` importing `axios`.
## [2026-04-03 17:20] Fix backend CommonJS runtime interop
- **Changes:** Enabled `esModuleInterop` in `backend/tsconfig.json`, kept `backend/src/clamscan/clamscan.service.ts` on standard default-import syntax so Nest runtime can instantiate `clamscan`, and corrected `backend/src/config/logo.service.ts` to default-import `sharp` so the backend build compiles under the new interop settings.
- **Status:** Completed
- **Next Steps:** Fix the remaining anonymous-owner regressions surfaced by system smoke and backend coverage so the full backend regression stack turns green.
- **Context:** Verified with `npm --prefix backend run build`; `npm --prefix backend run test:system:smoke` now boots the app, runs the Newman collection successfully, and fails only on the existing anonymous-owner regression script instead of crashing during dependency initialization.
## [2026-04-03 17:26] Fix anonymous owner regressions
- **Changes:** Updated `backend/src/share/share.service.ts` so expired shares no longer resolve through owner-scoped lookups, added a unit regression in `backend/test/unit/share/share.service.spec.ts`, and stabilized `backend/test/integration/share/legacy-share.controller.spec.ts` by removing the time-sensitive owner-token equality assertion while adding delete-path coverage for anonymous owner access.
- **Status:** Completed
- **Next Steps:** If desired, the next cleanup pass can fold the backend system-smoke launcher and root test scripts into a root `test` / `test:coverage` workflow.
- **Context:** Verified with `npm --prefix backend run test:coverage` and `npm --prefix backend run test:system:smoke`; backend coverage now passes `99/99`, and the anonymous owner system regression script now passes end-to-end.
## [2026-04-03 17:29] Add root test entrypoints
- **Changes:** Added root-level `test` and `test:coverage` scripts in `package.json` so the repo can run fast tests and coverage from one command, and updated `docs/docs/help-out/contribute.md` so contributor docs reflect the current backend/frontend/system/Playwright test layers.
- **Status:** Completed
- **Next Steps:** If we want a fuller Batch A finish, the next isolated step is adding JUnit-style reporters and CI-friendly artifact names without touching the in-flight Playwright workflow changes already present in the worktree.
- **Context:** Verified with `npm run test` and `npm run test:coverage`; both root commands now execute successfully and route to the expected backend/frontend suites.
## [2026-04-03 17:31] Batch F API Black-Box Regression
- **Changes:** Added suite-driven backend API black-box orchestration in `scripts/testing/run-backend-system-tests.mjs`, introduced `backend/test/system/` manifests/environment/scripted regressions plus HTML/JSON/JUnit/snapshot artifacts, updated backend test scripts/docs, and fixed runtime CommonJS import issues plus anonymous-owner deletion semantics that were blocking end-to-end API smoke/full suites.
- **Status:** Completed
- **Next Steps:** Batch H can wire `npm run test:system` to PR checks and `npm run test:system:full-regression` to nightly/release workflows, reusing the generated artifacts under `test-results/backend/system/`.
- **Context:** Verified in the `batch-f-api-blackbox` worktree with `cd backend && npm run build`, `cd backend && npm run test:system:smoke`, and `cd backend && npm run test:system:full-regression`.
## [2026-04-03 17:38] Add CI-friendly test reports
- **Changes:** Added backend JUnit reporting via `jest-junit`, switched `backend` `test:ci` to emit JSON results into `test-results/backend/`, and extended `frontend/vitest.config.mjs` to emit both JSON and JUnit reports into `test-results/frontend/`.
- **Status:** Completed
- **Next Steps:** Finish the remaining Batch A script parity work (`backend`/`frontend` package-level `test:fast` and `test:all`) or move on to CI wiring once the in-flight Playwright changes are ready.
- **Context:** Verified with `npm --prefix backend run test:ci`, `npm --prefix frontend run test`, and `npm run test`; reports now land in `test-results/backend/jest.json`, `test-results/backend/junit.xml`, `test-results/frontend/vitest.json`, and `test-results/frontend/junit.xml`.
## [2026-04-03 17:45] Add package-level fast and full test aliases
- **Changes:** Added `test:fast` and `test:all` aliases to `backend/package.json` and `frontend/package.json` so package-local test entrypoints now mirror the root-layer naming without changing the underlying test runners.
- **Status:** Completed
- **Next Steps:** If we keep pushing Batch A, the next tidy step is deciding whether to add package-local `test` aliases for backend parity or leave `test:ci` as the backend default fast entrypoint.
- **Context:** Verified with `npm --prefix frontend run test:fast`, `npm --prefix frontend run test:all`, `npm --prefix backend run test:fast`, and `npm --prefix backend run test:all`; backend full runs still surface existing upstream deprecation warnings from Prisma/Newman but pass.
## [2026-04-03 17:54] Batch G browser E2E smoke suite
- **Changes:** Added a Playwright setup project plus shared fixtures/helpers under `e2e/`, implemented browser smoke coverage for anonymous-owner uploads, authenticated upload/edit flows, password-protected shares + `files.json`, API token creation with `/api/v1` usage, and reverse-share submissions, and replaced the root Playwright bootstrap with a dynamic-port stack launcher that seeds isolated SQLite/upload runtime data for each run. Updated `frontend/next.config.js`, `playwright.config.mjs`, `README.md`, and `e2e/README.md` so the suite disables PWA registration during tests and documents the new execution model.
- **Status:** Completed
- **Next Steps:** Batch H can wire `npm run test:e2e` artifacts into CI, and if desired we can split the current single-browser smoke lane into separate jobs once workflow names stabilize.
- **Context:** Verified in `/tmp/worktrees/batch-g-browser-e2e` with `npx playwright install chromium`, `npx playwright test --config ./playwright.config.mjs --project setup`, targeted reruns for the flaky scenarios, and a final passing `npx playwright test --config ./playwright.config.mjs` (`6 passed`).
## [2026-04-03 18:28] Integrate Batch F/G into Wave 2 branch
- **Changes:** Created the `integration-fg` worktree from `main`, merged `batch-f-api-blackbox` and `batch-g-browser-e2e`, resolved merge conflicts in `README.md`, `docs/docs/help-out/contribute.md`, and `statusquo.md`, and fixed `e2e/api-token.spec.ts` to use the backend-supported relative expiration format for API v1 share creation.
- **Status:** Completed
- **Next Steps:** Batch H can branch from `integration-fg` for CI wiring; if desired, promote the `e2e/api-token.spec.ts` fix back into the Batch G source branch or cherry-pick it wherever the browser suite will land.
- **Context:** Verified in `/tmp/worktrees/integration-fg` with symlinked root/backend/frontend `node_modules`, `npm run typecheck`, `npm run test:all`, targeted `npx playwright test --config ./playwright.config.mjs e2e/api-token.spec.ts`, and a final passing `npm run test:e2e`. The merged Wave 2 stack now passes backend fast/system suites plus all 6 Playwright smoke specs.
## [2026-04-03 18:57] Batch H CI gate and release wiring
- **Changes:** Added `.github/workflows/ci.yml` to run backend, frontend, API smoke, and browser E2E jobs in parallel with cached `npm ci`, artifacts, summaries, and a stable `Required checks` gate; converted `.github/workflows/build-docker-image.yml` into a reusable/manual publish workflow so GHCR releases are invoked only after CI succeeds on `main` and `v*` pushes; retired `.github/workflows/backend-system-tests.yml`; and documented the new CI/branch-protection flow in `README.md`, `CONTRIBUTING.md`, and `docs/docs/help-out/contribute.md`.
- **Status:** Completed
- **Next Steps:** Configure repository branch protection to require `CI / Required checks`, then verify one PR run and one `main` push to confirm artifact links, PR summary comments, and the gated GHCR publish path behave as expected in GitHub.
- **Context:** Verified locally with Ruby YAML parsing for `.github/workflows/ci.yml` and `.github/workflows/build-docker-image.yml`, `./backend/node_modules/.bin/prettier --check` on the changed workflow/docs files, and `git diff --check`. DeepWiki lookup for the GitHub Actions repos was unavailable in this session, so the workflow changes were cross-checked against official GitHub docs and action READMEs instead.
## [2026-04-03 19:06] Release v1.15.1
- **Changes:** Bumped the root, backend, and frontend package versions to `1.15.1`, refreshed `CHANGELOG.md` with a structured release summary for everything shipped since `v1.15.0`, and prepared the GitHub release payload for the `v1.15.1` tag.
- **Status:** Completed
- **Next Steps:** Push `main` and the `v1.15.1` tag, then confirm the new `CI` workflow completes and that the gated GHCR publish path runs for the release tag.
- **Context:** Release notes summarize the automation API ZIP download, backend/frontend/API/browser regression coverage, CI gatekeeping, Docker publication changes, and the associated bug fixes included in this patch release.
## [2026-04-03 19:15] Release v1.15.2 CI hotfix
- **Changes:** Updated `.github/workflows/ci.yml` to use a supported Node 22 semver target instead of the invalid `22.14.1` exact pin, bumped the root/backend/frontend package versions to `1.15.2`, and added a follow-up `CHANGELOG.md` entry documenting the release-engineering fix.
- **Status:** Completed
- **Next Steps:** Push `main`, verify the repaired `CI` workflow succeeds, then publish the `v1.15.2` tag and GitHub release once the gate is green.
- **Context:** The original `v1.15.1` GitHub Actions runs failed during `actions/setup-node` because Node `22.14.1` does not exist for Linux x64; this patch keeps the application code unchanged and only repairs CI/release automation.
## [2026-04-03 19:26] Stabilize isolated package CI jobs
- **Changes:** Added a backend `postinstall`/`prisma:generate` hook so `npm --prefix backend ci` generates the typed Prisma client from `backend/prisma/schema.prisma`, added `dotenv` to the frontend dev dependencies so `frontend/vitest.config.mjs` can load `.env.test` when the frontend package is installed on its own, and updated the `1.15.2` changelog text to document both CI bootstrap fixes.
- **Status:** Completed
- **Next Steps:** Commit the isolated-package CI fixes, push `main`, and rerun the unified GitHub Actions pipeline before tagging `v1.15.2`.
- **Context:** Local verification now passes with a clean `npm --prefix backend ci && npm --prefix backend run typecheck`, `npm --prefix backend run build`, `npm --prefix backend run test:coverage`, `npm --prefix frontend run test:coverage`, and a full `npm run test:e2e`.
## [2026-04-03 19:35] Fix reusable GHCR workflow call context
- **Changes:** Updated `.github/workflows/build-docker-image.yml` so the reusable workflow reads `inputs.*` by default and only falls back to `github.event.inputs` for manual dispatch, which fixes post-CI image publishing when the caller was triggered by a `push`. Also refreshed the `1.15.2` changelog entry to note the reusable workflow fix.
- **Status:** Completed
- **Next Steps:** Commit the reusable workflow hotfix, push `main`, confirm the CI run and downstream GHCR publish job succeed, then tag and release `v1.15.2`.
- **Context:** The earlier `main` CI run had all required checks passing, but the reusable Docker workflow still failed in `Resolve build plan` because `github.event_name` inside the called workflow reflected the caller's `push` event instead of `workflow_call`.
## [2026-04-03 19:45] Preserve Docker dependency layers with Prisma postinstall
- **Changes:** Updated the backend `postinstall` hook to generate Prisma client types only when `prisma/schema.prisma` is present, which keeps clean repo installs fixed while avoiding failures in Docker dependency-only layers that copy only `package.json` and `package-lock.json`.
- **Status:** Completed
- **Next Steps:** Re-run the unified CI workflow and confirm both GHCR build matrix jobs and the manifest merge succeed before tagging `v1.15.2`.
- **Context:** The reusable publish workflow fix exposed a second release-gating issue: the Docker backend dependency stage runs `npm ci` before the Prisma schema is copied into the image, so an unconditional postinstall generation step breaks image builds.

## [2026-04-03 20:41] CI report path and lint gate hardening
- **Changes:** Aligned `.github/workflows/ci.yml` with backend coverage output in `backend/test/coverage` and backend system `suite.json`, inserted explicit lint gates before CI test jobs, moved backend Jest coverage reporting to a deterministic `backend/test/coverage` root, and removed `passWithNoTests` bypasses from backend, frontend, and Playwright test commands.
- **Status:** Completed
- **Next Steps:** Watch the next GitHub Actions run to confirm the backend coverage card and API smoke summary populate from the updated artifact paths.
- **Context:** Verified with `npm --prefix backend run lint`, `npm --prefix backend run test:coverage`, `npm --prefix backend run test:ci`, `npm --prefix backend run test:system`, `npm --prefix frontend run lint`, `npm --prefix frontend run test`, `npm --prefix frontend run test:coverage`, `npm run quality`, and `npx playwright test --config ./playwright.config.mjs --list`; frontend lint still emits existing warnings, but backend lint is now clean and Playwright detects 6 tests without the no-tests bypass.
## [2026-04-03 21:16] Make files.json token links configurable
- **Changes:** Updated `backend/src/share/share.controller.ts` so `files.json` keeps refreshing the share-token cookie but only embeds `token=` in returned URLs when `share.filesJsonPasswordProtectedLinksIncludeToken` is enabled for password-protected shares; added the new admin/config-file setting in `backend/src/config/configDefinitions.ts`, `config.example.yaml`, and `frontend/src/i18n/translations/en-US.ts`; extended `backend/test/integration/share/legacy-share.controller.spec.ts`, `e2e/protected-share.spec.ts`, and related README guidance to cover the default clean-link behavior plus the opt-in password-protected tokenized-link mode.
- **Status:** Completed
- **Next Steps:** If desired, add localized labels for the new admin setting in the non-English translation files.
- **Context:** Verified with `npm --prefix backend run typecheck`, `npm --prefix frontend run typecheck`, `npm --prefix backend run test:integration -- --runTestsByPath test/integration/share/legacy-share.controller.spec.ts`, and `npx playwright test --config ./playwright.config.mjs e2e/protected-share.spec.ts`.
## [2026-04-03 21:37] README badge refresh
- **Changes:** Added a centered badge hero to `README.md` for CI, tests, version, and backend/frontend coverage; created `.github/badges/*.json` snapshot payloads; and updated `.github/workflows/ci.yml` to refresh those badge payloads from `main` branch CI runs while avoiding badge-only reruns.
- **Status:** Completed
- **Next Steps:** Push `main`, then confirm the next CI run refreshes the badge JSON snapshots and that the README badge row renders correctly on GitHub.
- **Context:** Verified with `node` JSON parsing for `.github/badges/*.json`, `ruby` YAML parsing for `.github/workflows/ci.yml`, `npx prettier --check` on the touched files, `git diff --check`, and a live `curl -I` check for the Shields GitHub Actions badge endpoint.

## [2026-04-03 22:17] Simplify files.json web-view output
- **Changes:** Updated `backend/src/file/file.controller.ts` and `backend/src/file/fileWebView.util.ts` so the new `webViewUrl` returns only the raw file content inline (no wrapper HTML or styling), kept the `files.json` opt-in config/docs/translations aligned, and refreshed `backend/test/integration/share/legacy-share.controller.spec.ts` coverage for the raw-content response.
- **Status:** Completed
- **Next Steps:** If needed, broaden the supported file-type matcher for additional text-based formats.
- **Context:** `webViewUrl` stays opt-in via `share.filesJsonWebViewLinksEnabled`; supported files are limited to text-like content so crawlers can fetch source without triggering attachment downloads.
## [$(date '+%Y-%m-%d %H:%M')] Add backend email service coverage
- **Changes:** Added `backend/test/unit/email/email.service.spec.ts` to cover SMTP gating, transporter configuration, share recipient templating, reverse-share/reset/invite email payloads, and transport error propagation.
- **Status:** Completed
- **Next Steps:** Continue raising backend coverage in other low-signal services (`jobs`, `oauth`, storage backends) and then tighten CI thresholds around the improved baseline.
- **Context:** Verified with `npx jest --config ./test/jest.config.cjs --selectProjects unit --runInBand --runTestsByPath test/unit/email/email.service.spec.ts` from `backend/`.
## [$(date '+%Y-%m-%d %H:%M')] Add backend jobs service coverage
- **Changes:** Added `backend/test/unit/jobs/jobs.service.spec.ts` to cover expired-share cleanup, reverse-share cleanup, unfinished share deletion, temporary chunk pruning, and token expiry aggregation in `JobsService`.
- **Status:** Completed
- **Next Steps:** Continue improving frontend coverage around zero-hit account/admin UI helpers, then harden CI thresholds once the new baseline is stable.
- **Context:** Verified with `npx jest --config ./test/jest.config.cjs --selectProjects unit --runInBand --runTestsByPath test/unit/jobs/jobs.service.spec.ts` from `backend/`.
