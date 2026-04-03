`e2e/` contains the Playwright smoke suite.

- `npm run test:e2e` boots an isolated backend + frontend stack on dynamic ports
- Browser auth state is created once by `e2e/setup/auth.setup.ts`
- Runtime data, SQLite files, and upload directories live under `tmp/test-runtime/`
- Playwright artifacts land under `test-results/playwright/`
