/// Build-time configuration (pass with `--dart-define=KEY=value`).
///
/// API_BASE_URL defaults to the Android emulator's alias for the host machine.
/// Firebase values are optional: without them push is disabled (never faked) and the
/// app still receives payments live over the realtime socket while it is open.
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:4100');

  static const firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const firebaseSenderId = String.fromEnvironment('FIREBASE_SENDER_ID');

  static bool get pushConfigured =>
      firebaseApiKey.isNotEmpty && firebaseAppId.isNotEmpty && firebaseProjectId.isNotEmpty && firebaseSenderId.isNotEmpty;

  static const appVersion = '0.5.0';
}
