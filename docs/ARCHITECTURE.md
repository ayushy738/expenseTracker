# Architecture

Deposit Flow Finance is a Next.js application with a MongoDB data store and an optional native Android capture client. Next.js route handlers run as Vercel serverless functions; the project does not include a separate application server.

## Components

```text
Browser
  └─ Installable Next.js PWA (account, deposits, quick add, expenses, savings, goals, reports, inbox)
       └─ Next.js App Router API routes
            ├─ Cookie session + CSRF checks for browser operations
            ├─ User-scoped Mongoose queries and aggregations
            └─ MongoDB Atlas

The PWA manifest provides standalone display and a `/quick-add` shortcut. Its service worker caches only same-origin versioned Next static assets and public app icons. Navigations are network-only with a generic offline fallback; authenticated HTML, financial APIs, session/PIN responses, and writes are not cached.

Quick Add is a protected dashboard route. It reads the signed-in user's deposits, stores only the last successful deposit ID in browser storage namespaced by that user, and submits through the existing `POST /api/expenses` route. That route validates the session, CSRF token, deposit ownership, and available balance, then performs the existing MongoDB transaction. The client does not authoritatively change balances and does not queue offline expense writes.

Android phone
  ├─ SMS_RECEIVED receiver (new messages only)
  ├─ optional NotificationListenerService (user-selected apps)
  ├─ local sender/package filtering and heuristic parser
  ├─ encrypted Room candidate queue and local deduplication
  └─ WorkManager → HTTPS POST /api/sms → pending BankTransaction
```

The website owns financial records and confirmation decisions. Android does not create Expense records and does not change Deposit balances.

## Web account and sessions

- Registration creates a `User` document with a normalized unique email and a scrypt password verifier.
- The server generates an opaque random session token, stores only its SHA-256 digest in `UserSession`, and sends the token in an HttpOnly cookie. Session expiry is 30 days; logout revokes the server-side session.
- Authenticated state-changing browser APIs check the request origin and CSRF token; login and registration also enforce same-origin requests. User-owned finance APIs derive `userId` from the valid session rather than accepting it from the client.
- An optional four-digit PIN is a quick lock for an already authenticated session. It cannot create a session. Its verifier uses scrypt with a server-only `PIN_PEPPER`; the session's unlocked window is 30 minutes.
- The dashboard layout checks authentication and PIN lock state before rendering finance pages.

## Data ownership and accounting

`Deposit`, `Expense`, `SavingsFund`, `Goal`, `BankTransaction`, and `Device` are user-owned. API reads, writes, deletes, reports, and aggregate queries should include the authenticated owner. Relationships such as an expense's deposit, a bank transaction's device, and a selected savings fund are checked within that owner scope.

Deposit accounting follows:

```text
spendable = deposit amount − initial savings
remaining = spendable − sum(confirmed, non-reversed expenses)
```

Manual expense creation and imported expense confirmation run inside MongoDB transactions. Imported confirmation reserves remaining balance, creates one linked expense, changes the BankTransaction state, and recalculates the deposit in the same transaction. A unique link prevents creating a second expense for the same imported transaction. Confirmed imported entries can be corrected or reversed with history retained.

## Device pairing and ingestion

1. A signed-in owner starts pairing from the device-management page. The server generates a ten-character, short-lived code, stores only a hash, and associates the challenge with that owner.
2. The Android app creates a random device token locally and claims the code over HTTPS. The claim cannot specify a `userId`. Challenge consumption and pending Device creation are atomic.
3. The owner approves the pending device. Revoked and pending devices cannot authenticate to SMS ingestion.
4. The Android client sends normalized transaction fields to `POST /api/sms` with a bearer device token and a current Unix-millisecond timestamp. The server validates the device and derives the transaction owner from that device.
5. Deduplication uses a device/user-scoped `captureId` when supplied and a user-scoped transaction fingerprint for backwards compatibility. New records enter `PENDING`; the server does not create an Expense or alter a Deposit during ingestion.

The ingestion route also has a per-device request limit. Device bearer tokens are stored as hashes on the server. On Android, the token is encrypted with AES-GCM using an Android Keystore key.

## Capture, queue, and synchronization

- SMS uses Android's new-message broadcast and `RECEIVE_SMS`. The app does not ask for `READ_SMS` and does not scan historical messages.
- Bank sender IDs are allowlisted and individually enabled by the user. Notification capture is optional, separately permissioned, package-filtered, and user-selected.
- Parsing extracts a normalized candidate. Raw SMS/notification text is transient and is not placed in Room, logs, or the upload payload.
- Candidate payloads are encrypted with AES-GCM using an Android Keystore key. Room indexes store operational state and one-way matching fingerprints; database and app preferences are excluded from backup/transfer.
- Exact matches can merge source metadata while preserving the original capture ID. Uncertain near matches remain separate and are marked for review.
- WorkManager uploads only while the paired device reports `ACTIVE`. It retries temporary failures and reuses the same capture ID. The server creates only pending inbox records.
- Android's separate transaction alert fires only after a new production insertion response (`201`, not duplicate `200`). Tapping it launches an HTTPS browser link to `/expenses#inbox`. Android runtime and browser behavior still need device testing.

## Test-only path

The optional E2E path is development-only. The backend requires `NODE_ENV=development`, a loopback MongoDB URI, a database name ending in `_e2e`, an explicit test account, and `E2E_TEST_MODE=true`; production Vercel is rejected. Android exposes the E2E UI only in debug builds and restricts it to the emulator host `10.0.2.2`. Synthetic candidates are marked and cannot enter the normal production upload queue. Use a separate test database, account, and device; never use production credentials for E2E testing.
