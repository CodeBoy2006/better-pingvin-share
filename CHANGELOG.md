## [1.16.1](https://github.com/CodeBoy2006/better-pingvin-share/compare/v1.16.0...v1.16.1) (2026-04-29)


### Bug Fixes

* cover public config fallbacks ([c1eab26](https://github.com/CodeBoy2006/better-pingvin-share/commit/c1eab26adf3dcbbb77545ce7dc05b2bb83518ffb))
* provide default config fallbacks ([41bcba3](https://github.com/CodeBoy2006/better-pingvin-share/commit/41bcba38ca74916cc4c7ee5242f1c20be55a2073))

## [1.16.0](https://github.com/CodeBoy2006/better-pingvin-share/compare/v1.15.3...v1.16.0) (2026-04-28)


### Features

* add expired share editing ([d82376a](https://github.com/CodeBoy2006/better-pingvin-share/commit/d82376acefc9fd438479f24e59c1cedc8cc01b9f))
* add plain text share listings ([574b057](https://github.com/CodeBoy2006/better-pingvin-share/commit/574b05795592bc6e5773e40a902f3f482446555f))
* expand text file web views ([ac6cdbc](https://github.com/CodeBoy2006/better-pingvin-share/commit/ac6cdbc0fdd805ebafccc61d116ec912cb514598))


### Bug Fixes

* reduce ci test runtime ([5afd37f](https://github.com/CodeBoy2006/better-pingvin-share/commit/5afd37fd266a76dac81d15a4ea075025715f487f))
* remove filename share file routes ([7cfa603](https://github.com/CodeBoy2006/better-pingvin-share/commit/7cfa60308b3f42dcecd8ed3dd589cff3fd24bd15))
* resolve backend lint errors ([2bbd560](https://github.com/CodeBoy2006/better-pingvin-share/commit/2bbd5600001749c46170ee4d0e141f770b3e469f))
* stabilize backend and e2e ci ([a4429cb](https://github.com/CodeBoy2006/better-pingvin-share/commit/a4429cb0e5d3d5a9836fa1a9fefafc2f9c7dc69b))

# Changelog

All notable changes to this project will be documented in this file.

## [1.15.3] - 2026-04-21

### Highlights

Better Pingvin Share 1.15.3 packages the recent share-hardening and machine-consumption work into a formal patch release. It adds share-level IP access restrictions, introduces administrator-only retained-file audit access, expands `files.json` with optional inline web-view links for crawler-friendly integrations, and closes the remaining gaps that allowed expired share artifacts to leak through normal download paths.

### Added

- Share-level IP restrictions with two modes: a fixed allow list of IP addresses or a first-come-first-served `maxIps` slot limit. The new rules are enforced across share pages, downloads, ZIPs, `files.json`, and web-view routes, and are exposed in the upload UI plus owner/API DTOs.
- Administrator-only retained-file audit endpoints at `GET /api/shares/:id/audit` and `GET /api/shares/:id/audit/files/:fileId`, together with a new admin share-table action and modal for inspecting retained files without reopening public access to expired shares.
- Optional `webViewUrl` entries in `files.json` for supported text/code/Markdown files, images, audio, video, and PDFs so crawlers and machine consumers can request inline-renderable resources directly.
- Expanded backend/frontend automated coverage for email delivery, cleanup jobs, admin helpers, account share modals, share-route aliases, IP normalization, and `files.json` proxy behavior. The CI gate now also validates the documentation build.

### Changed

- Password-protected `files.json` responses can now optionally embed tokenized download and inline-view URLs when `share.filesJsonPasswordProtectedLinksIncludeToken` is enabled. The default behavior remains plain links.
- Text-like `webViewUrl` responses now stream the original file bytes as raw `text/plain`, while image/audio/video/PDF web views stream the original bytes inline without wrapper HTML.
- Public share detail, file download, ZIP, `files.json`, and web-view responses now send strict private `no-store` headers to reduce caching of sensitive artifacts.
- CI now enforces explicit backend/frontend coverage thresholds and a docs build gate, and the README badge snapshots are refreshed from `main` branch CI runs.
- Share pages now surface dedicated error handling for IP allow-list denials and exhausted dynamic IP-slot claims instead of falling back to generic failures.

### Fixed

- Expired shares and removed artifacts can no longer be fetched through normal share detail, file download, ZIP, or `files.json` routes, even when administrator-wide share access is enabled.
- File and ZIP deletion now honors the share's persisted storage provider instead of assuming the currently active backend, preventing cleanup from targeting the wrong storage layer.
- Inline media web views now normalize MP4 delivery and serve image/audio/video/PDF content with browser-friendly inline headers for better crawler and preview compatibility.
- Retained-share administrator inspection now stays on dedicated audit routes, so administrators can review preserved files without restoring public access to expired links.

### Upgrade notes

- This release includes the Prisma migration `20260421090000_share_ip_access_restrictions`. Run the normal backend migration flow before creating or editing shares that use IP restrictions.
- IP-based share access depends on accurate client IP resolution. If Better Pingvin Share sits behind a reverse proxy, verify that the real client address is preserved in `X-Forwarded-For` and exposed correctly to the backend.
- No manual configuration migration is required for the new share settings, but the new `share.filesJsonPasswordProtectedLinksIncludeToken` and `share.filesJsonWebViewLinksEnabled` behaviors remain opt-in.
- Administrator retained-file audit is most useful when `share.fileRetentionPeriod` is non-zero. Public access to expired shares remains blocked regardless of the retention setting.

## [1.15.2] - 2026-04-03

### Highlights

Better Pingvin Share 1.15.2 is a follow-up patch to 1.15.1 that repairs the new GitHub Actions gate. It replaces the invalid `22.14.1` Node runtime pin with a supported Node 22 semver target so backend, frontend, API smoke, and browser E2E jobs can bootstrap correctly again.

### Changed

- The unified `CI` workflow now resolves Node.js from the supported `22` semver line instead of a non-existent exact runtime build.
- Backend installs now run an explicit Prisma client generation step from `backend/prisma/schema.prisma` whenever the schema is present, so clean environments produce the typed client before type-checking or runtime startup without breaking Docker's dependency-only layer.
- Frontend Vitest installs now include the `dotenv` runtime required by `frontend/vitest.config.mjs` when the frontend package is installed in isolation.
- The reusable GHCR publish workflow now reads `workflow_call` inputs even when the caller was triggered by a `push`, allowing the post-CI publish gate to run on `main` and release tags.

### Fixed

- GitHub Actions no longer fails during `actions/setup-node` on `ubuntu-24.04` runners before any install or test step starts.
- Clean backend installs no longer fall back to Prisma's untyped stub client when dependencies are installed from the repository root with `npm --prefix backend ci`.
- The `CI / Required checks` gate and the downstream GHCR publish workflow can now execute as intended for `main` and `v*` pushes.

### Upgrade notes

- There are no application, database, or configuration changes in this patch release.
- If you already deployed `1.15.1`, upgrading to `1.15.2` is only needed to pick up the corrected CI and release automation behavior.

## [1.15.1] - 2026-04-03

### Highlights

Better Pingvin Share 1.15.1 strengthens the automation and release pipeline around the product. It adds bearer-token ZIP downloads for the automation API, ships a full backend/frontend/API/browser regression stack, and introduces a unified GitHub Actions gate that validates the repository before GHCR publication.

### Added

- Bearer-token-protected ZIP bundle downloads for `/api/v1/shares/:shareId/files/zip`.
- Root-level and package-level test commands for fast, coverage, full-regression, and browser smoke execution.
- Backend Jest unit and integration coverage for authentication, users, config, reverse shares, shares, files, API tokens, and `/api/v1`.
- Frontend Vitest coverage for utilities, services, hooks, middleware, key UI components, and page smoke scenarios.
- Newman smoke/full-regression orchestration with structured JSON, JUnit, HTML, and diagnostic artifacts.
- Playwright browser smoke coverage for anonymous-owner uploads, authenticated sharing, protected shares, API token flows, and reverse-share submissions.
- A unified `CI` workflow that uploads coverage and regression artifacts, writes PR summaries, and exposes a stable branch-protection gate.

### Changed

- Docker publication now builds `linux/amd64` and `linux/arm64` images on native GitHub-hosted runners with per-platform cache scopes.
- GHCR tagging is split between `development` on `main` and formal `vX.Y.Z`/`latest` tags on release refs, while manual publish controls remain available for maintainers.
- Container publication now runs only after the required CI gate succeeds on `main` or `v*` pushes.
- Test runs now use dynamic ports, isolated SQLite databases, temporary upload directories, shared `.env.test` defaults, and normalized artifact locations for reproducible automation.

### Fixed

- Production Docker seeding now resolves config definitions correctly after the config refactor.
- Admin logo uploads once again accept valid PNG files.
- Backend runtime interop is stabilized for CommonJS-backed dependencies used by services such as ClamAV and Sharp.
- Anonymous-owner flows now handle expired shares and deletion paths correctly across unit, integration, and black-box regression layers.
- The browser API token smoke flow now uses the same relative expiration format accepted by backend share creation.

### Upgrade notes

- This release includes the API token schema migration used by the automation token flow; ensure backend migrations run before enabling those workflows in production.
- No manual configuration change is required for the new test and CI tooling, but maintainers should update branch protection to require `CI / Required checks`.
- GHCR release publication now happens after CI succeeds, so release tags may take slightly longer than before to surface published images.

## [1.15.0] - 2026-04-03

### Highlights

Better Pingvin Share 1.15.0 focuses on better administrator visibility and control, a smoother sharing and upload experience, and much richer in-browser file previews.

### Added

- QR code support for share links in the share completion modal and in the **My Shares** information panel.
- An admin storage overview on **Admin -> Share Management** showing total share storage usage and remaining local disk space.
- Clipboard support for uploads, including both pasted files and pasted plain text.
- A text editor modal for supported text-based uploads before they are sent.
- A one-click action to copy the contents of shared text files directly to the clipboard.
- Rich share previews for text and media files, including:
  - syntax-highlighted source code previews for common programming languages
  - Markdown rendering with GitHub Flavored Markdown support
  - LaTeX math rendering inside Markdown previews
  - inline previews for images, audio, video, and PDF files
- Office document previews for supported file types, including Word, Excel-compatible spreadsheets, and PowerPoint presentations.

### Changed

- Administrators can now opt in to access all shares, including shares that are password-protected, expired, or soft-deleted during the retention window.
- A new file retention workflow allows expired and uploader-deleted shares to remain available for a configurable period before permanent cleanup.
- When an uploader deletes a share, it is now soft-deleted first so administrators can still inspect it during the retention period.
- Administrators can now change the default share expiration from the configuration UI.
- The admin share management table now shows a **Deletes on** column when file retention is enabled.
- File previews now use both filename extensions and lightweight content sniffing to classify files more accurately.
- Unknown but previewable small files can now be identified and rendered without relying only on MIME guesses.

### Fixed

- Permanent upload failures, including server-capacity and file-size errors, no longer get stuck in endless retry loops.
- Missing config rows are now backfilled automatically on startup, preventing upgraded instances from crashing when new config variables are introduced.
- Newly introduced share retention settings now upgrade cleanly even on older databases that do not yet contain the required config entries.
- Direct text/code preview detection now avoids incorrect MIME-based classifications for certain extensions such as `.ts`.

### Upgrade notes

- This release introduces new administrator-facing share controls, including share-wide admin access and file retention settings.
- Existing installations are automatically backfilled with any missing config rows at startup, so a manual reseed is no longer required when upgrading to 1.15.0.
- Preview functionality now pulls in additional frontend-only viewer dependencies for Markdown, code, Office files, and embedded media.
