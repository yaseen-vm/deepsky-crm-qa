# Deepsky CRM — Playwright Adversarial QA

Automated, conservative browser checks for the Deepsky CRM staging environment. The current starter focuses on login behavior, browser exceptions, visible application errors, same-origin navigation, optional known role routes, and input edge cases. It does not intentionally create, update, or delete CRM records.

## Local setup

Requires Node.js 20+.

```bash
npm install
npx playwright install chromium
```

Copy `.env.example` to `.env` and provide dedicated staging test credentials. Never commit `.env` or put credentials in test source.

PowerShell:

```powershell
Copy-Item .env.example .env
npm test
npm run test:headed
npm run report
```

## GitHub Actions

The workflow `.github/workflows/deepsky-qa.yml` is manually triggerable from **Actions → Deepsky CRM Adversarial QA → Run workflow**.

Set these repository secrets under **Settings → Secrets and variables → Actions → Secrets**:
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `FIELDSTAFF_EMAIL`, `FIELDSTAFF_PASSWORD`

Optional repository variables:
- `ADMIN_PATHS`: comma-separated admin route paths verified against the real app.
- `FIELDSTAFF_PATHS`: comma-separated field-staff route paths verified against the real app.

Reports, traces, and screenshots are uploaded as an Actions artifact. They can contain sensitive staging data; limit access and redact them before sharing.

## Accuracy and safe operation

- Login selectors are intentionally heuristic. If the UI uses unusual labels or custom controls, update `findLoginControls()` after examining the app.
- Route checks only cover routes explicitly configured in repository variables. Do not guess routes.
- GET-based link checks can flag routes that expect client-side navigation or a different HTTP method. Treat those as leads until reproduced manually.
- Search edge-case probes run only when a visible search input can be found.
- This starter is not a complete authorization/security audit. Verify admin-only routes and API-level object access separately once route and API contracts are mapped.
- A green run means only that these checks passed; it is not proof that all modules or edge cases are defect-free.
