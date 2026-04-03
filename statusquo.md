## [2026-03-31 22:13] Automation API v1 implementation
- **Changes:** Added isolated `/api/v1` automation endpoints with API token auth, token-aware throttling, debounced token usage tracking, per-route CORS handling, multipart upload support, account-page token management, Prisma schema/migration updates, and dedicated Newman coverage/docs.
- **Status:** Completed
- **Next Steps:** Run the new `backend/test/newman-api-v1.json` flow in an environment with a reset database and verify the account-page API token UX manually in a browser.
- **Context:** API token usage metadata is intentionally debounced in-memory for SQLite safety, and `/api/v1` CORS stays disabled until `api.corsAllowedOrigins` is configured.
## [2026-03-31 22:49] System test SQLite bootstrap fix
- **Changes:** Updated `backend/package.json` system test scripts to create `backend/data/pingvin-share.db` before `prisma migrate reset`, matching Prisma's schema-relative SQLite path resolution and restoring both legacy and v1 Newman test bootstrapping.
- **Status:** Completed
- **Next Steps:** Keep using the new `/api/v1` Newman collection for regression coverage; backend lint still needs a separate ESLint 9 flat-config migration if the team wants `npm run lint` to pass.
- **Context:** The earlier failure was not a Prisma/Node compatibility issue; it came from creating `../data` at repo root while Prisma resolved `file:../data/pingvin-share.db` relative to `backend/prisma/schema.prisma`, i.e. `backend/data`.
## [2026-03-31 23:19] Backend ESLint 9 migration fix
- **Changes:** Replaced the legacy backend `.eslintrc.json` with `backend/eslint.config.mjs`, kept the ruleset close to the prior setup, added underscore-friendly unused-var handling for existing patterns, and fixed the remaining low-risk backend lint violations so `backend` and root lint scripts run again.
- **Status:** Completed
- **Next Steps:** If desired, clean up the existing frontend warning set separately; it does not currently block CI because `next lint` exits successfully.
- **Context:** DeepWiki was rate-limited during verification, so the migration was validated against the official ESLint v9 flat-config guide and typescript-eslint flat-config docs instead.
## [$(date '+%Y-%m-%d %H:%M')] Reset password token expiry enforcement
- **Changes:** Updated `backend/src/auth/auth.service.ts` so password resets load `ResetPasswordToken` records directly and only accept tokens whose `expiresAt` is still in the future before changing the password.
- **Status:** Completed
- **Next Steps:** Fix the remaining auth issues: TOTP password confirmation and LDAP password verification.
- **Context:** Backend verification succeeded after regenerating the local Prisma client and rebuilding; the regression check now confirms expired reset tokens are rejected without mutating user state.
## [$(date '+%Y-%m-%d %H:%M')] TOTP password confirmation await fix
- **Changes:** Updated `backend/src/auth/authTotp.service.ts` so enable/verify/disable TOTP paths now await `AuthService.verifyPassword(...)` before allowing any TOTP state change.
- **Status:** Completed
- **Next Steps:** Fix the LDAP branch of `AuthService.verifyPassword` so directory-backed accounts are checked correctly.
- **Context:** Verified with a regression script that mocked async password failures now throw `ForbiddenException` and prevent TOTP state writes.
## [$(date '+%Y-%m-%d %H:%M')] LDAP password verification await fix
- **Changes:** Updated `backend/src/auth/auth.service.ts` so LDAP-backed password checks now await `ldapService.authenticateUser(...)` and return a real boolean based on the bind result.
- **Status:** Completed
- **Next Steps:** Implement dedicated anonymous share owner tokens so unauthenticated uploads can be managed without treating everyone as the owner.
- **Context:** Verified with a regression script that failed LDAP binds now return `false` and successful binds return `true` instead of every Promise being treated as truthy.
## [$(date '+%Y-%m-%d %H:%M')] Anonymous share owner token hardening
- **Changes:** Added dedicated anonymous-share owner capability tokens in `backend/src/share/share.service.ts`, enforced them in `backend/src/share/guard/shareOwner.guard.ts`, exposed owner-management links from `backend/src/share/share.controller.ts`, updated the frontend upload/edit flow to store and consume those tokens securely, and documented the new anonymous edit-link behavior in `README.md`.
- **Status:** Completed
- **Next Steps:** Push the four security-fix commits to the remote branch.
- **Context:** Verified with backend/frontend production builds plus a backend regression script that anonymous owner actions are denied without the dedicated token and accepted with it; owner distribution links now use URL fragments so the token is not sent to the server in the request URL.
## [$(date '+%Y-%m-%d %H:%M')] Anonymous owner follow-up flow fix
- **Changes:** Updated `backend/src/share/share.controller.ts` and `backend/src/share/share.service.ts` so anonymous owner-token holders can reopen `/shares/:id/from-owner` without a logged-in user and can delete their own anonymous shares once the guard has already validated the dedicated owner token.
- **Status:** Completed
- **Next Steps:** No additional follow-up is required for the anonymous owner-token flow unless we want to add end-to-end browser tests later.
- **Context:** Verified with a backend regression script that anonymous owners can now load the owner payload and delete their shares when explicitly authorized, while logged-in share ownership checks still reject requests without the creator identity.
## [$(date '+%Y-%m-%d %H:%M')] Anonymous owner end-to-end regression coverage
- **Changes:** Added `backend/test/anonymous-owner-flow.e2e.js` to exercise the anonymous owner-token lifecycle against the running API, and updated `backend/package.json` so `npm run test:system` now runs both the existing Newman suite and the new anonymous-owner regression.
- **Status:** Completed
- **Next Steps:** If desired, mirror this coverage in a browser-level test later; the current API-level regression already protects the security-critical owner-token flow.
- **Context:** I initially tried to extend the Newman collection, but its cookie handling was unreliable for this capability-token scenario, so the final test uses a dedicated Node script with explicit cookie control and was verified by a full passing `backend npm run test:system` run.
## [2026-04-02 10:34] Machine-readable share file listings
- **Changes:** Added `GET /api/shares/:id/files.json` in `backend/src/share/share.controller.ts` and `backend/src/share/share.service.ts`, introduced `backend/src/share/dto/shareFileList.dto.ts` plus `backend/src/share/shareRequest.util.ts`, taught the share/file guards to accept `token` query parameters for direct links, added public proxy pages at `frontend/src/pages/s/[shareId]/files.json.ts` and `frontend/src/pages/share/[shareId]/files.json.ts`, and documented the new `<share-url>/files.json` endpoint in `README.md`.
- **Status:** Completed
- **Next Steps:** If we want browser-level coverage later, add a frontend/integration test that fetches `/s/:shareId/files.json` through the Next.js layer once the existing frontend type-check issue is cleaned up.
- **Context:** Backend build and a targeted end-to-end verification passed, including tokenized direct downloads from the new JSON listing. `frontend npm run build` still fails on the pre-existing `frontend/src/hooks/useTranslate.hook.ts` type error, and the legacy Newman-based `backend npm run test:system` flow remains flaky for unrelated auth/bootstrap reasons.
## [2026-04-02 10:35] Machine-readable share listing log correction
- **Changes:** No new code changes; this note corrects the previous ledger entry.
- **Status:** Completed
- **Next Steps:** None.
- **Context:** The `<share-url>/files.json` README note was already present on this branch before the implementation work, so the actual code changes for this task are limited to the backend/frontend route, DTO, guard, utility, and regression-test files plus `statusquo.md`.
## [2026-04-02 19:39] GHCR workflow publish path
- **Changes:** Updated `.github/workflows/build-docker-image.yml` so image publishing now targets only `ghcr.io/${{ github.repository }}` with explicit `packages: write` permissions, supports `workflow_dispatch` plus `main`/tag pushes, and emits `latest` from the default branch for repo-linked registry publishing.
- **Status:** Completed
- **Next Steps:** Monitor the first workflow run and, if the package is created as private on first publish, adjust the package visibility in GitHub once.
- **Context:** This change avoids relying on a local PAT scope for GHCR pushes and keeps publication tied to the repository via GitHub Actions and the repo-scoped `GITHUB_TOKEN`.
## [2026-04-02 19:56] Release v1.14.0
- **Changes:** Bumped the root, backend, and frontend package metadata from `1.13.0` to `1.14.0`, including all three `package-lock.json` files, in preparation for the `v1.14.0` release/tag publish.
- **Status:** Completed
- **Next Steps:** Commit the release bump, push `main`, create/push the `v1.14.0` tag, and publish the release so the GHCR workflow can emit the versioned image.
- **Context:** This is a metadata-only release bump; verification consisted of checking all package versions and confirming the diffs are version-only with `git diff --check`.
## [2026-04-02 20:34] Tighten Docker image publish triggers
- **Changes:** Updated `.github/workflows/build-docker-image.yml` so `main` pushes publish `edge`, `main`, and `sha-*` tags, version tag pushes publish `latest` and the pushed `v*` tag, and pure docs/Markdown pushes no longer trigger the image workflow.
- **Status:** Completed
- **Next Steps:** Watch the next `main` push and next `v*` tag workflow run in GitHub Actions to confirm the expected tag set is published to GHCR.
- **Context:** `workflow_dispatch` is still available for manual runs; `latest` now comes from version tag builds instead of every `main` update.
## [2026-04-02 21:09] Expose files.json links in share modals
- **Changes:** Updated `frontend/src/components/upload/CopyTextField.tsx` to accept custom labels, and updated `frontend/src/components/upload/modals/showCompletedUploadModal.tsx`, `frontend/src/components/account/showShareLinkModal.tsx`, and `frontend/src/components/account/showShareInformationsModal.tsx` to show both the normal share URL and the `/files.json` URL together.
- **Status:** Completed
- **Next Steps:** If we later want parity in one-click copy actions from the shares tables, consider replacing the direct clipboard shortcut there with a modal/action that can surface both URLs.
- **Context:** Verified with `frontend npm run lint` and `frontend npm run build`; both still report the repository's pre-existing frontend warnings, but the build completed successfully.
## [2026-04-02 21:33] Always show both share URLs from link actions
- **Changes:** Updated `frontend/src/pages/account/shares.tsx`, `frontend/src/pages/account/reverseShares.tsx`, and `frontend/src/components/admin/shares/ManageShareTable.tsx` so share-link buttons now open the share-link modal instead of directly copying only the plain `/s/...` URL in secure contexts, ensuring the normal share link and `/files.json` link are both visible.
- **Status:** Completed
- **Next Steps:** If desired later, we can add a dedicated dual-copy action so users can still copy either URL in one click without opening a modal first.
- **Context:** Verified with `frontend npm run lint` and `frontend npm run build`; both still emit the repo's pre-existing warnings, but the build passed.
## [2026-04-02 22:00] Default share expiration setting
- **Changes:** Added `share.defaultExpiration` to backend config defaults and `config.example.yaml`, passed that timespan into the upload modal, and updated the English/Chinese admin config labels so new shares start with an admin-configurable expiration preset instead of a hard-coded 1 day.
- **Status:** Completed
- **Next Steps:** Continue with the remaining batch 1 UX enhancements (QR links, clipboard helpers, text editing, and paste upload support).
- **Context:** Verified with `backend npm run build`, `frontend npm run lint`, and `frontend npm run build`; frontend lint still reports the repository's pre-existing warnings only.
## [2026-04-02 22:12] QR codes in share link modals
- **Changes:** Added a reusable client-side QR code component, extended copy fields with an optional QR toggle, and surfaced QR previews for the primary share link in the completed-upload modal, the share-info modal, and the generic share-link modal. Added the frontend `qrcode` dependency plus English/Chinese button text.
- **Status:** Completed
- **Next Steps:** Continue batch 1 by adding text-content clipboard helpers, upload text editing, and clipboard paste support.
- **Context:** Verified with `frontend npm run lint` and `frontend npm run build`; lint still shows the repository's long-standing warnings, and the build still emits the existing Next.js Edge Runtime axios warning while succeeding.
## [2026-04-02 22:18] Clipboard copy for shared text files
- **Changes:** Added `shareService.isShareTextFile`, exposed a text-copy action in the share file list, and added user-facing copy status/error messages so small `text/*` files can be copied directly from the share view over HTTPS.
- **Status:** Completed
- **Next Steps:** Continue batch 1 with upload-queue text editing and clipboard paste support.
- **Context:** Verified with `frontend npm run lint` and `frontend npm run build`; lint still reports the repository's pre-existing warnings only.
## [2026-04-02 22:24] Upload text editor modal
- **Changes:** Added a lightweight text editor modal for queued text uploads, including replacement of edited file contents in the in-memory upload list and new edit/undo button labels for the upload file table.
- **Status:** Completed
- **Next Steps:** Finish batch 1 by adding clipboard paste support for uploads.
- **Context:** Verified with `frontend npm run lint` and `frontend npm run build`; lint still reports the repository's pre-existing warnings plus the same generic callback-name warnings from this new modal code, but the build passed.
## [2026-04-02 22:29] Paste uploads from the clipboard
- **Changes:** Added upload-page clipboard handling for pasted files and plain text, while explicitly ignoring pastes into editable form fields so normal typing is not hijacked. Updated the dropzone copy to advertise Ctrl+V support.
- **Status:** Completed
- **Next Steps:** Move on to batch 2: admin-wide share access, retention, and delete scheduling.
- **Context:** Verified with `frontend npm run lint` and `frontend npm run build`; lint still reports the repo's pre-existing warnings plus generic callback-name warnings in upload components, and the build passed.
## [2026-04-02 22:05] Eliminate confirmed ghost dependencies
- **Changes:** Added direct backend deps/devDeps for `express`, `keyv`, and `@eslint/js`; added direct docs deps/devDeps for `@docusaurus/plugin-content-docs`, `react-router-dom`, and `@types/react-router-dom`; removed the frontend `.eslintrc.json` `react` plugin entry so lint no longer relies on transitive `eslint-plugin-react`. Updated `backend/package-lock.json` and `docs/package-lock.json` to match.
- **Status:** Completed
- **Next Steps:** If we want to prevent regressions, add an automated dependency audit (e.g. a static import-vs-package.json check) in CI for backend/frontend/docs.
- **Context:** Investigation confirmed the repo had real ghost dependencies hidden by transitive installs; verification passed with `backend npm run lint`, `backend npm run build`, `frontend npm run lint`, `docs npm run typecheck`, and `docs npm run build`. Frontend lint still reports the repository's pre-existing warnings only; docs build still reports an existing broken anchor warning on `/setup/upgrading#stand-alone-installation`.
## [2026-04-02 22:10] Admin access to all shares
- **Changes:** Added the `share.allowAdminAccessAllShares` config flag to the backend seed/config example and English/Chinese admin labels. Updated share/file access guards plus `files.json` generation so admins can open expired, password-protected, and otherwise restricted shares without requiring share tokens, while normal users keep the existing restrictions.
- **Status:** Completed
- **Next Steps:** Implement retention/soft-delete handling next so expired or owner-deleted shares remain available for admins during the retention window.
- **Context:** Verified with `backend npm run build` plus a temporary SQLite-backed HTTP smoke test on port `18080` covering admin access to expired/password-protected shares, direct file downloads, `files.json`, and a private reverse-share case; normal user requests still returned `404/403` as expected.
## [2026-04-02 22:16] Share retention and soft delete window
- **Changes:** Added the `share.fileRetentionPeriod` config setting plus English/Chinese admin labels, changed non-admin share deletion to expire the share instead of immediately destroying its files, and updated the cleanup job to permanently remove expired shares only after the configured retention window elapses.
- **Status:** Completed
- **Next Steps:** Add the admin "Deletes on" visibility next so retained shares expose their final cleanup date in the share-management table.
- **Context:** Verified with `backend npm run build`, `frontend npm run lint`, and a temporary application-context smoke test against a fresh SQLite database covering owner soft-delete retention, admin hard delete, and cleanup behavior both inside and outside the configured 2-day retention window.
## [2026-04-02 22:21] Admin delete schedule column
- **Changes:** Updated the admin share-management table to read `share.fileRetentionPeriod` from config and show a conditional "Deletes on" column that adds the retention window to each share's expiration when retention is enabled. Added English/Chinese labels for the new column.
- **Status:** Completed
- **Next Steps:** Move to batch 3 by surfacing disk/share storage stats in the admin share-management screen.
- **Context:** Verified with `frontend npm run lint` and `frontend npm run build`; both passed with only the repository's longstanding frontend warnings.
## [2026-04-02 22:24] Admin storage and disk statistics
- **Changes:** Added an admin-only `GET /api/shares/stats/storage` endpoint that reports total share bytes and local disk capacity/remaining space, exposed the new response type through the frontend share service, and surfaced a storage overview panel on the admin share-management page with localized labels.
- **Status:** Completed
- **Next Steps:** Finish batch 3 by preventing permanent upload failures (especially low-disk/server-capacity errors) from retrying forever.
- **Context:** Verified with `backend npm run build`, `frontend npm run lint`, `frontend npm run build`, and a temporary SQLite-backed HTTP smoke test on port `18081` confirming admins can read storage stats while anonymous requests are rejected.
## [2026-04-02 22:31] Stop permanent upload retry loops
- **Changes:** Added upload-error classification helpers, tracked per-file permanent upload errors, and updated both the new-share and edit-share upload flows to stop retrying on permanent failures such as `413` size violations or the backend's "Not enough space on the server" response. Also prevented edit-save completion when uploads permanently fail and added localized non-retry failure messaging.
- **Status:** Completed
- **Next Steps:** Run final regression/status checks across the completed batch 1-3 rollout, then push the commit chain.
- **Context:** Verified with `frontend npm run lint`, `frontend npm run build`, and a targeted Node assertion script that exercised the new upload error classifier for unexpected chunk recovery, `413` payload-too-large responses, and the low-disk server error.
## [2026-04-02 22:47] Auto-backfill missing config rows on startup
- **Changes:** Moved config definitions into a shared backend module, updated the seed script to reuse it, and made `ConfigModule` automatically backfill/update missing config rows before loading runtime config. Added a defensive `ConfigService.get()` fallback to the shared definitions so newly introduced keys (like `share.fileRetentionPeriod`) no longer crash upgraded instances with older databases.
- **Status:** Completed
- **Next Steps:** Monitor for any other upgrade-time data migrations that should be promoted from manual seed runs into automatic startup backfills.
- **Context:** Verified with `backend npm run build` and a temporary SQLite application-context test that deleted `share.fileRetentionPeriod` after seeding, then confirmed app startup recreated the row and `JobsService.deleteExpiredShares()` ran without throwing.
## [2026-04-02 23:26] Enhanced share file previews
- **Changes:** Reworked the share preview modal to classify files by extension plus lightweight content sniffing, added a dedicated preview utility for text/code/markdown/media detection, and upgraded previews to support syntax-highlighted code, Markdown with GFM + LaTeX math, inline PDF, and native image/audio/video rendering. Also localized the new preview/loading messages, imported KaTeX styles globally, and widened preview availability for small unknown files that can be identified from their contents.
- **Status:** Completed
- **Next Steps:** If desired, add a browser-level smoke test around the share preview modal to catch future regressions in rendered markdown/media behavior.
- **Context:** Verified with `frontend npm run lint`, `frontend npm run build`, and a targeted Node assertion script for the new preview detection helpers. Frontend lint still reports the repository's existing warnings only, and the `/share/[shareId]` bundle grew noticeably because of the richer preview dependencies.
## [2026-04-02 23:43] Add Office file previews
- **Changes:** Extended share preview detection to recognize Office document, spreadsheet, and presentation formats and capped Office previews with a dedicated size limit. Added client-side Office preview rendering using `docx-preview` for Word-compatible OOXML files, `xlsx` for spreadsheet tabs/HTML previews, and `@jvmr/pptx-to-html` for PowerPoint slide previews inside sandboxed iframes.
- **Status:** Completed
- **Next Steps:** If needed, add a browser smoke test with sample `.docx`, `.xlsx`, and `.pptx` fixtures to cover real-world rendering regressions.
- **Context:** Verified with `frontend npm run lint`, `frontend npm run build`, and a targeted Node assertion script that confirmed the Office preview modules load and the XLSX preview pipeline can round-trip workbook data into HTML. Frontend lint still reports the repository's pre-existing warnings only.
## [2026-04-03 11:48] Prepare v1.15.0 release metadata
- **Changes:** Bumped the root, backend, and frontend package versions from 1.14.0 to 1.15.0 and added a new `CHANGELOG.md` entry with detailed English release notes covering the admin, upload, retention, preview, and reliability improvements included since v1.14.0.
- **Status:** Completed
- **Next Steps:** If desired, mirror the same release notes into a GitHub Release body or container/image release announcement.
- **Context:** Verified by checking the updated package versions, reviewing the generated diff, and running `git diff --check` to ensure the release metadata changes are clean.
## [2026-04-03 13:05] Optimize Docker image CI for native ARM builds
- **Changes:** Reworked the Docker publish workflow to build `linux/amd64` and `linux/arm64` on separate native GitHub-hosted runners (`ubuntu-24.04` and `ubuntu-24.04-arm`) instead of building both platforms together through QEMU emulation. Also switched the Buildx cache export from a shared `mode=max` cache to per-platform `mode=min` caches and merged the per-architecture digests into a final multi-arch manifest in a dedicated follow-up job.
- **Status:** Completed
- **Next Steps:** Monitor the next image publish run to confirm the expected arm64 build-time drop and smaller GitHub Actions cache export time in real CI telemetry.
- **Context:** Validated the updated workflow with local YAML parsing and diff review. This change targets the previously observed bottlenecks from QEMU-emulated arm64 installs/builds and oversized `type=gha,mode=max` cache uploads.
## [2026-04-03 13:14] Split dev and release image tags
- **Changes:** Updated the Docker publish workflow so pushes to `main` only publish a `development` image tag, while `v*` tag builds publish the formal release tags plus `latest`. Removed the old branch tags (`main`, `edge`, and SHA-based tags) from the metadata strategy so stable image publication now happens only from release tags.
- **Status:** Completed
- **Next Steps:** Verify the next `main` push only refreshes `ghcr.io/...:development` and the next tagged release publishes `vX.Y.Z` plus `latest` without extra stable tags from branch builds.
- **Context:** Verified with local YAML parsing and workflow diff review. This change keeps CI builds on `main` useful for dev image validation while preventing normal branch pushes from publishing formal release tags.
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
