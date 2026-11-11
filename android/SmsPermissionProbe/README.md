# Deposit Flow Android Companion

Kotlin + Jetpack Compose companion app with secure pairing, local transaction detection, and WorkManager synchronization. Normalized candidates upload to the existing pending transaction inbox only; the app does not create expenses or modify deposit balances.

## Pairing flow

1. Sign in to the web dashboard and create a one-time code in the Companion devices panel.
2. In this app enter the site's HTTPS origin (for example `https://finance.example`), a phone name, and the code.
3. The app generates a 256-bit random device token locally, encrypts it with AES-GCM using an Android Keystore key, then claims the code over HTTPS.
4. The dashboard shows the claimed device as pending. The owner must approve it before it can authenticate to transaction ingestion.
5. Refresh status in the app to see pending, active/approved, or revoked state. Disconnect revokes the server device and clears the local key/token. “Clear local credentials” only deletes local credentials; it does not revoke the server device, so revoke it from the dashboard if needed.

The app never sends a `userId`; the server derives ownership from the pairing challenge. The device token stays encrypted in Android Keystore-backed storage.

## Transaction capture and privacy

- SMS capture uses the system's new `SMS_RECEIVED` broadcast and `RECEIVE_SMS`; there is no historical SMS query or SMS provider access. The app does not request `READ_SMS`.
- SMS sender IDs are disabled by default. Enable only the listed bank senders you recognize. Sender allowlisting is checked before the receiver reads message bodies. Messages from other senders are discarded.
- Optional notifications are also disabled by default. Select particular supported apps, then separately grant this app access under Android's Notification access settings. Android's listener permission is broad; this app filters package names before reading notification text and never queries prior/active notification history.
- Local parsers recognize debit/credit wording and amount/reference/date patterns for UPI, card/POS, ATM, and IMPS/NEFT examples. OTP/verification, promotional, balance-enquiry, PIN/password and malformed content is dropped. Parsing is heuristic; candidates need review.
- Raw SMS and notification text are transient only. They are not written to Room, preferences, logs, or network requests. Amount, bank, merchant, reference and transaction time are encrypted with AES-GCM using a separate Android Keystore key. Room stores only encrypted candidate payloads plus capture time, source kind, processing state, and one-way fingerprints for matching. Database and preferences are excluded from backup/transfer.
- Exact matching bank/reference/type/amount candidates from a repeated event or another source coalesce into the original stable capture ID and add source metadata. Near-time amount/bank matches without a trustworthy exact reference are retained as separate `POSSIBLE_DUPLICATE` rows for review; the app does not silently drop uncertain matches.
- Normalized financial fields are AES-GCM encrypted in Room. Queue state is tracked separately as `QUEUED`, `UPLOADING`, `SYNCED`, or `FAILED`; failed items can be retried manually. Worker claims are serialized in a Room transaction and interrupted uploads become claimable after a ten-minute lease.
- WorkManager schedules network-constrained immediate sync and a 15-minute periodic safety run. Upload runs only after the device status endpoint reports `ACTIVE`. Pause state, queue, failed items, and last successful sync survive app restarts.
- A successful response (`201`) or duplicate response (`200`) marks a candidate synced. `401` pauses for credential repair, with a separate clock-skew warning; `429`, network failures, and server errors retry with exponential backoff. Permanent validation errors remain visible as failed items with safe explanations.
- Disconnecting or clearing local credentials clears the local transaction queue and its sync metadata. Re-pairing to a different site/account scope also clears that queue before storing the new credential, preventing old candidates from being sent to another account.
- Upload payload is limited to `captureId`, amount, `DEBIT`/`CREDIT`, ISO timestamp, and optional bank, merchant, and reference. It contains no raw message text or client-supplied user ID.

Sender IDs and app package IDs are built-in starting allowlists and may need updates as banks/apps change their identifiers. All switches start disabled.

## Backend API contracts

- `POST /api/devices` — dashboard session + CSRF protected. Empty JSON `{}`; response `201 { "code": "…", "expiresAt": "…" }`. Code is shown once, expires after five minutes, and is stored only as a hash.
- `GET /api/devices` — dashboard session protected; returns only the current user's devices and their approval/revocation states.
- `POST /api/device-pairings/claim` — HTTPS JSON `{ "code": "…", "deviceName": "…", "deviceToken": "…" }`. The Android-generated token is 32 random bytes, Base64 URL-safe encoded. The request cannot supply an owner id. Response `201 { "id": "…", "status": "PENDING", "duplicate": false }`; a retry using the same code and token returns the same device with `200`.
- `PATCH /api/devices/{id}` — dashboard session + CSRF protected JSON `{ "action": "approve" }` or `{ "action": "deny" }`; all operations are owner-scoped.
- `DELETE /api/devices/{id}` — dashboard session + CSRF protected; revokes that user's device.
- `GET /api/device/status` and `POST /api/device/disconnect` — device bearer token plus `X-Device-Timestamp` (Unix milliseconds, within five minutes); status can report a remotely revoked token, and disconnect revokes the current device.
- `POST /api/sms` — HTTPS JSON with `Authorization: Bearer <device token>`, `X-Device-Timestamp` (Unix epoch milliseconds), and `Content-Type: application/json`. Requires an active device. Normalized payload has `amount`, `transactionType`, ISO `timestamp`, optional `bank`, `merchant`, `reference`, and optional UUID `captureId`. New Android retries reuse `captureId`; the server enforces uniqueness per user/device/capture ID. Existing clients may omit it and continue using user-scoped fingerprint deduplication. `201` means inserted; `200` with `duplicate: true` means already present. `401` code `CLOCK_SKEW` is distinct from `DEVICE_AUTH_REQUIRED`; `429` is rate limited.

Claim attempts are throttled per source IP; code creation is throttled per authenticated user. Challenge consumption and device creation run in a MongoDB transaction. Existing SMS ingestion now accepts only active devices; legacy device documents without a status remain treated as active until revoked, to avoid breaking already provisioned devices.

## Build the APK

1. Install Android Studio and Gradle 8.9 on the build computer.
2. If this project has no Gradle wrapper yet, open a terminal here and run `gradle wrapper --gradle-version 8.9` once.
3. Open this directory in Android Studio. Install Android SDK Platform 35 if requested and wait for Gradle Sync.
4. Choose **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The debug APK is normally `app/build/outputs/apk/debug/app-debug.apk`.
5. To build unit tests from a machine with the wrapper, run `gradlew.bat testDebugUnitTest`. Device Keystore instrumentation tests can run on a connected Android device with `gradlew.bat connectedDebugAndroidTest`.

Transfer the APK to the phone with ordinary USB file transfer (select **File transfer**, not USB debugging), or another trusted file transfer method. Open it from My Files and allow that source to install apps if Android asks. Root access and USB debugging are not required.

## SMS permission

The app declares only `RECEIVE_SMS` for SMS. It does not request historical-message access. Permission grant and message delivery behavior still need verification on the Samsung device. An APK being buildable does not guarantee the permission can be granted through every installer or that Google Play will approve future distribution.

## Android project compatibility

The Activity, pairing API client, Keystore credential storage, SMS receiver, notification listener, parser, Room repository, and sync worker are separate. Transaction confirmation remains manual in the web inbox.
