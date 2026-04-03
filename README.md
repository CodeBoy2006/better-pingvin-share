Better Pingvin Share is a self-hosted file sharing platform and an alternative for WeTransfer.

## ✨ Features

- Share files using a link
- Unlimited file size (restricted only by disk space)
- Set an expiration date for shares
- Secure shares with visitor limits and passwords
- Email recipients
- Reverse shares
- OIDC and LDAP authentication
- Integration with ClamAV for security scans
- Different file providers: local storage and S3

<img src="https://user-images.githubusercontent.com/58886915/225038319-b2ef742c-3a74-4eb6-9689-4207a36842a4.png" width="700"/>

## ⌨️ Setup

### Installation with Docker (recommended)

1. Download the `docker-compose.yml` file
2. Run `docker compose up -d`

The website is now listening on `http://localhost:3000`, have fun with Better Pingvin Share 🐧!

> [!TIP]
> Checkout [Pocket ID](https://github.com/stonith404/pocket-id), a user-friendly OIDC provider that lets you easily log in to services like Better Pingvin Share using Passkeys.

## 📚 Documentation

TBD.

## ✅ Testing

- `npm run quality` runs lint, type checks, production builds, and the fast unit/integration layer
- `npm run test:fast` runs backend unit/integration tests plus frontend Vitest suites
- `cd backend && npm run test:system` runs the PR-safe backend API smoke suite
- `cd backend && npm run test:system:full-regression` runs the full Newman + scripted backend regression suite
- `npm run test:all` runs the fast layer and the full backend black-box regression suite
- `npm run test:e2e` boots a temporary backend + frontend stack on dynamic ports and runs the Playwright browser smoke suite in `e2e/`

Test artifacts are written to `test-results/`, and test-specific runtime files are isolated under `tmp/test-runtime/` or `backend/tmp/`. Backend black-box runs emit Newman JSON/JUnit reports, HTML summaries, and per-request snapshots under `test-results/backend/system/<suite>/`.

## 🚦 CI

- `.github/workflows/ci.yml` runs `Backend`, `Frontend`, `API smoke`, and `Browser E2E` in parallel on pull requests, `main`, and `v*` tags.
- The recommended branch protection gate is `CI / Required checks`; the per-area jobs stay stable for drill-down and artifact inspection.
- GHCR publication is no longer an independent push trigger: `build-docker-image.yml` is invoked by CI only after the required checks pass on `main` or release tags.

> [!IMPORTANT]
> Anonymous browser uploads now generate a dedicated edit link for the uploader. Treat that link as a secret because it grants owner-level access to the share.

## 🤖 Automation API

Better Pingvin Share now includes an automation-focused API under `/api/v1`.

- Authentication for `/api/v1` uses bearer tokens, not the browser `access_token` cookie
- Bearer tokens can be created from the account page and are shown only once
- Small uploads can use `multipart/form-data`; large or resumable uploads can keep using chunked `application/octet-stream`
- Browser-based cross-origin access to `/api/v1` is disabled by default and can be enabled with `api.corsAllowedOrigins`

Example small upload:

```bash
curl -X POST \
  -H "Authorization: Bearer $PINGVIN_API_TOKEN" \
  -F "file=@artifact.zip" \
  http://localhost:3000/api/v1/shares/my-share/files/multipart
```

Example chunk upload:

```bash
curl -X POST \
  -H "Authorization: Bearer $PINGVIN_API_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk.bin \
  "http://localhost:3000/api/v1/shares/my-share/files?name=artifact.zip&chunkIndex=0&totalChunks=1"
```

Example ZIP bundle download:

```bash
curl -L \
  -H "Authorization: Bearer $PINGVIN_API_TOKEN" \
  -o my-share.zip \
  http://localhost:3000/api/v1/shares/my-share/files/zip
```

In development mode, Swagger documents both the legacy routes and the new automation endpoints at `/api/swagger`.

## 📄 Machine-readable share listings

Every public share exposes a JSON file list at `<share-url>/files.json` (for example `http://localhost:3000/s/my-share/files.json`).

- The response uses `application/json`
- It includes share metadata, per-file metadata, and direct download URLs for every file
- Password-protected shares still require a valid share token before the JSON listing can be fetched
