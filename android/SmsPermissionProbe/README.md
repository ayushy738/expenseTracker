# Deposit Flow Android Companion

Kotlin + Jetpack Compose companion app with secure pairing, local transaction detection, and WorkManager synchronization. Normalized candidates upload to the existing pending transaction inbox only; the app does not create expenses or modify deposit balances.

## Pairing flow

1. Sign in to the web dashboard and create a one-time code in the Companion devices panel.
2. In this app enter the site's HTTPS origin (for example `https://finance.example`), a phone name, and the code.
3. The app generates a 256-bit random device token locally, encrypts it with AES-GCM using an Android Keystore key, then claims the code over HTTPS.
4. The dashboard shows the claimed device as pending. The owner must approve it before it can authenticate to transaction ingestion.
5. Refresh status in the app to see pending, active/approved, or revoked state. Disconnect revokes the server device and clears the local key/token. “Clear local credentials” only deletes local credentials; it does not revoke the server device, so revoke it from the dashboard if needed.

The app never sends a `userId`; the server derives ownership from the pairing challenge. The device token stays encrypted in Android Keystore-backed storage.

## Isolated local E2E synchronization test (debug builds only)

This flow sends one synthetic `₹2.50` debit to a local development backend. It is not a payment, does not use SMS capture, and does not change deposit balances until you manually confirm it in the test dashboard. The normal WorkManager queue still blocks every synthetic candidate, and ordinary uploads still require HTTPS. E2E uploads use a separate explicit client method and are accepted only when the backend is in development mode, is not a Vercel Production deployment, has `E2E_TEST_MODE=true`, uses a loopback MongoDB URI and a database ending in `_e2e`, and the approved device belongs to `E2E_TEST_USER_EMAIL`. Production rejects the E2E request marker regardless of client payload.

Use a **new Android Studio emulator** for this test. Do not reuse the emulator that contains your production device token or queued candidates. The app only allows the debug E2E control to use `http://10.0.2.2:3000`; this is the Android Emulator's host loopback. Debug network security permits cleartext only to that emulator host. Release builds do not show the control, do not allow this URL, and the ordinary upload method remains HTTPS-only.

### 1. Start an isolated local MongoDB replica set

Install MongoDB Community Server and MongoDB Shell if they are not already installed. In PowerShell window 1, create a dedicated local data directory and start a replica-set process on port 27018:

```powershell
$E2eMongoPath = Join-Path $env:LOCALAPPDATA 'DepositFlow\e2e-mongo'
New-Item -ItemType Directory -Force -Path $E2eMongoPath | Out-Null
mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27018 --dbpath $E2eMongoPath
```

In PowerShell window 2, initialize the replica set once:

```powershell
mongosh 'mongodb://127.0.0.1:27018/admin' --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27018'}]})"
```

If it was already initialized, `mongosh 'mongodb://127.0.0.1:27018/admin' --eval 'rs.status()'` should show `PRIMARY`. This is a local MongoDB process; do not substitute an Atlas or production connection string.

### 2. Start the local Next.js backend

In PowerShell window 3, from the repository root, set a loopback database URI, isolated database name, test-mode gate, and the email you will register below. Use a fresh random `PIN_PEPPER` for this local run.

```powershell
$env:MONGODB_URI = 'mongodb://127.0.0.1:27018/finance_tracker_e2e?replicaSet=rs0'
$env:MONGODB_DB = 'finance_tracker_e2e'
$env:E2E_TEST_MODE = 'true'
$env:E2E_TEST_USER_EMAIL = 'e2e@example.test'
$PepperBytes = New-Object byte[] 32
$PepperGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$PepperGenerator.GetBytes($PepperBytes)
$env:PIN_PEPPER = [Convert]::ToBase64String($PepperBytes)
$PepperGenerator.Dispose()
npm run dev -- --hostname 127.0.0.1
```

Do not add `MONGODB_URI` or the E2E variables to Vercel. The server-side E2E gate requires `NODE_ENV=development`, the local MongoDB host, the `_e2e` database suffix, and the configured test account. In a browser on this PC, open `http://localhost:3000/register` and create the `e2e@example.test` account. Then open `http://localhost:3000`, create a test deposit of at least ₹10 (for example, source `E2E test`, amount ₹100, savings ₹0). This user and deposit exist only in `finance_tracker_e2e`.

### 3. Pair a dedicated emulator

In Android Studio, open **Device Manager**, create and start a new Pixel emulator named `DepositFlow E2E`, then select the `debug` build variant and run `SmsPermissionProbe`. In the app enter `http://10.0.2.2:3000`, a test device name, and the one-time code created in the local dashboard's **Companion devices** panel. Approve this pending device in that same local dashboard and refresh the app status. The E2E panel should report **local and enabled**; it stays disabled for Vercel URLs, pending/revoked devices, a non-test owner, or a backend without the local E2E gate.

### 4. Run and verify the test transaction

In the app choose **Run E2E Sync Test**, read the confirmation, and select **Upload test transaction**. Each confirmed run gets new UUID capture and run IDs and a unique E2E reference. The result shows pending, uploading, uploaded, failed, or duplicate. On successful upload, the app should report **Uploaded** and the local dashboard should show a visibly labeled **SYNTHETIC TEST** pending debit (`E2E TESTSTORE`, ₹2.50).

Select the test deposit and category in the dashboard, then confirm the transaction as an expense. Confirm again only to verify idempotence: the dashboard should report it was already confirmed, there should remain one linked expense, and the deposit should be reduced by exactly ₹2.50 once. The test transaction remains labeled TEST. This is the same manual confirmation path used for normal pending debit transactions.

