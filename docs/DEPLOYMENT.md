# Deployment

The website and API deploy as a Next.js 15 application on Vercel. MongoDB Atlas stores data. No dedicated backend server is required. Do not use production credentials or data in local tests.

## MongoDB requirements

The application uses multi-document transactions for deposit/expense accounting, imported transaction confirmation/correction, and device pairing. MongoDB multi-document transactions require a replica set (or a compatible sharded cluster); a standalone `mongod` is insufficient. See [MongoDB transaction/replication documentation](https://www.mongodb.com/docs/manual/replication/).

For local development, run a single-node replica set in a dedicated data directory. Example PowerShell commands (choose a local directory you intend to use):

```powershell
$MongoData = Join-Path $env:LOCALAPPDATA 'DepositFlow\mongo-dev'
New-Item -ItemType Directory -Force -Path $MongoData | Out-Null
mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath $MongoData
```

In a second PowerShell window, initialize the local set once:

```powershell
mongosh 'mongodb://127.0.0.1:27017/admin' --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"
```

The local connection URI is:

```text
mongodb://127.0.0.1:27017/finance_tracker_v2?replicaSet=rs0
```

The Atlas production cluster must support replica-set transactions. Atlas deployment limits and free-tier quotas can change; review the [Atlas Free Cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) before deciding whether the selected tier fits expected database size and workload.

## Vercel environment setup

Configure these variables in the Vercel project's **Production** environment only after verifying the project and database target:

| Variable | Production value |
| --- | --- |
| `MONGODB_URI` | Atlas URI for the intended cluster and application database user. Use a least-privilege database user. |
| `MONGODB_DB` | Explicit production database name. The code treats this as authoritative over the URI's database path. |
| `PIN_PEPPER` | A unique random secret of at least 32 characters. Keep it in Vercel's encrypted environment configuration and a controlled secure backup. |

Do not configure `E2E_TEST_MODE=true` or a production E2E test email. E2E ingestion is local-development-only by code. There is no `SESSION_SECRET` configuration in this version.

Use separate databases and credentials for development, tests, previews, and production. Never copy production records into a local test database without an explicit data-protection plan. No startup/deployment migration is provided; new users start empty and ownership is assigned at record creation.

### Atlas network access and Vercel egress

Review Atlas **Network Access** rules before enabling production credentials. Vercel functions normally use changing outbound addresses; static egress IPs are documented for Pro/Enterprise plans, not Hobby. See [Vercel static IPs](https://vercel.com/changelog/static-ips-are-now-available-for-more-secure-connectivity) and [Vercel Hobby plan](https://vercel.com/docs/plans/hobby).

If a narrow Atlas IP allowlist is a requirement, choose a supported network path and account plan before launch. A broad allow-all Atlas IP rule expands the set of hosts that can attempt a connection; it is not equivalent to a public unauthenticated database, but it increases exposure. If used, protect it with strong unique database credentials, least-privilege roles, TLS, and monitoring. This repository review cannot see or verify current Atlas access rules or Vercel environment values. Do not change them automatically as part of this guide.

## Deploying the web app

1. Review the staged source and configuration diffs; do not include `.env.local`, local database files, generated output, APKs, or signing material.
2. Run tests, TypeScript, lint, and production build from the repository root.
3. Confirm the Vercel project is linked to the intended repository/branch and the production variables above point to the intended Atlas database.
4. Review Vercel Hobby limits and personal-use conditions in the current [plan documentation](https://vercel.com/docs/plans/hobby). Included quotas and platform terms can change; keep an eye on usage. Avoid adding paid Vercel networking or other services without an explicit cost decision.
5. Push only after approval. If Git integration auto-deploys the production branch, the push itself can deploy; this review does not push or deploy.
6. After an approved deployment, verify sign-in, PIN unlock, owner scoping, device approval/revocation, ingestion, pending inbox, and transaction confirmation against the intended environment. Never use a test synthetic E2E request against production.

## Android release signing

`assembleRelease` creates an unsigned APK, not an installable trusted release. Generate a signed artifact in Android Studio using **Build → Generate Signed Bundle / APK…**. Create a keystore only as a deliberate manual action; this review does not generate one. Keep the key, alias, and passwords outside Git and maintain a secure backup. See [Android setup](ANDROID_SETUP.md).

## E2E test isolation

Use the isolated replica-set and `_e2e` database procedure in [`android/SmsPermissionProbe/README.md`](../android/SmsPermissionProbe/README.md). Use a dedicated local user and device. Do not reuse production tokens, set production database variables in the test shell, or run database cleanup commands against any remote URI.
