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
