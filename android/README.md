# CyberShop Android — Trusted Web Activity

The user selected **TWA** on 2026-10-22. This is an internal implementation,
not a signed store release or proof of physical-device parity. The browser owns
authentication cookies, permissions, downloads and WhatsApp/payment handovers.
There is no native JavaScript bridge and no bundled Worker/internal secret.

## Identity and build

- Proposed release application ID: `ng.cybershop.app`. **Confirm the package of
  any existing Samsung listing before publishing**; an update must preserve its
  identity and signing lineage. Do not overwrite/re-sign an existing app blindly.
- Debug ID: `ng.cybershop.app.debug` (separate from release).
- Default exact launch origin: `https://cybershop.ng`; min SDK 24, target/compile
  SDK 36, build tools 36.0.0, Java 17, AGP 8.9.1, Android Browser Helper 2.7.4,
  Gradle 8.14.3 with SHA-256 pinned from the official GitHub release asset.
- The AGP/API baseline follows Bubblewrap 1.27.0's template. A newer plugin and
  current channel eligibility must be reviewed before release; do not interpret
  a successful compile as policy acceptance.

With JDK 17 and Android SDK installed:

```sh
sdkmanager 'platforms;android-36' 'build-tools;36.0.0'
cd android
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
# On an owned staging origin and separate staging app identity:
./gradlew -PcybershopOrigin=https://YOUR-OWNED-STAGING-ORIGIN \
  -PcybershopApplicationId=YOUR.CONFIRMED.STAGING.ID assembleDebug
```

The CI Android job builds/tests/lints the debug identity only and retains an
internal artifact for seven days. A debug APK still requires its actual debug
certificate to be associated on an **owned staging** host for a trusted,
address-bar-free launch. Until association works, browser UI is the honest
fallback. A generic desktop viewport is not an Android acceptance test.

## Domain association

Serve `/.well-known/assetlinks.json` from the exact HTTPS web origin. The Next
route fails **503/no-store** until valid real configuration is supplied; it does
not invent package/certificate values. Set server-only deployment variables:

- `SITE_URL`: exact HTTPS origin.
- `ANDROID_ASSETLINKS`: JSON array with `package_name` and
  `sha256_cert_fingerprints` (full colon-separated SHA-256 certificate strings).
- `ANDROID_ASSOCIATION_ENV=staging` only for the explicitly owned staging site
  when associating `.debug`/`.staging` package identities. Production
  `cybershop.ng`/`www.cybershop.ng` reject these even with the staging flag.

Use `./gradlew signingReport` for the actual installed debug certificate; obtain
release/store signing fingerprints from approved key custody or the store
console. An upload-key fingerprint is not necessarily the installed app-signing
fingerprint. Fingerprints are public; private keys and passwords are not.
Verify HTTPS status 200, JSON content type, no redirect, exact fingerprint and
Android App Link/TWA verification **on the distributed binary**.

## Release signing gate

Release tasks intentionally fail without `-PcybershopReleaseApproved=true` and
all four protected environment variables: `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Never put keystores or credentials in Git, issue text, chat or build logs.
Choose the confirmed application ID/origin/version and review current payment,
privacy and store requirements before authorizing a release. The flag is a
manual approval boundary, not evidence that policy/legal review happened.
Debug signing is generated locally by Android tooling; it is not release custody.
There is no automated release upload or store submission.

## Device acceptance still required

Use real low-end Android and Samsung devices. Record OS/browser/provider and
binary SHA, then cover: fresh/warm/process-killed app links, Back, absent app,
failed association/missing trusted browser, Wi-Fi/mobile/offline recovery,
TalkBack/large font/keyboard, image picker/camera/audio permissions, WhatsApp
standard/Business/both/neither, cart draft/session preservation, hosted checkout
return, reset/verify/invite links, downloads/share/copy, account closure, private
proof denial and upgrade/signing lineage. No new native permission is requested
just to make a screenshot or claim a feature exists.