### 5. Clean up

In PowerShell, explicitly drop only the local E2E database:

```powershell
mongosh 'mongodb://127.0.0.1:27018/finance_tracker_e2e?replicaSet=rs0' --eval 'db.dropDatabase()'
```

Stop the local `mongod` process with Ctrl+C in window 1. To also remove its local files after verifying the path, run:

```powershell
$E2eMongoPath = Join-Path $env:LOCALAPPDATA 'DepositFlow\e2e-mongo'
Resolve-Path $E2eMongoPath
Remove-Item -LiteralPath $E2eMongoPath -Recurse -Force
```

The database drop and directory removal are manual and affect only the named local E2E database and directory. Nothing is automatically deployed or run against the production Vercel app.

## Transaction capture and privacy

- SMS capture uses the system's new `SMS_RECEIVED` broadcast and `RECEIVE_SMS`; there is no historical SMS query or SMS provider access. The app does not request `READ_SMS`.
- SMS sender IDs are disabled by default. Enable only the listed bank senders you recognize. Sender allowlisting is checked before the receiver reads message bodies. Messages from other senders are discarded.
- Debug APKs include an off-by-default **Enable emulator SMS testing** switch for exactly `(650) 555-1212`. The switch is unavailable in release builds and release receiver logic always rejects this sender unless it independently matches a normal bank sender rule. Test candidates are visibly labeled synthetic, stored encrypted as `LOCAL_ONLY`, excluded from queue claiming, and rejected again by the upload payload mapper.
- SMS diagnostics retain only generic event counters, a coarse outcome label, and event time (for example, “sender not enabled” or “no transaction pattern”). They never save sender numbers or SMS contents.
- Optional capture from financial-app notifications is disabled until the user selects supported apps and separately grants Notification Access in Android settings. Android's listener permission is broad; this app filters package names before reading notification text and never queries prior/active notification history.
- Local parsers recognize debit/credit wording and amount/reference/date patterns for UPI, card/POS, ATM, and IMPS/NEFT examples. OTP/verification, promotional, balance-enquiry, PIN/password and malformed content is dropped. Parsing is heuristic; candidates need review.
- Raw SMS and notification text are transient only. They are not written to Room, preferences, logs, or network requests. Amount, bank, merchant, reference and transaction time are encrypted with AES-GCM using a separate Android Keystore key. Room stores only encrypted candidate payloads plus capture time, source kind, processing state, and one-way fingerprints for matching. Database and preferences are excluded from backup/transfer.
- Exact matching bank/reference/type/amount candidates from a repeated event or another source coalesce into the original stable capture ID and add source metadata. Near-time amount/bank matches without a trustworthy exact reference are retained as separate `POSSIBLE_DUPLICATE` rows for review; the app does not silently drop uncertain matches.
- Normalized financial fields are AES-GCM encrypted in Room. Queue state is tracked separately as `QUEUED`, `UPLOADING`, `SYNCED`, or `FAILED`; failed items can be retried manually. Worker claims are serialized in a Room transaction and interrupted uploads become claimable after a ten-minute lease.
- WorkManager schedules network-constrained immediate sync and a 15-minute periodic safety run. Upload runs only after the device status endpoint reports `ACTIVE`. Pause state, queue, failed items, and last successful sync survive app restarts.
- A successful response (`201`) or duplicate response (`200`) marks a candidate synced. `401` pauses for credential repair, with a separate clock-skew warning; `429`, network failures, and server errors retry with exponential backoff. Permanent validation errors remain visible as failed items with safe explanations.
- Separate native transaction alerts can be enabled in app settings. A notification is eligible only after a new production insertion response (`201`, not a duplicate `200`); permission-denied, failed, local-only, review, and synthetic candidates do not claim they are in the website inbox. On Android 13+, `POST_NOTIFICATIONS` must be granted. Tapping opens the production expenses inbox in the system browser. This path has not been verified on every physical device.
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

1. Install Android Studio and use JDK 17 for Gradle.
2. Open this directory in Android Studio. The checked-in Gradle wrapper uses Gradle 9.6.0; do not regenerate or remove the wrapper files. Install Android SDK Platform 35 if requested and wait for Gradle Sync.
3. Choose **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The debug APK is normally `app/build/outputs/apk/debug/app-debug.apk`.
4. From PowerShell in this directory, run `.\gradlew.bat testDebugUnitTest assembleDebug assembleRelease` to run unit tests and build debug/release APKs. `assembleRelease` produces an unsigned APK unless you use Android Studio's signed-artifact wizard.
5. To prepare a signed APK, select **Build > Generate Signed Bundle / APK… > APK** and follow the signing wizard. Keep any generated keystore and passwords outside Git. Do not create a keystore until ready to manage and back it up securely.

Transfer the APK to the phone with ordinary USB file transfer (select **File transfer**, not USB debugging), or another trusted file transfer method. Open it from My Files and allow that source to install apps if Android asks. Root access and USB debugging are not required.

## SMS permission

The app declares only `RECEIVE_SMS` for SMS. It does not request historical-message access. Permission grant and message delivery behavior still need verification on the Samsung device. An APK being buildable does not guarantee the permission can be granted through every installer or that Google Play will approve future distribution.

See the repository's [Android setup and release signing guide](../../docs/ANDROID_SETUP.md) for runtime permissions, pairing, troubleshooting, and the exact release signing steps.

## Android project compatibility

The Activity, pairing API client, Keystore credential storage, SMS receiver, notification listener, parser, Room repository, and sync worker are separate. Transaction confirmation remains manual in the web inbox.
