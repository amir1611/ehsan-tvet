# Website and admin review — 2026-11-24

Scope: local source changes to the public website, admin interface, Node API, static serving, SEO and Vercel headers. This is a focused code improvement pass, not a complete penetration test or a promise that every issue is resolved. No production probe, database provisioning, social posting or deployment was performed.

## Source changes

- Password derivation uses asynchronous scrypt, preserving existing salted hashes and timing-safe comparisons while freeing the HTTP event loop. Credentials remain in ignored runtime data, never static website files.
- User patches validate every field and access restriction before changing names/roles/activation. Role membership uses own properties, so prototype property names cannot pass the role allowlist.
- JSON requests count bytes before parsing and require an object. Enquiries require boolean consent and bounded string fields, including course and message.
- Rate-limit buckets expire and have a finite key capacity; expired session records are swept. Request/header timeouts are explicit.
- Static assets use streams instead of buffering every video/PDF. Byte-range parsing enables seeking; ETags enable conditional requests. Admin HTML uses no-store and noindex. Real-path containment rejects static symlinks escaping the chosen public/uploads root; no race-free filesystem guarantee is claimed.
- CSP and browser permission policies are added in the Node server and Vercel configuration. Google Maps, fonts, image previews and same-origin admin previews remain allowed. Inline scripts are not allowed; inline styles are retained for existing animation/card styles.
- Password reveal controls use Lucide, accessible labels and pressed state; form reset masks them again. New user forms accept the requested @ username format.
- Public content survives JavaScript/fetch failure; filters disable if content loading fails. Preview messages require the same-origin parent window. Program-page CTAs select the matching form option. Static-host detection uses API availability instead of a hostname suffix.

## Validation and limits

- JavaScript parse checks (`node --check`) and `git diff --check` passed during this pass. Trusted HTML/JSON parsing checked static content and metadata.
- Added six pure regression tests in `tests/security.test.mjs`: hashes, JSON byte limits, own-property roles/usernames, enquiry fields/consent, rate-limit expiry/capacity, video byte ranges.
- The security-audit skill requires OS isolation before executing target code. A no-network/read-only macOS profile, empty environment, read-confined fixture copy and resource limits were attempted. The Node test invocation exited 134 before output. A runtime-only `node --version` baseline under the same controls also exited 134. This is a sandbox/runtime blocker, not evidence of an application crash. The new runtime tests and full API suite have **not passed on this revision** and must run in a working isolated environment before release. No live probes were substituted.
- Browser interaction, accessibility rendering, Google Maps destination accuracy, real cache/video behavior and measured performance remain to be verified. No Lighthouse score, speed improvement percentage or complete-security claim is made.
- Vercel still hosts the static landing page and admin HTML. The production admin backend, durable sessions, uploaded media and database are not provisioned. Local credentials do not establish a production account. Configure persistent storage and serverless-compatible backend before activating live edits/enquiries.
- File-backed local state supports a single process. Multi-process transactions, durability on crashes and concurrent administrative races require a database migration; they are not solved by this pass.
- Search Console/Bing ownership, actual search demand, AI citation measurements and third-party profile consistency require owner data. See `seo-plan.md`.

## Reproduction in an isolated environment

Use a disposable checkout with dummy `DATA_DIR`, empty allowlisted environment, no external network, isolated loopback, read-only application/toolchain mounts, scratch-only writes and explicit limits. Run `node --test tests/security.test.mjs` and then `node --test tests/api.test.mjs`. The API suite now includes failed-patch atomicity, @ usernames, inherited-role rejection, object-shaped JSON, headers, conditional GET/HEAD and range response checks. These new cases still need isolated execution before calling this release fully verified. Do not expose real users.json, cloud tokens or home directories to the runner.
