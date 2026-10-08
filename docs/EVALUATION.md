# Synthetic evaluation and acceptance

The MVP acceptance target is a runnable local text workflow, exact reversible substitution, typed ID relationship preservation, conservative failures, and explicit review. It is not a production-readiness or anonymization certification.

Run from the checkout:

```sh
python -m unittest discover -v
python -m compileall -q credential_mask tests
```

## Covered synthetic cases

| Case | Expected evidence |
| --- | --- |
| Japanese names supplied as manual/model ranges, emoji, combining characters, CRLF | Byte-for-byte UTF-8 roundtrip; code-point positions, no normalization |
| 会員ID / 顧客番号 / 注文番号; member_id / customer_id / order_id | Exact same category/value reused within one document; different categories get distinct tokens even when numeric values agree |
| Broad model/manual span encloses a labelled ID | Whole sensitive union masked while deterministic ID boundaries retain stable tokens |
| JSON string IDs, escaped quotes/backslashes, long values | Full raw source value masked and exactly restored; no prefix/suffix leakage from truncation |
| Explicit generic id; price/count numbers | Generic id is an ambiguous review candidate; ordinary unlabelled numbers remain visible |
| Provider-like synthetic secrets, email, bearer, JWT, private-key block | Candidate masked without publishing real credentials |
| Crossing/containing ranges and random token collisions | Union covered, no original token collision, deterministic known-token restore |
| Unfinished recognized quotes/escapes/key blocks | Preparation stops rather than masking a prefix |
| Unknown/damaged response tokens; edited map/candidate | No restoration/export file written |
| Failed/redirected/oversized/malformed/low-confidence djev response | Static error, no regex-only/cloud fallback; source-bound offsets checked |
| Local mapping persistence and file permissions | No persistence without plaintext opt-in; 0700/0600 on POSIX; non-POSIX acknowledgement required; no overwrite |
| 1MiB marker-free input | Completes without quadratic no-delimiter candidate scans |

## Deliberate negative cases

- Regex-only `担当: 架空花子。秘密案件: 月面計画` stays visible. Tests assert this known miss and the always-required review flag.
- A custom `MEM-` + four-digit format does not detect five-digit IDs. Configuration is not an inference engine.
- Japanese names/addresses, context-sensitive internal project names, unlabelled/customer-specific ID formats, unusual credentials, and reidentification through events or affiliations remain open risks.
- Numeric JSON replacement is a **text** candidate and may not be valid JSON. This MVP does not promise schema preservation.
- djev fixtures test the observed request/response contract, not an actual local model's outputs. Confidence/coverage thresholds are cautionary gates, not calibrated Japanese recall measurements. Upstream silent omissions/canvas limits cannot be inferred reliably from successful responses.

## Evidence required before broader use

Use a representative labelled dataset that you are authorized to process locally. Define sensitive categories and ground-truth Unicode ranges before tuning. Report per-category precision, recall, and especially false negatives for Japanese names/addresses, typed identifiers, secret variants, long documents, formatting changes, prompt-injection content, and field ambiguity. Also verify the chosen local server's upstream/telemetry/logging. Never send that evaluation corpus or its maps to public CI or cloud AI.

No real dataset, live model test, automatic cloud transmission, model download, service installation, billing, or user-computer access is part of this implementation's evidence. Hold automation of external transmission until both detection validation and a separate authorization/safety review establish an acceptable policy.
