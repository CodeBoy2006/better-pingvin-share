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
