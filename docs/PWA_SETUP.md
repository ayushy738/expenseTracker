# PWA and Quick Add

## Install on Android

1. Open the production website over HTTPS in Chrome on the Samsung/Android phone.
2. Sign in and open **Settings → Install app**. Accept Chrome's prompt if it appears. The app reports installation only after the browser confirms it.
3. If no prompt appears, use Chrome's ⋮ menu and choose **Install app** or **Add to Home screen** when available. Browser support and install criteria vary by browser/device.
4. Launch Deposit Flow from the home screen. The manifest uses standalone display and provides a `/quick-add` shortcut where the launcher/browser supports shortcuts.

The install control does not force or simulate installation. If there is no native prompt, it displays browser-menu instructions. A dismissed native prompt is not automatically repeated.

## Record an expense quickly

1. Tap **+ Expense** in the dashboard shell, or use the app shortcut if available.
2. Enter the amount, select a deposit with enough remaining balance, and tap a category.
3. Save. The date defaults to the phone's local calendar date; date and note are optional details.
4. The existing authenticated expense route checks deposit ownership and balance in a MongoDB transaction. The success screen shows the refreshed balance when it can reload deposits.

Quick Add remembers the last successful eligible deposit using browser storage scoped to the authenticated user. It clears a missing/ineligible choice on next load. It stores no balance, note, or other financial data in browser storage. Amount input is converted to integer paise before submission; the existing server/database amount model is unchanged.

## Service worker behavior and privacy

The service worker caches only same-origin public `/_next/static/` resources and public icons. It does not intercept or cache document navigations, authenticated HTML, App Router/RSC requests, account data, `/api/*` responses, session cookies, PIN responses, or financial data. Expense creation requires a live network request; there is no background or offline write queue. If offline, a fresh navigation is handled by the browser, and a page already open displays the request failure state.

This PWA is the website running in the browser's standalone shell. The optional native Kotlin Android companion is a separate app with pairing, SMS/notification capture, and candidate synchronization. Installing the PWA does not enable SMS capture or grant SMS permissions.

## Troubleshooting

- If Chrome does not offer installation, confirm the production site uses HTTPS and the manifest and PNG icon paths load. Use **Add to Home screen** when Chrome offers it.
- If offline, reconnect and reload. Account data intentionally is not available offline.
- If Quick Add reports an expired or locked session, sign in or unlock with the existing PIN, then try again.
- If a deposit is missing, depleted, or belongs to another account, it will not be selectable; server validation remains authoritative.

## Custom domain: `spend.ayushydv.me`

The website uses relative API and navigation URLs, root-relative manifest and service-worker paths, and host-only session cookies (no `Domain` attribute). The custom hostname therefore gets its own browser cookies and its own PWA installation. Sign in separately on each hostname; do not copy cookies between them. The `finance_session` cookie is `Secure` in production, `HttpOnly`, `SameSite=Strict`, `Path=/`, and expires with the server-side session. The CSRF cookie is also secure, same-site, and host-only; JavaScript reads it to send the matching CSRF header.

To attach the custom hostname without changing nameservers or redirecting the existing URL:

1. In Vercel, open the existing project → **Settings → Domains** and add `spend.ayushydv.me` to the Production environment. Keep the existing `*.vercel.app` domain assigned.
2. Copy the exact CNAME target Vercel displays for this project. Vercel's general target may be `cname.vercel-dns-0.com`, but use the project-specific value displayed by Vercel if it differs.
3. In Namecheap, open **Domain List → Manage → Advanced DNS → Host Records → Add New Record**. Add **CNAME Record**, Host `spend`, Value the exact Vercel target, TTL Automatic. Namecheap expects only the subdomain label in Host.
4. Remove conflicting `A`, `AAAA`, redirect, or other records for the `spend` host only. Leave apex, mail, and unrelated DNS records unchanged. If Namecheap does not provide Host Records, DNS is managed by the currently configured nameserver provider instead.
5. Wait until Vercel marks the domain as configured and its TLS certificate as issued. Keep both hostnames serving the same deployment while validating; do not add a redirect yet.
6. On `https://spend.ayushydv.me`, verify register/login, logout/re-login, PIN unlock, dashboard APIs, `/quick-add`, and the manifest/service worker. Then install the PWA from the custom hostname. The existing Vercel-origin PWA can continue to work, but it remains a separate installation with separate cookies.

No environment variable or backend change is required for the website. If both hostnames route to this same Vercel project and MongoDB database, Android pairing and sync can continue using the Vercel origin. The Android app currently opens its fixed Vercel inbox URL for transaction notifications; using the custom domain as the canonical notification target requires a separate Android source/build change. On the current build, tapping Android's notification opens the Vercel origin, where the user may need to sign in separately.
