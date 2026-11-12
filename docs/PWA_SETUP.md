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

## Offline behavior and privacy

The service worker caches only public `/_next/static/` resources, public icons, and a generic offline page. It does not cache authenticated HTML, account data, `/api/*` responses, session cookies, PIN responses, or financial data. The offline page says expenses are not saved. Expense creation requires a live network request; there is no background or offline write queue.

This PWA is the website running in the browser's standalone shell. The optional native Kotlin Android companion is a separate app with pairing, SMS/notification capture, and candidate synchronization. Installing the PWA does not enable SMS capture or grant SMS permissions.

## Troubleshooting

- If Chrome does not offer installation, confirm the production site uses HTTPS and the manifest and PNG icon paths load. Use **Add to Home screen** when Chrome offers it.
- If offline, reconnect and reload. Account data intentionally is not available offline.
- If Quick Add reports an expired or locked session, sign in or unlock with the existing PIN, then try again.
- If a deposit is missing, depleted, or belongs to another account, it will not be selectable; server validation remains authoritative.
