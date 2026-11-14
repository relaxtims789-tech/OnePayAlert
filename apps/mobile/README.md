# One PayAlert mobile (`apps/mobile`)

Flutter app (Android and iOS) for merchants and their staff: a live payment feed, spoken and notified payment alerts, today's totals, transaction history, an outlet filter, collecting payments with a Bakong KHQR code, adding soundboxes by scanning the box label, and (Android) forwarding any bank app's payment alerts so the soundbox announces them. Languages: Khmer, English and Chinese.

## Run
```powershell
. ..\..\tools\dev-env.ps1        # Flutter, Java 17 and the Android SDK from D:\dev, this session only
flutter emulators --launch onepay
flutter run
```

Build settings (`--dart-define`):

| Name | Default | Purpose |
|------|---------|---------|
| `API_BASE_URL` | `http://10.0.2.2:4100` | API origin. `10.0.2.2` is the host machine as seen from the Android emulator. |
| `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_SENDER_ID`, `FIREBASE_PROJECT_ID` | empty | Turn on FCM push for closed-app alerts. Without them, push is off and Settings says so. |

Debug builds may use plain HTTP to `10.0.2.2` / `localhost` only. Release builds require HTTPS.

## Test
```powershell
flutter analyze
flutter test                                  # unit + widget tests
flutter test integration_test/app_test.dart   # needs a running emulator and the local API stack
```

## Layout
- `lib/core`: config, API client (token refresh), secure token storage, money/date formatting
- `lib/data`: models and the typed repository
- `lib/services`: realtime socket, local alerts and text-to-speech, FCM push
- `lib/state`: Riverpod providers (session, feed, outlet filter, settings)
- `lib/ui`: screens and shared widgets
- `lib/l10n`: ARB translations (`flutter gen-l10n` generates `app_localizations*.dart`)
