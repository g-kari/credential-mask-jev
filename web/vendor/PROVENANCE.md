# SheetJS CE vendored dependency

Fetched 2026-10-28 from the authoritative upstream distribution:
- https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs
- https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE

The corresponding `/package/NOTICE` URL returned HTTP404; no upstream NOTICE was obtained. Original copyright banner remains in the unmodified module.

Pinned CE 0.20.3. Module SHA256: `1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`.
Apache-2.0 license retained. No runtime CDN/package requests.

Official installation docs https://docs.sheetjs.com/docs/getting-started/installation/standalone/ identify 0.20.3 as current and encourage vendoring. Official advisory index https://cdn.sheetjs.com/advisories/ lists CVE-2023-30533 (fixed >=0.19.3) and CVE-2024-22363 (fixed >=0.20.2); both official pages read 2026-10-28. This is a bounded dependency-selection check, not a complete security audit or assurance that no other vulnerability exists. A search result for a third-party fork's SECURITY_FIXES_0.20.4.md was not treated as an official release.

The app never uses SheetJS HTML export, streams or network/file APIs. Only XLSX read, values-only workbook construction and XLSX byte serialization are used. HTML export's unsafe-link behavior is explicitly documented upstream https://docs.sheetjs.com/docs/miscellany/security/ and that API is not called.

Before SheetJS reads any workbook: bounded ZIP central/local checks, path/part allowlist, actual bounded inflation, declared length and CRC verification, UTF-8/XML checks, macro part/formula/external relationship rejection. Verified entries are rebuilt as a stored ZIP, never forwarding original ZIP structure. Conservative unsupported features are rejected, not preserved. This narrow OOXML profile does not claim general XLSX compatibility or complete malicious-file detection. Main-thread browser callers must use xlsx-client.mjs (fresh terminable Worker, 10-second deadline). Browser Worker memory is not a hard memory sandbox.

All output is a fresh generic-name workbook of scalar string/finite number/boolean cells, dropping original metadata/styles/comments/links/names and other objects. Literal strings beginning '=' remain string cells, not formulas. Source Excel numeric precision and date formatting cannot be reconstructed: dates remain numeric serials. XLSX bytes, source sheet names and formatting are intentionally not reversible.

## Strict XML prevalidation correction — 2026-10-28

Added Saxes 6.0.0 with xmlchars 2.2.0, browser-only ESM bundle `saxes.mjs`, built using existing local esbuild 0.28.2 without installing or running package lifecycle scripts. Official package tarballs:
- https://registry.npmjs.org/saxes/-/saxes-6.0.0.tgz — SHA256 `1cdf52fbbe1ccbd175c365d2b8e63f46e590e74aff23fa6a44a6ec51522e96db`
- https://registry.npmjs.org/xmlchars/-/xmlchars-2.2.0.tgz — SHA256 `bdf900298963e4bd95b76aa95e96d29f05687e6ae662d617061778267b576da8`
- Bundle SHA256 `56c5c7753d9ad739917759d7f651b84c4287dc168cad52f7a3ce8814a7c7ba41`

Saxes upstream https://github.com/lddubeau/saxes documents strict well-formedness checks and browser support. Its repository is archived (2025-12-31), a maintenance limitation, not a claim of current maintenance. Package metadata declares ISC; complete upstream v6.0.0 LICENSE was separately fetched from https://raw.githubusercontent.com/lddubeau/saxes/v6.0.0/LICENSE and retained (the npm tarball omits that file). xmlchars MIT license retained from its tarball. Package manifests retained to identify exact source versions.

Every XML entry must pass Saxes namespace-aware well-formedness checks before SheetJS. Errors/DTDs abort. XML depth <=64 and elements <=300000 per part. Worksheet geometry attributes are exact allowlists; unquoted or duplicate attributes fail XML parsing, uppercase/namespaced aliases fail the allowlist. Column min/max are required bounded integers <=256, row r<=10000, cell coordinates and dimension rectangle follow application limits. Bounds are checked on decoded SAX attribute values (including numeric references), not just regex matches. Only standard `xml:space` and namespace declarations are excepted from geometry attribute allowlists.

Eight synthetic runtime test cases pass after correction, including unquoted/duplicate/uppercase/namespaced/encoded geometry values, malformed XML, prior typed/hidden/compressed cases. This remains normal functional testing, not exhaustive XML parser verification or a security audit.
