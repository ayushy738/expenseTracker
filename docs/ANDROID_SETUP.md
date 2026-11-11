# Android companion setup

The native companion lives in `android/SmsPermissionProbe` and is built with Kotlin, Jetpack Compose, Android SDK 35, and JDK 17. Its current application ID is `com.depositflow.smsprobe`; the package is not published on Google Play.

## Build in Android Studio

1. Install Android Studio and Android SDK Platform 35. Install/use JDK 17 for Gradle.
2. Open the `android/SmsPermissionProbe` directory as the Android Studio project and let Gradle sync.
3. For development, choose the `debug` build variant. Use **Build → Build Bundle(s) / APK(s) → Build APK(s)**, or run in PowerShell from the project directory:

   ```powershell
   .\gradlew.bat testDebugUnitTest assembleDebug
   ```

   The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`.

4. Transfer the APK to the phone using a trusted file-transfer method, open it from the device's file manager, and allow installation from that source if Android prompts. USB debugging and root are not required to install the APK manually.

## Pair the phone

1. Create an account or sign in at the website.
2. Open **Companion devices** and create a pairing code. The code is single-use and expires after approximately five minutes; it is stored server-side only as a hash.
3. In the Android app, enter the HTTPS website origin, a device name, and the code. The app generates its token locally and stores the encrypted token using Android Keystore.
4. Approve the pending device in the signed-in website. Refresh/check the app status; uploads are permitted only after approval.
5. Keep device tokens private. Revoke a device from the web dashboard if the phone is lost or the local app is no longer trusted.

The companion does not receive a client-supplied account ID. Ownership comes from the approved pairing challenge and authenticated device.

## Permissions and capture settings

### SMS

- Grant `RECEIVE_SMS` in Android settings or in the app when prompted. The receiver handles new incoming SMS broadcasts only.
- The manifest does not declare `READ_SMS`; the app does not query or import old messages.
- SMS sender IDs start disabled. Enable only bank IDs you recognize. Current registry includes SBI, HDFC, ICICI, Axis, Kotak, PNB, Bank of Baroda, Canara, IDFC FIRST, and Union Bank patterns. A registry match is not a guarantee that every message format is recognized.
- `RECEIVE_SMS` is sensitive and Android classifies it as a hard-restricted permission. Installer/device behavior can affect whether it can be granted. Test on the actual Samsung device before relying on capture. Google Play further restricts SMS permissions; default-handler requirements or a policy exception may apply. This app's Play eligibility has not been assessed. See [Android's SMS permission guidance](https://developer.android.com/guide/topics/permissions/default-handlers) and [runtime permission guidance](https://developer.android.com/training/permissions/requesting).

### Financial-app notifications

- Notification capture is optional and separate from SMS. Select supported apps in the companion, then grant Notification Access through Android's Notification access settings.
- The system-level listener capability is broad. This app filters to the selected package IDs before parsing notification content; package names and notification formats can change.
- Current package registry includes Google Pay, PhonePe, Paytm, YONO SBI, Axis Mobile, iMobile Pay, and Kotak Bank. This list does not imply universal app or notification support.

### Transaction alert notifications

- The app's separate **Transaction notifications** switch controls native alerts about newly inserted transactions.
- Android 13+ requires `POST_NOTIFICATIONS` permission. The app asks when the user enables alerts or taps the permission button; a denied permission means no native alert is displayed.
- Alerts are eligible only after the normal sync receives a new-production-insert response (`201` without `duplicate: true`). A duplicate `200`, a failure, an unuploaded/local-review item, and a synthetic E2E test do not produce a production inbox alert.
- The alert includes amount, direction, and bank label only. Tapping uses an immutable browser `ACTION_VIEW` PendingIntent for `https://expense-tracker-phi-gules.vercel.app/expenses#inbox`; it does not navigate to the Android detected-candidate view. Confirm browser handoff behavior on the target device.

## Local data and privacy

- Raw message text is used only during receiver parsing. It is not intentionally persisted, logged, or uploaded.
- Normalized candidate fields and the device token use separate AES-GCM keys held by Android Keystore. The Room queue is excluded from Android backup/transfer. This is local at-rest encryption, not end-to-end encryption.
- Normalized candidates remain local until approved-device synchronization. They appear in the website inbox as pending. A person must select a deposit/category and confirm before an expense or balance update occurs.
- Exact reference matches may coalesce SMS and notification events. Uncertain matches are kept for review instead of silently discarded.

## Debug-only testing

Debug APKs contain an off-by-default emulator sender toggle for `(650) 555-1212`; its candidates are marked synthetic and local-only. The **Run E2E Sync Test** control is debug-only and accepts only the local emulator backend (`http://10.0.2.2:3000`). It requires an isolated local `_e2e` database, test account, and separately approved test device. Release `BuildConfig.DEBUG` is false and the release manifest excludes the debug cleartext-network configuration. Never use a production paired emulator for E2E testing.

## Troubleshooting

- **No SMS candidates:** check `RECEIVE_SMS`, enable the matching sender ID, and check the generic SMS diagnostics. Do not forward raw bank messages into issue reports.
- **Unknown sender:** the sender may not be in the registry. Avoid enabling a broad sender wildcard; add a narrowly reviewed pattern in code and a sanitized synthetic test.
- **Candidate needs review:** the parser could not safely classify it. It stays local and is not uploaded automatically.
- **Device pending:** approve it in the web dashboard. Pending devices cannot upload.
- **Authentication warning:** check connection status or revoke/re-pair through the dashboard. Do not paste bearer tokens into logs or tickets.
- **No website alert:** check the app switch, Android 13+ permission, OS channel settings, and whether this was a new insert rather than a duplicate response.
- **No historical entries:** this is intentional; the app does not scan the SMS inbox.

## Prepare a signed release APK

No signed release APK or signing keystore is checked in. Gradle's `assembleRelease` currently produces an unsigned APK at `app/build/outputs/apk/release/app-release-unsigned.apk`.

To sign locally in Android Studio:

1. Select **Build → Generate Signed Bundle / APK… → APK → Next**.
2. Choose **Create new…** only if you are ready to create and securely back up a signing key. Do not generate the key in this automated review.
3. Store the keystore and passwords outside the repository and backups that are not approved for secrets. The ignore rules cover common keystore and signing-property extensions.
4. Select the `release` build variant, complete the wizard, and inspect the generated signed APK path and signing status.
5. Keep the keystore, alias, and passwords safe. Future updates must be signed with the same app-signing identity. Do not commit them or paste them into chat/logs.

The current manifest uses Android's generic system application icon. Replace it with a privacy-safe Deposit Flow icon before public distribution. The signed artifact still needs installation and runtime testing on the intended Samsung phone. A successful APK build does not establish Play Store eligibility or reliable SMS delivery.
