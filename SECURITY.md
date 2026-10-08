# Security scope and threat model

## Assets and boundaries

- Originals, mappings, and restored replies contain sensitive information. Tokens are random opaque identifiers, not ciphertext or encryption keys.
- The default Python core has no network, persistence, logging, automatic downloads, or model installation. CLI persistence requires `--allow-plaintext-map`; there is no automatic map upload or cloud-AI request.
- A session directory contains an unencrypted original-value map, a potentially incomplete candidate, and local metadata. These are all private local artifacts. File hashes can reveal information about guessable content; keep them local too.
- POSIX 0700/0600 and final-component `O_NOFOLLOW` are checked. Use a trusted, non-shared parent directory with no replaceable/symlink ancestors, restrictive ACLs, disk encryption, and no automatic sync/backups. Path-based checks do **not** resist a hostile same-user process or races that replace parent directories. Windows ACLs are neither set nor verified; persistence needs explicit risk acknowledgement. No secure erase claim is made.
- OS swap, crash dumps, malware, console/editor history, backups, and a malicious local server are outside this MVP's protection. Memory-only maps reduce persistence but do not protect against those threats.

## Detection and review

- Rules are additive. Model/manual ranges cannot remove deterministic candidates. Broader additional spans are split around core candidates so typed field-ID relations remain stable.
- Overlapping candidates mask their union. Core collisions choose a more specific field label where exact bounds agree; ambiguous partial overlaps may become the generic sensitive category. Identity means exact category + exact raw substring, not inferred person/account identity.
- Original source hash binds manual offsets. Model text and integer Unicode code-point offsets must exactly match source slices. This prevents invented replacements; it does not prove the chosen category is correct or that all sensitive text was found.
- Prompt injection can influence a detector, including by causing omissions or overmasking. It cannot authorize networking beyond the configured loopback origin or change restoration code. Model instructions are a weak aid, not an isolation boundary.
- Human review is always required for export. Names, physical addresses, unusual secrets, unlabelled IDs, private events, membership context, and quasi-identifiers may remain visible. Masked output can still reidentify someone through context or relationships. This is reversible pseudonymization, **not complete anonymization**.
- Unfinished recognized quoted fields/private-key blocks, explicit model failures, invalid/low-confidence spans, caps, stale offsets, and inconsistent maps are blocking errors. The upstream djev spans API does not certify exhaustive detection and may silently omit/stop candidates; review remains the gate for that unresolved uncertainty.

## Optional network path

The explicit djev adapter posts unmasked source to a literal loopback HTTP origin. URL credentials, remote/LAN/DNS destinations, origin paths/queries/fragments, redirects, and ambient proxies are rejected. There are finite input/response/time limits and no external or regex-only fallback after an adapter failure.

This verifies the client's immediate destination only. Before acknowledging the server, verify its model, upstream endpoint, request logs, generated-text logs, telemetry, and egress independently. A local bridge can forward to cloud services. This project neither installs a firewall nor inspects/configures that process. Authentication credentials are not accepted.

## Restoration and local integrity

Restoration is one-pass exact substitution of known tokens. Unknown or recognizably damaged markers stop the operation; there is no LLM regeneration, recursive replacement, or guessing. Omitted tokens stay omitted. A completely changed marker can become indistinguishable from ordinary prose.

Per-document nonce and per-item random identifiers avoid embedding original values in tokens. Allocation checks collisions. Equal raw values within the same category get one token, different categories remain separate; separate sessions are unlinkable by token alone. The intended within-session relationships themselves disclose information.

Session load checks candidate/report consistency and that restoring the saved candidate reconstructs the source hash. This catches accidental map edits, not an attacker rewriting all hashes and files. Files are created exclusively and never overwritten. A crash/write failure may leave a partial private session; it cannot export until its files pass validation. Remove partial sessions using normal local data-handling procedures.

## Safe reporting

CLI errors are controlled static messages; model responses, source snippets, filenames, and exception tracebacks are not printed. Review reports include offsets/categories/counts, not originals. Library users must avoid logging session/mapping objects or model responses. Do not publish real data in tests, CI artifacts, issues, or pull requests.

Tests use synthetic in-memory/filesystem cases and mocked network responses. Live djev behavior and Japanese PII recall are unverified. Future encrypted storage, Japanese NER, structured-format exporters, and hostile-parent-path hardening require separate design/review; this MVP does not claim those protections.
