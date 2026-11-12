# Deposit Flow Finance

> **Know where your money comes from, where it goes, and what's left.**

Deposit Flow Finance is a deposit-first personal finance tracker. Record each deposit, choose its savings allocation, and see expenses against the specific deposit that funded them. The optional Android companion can capture selected bank SMS alerts and financial-app notifications, then send normalized candidates to the website for review.

The website remains the source of truth. Imported transactions stay pending until a person checks them, chooses a deposit and category, and confirms them as an expense.

## What it does

- Tracks deposits, savings funds, goals, expenses, and analytics.
- Adds manual expenses from a focused, mobile-first Quick Add screen.
- Installs from supported browsers as a standalone PWA with a Quick Add home-screen shortcut.
- Keeps each confirmed expense tied to one of your deposits.
- Provides email/password accounts, a server-side session, and an optional quick-lock PIN.
- Lets an account owner pair, approve, and revoke Android devices.
- Keeps imported transaction candidates in a pending inbox for correction, confirmation, or ignore actions.
- Supports transaction correction and reversal history for confirmed imported expenses.
- Offers a Kotlin Android companion with opt-in SMS sender IDs, optional selected-app notification capture, an encrypted offline queue, and background synchronization.

This project does not connect to bank APIs and does not make payments. SMS and notification parsing is heuristic; supported sources and capture behavior vary by bank, Android version, device, and app settings.

## Deposit-first accounting

Each deposit is tracked independently:

```text
Spendable amount = deposit amount − initial savings
Remaining amount = spendable amount − confirmed, non-reversed expenses
```

When adding an expense, select the deposit it belongs to. The server checks that the deposit belongs to the signed-in account and has enough remaining balance. Imported SMS/notification candidates do **not** change balances until manually confirmed. Confirmation creates a linked expense and updates the deposit in a MongoDB transaction; duplicate confirmations are idempotent.

### Quick Add Expense

Use **+ Expense** from the dashboard shell or open `/quick-add`. Enter the amount, tap a deposit and category, then save. The last successfully used eligible deposit is remembered only in browser storage under a key scoped to the signed-in account. The server still validates deposit ownership and remaining balance and performs the existing transactional accounting; no balance is trusted from the browser. Date and note are optional details supported by the existing expense schema.

Quick Add needs a network connection. It does not queue expense writes offline.

### Install on Android as a PWA

Open the production website in Chrome on Android, sign in, then use **Settings → Install app**. If Chrome does not expose an install prompt, open its ⋮ menu and choose **Install app** or **Add to Home screen** if offered. The PWA provides standalone launch and a Quick Add shortcut. The service worker caches only public static assets and icons; documents, RSC requests, authentication, and finance APIs always use the network. If you open a page while offline, the browser handles the unavailable navigation. A page already open can report a failed request, and financial data cannot be edited offline.

The PWA is the website in an installable browser shell. It is separate from the optional native Kotlin Android companion, which captures allowlisted new bank SMS and selected financial-app notifications and uploads candidates for manual website confirmation.

## Android transaction workflow

```text
New bank SMS or selected financial-app notification
  → sender/package filtering and local parsing
  → encrypted Room candidate queue and duplicate review
  → WorkManager upload over HTTPS from an active, approved device
  → pending BankTransaction in the website inbox
  → owner checks it, selects deposit/category, and confirms or ignores
  → confirmed expense updates that deposit
```

The companion requests `RECEIVE_SMS`, not `READ_SMS`, and does not scan message history. Optional notification capture requires the user to grant Android Notification Access and select apps. Raw SMS and notification text are not sent to the backend. The website's native transaction notification is intended to appear after a new production insertion response; Android device behavior has not been independently verified on every target device.

## Architecture and technology

- **Website and API:** Next.js 15 App Router, React, TypeScript, Tailwind CSS, Next.js route handlers.
- **Data:** MongoDB Atlas and Mongoose. Finance records are scoped to a user ID derived from the authenticated session/device.
- **Android:** Kotlin, Jetpack Compose, Android Keystore, Room, and WorkManager.
- **Hosting:** Vercel serverless functions for the web application and APIs.

More detail: [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), [Android setup](docs/ANDROID_SETUP.md), [PWA setup](docs/PWA_SETUP.md), and [Deployment](docs/DEPLOYMENT.md).

