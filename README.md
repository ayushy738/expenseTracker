# Deposit Flow Finance

A mobile-first personal finance tracker where every deposit is tracked as its own branch. The core question is always: where did this exact deposit go?

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- Shadcn-style local UI primitives
- Recharts
- Framer Motion
- Next.js API routes
- MongoDB with Mongoose

## Local setup (fresh database)

```bash
npm install
copy .env.example .env.local
npm run dev
```

Use a new, empty database in your existing Atlas cluster (default name: `finance_tracker_v2`). Do not reuse the old database. In `.env.local`, set `MONGODB_URI` to your Atlas cluster URI and `MONGODB_DB=finance_tracker_v2`. `MONGODB_DB` is passed explicitly to Mongoose and overrides any database path embedded in `MONGODB_URI`; if it is omitted, the helper still defaults to `finance_tracker_v2` rather than silently reusing the URI path. The Atlas database user must have read/write access to the new database. The application never drops or clears a database. Mongoose creates collections and indexes when models are first used.

Generate a server-only PIN pepper locally (PowerShell):

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Put the output in `PIN_PEPPER` in `.env.local`. Keep `.env.local` out of version control. For a Vercel deployment, configure the same variables only after you approve production configuration changes; set `MONGODB_DB` to the new database explicitly. No auth provider, email service, dedicated server, or paid service is required. Atlas transactions require a replica set; Atlas Free clusters support replica sets, subject to current plan limits.

## Accounts and sessions

Create an account at `/register`, then sign in at `/login`. Passwords and optional four-digit PINs are stored as salted scrypt verifiers. Sessions are opaque random tokens stored only as hashes in MongoDB and expire after 30 days. A configured PIN unlocks only a still-valid session and does not replace password sign-in. Browser mutations use same-origin checks and a CSRF cookie/header pair. Login and registration are throttled in MongoDB.

Every finance, report, export, device-management, and transaction-inbox API derives its `userId` from the session and scopes database operations to that owner. New users have empty dashboards. Registration is public and throttled; there is no email verification or self-service password recovery in this version. Users can change their password and PIN in Account settings.

Open Expenses → Inbox to issue and revoke companion device credentials. Only the authenticated owner can manage their devices. The `/api/sms` endpoint accepts normalized transaction fields, derives ownership from the bearer token’s device, and does not accept SMS bodies or trust payload user IDs.

The companion client sends `POST /api/sms` with `Authorization: Bearer <device-token>`, `X-Device-Timestamp: <Unix milliseconds>`, and a JSON body containing `amount`, `transactionType` (`DEBIT` or `CREDIT`), `timestamp` (ISO date), and optional `bank`, `merchant`, and `reference`. This endpoint still requires an active, revocable device token. The request timestamp must be within five minutes of server time. Transaction imports are deduplicated using the bank/reference or normalized transaction fields.

MongoDB Atlas multi-document transactions are used when confirming an imported expense and when changing manual expense allocations. The configured database must support replica-set transactions; Atlas clusters do. No transaction endpoints are run against production as part of local checks.

Confirmed imported expenses can be reversed or corrected from the inbox. Reversal marks the linked expense as reversed rather than deleting it, and deposit totals and spending reports exclude it. A correction records a snapshot of the original and creates a linked pending replacement that must be confirmed again. Ordinary manual expense edit/delete behavior is unchanged.

Run checks with `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. The integration suite starts an isolated MongoDB 7.0.16 replica set using MongoDB Memory Server; on a new machine its first test run downloads the MongoDB test binary from `fastdl.mongodb.org` (roughly 594 MiB) and needs local disk space. This adds no runtime service or recurring fee, and test data is ephemeral. The cached binary is stored under the ignored `.cache` directory.

## Production rollout (not performed)

1. Create a new empty Atlas database by using the name `finance_tracker_v2` on first connection; do not delete the existing database.
2. Add `MONGODB_URI`, `MONGODB_DB=finance_tracker_v2`, and a strong `PIN_PEPPER` to Vercel Project Settings → Environment Variables for the intended environment.
3. Confirm the Atlas network access and database user permit the Vercel deployment to connect to that cluster.
4. Deploy only after explicitly approving the production configuration change. Register the first account after deployment; it will have no legacy data.
5. Confirm account registration/login, then create a PIN and provision the Android device from the inbox.

This implementation has not deployed, contacted Atlas, or created/modified production data.
