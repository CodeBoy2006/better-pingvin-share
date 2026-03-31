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