## Developer setup

Requirements: Node.js 20 LTS, npm, MongoDB that supports replica-set transactions, and (for Android) Android Studio with Android SDK Platform 35 and JDK 17.

1. Clone the repository and install the locked dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env.local` and replace the placeholders. Do not commit `.env.local`.

   PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   macOS/Linux:

   ```bash
   cp .env.example .env.local
   ```

3. Start a local MongoDB replica set as described in [Deployment](docs/DEPLOYMENT.md), then run:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000/register` to create a development account.

`MONGODB_DB` is authoritative if the database path embedded in `MONGODB_URI` differs. Without an explicit `MONGODB_DB`, the application selects `finance_tracker_v2`. Use a fresh development database; the application does not create or migrate financial data from an older database automatically.

## Environment variables

`.env.example` contains placeholders only. The application reads:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection URI. Keep credentials server-side; URL-encode reserved characters in passwords. |
| `MONGODB_DB` | Explicit database name; overrides a database path embedded in the URI. |
| `PIN_PEPPER` | Server-only random value of at least 32 characters used when hashing PIN verifiers. |
| `E2E_TEST_MODE` | Must remain `false` for normal use. The isolated E2E ingestion gate requires local development conditions. |
| `E2E_TEST_USER_EMAIL` | Email allowed for the isolated local E2E test account; do not configure for production. |

There is no `SESSION_SECRET` variable in the current implementation. See [Deployment](docs/DEPLOYMENT.md) for production setup and local replica-set commands.

## Android companion setup and pairing

The Android project is at [`android/SmsPermissionProbe`](android/SmsPermissionProbe). Open that directory in Android Studio, sync Gradle, and build the `debug` variant. Pairing starts from the signed-in website: create a short-lived code, enter it in the companion, and approve the pending device in the website. A paired device cannot upload until approved. Full instructions and permission notes are in [Android setup](docs/ANDROID_SETUP.md).

An Android release APK has not been signed or prepared for distribution. Do not commit a signing keystore or its password. Follow the signing steps in [Android setup](docs/ANDROID_SETUP.md) when preparing a release.

## Supported sources and limits

- The app includes sender registries for SBI, HDFC, ICICI, Axis, Kotak, PNB, Bank of Baroda, Canara, IDFC FIRST, and Union Bank. Users must enable specific SMS senders; IDs and templates may change.
- Optional notification sources currently include Google Pay, PhonePe, Paytm, YONO SBI, Axis Mobile, iMobile Pay, and Kotak Bank. Package IDs and notification text can change.
- Parsing is heuristic and may miss, misclassify, or require review for alerts outside tested patterns. Duplicate candidates without reliable references are retained for review rather than silently discarded.
- SMS access is sensitive and may be subject to Google Play restrictions; Play eligibility has not been established. See [Android's SMS/call-log permission guidance](https://developer.android.com/guide/topics/permissions/default-handlers).
- The app is not listed on Google Play. Installation and capture behavior must be verified on the intended Samsung device.

## Screenshots

No verified, privacy-reviewed screenshots are checked in yet. Add screenshots here only after removing names, balances, transaction details, and other personal information.

<!-- Screenshot placeholders: dashboard, deposit detail, transaction inbox, Android capture settings. -->

## Testing and checks

From the repository root:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

The MongoDB integration suite uses an isolated local replica-set test database. It must not be pointed at production.

From PowerShell in `android/SmsPermissionProbe`:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug assembleRelease
```

To compile Android instrumentation tests without running them on a device:

```powershell
.\gradlew.bat assembleDebugAndroidTest
```

Device behavior, SMS permission availability, notification delivery, and browser handoff require separate physical-device verification.

## Repository map

```text
app/                         Dashboard pages and Next.js API routes
components/                  Dashboard, account, and inbox UI
lib/                         Authentication, MongoDB, device, and finance helpers
models/                      Mongoose user and finance models
tests/                       Security, API, model, and MongoDB integration tests
android/SmsPermissionProbe/  Kotlin Android companion
docs/                        Architecture, security, setup, and deployment guides
```

## License

There is currently no `LICENSE` file. Reuse and redistribution terms are therefore not specified. Add an explicit license before inviting external contributions or redistributing the project.
