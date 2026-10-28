# Browser-local reversible masking (development preview)

This static web application replaces reviewed text values with opaque session tokens before manual sharing with an AI, and restores matching tokens in replies locally. It is **pseudonymization, not guaranteed anonymization**. Automatic email/phone suggestions can miss sensitive data. Names, addresses and context require manual review.

## Formats

- UTF-8 text, CSV and TSV.
- Restricted XLSX: multiple sheets, scalar strings/numbers/booleans and hidden-content review. Output is a new values-only workbook with generic sheet names. Formulas, external references, encrypted/macro workbooks and unsupported embedded/drawing structures are refused.
- Source XLSX formatting, date presentation, original sheet names and original bytes are not restored. Dates may appear as numeric Excel serial values. Masked numeric cells become string tokens.
- XLS, XLSM, PDF, DOCX and images are not supported.

The input limit is2MB. XLSX parsing uses a fresh Worker with a10-second timeout, bounded ZIP expansion and a locally bundled parser; there is no runtime CDN. These controls do not guarantee a hard browser memory limit or exhaustive malicious-file detection.

## Privacy model

No document upload, external AI call, analytics, automatic clipboard or persistent browser storage. Maps stay in memory unless explicitly exported as password-encrypted AES-256-GCM data. PBKDF2-SHA256 uses600000 iterations, a fresh16-byte salt and12-byte IV. Losing the passphrase means losing access; passphrase length is not a strength guarantee. Never send the map to an AI.

Restored text contains the original sensitive data. Extensions, compromised hosts/devices, swap and contextual reidentification remain risks. Unknown or recognizable broken tokens fail restoration rather than guessing. CSV output may add a leading apostrophe to formula-like values, changing exact source strings for spreadsheet safety.

## Development

Use Node24 for synthetic functional tests:

```sh
node --test web/*.test.mjs
```

Run `node web/build-static.mjs` from the repository root and serve the freshly generated `dist/` as a static HTTPS site. The fixed allowlist excludes test files, package manifests and node_modules. Include local module/vendor files and `_headers`; do not include originals, maps, personal fixtures or unrelated workspace files. Keep all runtime code same-origin. Read `vendor/PROVENANCE.md` and retained licenses.

Chrome 155 synthetic browser checks passed on GitHub Actions: text masking/restoration, encrypted maps, Worker-based XLSX import/export, hidden-data consent, response headers and downloaded values. Mobile viewport was tested, not an actual mobile device. Other browsers and deployment verification remain pending. This is a trial version; start with synthetic data. These checks are not a complete security audit or a guarantee of anonymization. The existing Python CLI remains separate; its mapping file format is not compatible with this web implementation.

### Synthetic browser acceptance check

Development only: `npm ci --ignore-scripts --no-audit --no-fund`,
then `node browser-check.mjs` with an installed official Google Chrome.
The exact Playwright version is locked. The check uses synthetic text/workbooks,
a loopback-only test server with the site's response headers, and Chromium's
sandbox enabled. CI uses the runner's preinstalled official Chrome channel and
records its version; it does not disable AppArmor or the browser sandbox. It does not require account credentials or production data.
Official CI setup: https://playwright.dev/docs/ci . Passing Node tests alone does
not establish browser compatibility; check the browser step's actual result.

## Workers static-assets migration

The root `wrangler.jsonc` targets `mask.0g0.xyz` with static assets only: no server handler, API, storage binding, secret, preview URL or workers.dev hostname. Build the same 17-file allowlist with `node web/build-static.mjs`; `_headers` remains in the asset directory and is interpreted by Workers, not served as source. Unknown paths use normal 404 handling, not SPA fallback.

Deployment is a separate authenticated operation, not part of tests. Recheck account ownership and hostname conflicts before deploying. Do not create tokens or expand permissions to bypass a failed deployment. Keep the existing Pages deployment until the Workers HTTPS response, all served asset hashes and all six response headers have been verified. This configuration alone does not establish a successful migration.

Official references (checked 2026-10-28):
- https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

Static-asset requests and storage are free under the documented Workers static-assets model; this configuration deliberately has no Worker handler. Hosting access metadata is distinct from document contents, which remain in the browser.

## UI refresh (2026-10-28)

The workspace now places source and masked output side by side on desktop, stacks them on narrow screens, and separates reply restoration from encrypted-map management. Every existing control and processing module is preserved; no runtime dependency, external font or network path was added. Format limitations remain available beside file controls, and the anonymization warning stays visible.

Design guidance: official UI UX Pro Max skill (MIT), upstream commit `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03`, https://github.com/nextlevelbuilder/ui-ux-pro-max-skill . The verified Minimalism/Swiss style result informed grid, spacing and contrast; automatically suggested marketing landing-page layouts were rejected for this operational tool. Japanese system fonts and the existing local-only security model take precedence over external asset recommendations.

CI installs Japanese system fonts only in its ephemeral runner (no app font download), then additionally checks 390px/1280px overflow, 44px action targets, visible keyboard focus, and saves synthetic-only screenshots for visual review. Screenshot artifacts are excluded from the deployed allowlist. A successful test is not a complete accessibility or security audit; actual mobile devices and other browsers remain unverified.

## Selected concept A: quiet editing studio

The owner selected the dark editing-studio direction. It replaces stacked cards with a compact application header/tool rail, aligned equal-height source/result editors and a candidate inspector. Mask, restoration and encrypted-map management are separate presentation modes; switching modes preserves the existing DOM values and in-memory map. Narrow screens switch explicitly between source, terms and output. The actual opaque tokens are unchanged, not the illustrative short labels from the concept image.

No processing dependency, external asset request or security/hosting setting is added. All file-format, consent and privacy limits remain. Browser acceptance additionally tests repeated mode switching/state retention and equal desktop editor geometry; screenshots are compared with the selected concept, not only tested for overflow.

## Selection-assisted review

For plain text, select a phrase in the source and choose 選択した語句を追加. This adds the exact value (including surrounding spaces), targeting every identical occurrence, not only the selected occurrence. Empty/whitespace-only, multiline/tab and partial grapheme selections are rejected; duplicates do not invalidate an existing result. No Unicode normalization is performed.

対象箇所を確認 shows a safe text-node/mark rendering using the same longest-first matching as masking. It never sends source data. Editing source/terms/format or loading/clearing data removes stale review contents. Review is limited to 50,000 UTF-16 units and 1,000 matches; exceeding a limit reports an error instead of displaying a partial document. Marks do not mean that unmarked content is safe.

CSV/TSV/XLSX retain existing cell-aware masking, but selection/highlight shortcuts are deliberately unavailable for those formats: raw syntax or sheet labels must not be mistaken for cell values. Use the terms field and compare original/result cells. Runtime allowlist now contains 18 files.
