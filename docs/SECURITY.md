# Security and privacy

This document describes safeguards visible in the current source. It is not a certification, penetration test, or guarantee that the application is secure. Financial data is sensitive; review changes and verify deployment configuration before using real records.

## Web account security

- Passwords are verified with Node.js scrypt using a per-password random salt. Registration requires a password of at least eight characters.
- The server issues a random opaque 30-day session token and stores only its SHA-256 digest in MongoDB. The browser cookie is HttpOnly, SameSite Strict, Secure in production, and server-checked on requests. Sessions can be revoked at logout.
- Mutating browser APIs check request origin and a CSRF cookie/header token. Finance APIs derive the owner from the authenticated session and scope database operations to that user.
- Login, registration, and device pairing operations use MongoDB-backed throttling. PIN failures are limited and can lock the account PIN; use the password login to recover an existing quick-locked session.
- The optional four-digit PIN unlocks only an existing session. It cannot authenticate a new session. PIN verifiers use scrypt and a server-only `PIN_PEPPER`.
- Password changes require the current password and revoke other sessions. A self-service email/password recovery or email verification flow is not currently implemented; protect the account email/password and store the deployment secrets securely.

## Device and transaction security

- Pairing challenges are random, short-lived, single-use, owner-bound, and stored as hashes. The device token is generated on the phone; the claim does not accept a client user ID. The account owner must approve a pending device.
- Server device records store a hash of the bearer token. Device status, timestamp validation, rate limits, and revocation are checked before ingestion. Use HTTPS and revoke lost or unwanted devices promptly.
- Android encrypts the device token and normalized candidate payloads with AES-GCM keys kept by Android Keystore. The Room database and preferences are excluded from backup/transfer. This protects local data at rest in the intended platform model; it is not end-to-end encryption and does not protect data on a compromised/unlocked device.
- The companion filters sender IDs and notification package names before parsing. `RECEIVE_SMS` is used for new broadcasts; `READ_SMS` is not declared and historical messages are not scanned. Notification Access is optional and Android grants a broad system-level capability, so users should select only apps they intend to capture.
- Raw SMS/notification content is not intended to be stored or sent. The backend receives normalized fields only. Avoid including real SMS, references, account details, device tokens, or session cookies in diagnostics or bug reports.
- Ingestion creates `PENDING` BankTransaction records only. It does not create expenses or modify balances. Manual confirmation checks deposit ownership and remaining balance and uses a MongoDB transaction. Idempotency and a unique transaction-to-expense link prevent duplicate imported expenses.
- Native transaction notifications contain amount, direction, and bank label, and open the production website inbox only after a new insertion response. They do not contain a token, reference, account suffix, merchant, or message body.

## Secrets and repository handling

- Keep `.env.local`, production environment exports, MongoDB credentials, `PIN_PEPPER`, session cookies/tokens, device tokens, pairing codes, and signing credentials out of Git.
- `.env.example` uses placeholders. There is no separate `SESSION_SECRET` in the current code.
- Treat logs, screenshots, crash reports, and downloaded APKs as potentially sensitive. Review `git status`, ignored paths, and staged diffs before every commit.
- If a real secret was committed, revoke/rotate it at its issuing service immediately. Deleting a file in a later commit does not remove it from Git history. Coordinate any history rewrite separately; this review does not rewrite history.

## E2E test safeguards

The E2E backend gate is intended for a local development process and fails closed unless the MongoDB URI points to loopback, the database name ends in `_e2e`, the test email is configured, and test mode is explicitly enabled. Vercel production is rejected. Use separate local data and credentials. Never point an E2E test at production.

## Remaining limitations and launch checks

- Public registration is available and throttled, but the app does not currently provide email verification, MFA, or account recovery.
- Android SMS access is sensitive and must be verified on the target phone. Google Play policy may require default-handler status or an eligible exception; no Play review has occurred.
- The current Android release APK is unsigned. Create and protect a signing key manually before release.
- Vercel Hobby outbound addresses can change. If Atlas requires a narrow IP allowlist, verify how Vercel functions connect before launch. Vercel documents static egress IPs as a Pro/Enterprise feature; using a broad Atlas access rule increases the database's network exposure. This repository review did not inspect your Atlas network rules or Vercel environment settings.
- No independent security audit or production security assessment has been performed.

## Vulnerability reporting

Please do not publish credentials, bank messages, or a complete exploit in a public issue. If GitHub private vulnerability reporting is enabled for the repository, submit a private advisory. Otherwise contact the repository owner through a private channel available from the repository's GitHub profile. Include affected version/commit, impact, and a minimal reproduction with synthetic data.
